/**
 * Canonical active working-context facade.
 *
 * Existing ContextIndexer / ContextCompiler / ActiveContextManager remain
 * implementation primitives. ContextFabric is the single logical boundary
 * that coordinates them for active context.
 */

import * as crypto from "node:crypto";
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

  private readonly createdAt: string;
  private workspace: ContextWorkspace;

  constructor(params?: {
    workspaceId?: string;
    missionId?: string;
    taskId?: string;
    indexer?: ContextIndexer;
    activeContext?: ActiveContextManager;
    compiler?: ContextCompiler;
    maxActiveTokens?: number;
  }) {
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

  private buildWorkspace(
    workspaceId: string,
    missionId: string,
    taskId: string,
    version: number
  ): ContextWorkspace {
    const activeReferences = this.activeContext.getActiveItems();
    const payload = { workspaceId, missionId, taskId, version, activeReferences };
    const contextHash = crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
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
