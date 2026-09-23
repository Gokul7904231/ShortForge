/**
 * ShortForge / FactoryOS — Typed Decision Fabric Contracts
 *
 * Defines Noul (Binary Truth), Choice (Categorical Selection),
 * and Score (Rubric Level) primitives with strict Probability/Confidence separation.
 * Enhanced for Project Ascalon training readiness with rigorous validation codes,
 * evidence tracking, and epistemic uncertainty calibration.
 */

export type DecisionStatus = "VALID" | "INVALID" | "UNRESOLVED" | "ESCALATED";

export type DecisionValidationErrorCode =
  | "INVALID_JSON"
  | "MISSING_FIELD"
  | "INVALID_ENUM"
  | "INVALID_PROBABILITY"
  | "INVALID_DISTRIBUTION"
  | "INVALID_CONFIDENCE"
  | "INVALID_RUBRIC_LEVEL"
  | "UNKNOWN_QUESTION"
  | "DUPLICATE_QUESTION"
  | "MISSING_QUESTION";

export interface DecisionEvidence {
  readonly evidenceIds: readonly string[];
  readonly evidenceCount: number;
  readonly authoritativeEvidence: boolean;
  readonly contradictoryEvidence: boolean;
  readonly sourceFreshness?: string;
  readonly sourceAuthority?: string;
}

export type CalibrationStatus = "CALIBRATED" | "UNCALIBRATED" | "ESTIMATED" | "UNKNOWN";

export interface DecisionUncertainty {
  readonly modelProbability?: number;
  readonly epistemicConfidence: number;
  readonly calibrationStatus: CalibrationStatus;
  readonly uncertaintyReason?: string;
}

export interface NoulQuestion {
  readonly id: string;
  readonly type: "NOUL";
  readonly question: string;
  readonly contextSlice?: Record<string, unknown>;
  readonly threshold?: number; // Default 0.5
}

export interface NoulAnswer {
  readonly questionId: string;
  readonly type: "NOUL";
  readonly value: boolean;
  readonly probabilityTrue: number; // Uncertainty: [0.0, 1.0]
  readonly confidence: number; // Epistemic certainty: [0.0, 1.0]
  readonly reasoning?: string;
  readonly isDeterministic?: boolean;
  readonly status?: DecisionStatus;
  readonly validationErrorCode?: DecisionValidationErrorCode;
  readonly evidence?: DecisionEvidence;
  readonly uncertainty?: DecisionUncertainty;
}

export interface ChoiceQuestion<T extends string = string> {
  readonly id: string;
  readonly type: "CHOICE";
  readonly question: string;
  readonly options: readonly T[];
  readonly contextSlice?: Record<string, unknown>;
}

export interface ChoiceAnswer<T extends string = string> {
  readonly questionId: string;
  readonly type: "CHOICE";
  readonly selected: T;
  readonly probabilities: Record<T, number>; // Probability distribution summing to ~1.0
  readonly confidence: number; // Epistemic belief: [0.0, 1.0]
  readonly reasoning?: string;
  readonly isDeterministic?: boolean;
  readonly status?: DecisionStatus;
  readonly validationErrorCode?: DecisionValidationErrorCode;
  readonly evidence?: DecisionEvidence;
  readonly uncertainty?: DecisionUncertainty;
}

export interface RubricLevel {
  readonly level: number;
  readonly label: string;
  readonly description: string;
}

export interface ScoreQuestion {
  readonly id: string;
  readonly type: "SCORE";
  readonly question: string;
  readonly rubric: readonly RubricLevel[];
  readonly contextSlice?: Record<string, unknown>;
}

export interface ScoreAnswer {
  readonly questionId: string;
  readonly type: "SCORE";
  readonly selectedLevel: number;
  readonly selectedLabel: string;
  readonly score: number; // Normalized [0.0, 1.0]
  readonly distribution: Record<number, number>;
  readonly confidence: number; // Epistemic belief: [0.0, 1.0]
  readonly reasoning?: string;
  readonly isDeterministic?: boolean;
  readonly status?: DecisionStatus;
  readonly validationErrorCode?: DecisionValidationErrorCode;
  readonly evidence?: DecisionEvidence;
  readonly uncertainty?: DecisionUncertainty;
}

export type DecisionQuestion = NoulQuestion | ChoiceQuestion<any> | ScoreQuestion;
export type DecisionAnswer = NoulAnswer | ChoiceAnswer<any> | ScoreAnswer;

export interface DecisionBatchRequest {
  readonly batchId: string;
  readonly taskId?: string;
  readonly missionId?: string;
  readonly contextFingerprint?: string;
  readonly questions: readonly DecisionQuestion[];
  readonly sharedContext?: Record<string, unknown>;
}

export interface AdapterMetadata {
  readonly adapterType: string;
  readonly implementationVersion: string;
  readonly isProductionAuthority: boolean;
  readonly isTrainingEligible: boolean;
}

export interface DecisionBatchResult {
  readonly batchId: string;
  readonly evaluatedAt: string;
  readonly answers: readonly DecisionAnswer[];
  readonly answersById: Record<string, DecisionAnswer>;
  readonly adapterUsed: "DETERMINISTIC" | "LLM" | "JEV_SHADOW" | "HEURISTIC_SHADOW" | "HYBRID";
  readonly totalLatencyMs: number;
  readonly minConfidence: number;
  readonly shouldEscalate: boolean; // True if minConfidence < threshold (e.g. 0.70)
  readonly status?: DecisionStatus;
  readonly adapterMetadata?: AdapterMetadata;
}

export interface IDecisionAdapter {
  readonly adapterName: string;
  evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult>;
}
