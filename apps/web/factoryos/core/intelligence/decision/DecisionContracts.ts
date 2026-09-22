/**
 * ShortForge / FactoryOS — Typed Decision Fabric Contracts
 *
 * Defines Noul (Binary Truth), Choice (Categorical Selection),
 * and Score (Rubric Level) primitives with strict Probability/Confidence separation.
 */

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
  readonly probabilities: Record<T, number>; // Probability distribution summing to 1.0
  readonly confidence: number; // Epistemic belief: [0.0, 1.0]
  readonly reasoning?: string;
  readonly isDeterministic?: boolean;
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

export interface DecisionBatchResult {
  readonly batchId: string;
  readonly evaluatedAt: string;
  readonly answers: readonly DecisionAnswer[];
  readonly answersById: Record<string, DecisionAnswer>;
  readonly adapterUsed: "DETERMINISTIC" | "LLM" | "JEV_SHADOW" | "HYBRID";
  readonly totalLatencyMs: number;
  readonly minConfidence: number;
  readonly shouldEscalate: boolean; // True if minConfidence < threshold (e.g. 0.70)
}

export interface IDecisionAdapter {
  readonly adapterName: string;
  evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult>;
}
