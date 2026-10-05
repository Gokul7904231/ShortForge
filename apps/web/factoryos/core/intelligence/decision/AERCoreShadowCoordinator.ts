/**
 * ShortForge / FactoryOS — non-authoritative AER-Core shadow comparison.
 *
 * This module only measures disagreement/latency/calibration signals. It never
 * mutates the primary decision and never grants execution authority.
 */

import type { DecisionBatchResult } from "./DecisionContracts";

export interface AERCoreShadowQuestionDiff {
  readonly questionId: string;
  readonly agreed: boolean;
  readonly primarySelected: unknown;
  readonly aerCoreSelected: unknown;
  readonly primaryConfidence: number;
  readonly aerCoreConfidence: number;
}

export interface AERCoreShadowRecord {
  readonly batchId: string;
  readonly recordedAt: string;
  readonly baselineAdapters: readonly ("PRIMARY" | "JEV_SHADOW" | "GLIDE_SHADOW")[];
  readonly aerCoreStatus: "VALID" | "UNRESOLVED" | "ERROR";
  readonly aerCoreModelRef?: string;
  readonly aerCoreModelVersion?: string;
  readonly aerCoreLatencyMs?: number;
  readonly primaryLatencyMs: number;
  readonly questionDiffs: readonly AERCoreShadowQuestionDiff[];
  readonly agreementRate: number;
  readonly highConfidenceDisagreements: number;
}

function selectedValue(
  answer: DecisionBatchResult["answers"][number],
): unknown {
  if (!answer) return undefined;
  if (answer.type === "NOUL") return answer.value;
  if (answer.type === "CHOICE") return answer.selected;
  return answer.selectedLevel;
}

export class AERCoreShadowCoordinator {
  public compare(
    primary: DecisionBatchResult,
    aerCore: DecisionBatchResult,
    baselineAdapters: readonly ("PRIMARY" | "JEV_SHADOW" | "GLIDE_SHADOW")[],
  ): AERCoreShadowRecord {
    const diffs: AERCoreShadowQuestionDiff[] = [];

    for (const questionId of Object.keys(primary.answersById)) {
      const primaryAnswer = primary.answersById[questionId];
      const aerAnswer = aerCore.answersById[questionId];
      if (!aerAnswer) continue;

      const primarySelected = selectedValue(primaryAnswer);
      const aerCoreSelected = selectedValue(aerAnswer);
      diffs.push({
        questionId,
        agreed: primarySelected === aerCoreSelected,
        primarySelected,
        aerCoreSelected,
        primaryConfidence: primaryAnswer.confidence,
        aerCoreConfidence: aerAnswer.confidence,
      });
    }

    const agreementRate =
      diffs.length > 0
        ? diffs.filter((diff) => diff.agreed).length / diffs.length
        : 1;

    const highConfidenceDisagreements = diffs.filter(
      (diff) =>
        !diff.agreed &&
        diff.primaryConfidence >= 0.8 &&
        diff.aerCoreConfidence >= 0.8,
    ).length;

    return {
      batchId: primary.batchId,
      recordedAt: new Date().toISOString(),
      baselineAdapters,
      aerCoreStatus: aerCore.status === "VALID" ? "VALID" : "UNRESOLVED",
      aerCoreModelRef: aerCore.adapterMetadata?.modelRef,
      aerCoreModelVersion: aerCore.adapterMetadata?.implementationVersion,
      aerCoreLatencyMs: aerCore.totalLatencyMs,
      primaryLatencyMs: primary.totalLatencyMs,
      questionDiffs: diffs,
      agreementRate,
      highConfidenceDisagreements,
    };
  }
}
