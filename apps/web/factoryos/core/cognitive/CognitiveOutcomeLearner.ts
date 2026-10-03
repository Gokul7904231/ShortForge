/**
 * FactoryOS Frontier v2 — Cognitive Outcome Learner
 * Closes the feedback loop between cognitive decisions and verified Validator outcomes.
 */

import type { IndexedExperienceMemory, ExperienceMemoryEntry } from "./memory/IndexedExperienceMemory";
import type { AgentEconomicsEngine } from "./economics/AgentEconomicsEngine";

export interface OutcomeFeedback {
  readonly incidentId: string;
  readonly category: string;
  readonly floorId?: string;
  readonly proposedAction: string;
  readonly predictedSuccess: boolean;
  readonly validatorPassed: boolean;
  readonly durationMs: number;
  readonly symptoms: string[];
  readonly trajectoryId?: string;
  readonly evidenceRefs?: readonly string[];
  readonly tokensConsumed?: number;
  readonly actualCostUsd?: number;
  readonly modelTier?: Parameters<AgentEconomicsEngine["recordExecution"]>[0];
}

export class CognitiveOutcomeLearner {
  private experienceMemory: IndexedExperienceMemory;
  private economics: AgentEconomicsEngine;
  private recentPredictionErrors: number[] = [];

  constructor(experienceMemory: IndexedExperienceMemory, economics: AgentEconomicsEngine) {
    this.experienceMemory = experienceMemory;
    this.economics = economics;
  }

  /**
   * Records verified outcome and persists experiential learning.
   * Verified operational outcomes are explicitly promoted as real evidence so
   * downstream Ascalon training pipelines can distinguish them from simulation.
   */
  async recordOutcome(feedback: OutcomeFeedback): Promise<ExperienceMemoryEntry> {
    const isAccurate = feedback.predictedSuccess === feedback.validatorPassed;
    const predictionError = isAccurate ? 0.0 : 1.0;
    this.recentPredictionErrors.push(predictionError);
    if (this.recentPredictionErrors.length > 50) this.recentPredictionErrors.shift();

    const category = feedback.category === "PRODUCTION_TRAJECTORY" ? "FLOOR_PERFORMANCE" : "ANOMALY_RESOLUTION";
    const verified = Boolean(feedback.evidenceRefs?.length) && feedback.validatorPassed;
    const outcomeStatus = feedback.validatorPassed ? "SUCCESS" : "FAILED";

    const entry = await this.experienceMemory.storeExperience({
      category,
      title: feedback.category + " resolution on " + (feedback.floorId || "global"),
      summary: "Applied " + feedback.proposedAction + " for " + feedback.symptoms.join("; ") + " with validator score " + (feedback.validatorPassed ? 1.0 : 0.0) + ".",
      fullEvidence: {
        incidentId: feedback.incidentId,
        trajectoryId: feedback.trajectoryId,
        category: feedback.category,
        floorId: feedback.floorId,
        symptoms: feedback.symptoms,
        proposedAction: feedback.proposedAction,
        outcome: outcomeStatus,
        durationMs: feedback.durationMs,
        evidenceRefs: feedback.evidenceRefs || [],
        predictionCorrect: isAccurate,
      },
      floorId: feedback.floorId,
      confidence: verified ? 0.95 : 0.4,
      experienceType: verified ? "REAL_OPERATIONAL" : "REPLAY",
      verificationStatus: verified ? "VERIFIED" : "UNVERIFIED",
      outcomeStatus,
      authority: verified ? "AUTHORITATIVE" : "UNVERIFIED",
      trainingEligibility: verified ? "ELIGIBLE" : "INELIGIBLE",
    });

    // Record economics only when production telemetry actually reports token use.
    // Never synthesize model usage as a learning/economics signal.
    if (feedback.tokensConsumed !== undefined && feedback.tokensConsumed >= 0) {
      this.economics.recordExecution(
        feedback.modelTier || "LARGE_REASONER",
        feedback.tokensConsumed,
        feedback.durationMs,
        feedback.actualCostUsd,
      );
    }

    return entry;
  }

  getAveragePredictionError(): number {
    if (this.recentPredictionErrors.length === 0) return 0.0;
    const sum = this.recentPredictionErrors.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.recentPredictionErrors.length) * 100) / 100;
  }
}