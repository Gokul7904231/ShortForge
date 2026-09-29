/**
 * AER runtime economics and reliability metrics.
 *
 * Metrics are observational only. They never grant authority and never
 * convert confidence/support into truth.
 */

export interface AEREpisodeRecord {
  readonly episodeId: string;
  readonly recordedAt: string;
  readonly uncertaintyEncountered: boolean;
  readonly aerInvoked: boolean;
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
}

interface MutableAEREpisodeRecord {
  episodeId: string;
  recordedAt: string;
  uncertaintyEncountered: boolean;
  aerInvoked: boolean;
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
  readonly costPerResolvedUncertainty: number;
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
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      uncertaintyEncountered: input.uncertaintyEncountered ?? false,
      aerInvoked: input.aerInvoked,
      ascalonEscalationRecommended: false,
      ascalonInvoked: false,
      aerLatencyMs: 0,
      probesPlanned: 0,
      probesExecuted: 0,
      usefulProbes: 0,
      cacheLookups: 0,
      cacheHits: 0,
      costUnits: 0,
    });
  }

  public recordAssessment(input: {
    readonly episodeId: string;
    readonly uncertaintyEncountered: boolean;
    readonly ascalonEscalationRecommended: boolean;
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
    episode.uncertaintyEncountered = input.uncertaintyEncountered;
    episode.ascalonEscalationRecommended = input.ascalonEscalationRecommended;
    episode.aerLatencyMs = Math.max(0, input.aerLatencyMs);
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

  public recordAscalonInvocation(input: {
    readonly episodeId: string;
    readonly latencyMs: number;
    readonly costUnits?: number;
  }): void {
    const episode = this.requireOrCreate(input.episodeId);
    episode.ascalonInvoked = true;
    episode.ascalonLatencyMs = Math.max(0, input.latencyMs);
    episode.costUnits += Math.max(0, input.costUnits ?? 0);
  }

  public recordOutcome(input: {
    readonly episodeId: string;
    readonly resolvedUncertainty: boolean;
    readonly falseReassurance?: boolean;
    readonly ascalonWasNecessary?: boolean;
  }): void {
    const episode = this.requireEpisode(input.episodeId);
    episode.resolvedUncertainty = input.resolvedUncertainty;
    episode.falseReassurance = input.falseReassurance;
    episode.ascalonWasNecessary = input.ascalonWasNecessary;
  }

  public snapshot(): AERMetricSnapshot {
    const records = [...this.episodes.values()];
    const uncertaintyRecords = records.filter((record) => record.uncertaintyEncountered);
    const aerRecords = records.filter((record) => record.aerInvoked);
    const ascalonRecords = records.filter((record) => record.ascalonInvoked);
    const resolvedRecords = uncertaintyRecords.filter((record) => record.resolvedUncertainty === true);
    const reassuranceOutcomes = records.filter((record) => record.falseReassurance !== undefined);
    const ascalonOutcomes = ascalonRecords.filter((record) => record.ascalonWasNecessary !== undefined);
    const aerLatencies = aerRecords.map((record) => record.aerLatencyMs).filter((value) => value > 0);
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
      costPerResolvedUncertainty: ratio(uncertaintyCost, resolvedRecords.length),
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
