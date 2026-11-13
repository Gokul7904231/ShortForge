import type {
  EpistemicContext,
  EpistemicCognitiveMode,
  AEROutcomeReceipt,
} from "./EpistemicContracts";
import type { AEROutcomeEvidenceVerifier } from "./AEROutcomeEvidence";

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
  readonly unverifiedEpisodeCount: number;
  readonly decisionChangedCount: number;
  readonly wouldEscalateUnnecessarily: number;
  readonly wouldMissNecessaryEscalation: number;
  readonly controlledNecessityCoverage: number;
  readonly controlledNecessityCoverageRate: number;
  readonly decisionChangeRate: number;
}

/**
 * Offline evaluator only. It never invokes probes, models, tools, or policy writes.
 * Every historical outcome must be independently verified before it may affect
 * replay counts or necessity calibration.
 */
export class AERShadowReplayEvaluator {
  public constructor(
    private readonly outcomeEvidenceVerifier?: AEROutcomeEvidenceVerifier,
  ) {}

  public evaluate(
    episodes: readonly AERShadowReplayEpisode[],
    policy: AERShadowReplayPolicy,
  ): AERShadowReplayReport {
    let replayedCount = 0;
    let unverifiedEpisodeCount = 0;
    let decisionChangedCount = 0;
    let wouldEscalateUnnecessarily = 0;
    let wouldMissNecessaryEscalation = 0;
    let controlledNecessityCoverage = 0;

    for (const episode of episodes) {
      let verified = false;
      try {
        verified =
          this.outcomeEvidenceVerifier?.verifyOutcome(episode.outcome) === true;
      } catch {
        verified = false;
      }
      if (!verified) {
        unverifiedEpisodeCount += 1;
        continue;
      }

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
      unverifiedEpisodeCount,
      decisionChangedCount,
      wouldEscalateUnnecessarily,
      wouldMissNecessaryEscalation,
      controlledNecessityCoverage,
      controlledNecessityCoverageRate:
        replayedCount > 0 ? controlledNecessityCoverage / replayedCount : 0,
      decisionChangeRate:
        replayedCount > 0 ? decisionChangedCount / replayedCount : 0,
    };
  }
}
