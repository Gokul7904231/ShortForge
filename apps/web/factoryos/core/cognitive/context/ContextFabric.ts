/**
 * Canonical active working-context facade.
 *
 * Existing ContextIndexer / ContextCompiler / ActiveContextManager remain
 * implementation primitives. ContextFabric is the single logical boundary
 * that coordinates them for active context.
 */

import * as crypto from "node:crypto";
import type { ContextOperationType } from "../CognitiveContracts";
import type { IContextFabricRepository, ContextEditLedgerEntry } from "../../database/DatabaseContracts";
import type { EvidenceItem } from "../../intelligence/retrieval/RetrievalContracts";
import { ActiveContextManager } from "./ActiveContextManager";
import { ContextCompiler } from "../../intelligence/context/ContextCompiler";
import type { ContextCapsuleV2, ContextBudgetPolicy } from "../../intelligence/context/ContextCapsuleContracts";
import { ContextIndexer } from "../rlm/ContextIndexer";
import type {
  ContextFabricSeed,
  ContextFabricSnapshot,
  ContextWorkspace,
  ContextEdit,
  ContextOrchestrationPort,
} from "./ContextFabricContracts";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonicalize(record[key])).join(",") + "}";
}

export class ContextFabric {
  public static readonly AUTHORITY_DOMAIN = "working_context";
  public readonly indexer: ContextIndexer;
  public readonly activeContext: ActiveContextManager;
  public readonly compiler: ContextCompiler;

  private readonly orchestration?: ContextOrchestrationPort;
  private createdAt: string;
  private readonly repository?: IContextFabricRepository;
  private workspace: ContextWorkspace;

  constructor(params?: {
    workspaceId?: string;
    missionId?: string;
    taskId?: string;
    indexer?: ContextIndexer;
    activeContext?: ActiveContextManager;
    compiler?: ContextCompiler;
    maxActiveTokens?: number;
    repository?: IContextFabricRepository;
    orchestration?: ContextOrchestrationPort;
  }) {
    this.repository = params?.repository;
    this.orchestration = params?.orchestration;
    this.indexer = params?.indexer ?? new ContextIndexer();
    this.activeContext =
      params?.activeContext ??
      new ActiveContextManager(this.indexer, params?.maxActiveTokens ?? 8000);
    this.compiler = params?.compiler ?? new ContextCompiler();
    this.createdAt = new Date().toISOString();

    this.workspace = this.buildWorkspace(
      params?.workspaceId ?? "ctxws_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
      params?.missionId ?? "mission_unbound",
      params?.taskId ?? "task_unbound",
      0
    );
  }

  seed(seed: ContextFabricSeed): ContextWorkspace {
    this.activeContext.clear();
    for (const reference of seed.references) this.activeContext.addContextItem(reference);
    this.workspace = this.buildWorkspace(
      this.workspace.workspaceId,
      seed.missionId,
      seed.taskId,
      this.workspace.version + 1
    );
    return this.getWorkspace();
  }

  applyEdits(edits: ContextEdit[]): ContextWorkspace {
    if (edits.length === 0) return this.getWorkspace();

    const baseVersion = this.workspace.version;
    for (const edit of edits) {
      if (edit.baseVersion !== baseVersion) {
        throw new Error("Context edit " + edit.editId + " has stale baseVersion " + edit.baseVersion + "; current version is " + baseVersion);
      }
    }

    for (const edit of edits) {
      switch (edit.type) {
        case "RETAIN":
          this.activeContext.addContextItem(edit.reference);
          break;
        case "REORDER":
          this.activeContext.reorderContext(edit.priorityType);
          break;
        case "OPTIMIZE":
          this.activeContext.pruneAndOptimize();
          break;
      }
    }

    this.workspace = this.buildWorkspace(
      this.workspace.workspaceId,
      this.workspace.missionId,
      this.workspace.taskId,
      baseVersion + 1
    );
    return this.getWorkspace();
  }

  async hydrate(workspaceId: string = this.workspace.workspaceId): Promise<ContextWorkspace | null> {
    if (!this.repository) {
      throw new Error("Context Fabric durable persistence unavailable");
    }

    const persisted = await this.repository.getWorkspace(workspaceId);
    if (!persisted) return null;

    const expectedHash = this.computeWorkspaceHash(persisted);
    if (expectedHash !== persisted.contextHash) {
      throw new Error(
        "Context Fabric recovery integrity mismatch for workspace " + workspaceId
      );
    }

    const history = await this.repository.getEditHistory(workspaceId, 1000);
    const seen = new Set<string>();
    for (const entry of history) {
      if (seen.has(entry.editId)) {
        throw new Error("Context Fabric recovery contains duplicate edit " + entry.editId);
      }
      seen.add(entry.editId);
      if (entry.resultingVersion > persisted.version || entry.resultingVersion < 1) {
        throw new Error(
          "Context Fabric recovery found invalid ledger version " + entry.resultingVersion
        );
      }
    }

    const previous = this.getWorkspace();
    try {
      this.restoreActiveReferences(persisted.activeReferences);
      const restored = this.activeContext.getActiveItems();
      const restoredHash = this.computeWorkspaceHash({
        ...persisted,
        activeReferences: restored,
      });

      if (restoredHash !== persisted.contextHash) {
        throw new Error(
          "Context Fabric recovery changed the active set for workspace " + workspaceId
        );
      }

      this.createdAt = persisted.createdAt;
      this.workspace = structuredClone(persisted);
      return this.getWorkspace();
    } catch (error) {
      this.restoreFromSnapshot(previous);
      throw error;
    }
  }

  async recover(workspaceId: string = this.workspace.workspaceId): Promise<ContextWorkspace | null> {
    return this.hydrate(workspaceId);
  }

  async commitEdits(edits: ContextEdit[]): Promise<ContextWorkspace> {
    if (!this.repository) {
      throw new Error("Context Fabric durable persistence unavailable");
    }
    if (edits.length === 0) return this.getWorkspace();

    const editIds = new Set<string>();
    for (const edit of edits) {
      if (editIds.has(edit.editId)) {
        throw new Error("Duplicate Context Fabric edit ID: " + edit.editId);
      }
      editIds.add(edit.editId);
    }

    const previous = this.getWorkspace();
    try {
      const proposed = this.applyEdits(edits);
      const ledgerEntries: ContextEditLedgerEntry[] = edits.map((edit) => ({
        editId: edit.editId,
        workspaceId: proposed.workspaceId,
        missionId: proposed.missionId,
        taskId: proposed.taskId,
        baseVersion: previous.version,
        resultingVersion: proposed.version,
        actor: edit.actor,
        type: edit.type,
        targetRefId: edit.type === "RETAIN" ? edit.reference.refId : undefined,
        priorityType: edit.type === "REORDER" ? edit.priorityType : undefined,
        reason: edit.reason,
        resultHash: proposed.contextHash,
        recordedAt: proposed.updatedAt,
      }));

      await this.repository.commitWorkspace({
        workspace: proposed,
        edits: ledgerEntries,
        expectedVersion: previous.version,
      });

      return this.getWorkspace();
    } catch (error) {
      this.restoreFromSnapshot(previous);
      throw error;
    }
  }

  /**
   * Production cognitive entry points. The facade owns the boundary while
   * RLM/ContextOrchestrator remains the implementation substrate.
   */
  indexContext(items: Parameters<ContextOrchestrationPort["indexContext"]>[0]): ReturnType<ContextOrchestrationPort["indexContext"]> {
    return this.orchestration
      ? this.orchestration.indexContext(items)
      : this.indexer.indexBatch(items);
  }

  async runRecursiveInvestigation(
    goal: Parameters<ContextOrchestrationPort["runRecursiveInvestigation"]>[0],
  ): ReturnType<ContextOrchestrationPort["runRecursiveInvestigation"]> {
    if (!this.orchestration) {
      throw new Error("Context Fabric cognitive orchestration unavailable");
    }
    return this.orchestration.runRecursiveInvestigation(goal);
  }

  compileSeed(params: {
    taskId: string;
    query: string;
    evidenceItems: EvidenceItem[];
    currentState?: Record<string, unknown>;
    stateVersion?: string;
    sourceVersions?: Record<string, string>;
    budgetPolicy?: Partial<ContextBudgetPolicy>;
  }): ContextCapsuleV2 {
    return this.compiler.compileV2(params);
  }

  audit(): ContextFabricSnapshot {
    const health = this.activeContext.auditHealth();
    const recentOperations = this.activeContext
      .getAuditLog()
      .slice(-10)
      .map((entry) => entry.operation as ContextOperationType);

    return {
      ...this.getWorkspace(),
      health,
      recentOperations,
    };
  }

  getWorkspace(): ContextWorkspace {
    return structuredClone(this.workspace);
  }

  optimize(): ContextWorkspace {
    this.activeContext.pruneAndOptimize();
    this.workspace = this.buildWorkspace(
      this.workspace.workspaceId,
      this.workspace.missionId,
      this.workspace.taskId,
      this.workspace.version + 1
    );
    return this.getWorkspace();
  }

  private computeWorkspaceHash(workspace: ContextWorkspace): string {
    const payload = {
      workspaceId: workspace.workspaceId,
      missionId: workspace.missionId,
      taskId: workspace.taskId,
      version: workspace.version,
      activeReferences: workspace.activeReferences,
    };
    return crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
  }

  private restoreActiveReferences(references: ContextWorkspace["activeReferences"]): void {
    this.activeContext.clear();
    for (const reference of references) {
      this.activeContext.addContextItem(reference);
    }
  }

  private restoreFromSnapshot(snapshot: ContextWorkspace): void {
    this.restoreActiveReferences(snapshot.activeReferences);
    this.createdAt = snapshot.createdAt;
    this.workspace = structuredClone(snapshot);
  }

  private buildWorkspace(
    workspaceId: string,
    missionId: string,
    taskId: string,
    version: number
  ): ContextWorkspace {
    const activeReferences = this.activeContext.getActiveItems();
    const contextHash = this.computeWorkspaceHash({
      workspaceId,
      missionId,
      taskId,
      version,
      contextHash: "",
      activeReferences,
      totalTokens: activeReferences.reduce((sum, item) => sum + item.tokenCount, 0),
      createdAt: this.createdAt,
      updatedAt: "",
    });
    const now = new Date().toISOString();

    return {
      workspaceId,
      missionId,
      taskId,
      version,
      contextHash,
      activeReferences,
      totalTokens: activeReferences.reduce((sum, item) => sum + item.tokenCount, 0),
      createdAt: this.createdAt,
      updatedAt: now,
    };
  }
}
