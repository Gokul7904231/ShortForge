import type { EpistemicContext, EpistemicCognitiveMode, AEROutcomeReceipt } from "./EpistemicContracts";

export interface AERShadowReplayEpisode {
  readonly episodeId: string;
  readonly context: EpistemicContext;
  readonly actualMode: EpistemicCognitiveMode;
  readonly outcome: AEROutcomeReceipt;
}

export interface AERShadowReplayPolicy {
  readonly policyVersion: string;
  decide(context: EpistemicContext): EpistemicCognitiveMode;
}

export interface AERShadowReplayReport {
  readonly policyVersion: string;
  readonly episodeCount: number;
  readonly replayedCount: number;
  readonly decisionChangedCount: number;
  readonly wouldEscalateUnnecessarily: number;
  readonly wouldMissNecessaryEscalation: number;
  readonly controlledNecessityCoverage: number;
  readonly decisionChangeRate: number;
}

/**
 * Offline evaluator only. It never invokes probes, models, tools, or policy writes.
 *
 * Episodes with controlled necessity evidence provide a safe counterfactual label:
 * NECESSARY means the expensive cognition was required for that episode; NOT_NECESSARY
 * means the baseline/alternate route resolved the episode without it. INCONCLUSIVE
 * episodes are excluded from necessity scoring rather than guessed.
 */
export class AERShadowReplayEvaluator {
  public evaluate(
    episodes: readonly AERShadowReplayEpisode[],
    policy: AERShadowReplayPolicy,
  ): AERShadowReplayReport {
    let replayedCount = 0;
    let decisionChangedCount = 0;
    let wouldEscalateUnnecessarily = 0;
    let wouldMissNecessaryEscalation = 0;
    let controlledNecessityCoverage = 0;

    for (const episode of episodes) {
      const replayedMode = policy.decide(episode.context);
      if (replayedMode !== episode.actualMode) decisionChangedCount += 1;
      replayedCount += 1;

      const necessity = episode.outcome.necessityAssessment;
      if (!necessity || necessity.verdict === "INCONCLUSIVE") continue;
      controlledNecessityCoverage += 1;

      const replayedEscalated = replayedMode === "DEEP";
      if (replayedEscalated && necessity.verdict === "NOT_NECESSARY") {
        wouldEscalateUnnecessarily += 1;
      }
      if (!replayedEscalated && necessity.verdict === "NECESSARY") {
        wouldMissNecessaryEscalation += 1;
      }
    }

    return {
      policyVersion: policy.policyVersion,
      episodeCount: episodes.length,
      replayedCount,
      decisionChangedCount,
      wouldEscalateUnnecessarily,
      wouldMissNecessaryEscalation,
      controlledNecessityCoverage,
      decisionChangeRate:
        replayedCount > 0 ? decisionChangedCount / replayedCount : 0,
    };
  }
}
