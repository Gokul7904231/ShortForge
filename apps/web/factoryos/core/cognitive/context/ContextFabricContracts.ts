/**
 * Canonical active working-context contracts.
 *
 * ContextFabric is a working-context boundary, not a policy, security,
 * economic, artifact, verification, or execution authority.
 */

import type { ContextReference, ContextOperationType } from "../CognitiveContracts";
import type { ContextOrchestrator } from "../rlm/RecursiveInvestigator";

export type ContextOrchestrationPort = Pick<
  ContextOrchestrator,
  "indexContext" | "runRecursiveInvestigation"
>;

export type ContextEditActor = "SYSTEM" | "CLM_PROPOSAL" | "OPERATOR";

export interface ContextEditBase {
  readonly editId: string;
  readonly baseVersion: number;
  readonly actor: ContextEditActor;
  readonly reason: string;
}

export type ContextEdit =
  | (ContextEditBase & { readonly type: "RETAIN"; readonly reference: ContextReference })
  | (ContextEditBase & { readonly type: "REORDER"; readonly priorityType?: ContextReference["type"] })
  | (ContextEditBase & { readonly type: "OPTIMIZE" });

export interface ContextWorkspace {
  readonly workspaceId: string;
  readonly missionId: string;
  readonly taskId: string;
  readonly version: number;
  readonly contextHash: string;
  readonly activeReferences: ContextReference[];
  readonly totalTokens: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContextFabricSnapshot extends ContextWorkspace {
  readonly health: {
    readonly totalItems: number;
    readonly totalTokens: number;
    readonly staleCount: number;
    readonly redundantCount: number;
    readonly lowConfidenceCount: number;
    readonly healthScore: number;
  };
  readonly recentOperations: ContextOperationType[];
}

export interface ContextFabricSeed {
  readonly missionId: string;
  readonly taskId: string;
  readonly references: ContextReference[];
}

/**
 * Wave F is a proposal-only contract. A CLM implementation can produce this
 * envelope, but it cannot mutate active context or durable state through it.
 */
export const CONTEXT_CLM_PROPOSAL_SCHEMA_VERSION = "1.0.0" as const;

export interface ContextProposalBudget {
  readonly maxEdits: number;
  readonly maxContextGrowthTokens: number;
  readonly maxLatencyMs: number;
  readonly maxCost: number;
}

export interface ContextProposalProvenance {
  readonly source: "CLM_SHADOW";
  readonly modelRef: string;
  readonly modelVersion: string;
  readonly traceId: string;
  readonly policyVersion: string;
}

export interface CLMContextProposal {
  readonly schemaVersion: typeof CONTEXT_CLM_PROPOSAL_SCHEMA_VERSION;
  readonly proposalId: string;
  readonly workspaceId: string;
  readonly missionId: string;
  readonly taskId: string;
  readonly baseVersion: number;
  readonly generatedAt: string;
  readonly provenance: ContextProposalProvenance;
  readonly authorityScope: "WORKING_CONTEXT_ONLY";
  readonly confidence: number;
  readonly estimatedCost: number;
  readonly estimatedContextGrowthTokens: number;
  readonly budget: ContextProposalBudget;
  readonly edits: readonly ContextEdit[];
  readonly rationale: string;
  readonly proposalFingerprint: string;
}

export interface CLMContextProposalRequest {
  readonly workspace: ContextWorkspace;
  readonly traceId: string;
  readonly policyVersion: string;
  readonly candidateReferences: readonly ContextReference[];
  readonly budget: ContextProposalBudget;
}

export interface CLMContextProposalPort {
  readonly modelRef: string;
  propose(request: CLMContextProposalRequest): Promise<CLMContextProposal>;
}

export interface ContextProposalValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly normalizedProposal?: CLMContextProposal;
}

export interface CLMShadowProposalResult {
  readonly proposal: CLMContextProposal;
  readonly validation: ContextProposalValidationResult;
  readonly observedLatencyMs: number;
  readonly contextMutated: false;
  readonly durableCommitAttempted: false;
}
