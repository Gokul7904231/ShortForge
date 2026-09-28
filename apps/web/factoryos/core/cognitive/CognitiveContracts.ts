/**
 * FactoryOS Frontier v2 — Cognitive Operating Plane Contracts
 * Defines data structures for RLM, Active Context Management, Evidence Graphs,
 * Strategic Meta-Thinking, Contradiction Resolution, Predictive Reasoning, and Agent Economics.
 */

export interface ContextReference {
  readonly refId: string;
  readonly type: "TELEMETRY" | "LOG" | "EVENT" | "CASE_HISTORY" | "DOCUMENT" | "MEMORY" | "CODE";
  readonly title: string;
  readonly summary: string;
  readonly tokenCount: number;
  readonly timestamp: string;
  readonly confidence: number;
  readonly source: string;
  readonly tags: string[];
  readonly rawUri?: string;
  readonly isDereferenced: boolean;
}

export interface ContextSlice {
  readonly sliceId: string;
  readonly references: ContextReference[];
  readonly totalTokens: number;
  readonly compressionRatio: number;
  readonly generatedAt: string;
}

export interface RecursionBudget {
  readonly maxDepth: number;
  readonly maxTokens: number;
  readonly maxTimeMs: number;
  readonly maxSubcalls: number;
  readonly maxCost: number;
  readonly maxParallelBranches: number;
}

export interface RecursionNode {
  readonly nodeId: string;
  readonly parentId?: string;
  readonly depth: number;
  readonly query: string;
  readonly rationale: string;
  readonly tokensConsumed: number;
  readonly cost: number;
  readonly durationMs: number;
  readonly status: "PENDING" | "RUNNING" | "COMPLETED" | "TERMINATED_BUDGET" | "FAILED";
  readonly findings: string[];
  readonly subcallIds: string[];
}

export interface RecursionTrace {
  readonly traceId: string;
  readonly rootQuery: string;
  readonly budget: RecursionBudget;
  readonly nodes: Record<string, RecursionNode>;
  readonly totalTokens: number;
  readonly totalCost: number;
  readonly totalDurationMs: number;
  readonly terminationReason?: string;
}

export type ContextOperationType =
  | "RETAIN"
  | "COMPRESS"
  | "ARCHIVE"
  | "REORDER"
  | "RETRIEVE"
  | "DEREFERENCE"
  | "INVALIDATE";

export interface ContextAuditRecord {
  readonly operation: ContextOperationType;
  readonly targetRefId: string;
  readonly reason: string;
  readonly timestamp: string;
}

export interface EvidenceNode {
  readonly nodeId: string;
  readonly nodeType: "SYMPTOM" | "EVIDENCE" | "HYPOTHESIS" | "TEST" | "ACTION" | "REPAIR" | "VERIFICATION";
  readonly title: string;
  readonly description: string;
  readonly confidence: number;
  readonly source: string;
  readonly timestamp: string;
  readonly data: Record<string, unknown>;
  readonly verified: boolean;
}

export interface EvidenceEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly relationship: "CAUSES" | "SUPPORTS" | "CONTRADICTS" | "TESTS" | "RESOLVES" | "VERIFIES";
  readonly weight: number;
  readonly explanation?: string;
}

export interface EvidenceGraph {
  readonly graphId: string;
  readonly caseId: string;
  readonly nodes: Record<string, EvidenceNode>;
  readonly edges: EvidenceEdge[];
  readonly createdAt: string;
  updatedAt: string;
}

export interface ConflictRecord {
  readonly conflictId: string;
  readonly caseId: string;
  readonly claimA: { readonly claimant: string; readonly claim: string; readonly evidenceIds: string[] };
  readonly claimB: { readonly claimant: string; readonly claim: string; readonly evidenceIds: string[] };
  readonly telemetryPerspective?: { readonly metrics: Record<string, unknown>; readonly supports: "A" | "B" | "NEITHER" };
  status: "DETECTED" | "INVESTIGATING" | "RESOLVED" | "UNRESOLVED";
  resolutionRationale?: string;
  selectedClaim?: "A" | "B" | "SYNTHESIS";
  resolvedAt?: string;
  resolutionConfidence?: number;
}

export interface MetaThinkingEvaluation {
  readonly evaluationId: string;
  readonly planIsStillValid: boolean;
  readonly isInvestigationStuck: boolean;
  readonly isCollectingUselessEvidence: boolean;
  readonly areAgentsDuplicatingWork: boolean;
  readonly isRecursionExcessive: boolean;
  readonly shouldReplan: boolean;
  readonly shouldChangeAllocation: boolean;
  readonly shouldTerminate: boolean;
  readonly confidenceScore: number;
  readonly rationale: string;
  readonly recommendedAdjustments: string[];
}

export type ModelTier = "DETERMINISTIC" | "SMALL_FAST" | "LARGE_REASONER" | "RECURSIVE_RLM" | "MULTI_AGENT_SWARM";

export interface ModelRouteDecision {
  readonly taskDescription: string;
  readonly selectedTier: ModelTier;
  readonly estimatedTokens: number;
  readonly estimatedCost: number;
  readonly estimatedLatencyMs: number;
  readonly rationale: string;
}

export interface DegradationTrend {
  readonly floorId: string;
  readonly metricName: string;
  readonly currentRateOfChange: number; // e.g. +5% per min
  readonly estimatedTimeToThresholdMs: number;
  readonly failureProbability: number; // 0.0 to 1.0
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly trendSummary: string;
}

export interface PreventiveAction {
  readonly actionId: string;
  readonly floorId: string;
  readonly target: string;
  readonly actionType: string;
  readonly rationale: string;
  readonly riskScore: number;
  readonly requiresGuardianApproval: boolean;
  readonly executed: boolean;
}
