/**
 * ShortForge / FactoryOS — Decision Ledger & Calibration Store
 *
 * Operational decisions and shadow comparisons are audit signals.
 * AER-Core training truth is stored separately and only becomes eligible
 * when a sanitized input is paired with independently verified gold labels.
 */

import {
  type DecisionAnswer,
  type DecisionBatchResult,
} from "./DecisionContracts";
import type {
  AERDecisionTrainingRecord,
  AERTrainingInput,
} from "./AERDecisionTrainingContract";
import { assertTrainingRecordEligible } from "./AERDecisionTrainingContract";
import { ShadowDiffRecord } from "./TypeSafeJevAdapter";

export type DecisionLabelSource =
  | "DETERMINISTIC_RULE"
  | "AUTHORITATIVE_SYSTEM"
  | "HUMAN_REVIEW"
  | "VERIFIED_OUTCOME"
  | "MODEL_PREDICTION"
  | "HEURISTIC"
  | "SIMULATION";

export interface DecisionTransactionRecord {
  readonly batchId: string;
  readonly taskId?: string;
  readonly missionId?: string;
  readonly adapterUsed: string;
  readonly answers: readonly DecisionAnswer[];
  readonly totalLatencyMs: number;
  readonly minConfidence: number;
  readonly shouldEscalate: boolean;
  readonly shadowDiffs?: readonly ShadowDiffRecord[];
  readonly recordedAt: string;
  readonly labelSource: DecisionLabelSource;
  readonly trainingEligible: boolean;
  readonly worldStateSequence?: number;
  readonly inputFingerprint?: string;
  readonly validationResult?: "PASS" | "FAIL";
  readonly authorizationResult?: "APPROVED" | "DENIED" | "NOT_REQUIRED";
  readonly verificationResult?: "VERIFIED" | "UNVERIFIED" | "FAILED";
  readonly outcomeStatus?: "SUCCESS" | "FAILED" | "UNKNOWN";
}

export interface DecisionTrainingCapture {
  readonly input: AERTrainingInput;
  readonly goldAnswers: readonly DecisionAnswer[];
  readonly evidenceRefs: readonly string[];
  readonly outcomeRefs: readonly string[];
  readonly policyRefs: readonly string[];
  readonly verificationStatus: "VERIFIED" | "UNVERIFIED" | "FAILED";
  readonly labelSource: "VERIFIED_OUTCOME" | "AUTHORITATIVE_SYSTEM" | "HUMAN_REVIEW" | "DETERMINISTIC_RULE";
  readonly humanReviewed?: boolean;
  readonly synthetic?: boolean;
  readonly fallbackApplied?: boolean;
  readonly provenance?: Record<string, unknown>;
  readonly trajectoryId?: string;
}

export interface CalibrationSummary {
  readonly totalDecisions: number;
  readonly averageConfidence: number;
  readonly shadowAgreementRate: number;
  readonly totalEscalations: number;
  readonly deterministicRatio: number;
  readonly trainingEligibleRatio: number;
  readonly capturedTrainingRecords: number;
}

export class DecisionLedger {
  private static instance: DecisionLedger;
  private transactions: DecisionTransactionRecord[] = [];
  private shadowDiffs: ShadowDiffRecord[] = [];
  private trainingRecords: AERDecisionTrainingRecord[] = [];

  public static getInstance(): DecisionLedger {
    if (!this.instance) {
      this.instance = new DecisionLedger();
    }
    return this.instance;
  }

  public recordTransaction(
    result: DecisionBatchResult,
    meta: {
      taskId?: string;
      missionId?: string;
      shadowDiffs?: readonly ShadowDiffRecord[];
      labelSource?: DecisionLabelSource;
      trainingEligible?: boolean;
      worldStateSequence?: number;
      inputFingerprint?: string;
      validationResult?: "PASS" | "FAIL";
      authorizationResult?: "APPROVED" | "DENIED" | "NOT_REQUIRED";
      verificationResult?: "VERIFIED" | "UNVERIFIED" | "FAILED";
      outcomeStatus?: "SUCCESS" | "FAILED" | "UNKNOWN";
      trainingCapture?: DecisionTrainingCapture;
    } = {},
  ): void {
    const defaultLabelSource: DecisionLabelSource =
      result.adapterUsed === "DETERMINISTIC"
        ? "DETERMINISTIC_RULE"
        : result.adapterUsed === "HEURISTIC_SHADOW" ||
            result.adapterUsed === "JEV_SHADOW" ||
            result.adapterUsed === "GLIDE_SHADOW"
          ? "HEURISTIC"
          : meta.verificationResult === "VERIFIED"
            ? "VERIFIED_OUTCOME"
            : "MODEL_PREDICTION";

    const labelSource = meta.labelSource ?? defaultLabelSource;

    // A transaction is not a golden training example merely because its
    // decision source is deterministic. Gold capture must be explicit and verified.
    const capture = meta.trainingCapture;
    const trainingEligible =
      Boolean(meta.trainingEligible) &&
      result.status !== "INVALID" &&
      Boolean(capture) &&
      capture.verificationStatus === "VERIFIED" &&
      capture.evidenceRefs.length + capture.outcomeRefs.length > 0 &&
      capture.synthetic !== true &&
      capture.fallbackApplied !== true;

    const record: DecisionTransactionRecord = {
      batchId: result.batchId,
      taskId: meta.taskId,
      missionId: meta.missionId,
      adapterUsed: result.adapterUsed,
      answers: result.answers,
      totalLatencyMs: result.totalLatencyMs,
      minConfidence: result.minConfidence,
      shouldEscalate: result.shouldEscalate,
      shadowDiffs: meta.shadowDiffs,
      recordedAt: new Date().toISOString(),
      labelSource,
      trainingEligible,
      worldStateSequence: meta.worldStateSequence,
      inputFingerprint: meta.inputFingerprint,
      validationResult:
        meta.validationResult ??
        (result.status === "INVALID" ? "FAIL" : "PASS"),
      authorizationResult: meta.authorizationResult,
      verificationResult: meta.verificationResult,
      outcomeStatus: meta.outcomeStatus,
    };

    this.transactions.push(record);

    if (meta.shadowDiffs && meta.shadowDiffs.length > 0) {
      this.shadowDiffs.push(...meta.shadowDiffs);
    }

    if (trainingEligible && capture) {
      const trainingRecord: AERDecisionTrainingRecord = {
        exampleId: "aer_" + result.batchId,
        datasetVersion: "aer-core-dataset-v1",
        sourceBatchId: result.batchId,
        missionId: meta.missionId,
        trajectoryId: capture.trajectoryId,
        input: capture.input,
        goldAnswers: capture.goldAnswers,
        evidenceRefs: capture.evidenceRefs,
        outcomeRefs: capture.outcomeRefs,
        policyRefs: capture.policyRefs,
        verificationStatus: capture.verificationStatus,
        labelSource: capture.labelSource,
        humanReviewed: capture.humanReviewed ?? false,
        synthetic: capture.synthetic ?? false,
        fallbackApplied: capture.fallbackApplied ?? false,
        trainingEligible: true,
        provenance: capture.provenance ?? {},
        createdAt: new Date().toISOString(),
      };
      assertTrainingRecordEligible(trainingRecord);
      this.trainingRecords.push(trainingRecord);
    }
  }

  public recordTrainingExample(
    record: AERDecisionTrainingRecord,
  ): void {
    assertTrainingRecordEligible(record);
    this.trainingRecords.push(record);
  }

  public recordShadowDiffs(
    diffs: readonly ShadowDiffRecord[],
  ): void {
    if (diffs.length > 0) {
      this.shadowDiffs.push(...diffs);
    }
  }

  public getCalibrationSummary(): CalibrationSummary {
    const total = this.transactions.length;
    if (total === 0) {
      return {
        totalDecisions: 0,
        averageConfidence: 0.0,
        shadowAgreementRate: 1.0,
        totalEscalations: 0,
        deterministicRatio: 0.0,
        trainingEligibleRatio: 0.0,
        capturedTrainingRecords: 0,
      };
    }

    const confSum = this.transactions.reduce(
      (acc, t) => acc + t.minConfidence,
      0,
    );
    const escalations = this.transactions.filter(
      (t) => t.shouldEscalate,
    ).length;
    const deterministic = this.transactions.filter(
      (t) => t.adapterUsed === "DETERMINISTIC",
    ).length;
    const eligible = this.transactions.filter(
      (t) => t.trainingEligible,
    ).length;

    const agreedDiffs = this.shadowDiffs.filter(
      (d) => d.agreed,
    ).length;
    const shadowAgreementRate =
      this.shadowDiffs.length > 0
        ? agreedDiffs / this.shadowDiffs.length
        : 1.0;

    return {
      totalDecisions: total,
      averageConfidence: confSum / total,
      shadowAgreementRate,
      totalEscalations: escalations,
      deterministicRatio: deterministic / total,
      trainingEligibleRatio: eligible / total,
      capturedTrainingRecords: this.trainingRecords.length,
    };
  }

  public getTransactions(): readonly DecisionTransactionRecord[] {
    return this.transactions;
  }

  public getTrainingEligibleTransactions(): readonly DecisionTransactionRecord[] {
    return this.transactions.filter((t) => t.trainingEligible);
  }

  public getTrainingRecords(): readonly AERDecisionTrainingRecord[] {
    return this.trainingRecords;
  }

  public clear(): void {
    this.transactions = [];
    this.shadowDiffs = [];
    this.trainingRecords = [];
  }
}
