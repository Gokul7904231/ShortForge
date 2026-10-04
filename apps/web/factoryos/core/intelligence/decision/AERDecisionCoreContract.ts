/**
 * ShortForge / FactoryOS — AER Decision Core Contract
 *
 * AER Runtime owns epistemic state, evidence, probes, budgets and routing.
 * AER Decision Core is a learned, bounded typed-decision model.
 * Ascalon remains the deep-cognition model.
 *
 * This contract contains no provider-specific implementation.
 */

import type {
  DecisionAnswer,
  DecisionBatchRequest,
  DecisionQuestion,
} from "./DecisionContracts";

export type AERDecisionCoreMode = "CHOICE" | "SCORE" | "NOUL";

export interface AERDecisionCoreInput {
  readonly request: DecisionBatchRequest;
  /** Advisory epistemic projection; never an authority grant. */
  readonly epistemicContext?: Record<string, unknown>;
}

export interface AERDecisionCoreOutput {
  readonly batchId: string;
  readonly answers: readonly DecisionAnswer[];
  readonly modelRef: string;
  readonly modelVersion: string;
  readonly inferenceLatencyMs: number;
  readonly calibrationStatus: "CALIBRATED" | "UNCALIBRATED" | "ESTIMATED" | "UNKNOWN";
  readonly probabilitySemantics: "ABSOLUTE" | "CANDIDATE_RELATIVE" | "UNKNOWN";
  readonly trainingEligible: boolean;
  readonly productionAuthority: boolean;
}

export interface AERDecisionCoreProvider {
  readonly providerName: string;
  readonly supportedModes: readonly AERDecisionCoreMode[];
  evaluate(input: AERDecisionCoreInput): Promise<AERDecisionCoreOutput>;
}

/**
 * AER-Core is advisory. It cannot grant capabilities or authorize execution.
 */
export const AER_DECISION_CORE_AUTHORITY = {
  productionAuthority: false,
  canAuthorizeExecution: false,
  canGrantCapability: false,
  canMintLease: false,
  canChangeFencing: false,
  canPublish: false,
  canCertifyF07: false,
} as const;

/**
 * The model must score runtime-supplied questions/options/rubrics.
 * It must not depend on a fixed ShortForge task-specific output head.
 */
export function assertDynamicQuestionContract(
  questions: readonly DecisionQuestion[],
): void {
  if (questions.length === 0) {
    throw new Error("AER Decision Core requires at least one question");
  }

  const ids = new Set<string>();
  for (const question of questions) {
    if (ids.has(question.id)) {
      throw new Error("Duplicate AER Decision Core question id: " + question.id);
    }
    ids.add(question.id);
  }
}
