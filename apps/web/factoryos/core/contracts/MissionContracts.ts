/**
 * FactoryOS Frontier v2 / v3 — Mission Contracts
 * Defines the first-class persistent autonomous Mission primitive, state machine, and budget models.
 */

export type MissionState =
  | "CREATED"
  | "PLANNING"
  | "AUTHORIZED"
  | "RUNNING"
  | "PAUSED"
  | "BLOCKED"
  | "REPLANNING"
  | "VERIFYING"
  | "COMPLETING"
  | "COMPLETED"
  | "FAILED"
  | "RECOVERING"
  | "RETRYING"
  | "WAITING_FOR_APPROVAL"
  | "CANCELLED"
  | "TERMINATED";

export type MissionAutonomyMode = "ASSIST" | "AUTO" | "AUTOPILOT";

export type TaskExecutionType = "DETERMINISTIC" | "AGENTIC" | "HYBRID";

export interface MissionBudget {
  readonly maxTokens?: number;
  readonly maxCostUsd?: number;
  readonly maxDurationMs?: number;
  readonly maxParallelTasks?: number;
  readonly maxRetries?: number;
  tokensConsumed: number;
  costUsd: number;
  durationMs: number;
  retriesUsed?: number;
}

export interface MissionProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  percentComplete: number;
  currentPhase: string;
}

export interface MissionEventRecord {
  readonly timestamp: string;
  readonly eventType: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export type SuccessPredicateType =
  | "FLOOR_HEALTHY"
  | "NO_BLOCKING_CASES"
  | "TASKS_COMPLETE"
  | "VALIDATOR_PASSED"
  | "OBJECTIVE_MET"
  | "RESOURCE_CONDITION_MET"
  | "ARTIFACT_VERIFIED"
  | "EVIDENCE_COMMITTED";

export interface MissionSuccessCondition {
  readonly id: string;
  readonly predicateType: SuccessPredicateType;
  readonly target?: string;
  readonly expectedValue?: unknown;
  readonly description: string;
}

export interface DefinitionOfDoneItem {
  readonly id: string;
  readonly description: string;
  readonly requiredArtifactType?: string;
  readonly validatorName?: string;
  satisfied: boolean;
  evidenceId?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface MissionCheckpoint {
  readonly checkpointId: string;
  readonly missionId: string;
  readonly stepIndex: number;
  readonly phase: string;
  readonly timestamp: string;
  readonly completedTaskIds: string[];
  readonly pendingTaskIds: string[];
  readonly artifactIds: string[];
  readonly evidenceIds: string[];
  readonly stateSnapshot: Record<string, unknown>;
}

export interface MissionScope {
  readonly factoryId?: string;
  readonly projectId?: string;
  readonly floorIds?: string[];
  readonly workerIds?: string[];
  readonly agentIds?: string[];
  readonly [key: string]: unknown;
}

export interface MissionCompletionResult {
  readonly eligible: boolean;
  readonly passed: boolean;
  readonly successConditions: { condition: string; passed: boolean; reason?: string }[];
  readonly failedConditions: string[];
  readonly outstandingTasks: string[];
  readonly unresolvedCases: string[];
  readonly validatorResults: { validatorId: string; status: "PASSED" | "FAILED" | "PENDING"; reason?: string }[];
  readonly scopeHealth: { healthy: boolean; issues: string[] };
  readonly objectiveResult: { met: boolean; summary: string };
  readonly evidence: Record<string, unknown>[];
  readonly definitionOfDoneResults?: { item: string; satisfied: boolean }[];
}

export interface MissionTask {
  readonly taskId: string;
  readonly missionId: string;
  readonly name: string;
  readonly executionType: TaskExecutionType;
  readonly ownerAgent: string;
  readonly capabilityRequired: string;
  readonly input: Record<string, unknown>;
  readonly expectedOutputType: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  readonly timeoutMs: number;
  readonly maxRetries: number;
  retryCount: number;
  outputArtifactId?: string;
  evidenceId?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Mission {
  readonly missionId: string;
  readonly goal: string;
  readonly objective: string;
  readonly constraints: string[];
  readonly priority: number; // 1 = highest
  version: number;
  status: MissionState;
  autonomyMode?: MissionAutonomyMode;
  readonly createdAt: string;
  updatedAt: string;
  readonly owner: string;
  readonly scope?: MissionScope;
  worldStateSnapshot?: Record<string, unknown>;
  taskIds: string[];
  tasks?: MissionTask[];
  activeRunId?: string;
  progress: MissionProgress;
  metrics: Record<string, number>;
  readonly successConditions: string[];
  readonly terminationConditions: string[];
  readonly failurePolicy: "RETRY" | "FAIL_FAST" | "REPLAN" | "PAUSE" | "ESCALATE";
  budget: MissionBudget;
  eventHistory: MissionEventRecord[];
  checkpoints?: MissionCheckpoint[];
  definitionOfDone?: DefinitionOfDoneItem[];
  verificationState?: {
    verified: boolean;
    allChecksPassed: boolean;
    evidenceCount: number;
    lastVerifiedAt?: string;
  };
  creativeStateId?: string;
  artifactIds?: string[];
  evidenceIds?: string[];
  cancellationReason?: string;
  failureReason?: string;
  deadline?: string; // ISO deadline timestamp
}
