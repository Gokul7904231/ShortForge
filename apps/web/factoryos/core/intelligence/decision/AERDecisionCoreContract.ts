/**
 * ShortForge / FactoryOS — AER Decision Core Contract
 *
 * AER Runtime owns epistemic state, evidence, probes, budgets and routing.
 * AER Decision Core is a learned, bounded typed-decision model.
 * Ascalon remains the deep-cognition model.
 */

import type {
  DecisionAnswer,
  DecisionBatchRequest,
  DecisionQuestion,
} from "./DecisionContracts";

export type AERDecisionCoreMode = "CHOICE" | "SCORE" | "NOUL";

export interface AERDecisionCoreInput {
  readonly request: DecisionBatchRequest;
  readonly epistemicContext?: Record<string, unknown>;
}

export interface AERDecisionCoreOutput {
  readonly batchId: string;
  readonly answers: readonly DecisionAnswer[];
  readonly modelRef: string;
  readonly modelVersion: string;
  readonly inferenceLatencyMs: number;
  readonly calibrationStatus:
    | "CALIBRATED"
    | "UNCALIBRATED"
    | "ESTIMATED"
    | "UNKNOWN";
  readonly probabilitySemantics:
    | "ABSOLUTE"
    | "CANDIDATE_RELATIVE"
    | "UNKNOWN";
  readonly trainingEligible: boolean;
  readonly productionAuthority: boolean;
}

export interface AERDecisionCoreProvider {
  readonly providerName: string;
  readonly supportedModes: readonly AERDecisionCoreMode[];
  evaluate(input: AERDecisionCoreInput): Promise<AERDecisionCoreOutput>;
}

export const AER_DECISION_CORE_AUTHORITY = {
  productionAuthority: false,
  canAuthorizeExecution: false,
  canGrantCapability: false,
  canMintLease: false,
  canChangeFencing: false,
  canPublish: false,
  canCertifyF07: false,
} as const;

export function assertDynamicQuestionContract(
  questions: readonly DecisionQuestion[],
): void {
  if (questions.length === 0) {
    throw new Error("AER Decision Core requires at least one question");
  }

  const ids = new Set<string>();
  for (const question of questions) {
    if (!question.id.trim()) {
      throw new Error("AER Decision Core question id must be non-empty");
    }
    if (ids.has(question.id)) {
      throw new Error("Duplicate AER Decision Core question id: " + question.id);
    }
    ids.add(question.id);

    if (question.type === "CHOICE") {
      if (question.options.length < 2) {
        throw new Error("AER CHOICE questions require at least two options");
      }
      if (new Set(question.options).size !== question.options.length) {
        throw new Error("AER CHOICE options must be unique");
      }
    }

    if (question.type === "SCORE") {
      if (question.rubric.length < 2) {
        throw new Error("AER SCORE questions require at least two rubric levels");
      }
      const levels = question.rubric.map((item) => item.level);
      if (new Set(levels).size !== levels.length) {
        throw new Error("AER SCORE rubric levels must be unique");
      }
    }

    if (question.type === "NOUL") {
      const threshold = question.threshold ?? 0.5;
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        throw new Error("AER NOUL threshold must be within [0,1]");
      }
    }
  }
}
