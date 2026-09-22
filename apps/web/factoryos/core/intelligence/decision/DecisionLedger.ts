/**
 * ShortForge / FactoryOS — Decision Ledger & Calibration Store
 *
 * Persists decision records, tracks shadow-mode agreement rates,
 * and maintains calibration curves for durable learning.
 */

import { DecisionBatchResult, DecisionAnswer } from "./DecisionContracts";
import { ShadowDiffRecord } from "./TypeSafeJevAdapter";

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
}

export interface CalibrationSummary {
  readonly totalDecisions: number;
  readonly averageConfidence: number;
  readonly shadowAgreementRate: number;
  readonly totalEscalations: number;
  readonly deterministicRatio: number;
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
    } = {}
  ): void {
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
    };

    this.transactions.push(record);
    if (meta.shadowDiffs) {
      this.shadowDiffs.push(...meta.shadowDiffs);
    }
  }

  public getTransactions(): readonly DecisionTransactionRecord[] {
    return this.transactions;
  }

  public getShadowDiffs(): readonly ShadowDiffRecord[] {
    return this.shadowDiffs;
  }

  public getCalibrationSummary(): CalibrationSummary {
    if (this.transactions.length === 0) {
      return {
        totalDecisions: 0,
        averageConfidence: 1.0,
        shadowAgreementRate: 1.0,
        totalEscalations: 0,
        deterministicRatio: 1.0,
      };
    }

    let sumConfidence = 0;
    let totalAnswers = 0;
    let deterministicCount = 0;
    let escalations = 0;

    for (const tx of this.transactions) {
      if (tx.shouldEscalate) escalations++;
      for (const ans of tx.answers) {
        sumConfidence += ans.confidence;
        totalAnswers++;
        if (ans.isDeterministic) deterministicCount++;
      }
    }

    const agreeCount = this.shadowDiffs.filter((d) => d.agreed).length;
    const shadowAgreementRate = this.shadowDiffs.length > 0 ? agreeCount / this.shadowDiffs.length : 1.0;

    return {
      totalDecisions: totalAnswers,
      averageConfidence: totalAnswers > 0 ? sumConfidence / totalAnswers : 1.0,
      shadowAgreementRate,
      totalEscalations: escalations,
      deterministicRatio: totalAnswers > 0 ? deterministicCount / totalAnswers : 0.0,
    };
  }

  public clear(): void {
    this.transactions = [];
    this.shadowDiffs = [];
  }
}
