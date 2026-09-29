/**
 * AER runtime economics and reliability metrics.
 *
 * Metrics are observational only. They never grant authority and never
 * convert confidence/support into truth.
 */

import type {
  AEROutcomeReceipt,
  EpistemicCognitiveMode,
} from "./EpistemicContracts";

export interface AEREpisodeRecord {
  readonly episodeId: string;
  readonly assessmentCount: number;
  readonly assessmentAttempts: number;
  readonly recordedAt: string;
  readonly uncertaintyEncountered: boolean;
  readonly aerInvoked: boolean;
  readonly routedMode?: EpistemicCognitiveMode;
  readonly ascalonEscalationRecommended: boolean;
  readonly ascalonInvoked: boolean;
  readonly resolvedUncertainty?: boolean;
  readonly falseReassurance?: boolean;
  readonly ascalonWasNecessary?: boolean;
  readonly aerLatencyMs: number;
  readonly ascalonLatencyMs?: number;
  readonly probesPlanned: number;
  readonly probesExecuted: number;
  readonly usefulProbes: number;
  readonly cacheLookups: number;
  readonly cacheHits: number;
  readonly costUnits: number;
  readonly actualCostUsd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly modelRef?: string;
  readonly provider?: string;
  readonly baselineMode?: EpistemicCognitiveMode;
  readonly actualMode?: EpistemicCognitiveMode;
  readonly outcomeMode?: EpistemicCognitiveMode;
  readonly baselineCostUsd?: number;
  readonly baselineLatencyMs?: number;

}

interface MutableAEREpisodeRecord {
  episodeId: string;
  assessmentCount: number;
  assessmentAttempts: number;
  recordedAt: string;
  uncertaintyEncountered: boolean;
  aerInvoked: boolean;
  routedMode?: EpistemicCognitiveMode;
  ascalonEscalationRecommended: boolean;
  ascalonInvoked: boolean;
  resolvedUncertainty?: boolean;
  falseReassurance?: boolean;
  ascalonWasNecessary?: boolean;
  aerLatencyMs: number;
  ascalonLatencyMs?: number;
  probesPlanned: number;
  probesExecuted: number;
  usefulProbes: number;
  cacheLookups: number;
  cacheHits: number;
  costUnits: number;
  actualCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  modelRef?: string;
  provider?: string;
  baselineMode?: EpistemicCognitiveMode;
  actualMode?: EpistemicCognitiveMode;
  outcomeMode?: EpistemicCognitiveMode;
  baselineCostUsd?: number;
  baselineLatencyMs?: number;

}

export interface AERMetricSnapshot {
  readonly episodeCount: number;
  readonly uncertaintyEpisodeCount: number;
  readonly aerInvocationCount: number;
  readonly ascalonEscalationCount: number;
  readonly ascalonInvocationCount: number;
  readonly ascalonOutcomeCount: number;
  readonly resolvedUncertaintyCount: number;
  readonly falseReassuranceCount: number;
  readonly unnecessaryEscalationCount: number;
  readonly probeCount: number;
  readonly usefulProbeCount: number;
  readonly cacheLookupCount: number;
  readonly cacheHitCount: number;
  readonly totalCostUnits: number;
  readonly totalActualCostUsd: number;
  readonly costPerResolvedUncertainty: number | null;
  readonly actualCostUsdPerResolvedUncertainty: number | null;
  readonly aerInvocationRate: number;
  readonly ascalonEscalationRate: number;
  readonly ascalonInvocationRate: number;
  readonly averageProbesPerUncertainty: number;
  readonly cacheHitRate: number;
  readonly p50AERLatencyMs: number;
  readonly p95AERLatencyMs: number;
  readonly p50AscalonLatencyMs: number;
  readonly p95AscalonLatencyMs: number;
  readonly falseReassuranceRate: number;
  readonly probeUsefulnessRate: number;
  readonly unnecessaryEscalationRate: number;
  readonly shadowComparisonCount: number;
  readonly shadowRoutingDisagreementRate: number;
  readonly shadowCostSavingsUsd: number | null;
  readonly shadowLatencyDeltaMs: number | null;
}

function percentile(values: readonly number[], percentileRank: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export class AERMetricsRecorder {
  private readonly episodes = new Map<string, MutableAEREpisodeRecord>();
  private readonly modelUsageIds = new Set<string>();

  public recordEvent(input: {
    readonly episodeId: string;
    readonly aerInvoked: boolean;
    readonly uncertaintyEncountered?: boolean;
    readonly recordedAt?: string;
  }): void {
    const existing = this.episodes.get(input.episodeId);
    if (existing) {
      existing.aerInvoked ||= input.aerInvoked;
      existing.uncertaintyEncountered ||= input.uncertaintyEncountered ?? false;
      return;
    }

    this.episodes.set(input.episodeId, {
      episodeId: input.episodeId,
      assessmentCount: 0,
      assessmentAttempts: 0,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      uncertaintyEncountered: input.uncertaintyEncountered ?? false,
      aerInvoked: input.aerInvoked,
      routedMode: undefined,
      ascalonEscalationRecommended: false,
      ascalonInvoked: false,
      aerLatencyMs: 0,
      probesPlanned: 0,
      probesExecuted: 0,
      usefulProbes: 0,
      cacheLookups: 0,
      cacheHits: 0,
      costUnits: 0,
      actualCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    });
  }

  public recordAssessment(input: {
    readonly episodeId: string;
    readonly uncertaintyEncountered: boolean;
    readonly ascalonEscalationRecommended: boolean;
    readonly routedMode?: EpistemicCognitiveMode;
    readonly aerLatencyMs: number;
    readonly assessmentCostUnits?: number;
    readonly recordedAt?: string;
  }): void {
    this.recordEvent({
      episodeId: input.episodeId,
      aerInvoked: true,
      uncertaintyEncountered: input.uncertaintyEncountered,
      recordedAt: input.recordedAt,
    });

    const episode = this.requireEpisode(input.episodeId);
    episode.aerInvoked = true;
    episode.assessmentCount += 1;
    episode.assessmentAttempts += 1;
    episode.uncertaintyEncountered ||= input.uncertaintyEncountered;
    episode.routedMode = input.routedMode;
    episode.ascalonEscalationRecommended ||= input.ascalonEscalationRecommended;
    episode.aerLatencyMs += Math.max(0, input.aerLatencyMs);
    episode.costUnits += Math.max(0, input.assessmentCostUnits ?? 0);
  }

  public recordProbe(input: {
    readonly episodeId: string;
    readonly planned?: boolean;
    readonly executed?: boolean;
    readonly useful?: boolean;
    readonly costUnits?: number;
  }): void {
    const episode = this.requireOrCreate(input.episodeId);
    if (input.planned) episode.probesPlanned += 1;
    if (input.executed) episode.probesExecuted += 1;
    if (input.useful) episode.usefulProbes += 1;
    episode.costUnits += Math.max(0, input.costUnits ?? 0);
  }

  public recordCacheLookup(input: {
    readonly episodeId: string;
    readonly hit: boolean;
  }): void {
    const episode = this.requireOrCreate(input.episodeId);
    episode.cacheLookups += 1;
    if (input.hit) episode.cacheHits += 1;
  }

  public recordModelUsage(input: {
    readonly usageId?: string;
    readonly episodeId: string;
    readonly provider: string;
    readonly modelRef: string;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly reasoningTokens?: number;
    readonly actualCostUsd?: number;
    readonly actualLatencyMs?: number;
  }): void {
    const episode = this.requireOrCreate(input.episodeId);
    if (input.usageId) {
      if (this.modelUsageIds.has(input.usageId)) return;
      this.modelUsageIds.add(input.usageId);
    }
    episode.provider = input.provider;
    episode.modelRef = input.modelRef;
    episode.inputTokens += Math.max(0, input.inputTokens ?? 0);
    episode.outputTokens += Math.max(0, input.outputTokens ?? 0);
    episode.reasoningTokens += Math.max(0, input.reasoningTokens ?? 0);
    episode.actualCostUsd += Math.max(0, input.actualCostUsd ?? 0);
  }

  public recordShadowComparison(input: {
    readonly episodeId: string;
    readonly actualMode: EpistemicCognitiveMode;
    readonly baselineMode: EpistemicCognitiveMode;
    readonly baselineCostUsd?: number;
    readonly baselineLatencyMs?: number;
  }): void {
    const episode = this.requireOrCreate(input.episodeId);
    episode.actualMode = input.actualMode;
    episode.baselineMode = input.baselineMode;
    episode.baselineCostUsd = input.baselineCostUsd;
    episode.baselineLatencyMs = input.baselineLatencyMs;
  }

  public recordAscalonInvocation(input: {
    readonly episodeId: string;
    readonly latencyMs: number;
    readonly costUnits?: number;
    readonly provider?: string;
    readonly modelRef?: string;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly reasoningTokens?: number;
    readonly actualCostUsd?: number;
  }): void {
    const episode = this.requireOrCreate(input.episodeId);
    episode.ascalonInvoked = true;
    episode.ascalonLatencyMs = Math.max(0, input.latencyMs);
    episode.costUnits += Math.max(0, input.costUnits ?? 0);
    if (input.usageId) {
      if (this.modelUsageIds.has(input.usageId)) {
        return;
      }
      this.modelUsageIds.add(input.usageId);
    }
    episode.provider = input.provider ?? episode.provider;
    episode.modelRef = input.modelRef ?? episode.modelRef;
    episode.inputTokens += Math.max(0, input.inputTokens ?? 0);
    episode.outputTokens += Math.max(0, input.outputTokens ?? 0);
    episode.reasoningTokens += Math.max(0, input.reasoningTokens ?? 0);
    episode.actualCostUsd += Math.max(0, input.actualCostUsd ?? 0);
  }

  public recordOutcome(receipt: AEROutcomeReceipt): void {
    if (!receipt.outcomeId.trim() || !receipt.episodeId.trim()) {
      throw new Error("[AER metrics] outcome identity is required");
    }
    if (!receipt.verificationRef.trim()) {
      throw new Error("[AER metrics] outcome verificationRef is required");
    }
    if (
      receipt.authoritativeSource === "MODEL_INFERENCE" &&
      receipt.status === "RESOLVED"
    ) {
      throw new Error("[AER metrics] model inference cannot authoritatively resolve uncertainty");
    }
    if (receipt.evidenceRefs.length === 0 && receipt.status === "RESOLVED") {
      throw new Error("[AER metrics] resolved outcome requires evidenceRefs");
    }

    const episode = this.requireEpisode(receipt.episodeId);
    episode.outcomeMode = episode.routedMode;

    const resolved =
      receipt.status === "RESOLVED" &&
      receipt.evidenceRefs.length > 0 &&
      receipt.authoritativeSource !== "MODEL_INFERENCE";

    episode.resolvedUncertainty = resolved;

    if (
      receipt.ascalonClaimedResolved === true &&
      !resolved
    ) {
      episode.falseReassurance = true;
    } else if (receipt.ascalonClaimedResolved === true) {
      episode.falseReassurance = false;
    }

    const necessity = receipt.necessityAssessment;
    if (necessity && necessity.verdict !== "INCONCLUSIVE") {
      if (necessity.evidenceRefs.length === 0) {
        throw new Error("[AER metrics] necessity verdict requires evidenceRefs");
      }
      episode.ascalonWasNecessary = necessity.verdict === "NECESSARY";
    }
  }

  public snapshot(): AERMetricSnapshot {
    const records = [...this.episodes.values()];
    const uncertaintyRecords = records.filter((record) => record.uncertaintyEncountered);
    const aerRecords = records.filter((record) => record.aerInvoked);
    const ascalonRecords = records.filter((record) => record.ascalonInvoked);
    const resolvedRecords = uncertaintyRecords.filter((record) => record.resolvedUncertainty === true);
    const reassuranceOutcomes = records.filter((record) => record.falseReassurance !== undefined);
    const ascalonOutcomes = ascalonRecords.filter((record) => record.ascalonWasNecessary !== undefined);
    const aerLatencies = aerRecords
      .map((record) => record.assessmentCount > 0 ? record.aerLatencyMs / record.assessmentCount : 0)
      .filter((value) => value > 0);
    const ascalonLatencies = ascalonRecords
      .map((record) => record.ascalonLatencyMs ?? 0)
      .filter((value) => value > 0);

    const uncertaintyProbeCount = uncertaintyRecords.reduce(
      (sum, record) => sum + record.probesExecuted,
      0,
    );
    const uncertaintyCost = uncertaintyRecords.reduce(
      (sum, record) => sum + record.costUnits,
      0,
    );
    const totalProbes = records.reduce((sum, record) => sum + record.probesExecuted, 0);
    const totalUsefulProbes = records.reduce((sum, record) => sum + record.usefulProbes, 0);
    const cacheLookups = records.reduce((sum, record) => sum + record.cacheLookups, 0);
    const cacheHits = records.reduce((sum, record) => sum + record.cacheHits, 0);
    const falseReassurances = reassuranceOutcomes.filter(
      (record) => record.falseReassurance === true,
    ).length;
    const unnecessaryEscalations = ascalonOutcomes.filter(
      (record) => record.ascalonWasNecessary === false,
    ).length;

    return {
      episodeCount: records.length,
      uncertaintyEpisodeCount: uncertaintyRecords.length,
      aerInvocationCount: aerRecords.length,
      ascalonEscalationCount: aerRecords.filter((record) => record.ascalonEscalationRecommended).length,
      ascalonInvocationCount: ascalonRecords.length,
      ascalonOutcomeCount: ascalonOutcomes.length,
      resolvedUncertaintyCount: resolvedRecords.length,
      falseReassuranceCount: falseReassurances,
      unnecessaryEscalationCount: unnecessaryEscalations,
      probeCount: totalProbes,
      usefulProbeCount: totalUsefulProbes,
      cacheLookupCount: cacheLookups,
      cacheHitCount: cacheHits,
      totalCostUnits: records.reduce((sum, record) => sum + record.costUnits, 0),
      totalActualCostUsd: records.reduce((sum, record) => sum + (record.actualCostUsd ?? 0), 0),
      costPerResolvedUncertainty:
        resolvedRecords.length > 0
          ? uncertaintyCost / resolvedRecords.length
          : null,
      actualCostUsdPerResolvedUncertainty:
        resolvedRecords.length > 0
          ? records
              .filter((record) => record.uncertaintyEncountered)
              .reduce((sum, record) => sum + (record.actualCostUsd ?? 0), 0) /
            resolvedRecords.length
          : null,
      aerInvocationRate: ratio(aerRecords.length, records.length),
      ascalonEscalationRate: ratio(
        aerRecords.filter((record) => record.ascalonEscalationRecommended).length,
        aerRecords.length,
      ),
      ascalonInvocationRate: ratio(ascalonRecords.length, aerRecords.length),
      averageProbesPerUncertainty: ratio(uncertaintyProbeCount, uncertaintyRecords.length),
      cacheHitRate: ratio(cacheHits, cacheLookups),
      p50AERLatencyMs: percentile(aerLatencies, 50),
      p95AERLatencyMs: percentile(aerLatencies, 95),
      p50AscalonLatencyMs: percentile(ascalonLatencies, 50),
      p95AscalonLatencyMs: percentile(ascalonLatencies, 95),
      falseReassuranceRate: ratio(falseReassurances, reassuranceOutcomes.length),
      probeUsefulnessRate: ratio(totalUsefulProbes, totalProbes),
      unnecessaryEscalationRate: ratio(unnecessaryEscalations, ascalonOutcomes.length),
      shadowComparisonCount: records.filter(
        (record) => record.baselineMode !== undefined && record.actualMode !== undefined,
      ).length,
      shadowRoutingDisagreementRate: ratio(
        records.filter(
          (record) =>
            record.baselineMode !== undefined &&
            record.actualMode !== undefined &&
            record.baselineMode !== record.actualMode,
        ).length,
        records.filter(
          (record) => record.baselineMode !== undefined && record.actualMode !== undefined,
        ).length,
      ),
      shadowCostSavingsUsd: (() => {
        const comparable = records.filter(
          (record) =>
            record.baselineCostUsd !== undefined &&
            record.actualCostUsd !== undefined,
        );
        return comparable.length > 0
          ? comparable.reduce(
              (sum, record) =>
                sum + (record.baselineCostUsd ?? 0) - (record.actualCostUsd ?? 0),
              0,
            )
          : null;
      })(),
      shadowLatencyDeltaMs: (() => {
        const comparable = records.filter(
          (record) =>
            record.baselineLatencyMs !== undefined &&
            record.aerLatencyMs > 0,
        );
        return comparable.length > 0
          ? comparable.reduce(
              (sum, record) =>
                sum +
                (record.aerLatencyMs / Math.max(1, record.assessmentCount)) -
                (record.baselineLatencyMs ?? 0),
              0,
            ) / comparable.length
          : null;
      })(),
    };
  }

  public getModeCalibration(mode: EpistemicCognitiveMode): {
    readonly sampleCount: number;
    readonly resolvedCount: number;
    readonly resolutionProbability: number;
    readonly lowerBound95: number;
    readonly upperBound95: number;
    readonly averageCostUnits: number;
    readonly p50LatencyMs: number;
    readonly p95LatencyMs: number;
  } {
    const records = [...this.episodes.values()].filter(
      (record) =>
        (record.outcomeMode ?? record.routedMode) === mode &&
        record.uncertaintyEncountered &&
        record.resolvedUncertainty !== undefined,
    );
    const sampleCount = records.length;
    const resolvedCount = records.filter(
      (record) => record.resolvedUncertainty === true,
    ).length;
    const z = 1.96;
    const p = sampleCount > 0 ? resolvedCount / sampleCount : 0;
    const z2 = z * z;
    const denominator = 1 + z2 / Math.max(1, sampleCount);
    const center =
      sampleCount > 0
        ? (p + z2 / (2 * sampleCount)) / denominator
        : 0;
    const halfWidth =
      sampleCount > 0
        ? (z *
            Math.sqrt(
              (p * (1 - p)) / sampleCount +
                z2 / (4 * sampleCount * sampleCount),
            )) /
          denominator
        : 0;
    const modeCosts = records.map((record) => record.costUnits);
    const modeLatencies = records
      .map((record) =>
        mode === "DEEP" ? record.ascalonLatencyMs ?? record.aerLatencyMs : record.aerLatencyMs,
      )
      .filter((value) => value > 0);

    return {
      sampleCount,
      resolvedCount,
      resolutionProbability: p,
      lowerBound95: Math.max(0, center - halfWidth),
      upperBound95: Math.min(1, center + halfWidth),
      averageCostUnits:
        modeCosts.length > 0
          ? modeCosts.reduce((sum, value) => sum + value, 0) / modeCosts.length
          : 0,
      p50LatencyMs: percentile(modeLatencies, 50),
      p95LatencyMs: percentile(modeLatencies, 95),
    };
  }

  public listEpisodes(): readonly AEREpisodeRecord[] {
    return [...this.episodes.values()].map((record) => ({ ...record }));
  }

  public reset(): void {
    this.episodes.clear();
  }

  private requireEpisode(episodeId: string): MutableAEREpisodeRecord {
    const episode = this.episodes.get(episodeId);
    if (!episode) throw new Error(`[AER metrics] Unknown episode: ${episodeId}`);
    return episode;
  }

  private requireOrCreate(episodeId: string): MutableAEREpisodeRecord {
    const existing = this.episodes.get(episodeId);
    if (existing) return existing;

    this.recordEvent({
      episodeId,
      aerInvoked: false,
    });
    return this.requireEpisode(episodeId);
  }
}
