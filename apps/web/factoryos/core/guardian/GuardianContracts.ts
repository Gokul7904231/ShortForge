/**
 * FactoryOS Frontier v2 — Floor Guardian Operating Mind Contracts
 * Typed interfaces for autonomous floor supervision, auditing, decisions, worker management, and escalation.
 */

export type FloorHealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "RECOVERING";

export type GuardianState =
  | "BOOT"
  | "RESTORE"
  | "OBSERVE"
  | "AUDIT"
  | "CLASSIFY"
  | "PLAN"
  | "DISPATCH"
  | "EXECUTE"
  | "VERIFY"
  | "REPORT"
  | "IDLE"
  | "ERROR";

export type GuardianActionType =
  | "RETRY"
  | "REASSIGN"
  | "REBALANCE"
  | "RECOVER_WORKER"
  | "RECLAIM_LEASE"
  | "QUARANTINE_WORKER"
  | "THROTTLE_CONCURRENCY"
  | "CACHE_RESET"
  | "ESCALATE"
  | "RUN_LOCAL_DIAGNOSTIC";

export interface GuardianDecision {
  action: GuardianActionType;
  targetId: string;
  reason: string;
  confidence: number;
  parameters?: Record<string, unknown>;
  requiresOverseerApproval: boolean;
  timestamp: string;
}

export interface GuardianAuditReport {
  floorId: string;
  timestamp: string;
  health: FloorHealthStatus;
  score: number; // 0.0 to 1.0
  workerCount: number;
  healthyWorkers: number;
  queueDepth: number;
  activeTasks: number;
  failedTasks: number;
  recentAnomalies: number;
  findings: string[];
  recommendedActions: GuardianDecision[];
}

export interface GuardianEscalation {
  escalationId: string;
  floorId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  evidence: unknown[];
  suggestedRemediation?: string;
  escalatedAt: string;
}

export interface GuardianConfig {
  floorId: string;
  name: string;
  auditIntervalMs?: number;
  heartbeatIntervalMs?: number;
  maxConsecutiveWorkerFailures?: number;
  concurrencyLimit?: number;
}

// Preserve existing evaluation contracts for backward compatibility
export type EvaluationDecision = "PASS" | "REPAIR" | "FAIL";

export interface EvaluationMetric {
  name: string;
  score: number;
  passed: boolean;
  reason?: string;
}

export interface EvaluationReport {
  success: boolean;
  decision: EvaluationDecision;
  metrics: EvaluationMetric[];
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface Evaluator<TOutput = unknown> {
  readonly name: string;
  evaluate(output: TOutput, referenceEvidence?: unknown): Promise<EvaluationReport>;
}
