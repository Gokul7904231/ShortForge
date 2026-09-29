/**
 * ShortForge / FactoryOS — Ascalon Epistemic Runtime (AER) contracts.
 *
 * AER is epistemic/advisory infrastructure. It never grants capabilities,
 * executes side effects, declares F07 truth, or replaces DecisionEngine,
 * Guardian, Agent Execution Fabric, or Floor Governance Cell.
 */

export type EpistemicStateStatus =
  | "CONFIRMED"
  | "SUPPORTED"
  | "INFERRED"
  | "UNCERTAIN"
  | "CONTRADICTED"
  | "UNRESOLVED"
  | "STALE"
  | "NOT_APPLICABLE";

export type MeasurementType =
  | "REAL_MEASURED"
  | "OBSERVED_MEASUREMENT"
  | "VERIFIED_FACT"
  | "MODEL_INFERENCE"
  | "HEURISTIC_ESTIMATE"
  | "UNVERIFIED_ASSERTION";

export type CalibrationStatus =
  | "CALIBRATED"
  | "UNCALIBRATED"
  | "ESTIMATED"
  | "UNKNOWN";

export type EpistemicCognitiveMode =
  | "DETERMINISTIC"
  | "MICRO"
  | "DEEP"
  | "SPECIALIST"
  | "HUMAN";

export type AscalonInvocationReason =
  | "NO_MATERIAL_UNCERTAINTY"
  | "MICRO_SUFFICIENT"
  | "MATERIAL_UNCERTAINTY"
  | "MATERIAL_CONTRADICTION"
  | "MULTIPLE_VIABLE_HYPOTHESES"
  | "HIGH_IMPACT_UNRESOLVED"
  | "EXPECTED_VALUE_BELOW_THRESHOLD"
  | "ASCALON_UNAVAILABLE"
  | "ASCALON_BUDGET_EXHAUSTED"
  | "HUMAN_ESCALATION_REQUIRED";

export interface AscalonInvocationBudget {
  readonly maxTimeMs: number;
  readonly maxCallsRemaining: number;
  readonly maxCostUnits: number;
}

export interface EpistemicMeasurement {
  readonly measurementId: string;
  readonly dimension: string;
  readonly value: unknown;
  readonly measurementType: MeasurementType;
  readonly sourceRef: string;
  readonly observedAt: string;
  readonly evidenceRefs: readonly string[];
  readonly calibrationStatus?: CalibrationStatus;
  readonly freshnessSeconds?: number;
  readonly authoritative?: boolean;
}

export interface EpistemicFact {
  readonly factId: string;
  readonly statement: string;
  readonly sourceRefs: readonly string[];
  readonly measurementRefs?: readonly string[];
  readonly status: "CONFIRMED" | "SUPPORTED" | "INFERRED";
}

export interface EpistemicUnknown {
  readonly unknownId: string;
  readonly question: string;
  readonly reason: string;
  readonly material: boolean;
  readonly evidenceRefs: readonly string[];
}

export interface EpistemicContradiction {
  readonly contradictionId: string;
  readonly summary: string;
  readonly leftRefs: readonly string[];
  readonly rightRefs: readonly string[];
  readonly material: boolean;
  readonly evidenceRefs: readonly string[];
}

export type HypothesisStatus =
  | "VIABLE"
  | "SUPPORTED"
  | "CONTRADICTED"
  | "ELIMINATED"
  | "UNKNOWN";

export interface EpistemicHypothesis {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly support: number;
  readonly status: HypothesisStatus;
  readonly evidenceRefs: readonly string[];
  readonly requiredProbeIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ProbeRiskClass =
  | "READ_ONLY"
  | "SENSITIVE_READ"
  | "MUTATING";

export interface CognitiveProbe {
  readonly probeId: string;
  readonly type: string;
  readonly target: Record<string, unknown>;
  readonly requiredCapabilities: readonly string[];
  readonly estimatedLatencyMs: number;
  readonly estimatedCostUnits: number;
  readonly expectedInformationGain: number; // ranking signal only, never a probability
  readonly riskClass: ProbeRiskClass;
  readonly timeoutMs: number;
  readonly cacheable: boolean;
  readonly parallelizable: boolean;
  readonly evidenceProduced: readonly string[];
  readonly authorized?: boolean;
}

export interface ProbePlanEntry extends CognitiveProbe {
  readonly utilityScore: number;
  readonly rejectionReason?: string;
}

export interface EpistemicImpact {
  readonly affectedFloors: readonly string[];
  readonly affectedArtifacts: readonly string[];
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly reversible: boolean;
}

export interface EpistemicBudget {
  readonly maxEpistemicTimeMs: number;
  readonly maxDeepCalls: number;
  readonly maxMicroCalls: number;
  readonly maxProbeCount: number;
  readonly maxCostUnits: number;
}

export interface EpistemicUsage {
  readonly elapsedMs: number;
  readonly deepCalls: number;
  readonly microCalls: number;
  readonly probesExecuted: number;
  readonly costUnits: number;
}

export interface CognitiveRecommendation {
  readonly mode: EpistemicCognitiveMode;
  readonly reason: string;
  readonly reasonCode: AscalonInvocationReason;
  readonly deadlineMs: number;
  /**
   * Policy-derived normalized value estimate used for routing.
   * This is a ranking/triage signal, not a probability and not truth.
   */
  readonly expectedValue: number;
  readonly shouldInvokeAscalon: boolean;
  readonly estimatedCostUnits: number;
  readonly budget: AscalonInvocationBudget;
}

export interface EpistemicState {
  readonly schemaVersion: "1.0";
  readonly contextId: string;
  readonly state: EpistemicStateStatus;
  readonly known: readonly EpistemicFact[];
  readonly unknown: readonly EpistemicUnknown[];
  readonly contradictions: readonly EpistemicContradiction[];
  readonly measurements: readonly EpistemicMeasurement[];
  readonly hypotheses: readonly EpistemicHypothesis[];
  readonly recommendedProbes: readonly ProbePlanEntry[];
  readonly evidenceRefs: readonly string[];
  readonly investigationHistory: readonly Record<string, unknown>[];
  readonly impact: EpistemicImpact;
  readonly cognitiveRecommendation: CognitiveRecommendation;
  readonly budgets: EpistemicBudget;
  readonly usage: EpistemicUsage;
  readonly freshness: Record<string, unknown>;
  readonly authorityClass: "MODEL_ADVISORY";
}

export interface EpistemicContext extends EpistemicState {
  readonly contextFingerprint: string;
  readonly serializedTokenEstimate: number;
  readonly expiresAt: string;
  readonly redactionState: "CLEAN";
}

export interface AscalonEpistemicHandoff {
  readonly schemaVersion: "1.0";
  readonly handoffId: string;
  readonly contextFingerprint: string;
  readonly mode: "SHADOW";
  readonly modelAuthority: "ADVISORY_ONLY";
  readonly shouldInvokeAscalon: boolean;
  readonly invocationReason: AscalonInvocationReason;
  readonly expectedValue: number;
  readonly budget: AscalonInvocationBudget;
  readonly epistemicContext: EpistemicContext;
  readonly instructions: readonly string[];
}

export function assertUnitInterval(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`[AER] ${fieldName} must be within [0,1].`);
  }
}

export function validateMeasurement(measurement: EpistemicMeasurement): void {
  if (!measurement.measurementId.trim()) throw new Error("[AER] measurementId is required.");
  if (!measurement.dimension.trim()) throw new Error("[AER] measurement dimension is required.");
  if (!measurement.sourceRef.trim()) throw new Error("[AER] measurement sourceRef is required.");
  if (!measurement.observedAt.trim()) throw new Error("[AER] measurement observedAt is required.");
  if (!measurement.evidenceRefs) throw new Error("[AER] measurement evidenceRefs is required.");
  if (measurement.freshnessSeconds !== undefined && measurement.freshnessSeconds < 0) {
    throw new Error("[AER] freshnessSeconds cannot be negative.");
  }
  if (measurement.authoritative && measurement.measurementType === "MODEL_INFERENCE") {
    throw new Error("[AER] model inference cannot be authoritative.");
  }
}

export function validateHypothesis(hypothesis: EpistemicHypothesis): void {
  assertUnitInterval(hypothesis.support, "hypothesis.support");
  if (!hypothesis.hypothesisId.trim()) throw new Error("[AER] hypothesisId is required.");
  if (!hypothesis.statement.trim()) throw new Error("[AER] hypothesis statement is required.");
}
