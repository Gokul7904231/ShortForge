/**
 * ShortForge / FactoryOS — AER Decision Core training-record contract.
 */

import type { DecisionAnswer, DecisionQuestion } from "./DecisionContracts";

export type AERTrainingLabelSource =
  | "VERIFIED_OUTCOME"
  | "AUTHORITATIVE_SYSTEM"
  | "HUMAN_REVIEW"
  | "DETERMINISTIC_RULE";

export type AERTrainingVerificationStatus =
  | "VERIFIED"
  | "UNVERIFIED"
  | "FAILED";

export interface AERTrainingInput {
  readonly questions: readonly DecisionQuestion[];
  readonly sanitizedContext?: Record<string, unknown>;
  readonly contextFingerprint?: string;
  readonly policyVersion?: string;
  readonly decisionSchemaVersion?: string;
}

export interface AERDecisionTrainingRecord {
  readonly exampleId: string;
  readonly datasetVersion: string;
  readonly sourceBatchId: string;
  readonly missionId?: string;
  readonly trajectoryId?: string;
  readonly input: AERTrainingInput;
  readonly goldAnswers: readonly DecisionAnswer[];
  readonly evidenceRefs: readonly string[];
  readonly outcomeRefs: readonly string[];
  readonly policyRefs: readonly string[];
  readonly verificationStatus: AERTrainingVerificationStatus;
  readonly labelSource: AERTrainingLabelSource;
  readonly humanReviewed: boolean;
  readonly synthetic: boolean;
  readonly fallbackApplied: boolean;
  readonly trainingEligible: boolean;
  readonly provenance: Record<string, unknown>;
  readonly createdAt: string;
}

export function assertTrainingRecordEligible(
  record: AERDecisionTrainingRecord,
): void {
  if (!record.trainingEligible) {
    throw new Error("AER training record is not marked trainingEligible");
  }
  if (record.synthetic) {
    throw new Error("Synthetic AER training records are not eligible");
  }
  if (record.fallbackApplied) {
    throw new Error("Fallback-generated AER training records are not eligible");
  }
  if (record.verificationStatus !== "VERIFIED") {
    throw new Error("AER training records require VERIFIED status");
  }
  if (
    !["VERIFIED_OUTCOME", "AUTHORITATIVE_SYSTEM", "HUMAN_REVIEW", "DETERMINISTIC_RULE"].includes(
      record.labelSource,
    )
  ) {
    throw new Error("Unsupported AER training label source");
  }
  if (record.evidenceRefs.length === 0 && record.outcomeRefs.length === 0) {
    throw new Error("AER training record requires evidence or outcome references");
  }
  if (record.goldAnswers.length === 0) {
    throw new Error("AER training record requires at least one gold answer");
  }

  const questionIds = record.input.questions.map((question) => question.id);
  const answerIds = record.goldAnswers.map((answer) => answer.questionId);
  if (new Set(questionIds).size !== questionIds.length) {
    throw new Error("AER training input contains duplicate question ids");
  }
  if (new Set(answerIds).size !== answerIds.length) {
    throw new Error("AER training gold answers contain duplicate question ids");
  }
  if (
    questionIds.length !== answerIds.length ||
    questionIds.some((id) => !answerIds.includes(id))
  ) {
    throw new Error("AER training gold answers must exactly cover input questions");
  }
}
