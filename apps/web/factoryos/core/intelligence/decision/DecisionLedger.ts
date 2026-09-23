/**
 * ShortForge / FactoryOS — Decision Ledger & Calibration Store
 *
 * Persists decision records, tracks shadow-mode agreement rates,
 * and maintains calibration curves for durable learning.
 * Enhanced for Project Ascalon with training eligibility, provenance label sources,
 * and multi-stage lifecycle verification tracking.
 */

import { DecisionBatchResult, DecisionAnswer } from "./DecisionContracts";
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

export interface CalibrationSummary {
  readonly totalDecisions: number;
  readonly averageConfidence: number;
  readonly shadowAgreementRate: number;
  readonly totalEscalations: number;
  readonly deterministicRatio: number;
  readonly trainingEligibleRatio: number;
}

export class DecisionLedger {
  private static instance: DecisionLedger;
  private transactions: DecisionTransactionRecord[] = [];
  private shadowDiffs: ShadowDiffRecord[] = [];

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
    } = {}
  ): void {
    // Determine label source based on adapter and verification
    const defaultLabelSource: DecisionLabelSource =
      result.adapterUsed === "DETERMINISTIC"
        ? "DETERMINISTIC_RULE"
        : result.adapterUsed === "HEURISTIC_SHADOW" || result.adapterUsed === "JEV_SHADOW"
        ? "HEURISTIC"
        : meta.verificationResult === "VERIFIED"
        ? "VERIFIED_OUTCOME"
        : "MODEL_PREDICTION";

    const labelSource = meta.labelSource ?? defaultLabelSource;
    // Only verified outcomes, authoritative systems, human reviews, or deterministic rules are golden training eligible
    const defaultTrainingEligible =
      labelSource === "VERIFIED_OUTCOME" ||
      labelSource === "AUTHORITATIVE_SYSTEM" ||
      labelSource === "HUMAN_REVIEW" ||
      labelSource === "DETERMINISTIC_RULE";

    const trainingEligible = meta.trainingEligible ?? (defaultTrainingEligible && result.status !== "INVALID");

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
      validationResult: meta.validationResult ?? (result.status === "INVALID" ? "FAIL" : "PASS"),
      authorizationResult: meta.authorizationResult,
      verificationResult: meta.verificationResult,
      outcomeStatus: meta.outcomeStatus,
    };

    this.transactions.push(record);

    if (meta.shadowDiffs && meta.shadowDiffs.length > 0) {
      this.shadowDiffs.push(...meta.shadowDiffs);
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
      };
    }

    const confSum = this.transactions.reduce((acc, t) => acc + t.minConfidence, 0);
    const escalations = this.transactions.filter((t) => t.shouldEscalate).length;
    const deterministic = this.transactions.filter((t) => t.adapterUsed === "DETERMINISTIC").length;
    const eligible = this.transactions.filter((t) => t.trainingEligible).length;

    const agreedDiffs = this.shadowDiffs.filter((d) => d.agreed).length;
    const shadowAgreementRate = this.shadowDiffs.length > 0 ? agreedDiffs / this.shadowDiffs.length : 1.0;

    return {
      totalDecisions: total,
      averageConfidence: confSum / total,
      shadowAgreementRate,
      totalEscalations: escalations,
      deterministicRatio: deterministic / total,
      trainingEligibleRatio: eligible / total,
    };
  }

  public getTransactions(): readonly DecisionTransactionRecord[] {
    return this.transactions;
  }

  public getTrainingEligibleTransactions(): readonly DecisionTransactionRecord[] {
    return this.transactions.filter((t) => t.trainingEligible);
  }

  public clear(): void {
    this.transactions = [];
    this.shadowDiffs = [];
  }
}
