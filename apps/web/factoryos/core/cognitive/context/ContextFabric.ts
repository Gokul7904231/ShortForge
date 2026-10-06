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
  CLMContextProposalPort,
  CLMContextProposalRequest,
  CLMContextProposal,
  CLMShadowProposalResult,
  ContextProposalValidationResult,
  CONTEXT_CLM_PROPOSAL_SCHEMA_VERSION,
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

  /**
   * Wave F shadow-only entry point. A CLM proposal may be generated and
   * validated through ContextFabric, but this path never mutates the active
   * working set and never calls the durable commit path.
   */
  async proposeCLMShadowEdits(
    port: CLMContextProposalPort,
    request: Omit<CLMContextProposalRequest, "workspace">,
  ): Promise<CLMShadowProposalResult> {
    const startedAt = Date.now();
    const workspace = this.getWorkspace();
    const proposal = await port.propose({
      ...request,
      workspace,
    });
    const observedLatencyMs = Date.now() - startedAt;
    const validation = this.validateCLMShadowProposal(
      proposal,
      workspace,
      request.budget,
      port.modelRef,
      observedLatencyMs,
    );

    return {
      proposal,
      validation,
      observedLatencyMs,
      contextMutated: false,
      durableCommitAttempted: false,
    };
  }

  /**
   * Deterministic fail-closed validation for CLM shadow output.
   * Validation is pure with respect to ContextFabric state.
   */
  validateCLMShadowProposal(
    proposal: CLMContextProposal,
    workspace: ContextWorkspace = this.getWorkspace(),
    requestedBudget?: CLMContextProposalRequest["budget"],
    expectedModelRef?: string,
    observedLatencyMs = 0,
  ): ContextProposalValidationResult {
    const errors: string[] = [];
    const candidate = proposal as unknown as Record<string, unknown>;

    if (proposal.schemaVersion !== CONTEXT_CLM_PROPOSAL_SCHEMA_VERSION) {
      errors.push("unsupported proposal schemaVersion");
    }
    if (!proposal.proposalId?.trim()) errors.push("proposalId is required");
    if (proposal.workspaceId !== workspace.workspaceId) errors.push("workspaceId does not match current workspace");
    if (proposal.missionId !== workspace.missionId) errors.push("missionId does not match current workspace");
    if (proposal.taskId !== workspace.taskId) errors.push("taskId does not match current workspace");
    if (proposal.baseVersion !== workspace.version) errors.push("baseVersion does not match current workspace");
    if (proposal.provenance.source !== "CLM_SHADOW") errors.push("proposal source must be CLM_SHADOW");
    if (expectedModelRef && proposal.provenance.modelRef !== expectedModelRef) errors.push("modelRef does not match the proposal port");
    if (!proposal.provenance.modelVersion?.trim()) errors.push("modelVersion is required");
    if (!proposal.provenance.traceId?.trim()) errors.push("traceId is required");
    if (!proposal.provenance.policyVersion?.trim()) errors.push("policyVersion is required");
    if (proposal.authorityScope !== "WORKING_CONTEXT_ONLY") errors.push("authorityScope must be WORKING_CONTEXT_ONLY");
    if (!Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1) errors.push("confidence must be between 0 and 1");
    if (!Number.isFinite(proposal.estimatedCost) || proposal.estimatedCost < 0) errors.push("estimatedCost must be a non-negative finite number");
    if (!Number.isFinite(proposal.estimatedContextGrowthTokens) || proposal.estimatedContextGrowthTokens < 0) errors.push("estimatedContextGrowthTokens must be a non-negative finite number");
    if (!proposal.rationale?.trim()) errors.push("rationale is required");
    if (!Number.isFinite(Date.parse(proposal.generatedAt))) errors.push("generatedAt must be a valid timestamp");

    const budget = proposal.budget;
    if (!Number.isInteger(budget.maxEdits) || budget.maxEdits < 1) errors.push("budget.maxEdits must be a positive integer");
    if (!Number.isFinite(budget.maxContextGrowthTokens) || budget.maxContextGrowthTokens < 0) errors.push("budget.maxContextGrowthTokens must be non-negative");
    if (!Number.isFinite(budget.maxLatencyMs) || budget.maxLatencyMs <= 0) errors.push("budget.maxLatencyMs must be positive");
    if (!Number.isFinite(budget.maxCost) || budget.maxCost < 0) errors.push("budget.maxCost must be non-negative");

    if (requestedBudget) {
      if (canonicalize(budget) !== canonicalize(requestedBudget)) errors.push("proposal budget differs from the caller budget");
    }
    if (observedLatencyMs > budget.maxLatencyMs) errors.push("observed proposal latency exceeds budget.maxLatencyMs");
    if (proposal.estimatedCost > budget.maxCost) errors.push("estimatedCost exceeds budget.maxCost");
    if (proposal.estimatedContextGrowthTokens > budget.maxContextGrowthTokens) errors.push("estimated context growth exceeds budget.maxContextGrowthTokens");

    const edits = Array.isArray(proposal.edits) ? proposal.edits : [];
    if (!Array.isArray(proposal.edits)) errors.push("edits must be an array");
    if (edits.length > budget.maxEdits) errors.push("proposal edit count exceeds budget.maxEdits");

    const ids = new Set<string>();
    let minimumGrowth = 0;
    const currentRefIds = new Set(workspace.activeReferences.map((reference) => reference.refId));

    for (const edit of edits) {
      if (!edit || typeof edit !== "object") {
        errors.push("edit entries must be objects");
        continue;
      }
      if (!edit.editId?.trim()) errors.push("every edit requires an editId");
      if (ids.has(edit.editId)) errors.push("duplicate editId " + edit.editId);
      ids.add(edit.editId);
      if (edit.actor !== "CLM_PROPOSAL") errors.push("every shadow edit must use actor CLM_PROPOSAL");
      if (edit.baseVersion !== workspace.version) errors.push("shadow edit " + edit.editId + " has a stale baseVersion");
      if (!edit.reason?.trim()) errors.push("shadow edit " + edit.editId + " requires a reason");

      if (edit.type === "RETAIN") {
        if (!edit.reference || typeof edit.reference !== "object" || !edit.reference.refId) {
          errors.push("RETAIN edit " + edit.editId + " requires a reference");
        } else if (!currentRefIds.has(edit.reference.refId)) {
          const tokenCount = edit.reference.tokenCount;
          if (!Number.isFinite(tokenCount) || tokenCount < 0) errors.push("RETAIN edit " + edit.editId + " has invalid reference tokenCount");
          else minimumGrowth += tokenCount;
        }
      } else if (edit.type !== "REORDER" && edit.type !== "OPTIMIZE") {
        errors.push("edit " + edit.editId + " uses an unsupported context operation");
      }
    }

    if (proposal.estimatedContextGrowthTokens < minimumGrowth) {
      errors.push("estimated context growth is below deterministic minimum growth");
    }

    const forbiddenKeys = [
      "capabilityGrant",
      "lease",
      "treasuryAdmission",
      "casMutation",
      "f07Verification",
      "executionAuthority",
      "publish",
      "modelPromotion",
    ];
    for (const key of forbiddenKeys) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) errors.push("forbidden authority marker " + key);
    }

    const expectedFingerprint = this.computeProposalFingerprint(proposal);
    if (proposal.proposalFingerprint !== expectedFingerprint) errors.push("proposalFingerprint mismatch");

    return errors.length === 0
      ? { valid: true, errors: [], normalizedProposal: structuredClone(proposal) }
      : { valid: false, errors };
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

  private computeProposalFingerprint(proposal: CLMContextProposal): string {
    const payload = {
      schemaVersion: proposal.schemaVersion,
      proposalId: proposal.proposalId,
      workspaceId: proposal.workspaceId,
      missionId: proposal.missionId,
      taskId: proposal.taskId,
      baseVersion: proposal.baseVersion,
      generatedAt: proposal.generatedAt,
      provenance: proposal.provenance,
      authorityScope: proposal.authorityScope,
      confidence: proposal.confidence,
      estimatedCost: proposal.estimatedCost,
      estimatedContextGrowthTokens: proposal.estimatedContextGrowthTokens,
      budget: proposal.budget,
      edits: proposal.edits,
      rationale: proposal.rationale,
    };
    return crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
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
