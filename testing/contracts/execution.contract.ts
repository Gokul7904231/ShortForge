export type TruthLevel =
  | "PHYSICAL"
  | "OBSERVED"
  | "VERIFIED"
  | "ASSERTED"
  | "INFERRED"
  | "UNKNOWN"
  | "RECONSTRUCTED";

export type ExecutionTruthMode =
  | "REAL"
  | "REAL_WITH_DEGRADED_FALLBACK"
  | "SIMULATED"
  | "MOCKED"
  | "BLOCKED";

export type StageExecutionStatus =
  | "INVOKED"
  | "RETURNED"
  | "OBSERVED"
  | "OUTPUT_VERIFIED"
  | "CONSUMED_DOWNSTREAM"
  | "BYPASSED"
  | "FAILED";

export type DurationTruth =
  | "PHYSICAL"
  | "PROVIDER_REPORTED"
  | "ESTIMATED"
  | "SYNTHETIC"
  | "UNKNOWN";

export type ResearchTruth =
  | "REAL_WEB_RESEARCH"
  | "LOCAL_DETERMINISTIC_ANALYSIS"
  | "SYNTHETIC_FIXTURE"
  | "MOCKED_RESEARCH"
  | "DEGRADED_RESEARCH";

export interface EventActor {
  readonly type: "user" | "agent" | "system";
  readonly id: string;
  readonly role?: string;
  readonly floor?: string;
}

export type MissionActionType =
  | "mission_created"
  | "mission_started"
  | "mission_completed"
  | "mission_failed"
  | "decision"
  | "dag_planned"
  | "floor_start"
  | "floor_complete"
  | "capability_start"
  | "capability_complete"
  | "artifact_created"
  | "artifact_consumed"
  | "verification"
  | "failure"
  | "retry"
  | "recovery"
  | "delivery";

export interface MissionEvent {
  readonly id: string;
  readonly missionId: string;
  readonly runId: string;
  readonly timestamp: string;
  readonly truthLevel: TruthLevel;
  readonly actor: EventActor;
  readonly action: {
    readonly type: MissionActionType;
    readonly name?: string;
  };
  readonly subjectId: string;
  readonly taskNodeId?: string;
  readonly capabilityId?: string;
  readonly executionId?: string;
  readonly sourceIdentifier?: string;
  readonly durationMs?: number;
  readonly durationTruth?: DurationTruth;
  readonly consumedArtifactIds?: string[];
  readonly producedArtifactIds?: string[];
  readonly inputs?: string[];
  readonly outputs?: string[];
  readonly metadata?: Record<string, unknown>;
}
