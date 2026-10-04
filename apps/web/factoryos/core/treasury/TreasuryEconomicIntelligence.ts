/**
 * ShortForge / FactoryOS — Treasury Economic Intelligence
 *
 * Read-only economic intelligence. It observes Treasury's durable ledger and
 * produces measurements, anomaly signals, and bounded recommendations.
 *
 * IMPORTANT:
 * - This class cannot reserve, settle, release, freeze, unfreeze, or mutate pricing.
 * - Recommendations are advisory inputs for routing/Overseer/Ascalon.
 * - The Treasury Constitutional Kernel remains the only economic authority.
 */

import type {
  TreasuryLedgerEvent,
  TreasuryReport,
} from "./TreasuryContracts";
import type { TreasuryService } from "./TreasuryService";

export type TreasuryEconomicSignalSeverity =
  | "INFO"
  | "WARNING"
  | "CRITICAL";

export type TreasuryEconomicRecommendationKind =
  | "REDUCE_RESERVATION_SIZE"
  | "PREFER_LOW_COST_ROUTE"
  | "REDUCE_WASTE"
  | "RECONCILE_AMBIGUOUS_SPEND"
  | "PROTECT_CAPACITY"
  | "INVESTIGATE_BREACH"
  | "REVIEW_PRICE_DATA"
  | "OBSERVE";

export interface TreasuryEconomicProviderMetric {
  readonly providerId: string;
  readonly modelId?: string;
  readonly invocations: number;
  readonly settledCostUsd: number;
  readonly actualTokens: number;
  readonly costPer1kTokensUsd?: number;
  readonly verifiedExecutions: number;
  readonly observedPriceConfidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface TreasuryEconomicUnitMetrics {
  readonly settledCostUsd: number;
  readonly actualTokens: number;
  readonly consumedCapacityUnits: number;
  readonly reservedCostUsd: number;
  readonly releasedCostUsd: number;
  readonly releaseRatio: number;
  readonly reservationUtilization: number;
  readonly successfulExecutions: number;
  readonly verifiedExecutions: number;
  readonly deniedCommands: number;
  readonly expiredReservations: number;
  readonly breachedReservations: number;
  readonly costPer1kTokensUsd?: number;
  readonly costPerSuccessfulExecutionUsd?: number;
  readonly costPerVerifiedExecutionUsd?: number;
  readonly costPerVerifiedRenderUsd?: number;
  readonly costPerVerifiedShortUsd?: number;
  readonly spendPerHourUsd: number;
};

export interface TreasuryEconomicSignal {
  readonly code: string;
  readonly severity: TreasuryEconomicSignalSeverity;
  readonly message: string;
  readonly evidence: Readonly<Record<string, number | string | boolean>>;
}

export interface TreasuryEconomicRecommendation {
  readonly kind: TreasuryEconomicRecommendationKind;
  readonly priority: "LOW" | "MEDIUM" | "HIGH";
  readonly rationale: string;
  readonly evidence: Readonly<Record<string, number | string | boolean>>;
  readonly actionBoundary:
    | "ADVISORY_ONLY"
    | "TREASURER_KERNEL"
    | "OVERSEER";
}

export interface TreasuryEconomicAnomalyBaseline {
  readonly sampleWindows: number;
  readonly meanSpendPerDayUsd: number;
  readonly stdDevSpendPerDayUsd: number;
  readonly latestSpendPerDayUsd: number;
  readonly zScore: number;
  readonly severity: TreasuryEconomicSignalSeverity;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface TreasuryEconomicRightSizingMetric {
  readonly workloadType: string;
  readonly samples: number;
  readonly medianUtilization: number;
  readonly p90Utilization: number;
  readonly recommendedReservationMultiplier: number;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface TreasuryEconomicIntelligenceSnapshot {
  readonly accountId: string;
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly unitMetrics: TreasuryEconomicUnitMetrics;
  readonly priorWindow: TreasuryEconomicUnitMetrics;
  readonly spendDeltaPct: number;
  readonly anomalyBaseline: TreasuryEconomicAnomalyBaseline;
  readonly reservationRightSizing: readonly TreasuryEconomicRightSizingMetric[];
  readonly forecast: {
    readonly projected7dSpendUsd: number;
    readonly projected30dSpendUsd: number;
    readonly confidence: "LOW" | "MEDIUM" | "HIGH";
  };
  readonly activeReservedUsd: number;
  readonly activeReservedCapacityUnits: number;
  readonly providers: readonly TreasuryEconomicProviderMetric[];
  readonly signals: readonly TreasuryEconomicSignal[];
  readonly recommendations: readonly TreasuryEconomicRecommendation[];
}

type MutableTreasuryEconomicUnitMetrics = {
  -readonly [K in keyof TreasuryEconomicUnitMetrics]: TreasuryEconomicUnitMetrics[K];
};

type ReservationAccumulator = {
  reservedUsd: number;
  consumedUsd: number;
  releasedUsd: number;
  consumedCapacityUnits: number;
  actualTokens: number;
  consumed: number;
  verified: number;
  workloadType?: string;
};

function numeric(
  value: unknown,
): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function resourceIdentity(
  event: TreasuryLedgerEvent,
): { providerId?: string; modelId?: string } {
  const requests = Array.isArray(event.payload.resourceRequest)
    ? (event.payload.resourceRequest as Array<Record<string, unknown>>)
    : [];

  const first = requests.find(
    (request) =>
      typeof request.providerId === "string" ||
      typeof request.modelId === "string",
  );

  return {
    providerId:
      typeof first?.providerId === "string"
        ? first.providerId
        : undefined,
    modelId:
      typeof first?.modelId === "string"
        ? first.modelId
        : undefined,
  };
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, quantile));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function eventWorkloadType(event: TreasuryLedgerEvent): string {
  const requests = Array.isArray(event.payload.resourceRequest)
    ? (event.payload.resourceRequest as Array<Record<string, unknown>>)
    : [];
  const request = requests[0];
  const workload =
    typeof request?.workloadType === "string"
      ? request.workloadType
      : typeof request?.metadata === "object" &&
          request.metadata !== null &&
          typeof (request.metadata as Record<string, unknown>).workloadType ===
            "string"
        ? String(
            (request.metadata as Record<string, unknown>).workloadType,
          )
        : undefined;
  return workload || event.floorId || "UNKNOWN";
}

function dailySpendBaseline(
  events: TreasuryLedgerEvent[],
  currentStartMs: number,
  windowEndMs: number,
): TreasuryEconomicAnomalyBaseline {
  const dayMs = 24 * 60 * 60 * 1000;
  const historyStartMs = currentStartMs - dayMs * 7;
  const buckets = new Map<string, number>();

  for (const event of events) {
    if (event.eventType !== "RESOURCE_CONSUMED") continue;
    const ts = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(ts) || ts < historyStartMs || ts >= currentStartMs) {
      continue;
    }
    const day = new Date(ts).toISOString().slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + Math.max(0, numeric(event.amountUsd)));
  }

  const samples = Array.from(buckets.values());
  const mean =
    samples.length > 0
      ? samples.reduce((sum, value) => sum + value, 0) / samples.length
      : 0;
  const variance =
    samples.length > 1
      ? samples.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
        samples.length
      : 0;
  const stdDev = Math.sqrt(variance);

  const windowDays = Math.max(1, (windowEndMs - currentStartMs) / dayMs);
  const currentSpend = events
    .filter((event) => {
      if (event.eventType !== "RESOURCE_CONSUMED") return false;
      const ts = new Date(event.occurredAt).getTime();
      return ts >= currentStartMs && ts <= windowEndMs;
    })
    .reduce((sum, event) => sum + Math.max(0, numeric(event.amountUsd)), 0);
  const latestDailySpend = currentSpend / windowDays;
  const zScore =
    stdDev > 0 ? (latestDailySpend - mean) / stdDev : latestDailySpend > mean ? 3 : 0;

  const severity =
    Math.abs(zScore) >= 3
      ? "CRITICAL"
      : Math.abs(zScore) >= 2
        ? "WARNING"
        : "INFO";
  const confidence =
    samples.length >= 7 ? "HIGH" : samples.length >= 4 ? "MEDIUM" : "LOW";

  return {
    sampleWindows: samples.length,
    meanSpendPerDayUsd: mean,
    stdDevSpendPerDayUsd: stdDev,
    latestSpendPerDayUsd: latestDailySpend,
    zScore,
    severity,
    confidence,
  };
}

function emptyUnitMetrics(): TreasuryEconomicUnitMetrics {
  return {
    settledCostUsd: 0,
    actualTokens: 0,
    consumedCapacityUnits: 0,
    reservedCostUsd: 0,
    releasedCostUsd: 0,
    releaseRatio: 0,
    reservationUtilization: 0,
    successfulExecutions: 0,
    verifiedExecutions: 0,
    deniedCommands: 0,
    expiredReservations: 0,
    breachedReservations: 0,
    spendPerHourUsd: 0,
  };
}

export class TreasuryEconomicIntelligence {
  constructor(private readonly treasury: TreasuryService) {}

  async analyze(
    accountId: string,
    options: {
      windowMs?: number;
      eventLimit?: number;
      now?: Date;
    } = {},
  ): Promise<TreasuryEconomicIntelligenceSnapshot> {
    const now = options.now ?? new Date();
    const windowMs = Math.max(
      60_000,
      options.windowMs ?? 24 * 60 * 60 * 1000,
    );
    const eventLimit = Math.min(
      10_000,
      Math.max(100, options.eventLimit ?? 2_500),
    );
    const events = await this.treasury
      .getLedger()
      .listRecentEvents(accountId, eventLimit);
    const activeReservations =
      await this.treasury
        .getLedger()
        .listActiveReservations(accountId);
    const report: TreasuryReport = await this.treasury.report(
      accountId,
      Math.min(250, eventLimit),
    );

    const windowEndMs = now.getTime();
    const currentStartMs = windowEndMs - windowMs;
    const priorStartMs = currentStartMs - windowMs;

    const currentEvents = events.filter((event) => {
      const ts = new Date(event.occurredAt).getTime();
      return ts >= currentStartMs && ts <= windowEndMs;
    });
    const priorEvents = events.filter((event) => {
      const ts = new Date(event.occurredAt).getTime();
      return ts >= priorStartMs && ts < currentStartMs;
    });

    const current = this.aggregate(currentEvents, windowMs);
    const prior = this.aggregate(priorEvents, windowMs);
    const anomalyBaseline = dailySpendBaseline(
      events,
      currentStartMs,
      windowEndMs,
    );
    const reservationRightSizing =
      this.rightSizingInsights(currentEvents);

    const currentReservationsUsd = activeReservations.reduce(
      (sum, reservation) => sum + Math.max(0, reservation.reservedCostUsd),
      0,
    );
    const currentReservationsCapacity = activeReservations.reduce(
      (sum, reservation) =>
        sum + Math.max(0, reservation.reservedCapacityUnits),
      0,
    );

    const signals: TreasuryEconomicSignal[] = [];
    const recommendations: TreasuryEconomicRecommendation[] = [];

    if (
      anomalyBaseline.confidence !== "LOW" &&
      Math.abs(anomalyBaseline.zScore) >= 2
    ) {
      signals.push({
        code: "SPEND_BASELINE_ANOMALY",
        severity: anomalyBaseline.severity,
        message:
          "Measured daily spend is materially different from the recent Treasury spend baseline.",
        evidence: {
          zScore: anomalyBaseline.zScore,
          latestSpendPerDayUsd: anomalyBaseline.latestSpendPerDayUsd,
          meanSpendPerDayUsd: anomalyBaseline.meanSpendPerDayUsd,
          sampleWindows: anomalyBaseline.sampleWindows,
        },
      });
    }

    for (const insight of reservationRightSizing) {
      if (
        insight.samples >= 5 &&
        insight.medianUtilization < 0.6 &&
        insight.p90Utilization < 0.85
      ) {
        recommendations.push({
          kind: "REDUCE_RESERVATION_SIZE",
          priority: insight.confidence === "HIGH" ? "MEDIUM" : "LOW",
          rationale:
            "Measured Treasury utilization suggests the reservation envelope for this workload type is consistently oversized.",
          evidence: {
            workloadType: insight.workloadType,
            samples: insight.samples,
            medianUtilization: insight.medianUtilization,
            p90Utilization: insight.p90Utilization,
            recommendedReservationMultiplier:
              insight.recommendedReservationMultiplier,
          },
          actionBoundary: "OVERSEER",
        });
      }
    }

    const breachCount = current.metrics.breachedReservations;
    if (breachCount > 0 || report.account.mode === "FROZEN") {
      signals.push({
        code: "TREASURY_BREACH_OR_FROZEN",
        severity: "CRITICAL",
        message:
          "Treasury has a recent economic breach or is frozen; discretionary consumption requires investigation before optimization.",
        evidence: {
          breachCount,
          treasuryFrozen: report.account.mode === "FROZEN",
        },
      });
      recommendations.push({
        kind: "INVESTIGATE_BREACH",
        priority: "HIGH",
        rationale:
          "Resolve the breached economic envelope before pursuing cost optimization.",
        evidence: { breachCount, treasuryFrozen: report.account.mode === "FROZEN" },
        actionBoundary: "TREASURER_KERNEL",
      });
    }

    if (current.metrics.releaseRatio >= 0.35 && current.metrics.reservedCostUsd >= 0.01) {
      signals.push({
        code: "HIGH_RESERVATION_WASTE",
        severity: "WARNING",
        message:
          "A large fraction of reserved monetary capacity has recently been released instead of consumed.",
        evidence: {
          releaseRatio: current.metrics.releaseRatio,
          reservedCostUsd: current.metrics.reservedCostUsd,
        },
      });
      recommendations.push({
        kind: "REDUCE_RESERVATION_SIZE",
        priority: "MEDIUM",
        rationale:
          "Tighten default reservation envelopes for workloads that consistently consume less than their holds.",
        evidence: {
          releaseRatio: current.metrics.releaseRatio,
          reservedCostUsd: current.metrics.reservedCostUsd,
        },
        actionBoundary: "OVERSEER",
      });
    }

    const capacityUtilization =
      report.account.capacityUnits > 0
        ? currentReservationsCapacity / report.account.capacityUnits
        : 0;

    if (capacityUtilization >= 0.8) {
      signals.push({
        code: "CAPACITY_PRESSURE",
        severity: "WARNING",
        message:
          "Scarce compute capacity is highly utilized; economic intelligence recommends protecting capacity from discretionary work.",
        evidence: {
          reservedCapacityUnits: currentReservationsCapacity,
          capacityUtilization,
          totalCapacityUnits: report.account.capacityUnits,
        },
      });
      recommendations.push({
        kind: "PROTECT_CAPACITY",
        priority: "HIGH",
        rationale:
          "Prefer reuse, deterministic work, or currently-running capacity before admitting additional scarce resources.",
        evidence: {
          reservedCapacityUnits: currentReservationsCapacity,
          totalCapacityUnits: report.account.capacityUnits,
        },
        actionBoundary: "OVERSEER",
      });
    }

    if (current.metrics.deniedCommands > 0) {
      signals.push({
        code: "TREASURY_DENIALS_PRESENT",
        severity: "WARNING",
        message:
          "Recent commands were denied by Treasury; this is a control signal, not an error to bypass.",
        evidence: { deniedCommands: current.metrics.deniedCommands },
      });
    }

    if (current.metrics.settledCostUsd > 0 && current.metrics.actualTokens === 0) {
      signals.push({
        code: "MISSING_TOKEN_MEASUREMENT",
        severity: "WARNING",
        message:
          "Settled spend exists without token measurements; unit economics are incomplete for those executions.",
        evidence: { settledCostUsd: current.metrics.settledCostUsd },
      });
      recommendations.push({
        kind: "REVIEW_PRICE_DATA",
        priority: "MEDIUM",
        rationale:
          "Improve provider usage measurement before using token-normalized economics for routing advice.",
        evidence: { settledCostUsd: current.metrics.settledCostUsd },
        actionBoundary: "ADVISORY_ONLY",
      });
    }

    if (currentEvents.some((event) => event.eventType === "SPEND_RECONCILED")) {
      recommendations.push({
        kind: "RECONCILE_AMBIGUOUS_SPEND",
        priority: "LOW",
        rationale:
          "Use durable reconciliation evidence for any held or ambiguous provider outcomes before declaring savings.",
        evidence: {
          reconciliationEvents: currentEvents.filter(
            (event) => event.eventType === "SPEND_RECONCILED",
          ).length,
        },
        actionBoundary: "TREASURER_KERNEL",
      });
    }

    const spendDelta = pctChange(
      current.metrics.settledCostUsd,
      prior.metrics.settledCostUsd,
    );
    if (Math.abs(spendDelta) >= 50 && current.metrics.settledCostUsd >= 0.01) {
      signals.push({
        code: "SPEND_REGIME_CHANGE",
        severity: "INFO",
        message:
          "Current-window settled spend changed materially relative to the immediately preceding window.",
        evidence: {
          spendDeltaPct: spendDelta,
          currentSettledCostUsd: current.metrics.settledCostUsd,
          priorSettledCostUsd: prior.metrics.settledCostUsd,
        },
      });
    }

    if (
      current.metrics.reservationUtilization < 0.5 &&
      current.metrics.reservedCostUsd >= 0.01
    ) {
      recommendations.push({
        kind: "REDUCE_WASTE",
        priority: "MEDIUM",
        rationale:
          "Recent reservations are consuming less than half of held monetary value.",
        evidence: {
          reservationUtilization: current.metrics.reservationUtilization,
          reservedCostUsd: current.metrics.reservedCostUsd,
        },
        actionBoundary: "OVERSEER",
      });
    }

    const providers = this.providerMetrics(currentEvents);

    if (providers.length >= 2) {
      const priced = providers.filter(
        (provider) =>
          provider.costPer1kTokensUsd !== undefined &&
          provider.invocations >= 3,
      );
      if (priced.length >= 2) {
        const cheapest = [...priced].sort(
          (a, b) =>
            (a.costPer1kTokensUsd ?? Infinity) -
            (b.costPer1kTokensUsd ?? Infinity),
        )[0];
        const mostExpensive = [...priced].sort(
          (a, b) =>
            (b.costPer1kTokensUsd ?? 0) -
            (a.costPer1kTokensUsd ?? 0),
        )[0];
        if (
          cheapest.costPer1kTokensUsd !== undefined &&
          mostExpensive.costPer1kTokensUsd !== undefined &&
          mostExpensive.costPer1kTokensUsd > 0 &&
          cheapest.costPer1kTokensUsd <=
            mostExpensive.costPer1kTokensUsd * 0.7
        ) {
          recommendations.push({
            kind: "PREFER_LOW_COST_ROUTE",
            priority: "LOW",
            rationale:
              "Observed unit economics show a materially cheaper qualified provider/model route in the current window. Selection remains the router's responsibility and should consider quality/latency/capability constraints.",
            evidence: {
              cheaperProviderId: cheapest.providerId,
              cheaperModelId: cheapest.modelId ?? "",
              cheaperCostPer1kTokensUsd:
                cheapest.costPer1kTokensUsd ?? 0,
              comparisonProviderId: mostExpensive.providerId,
              comparisonModelId: mostExpensive.modelId ?? "",
              comparisonCostPer1kTokensUsd:
                mostExpensive.costPer1kTokensUsd ?? 0,
            },
            actionBoundary: "OVERSEER",
          });
        }
      }
    }

    return {
      accountId,
      generatedAt: now.toISOString(),
      windowStart: new Date(currentStartMs).toISOString(),
      windowEnd: new Date(windowEndMs).toISOString(),
      unitMetrics: current.metrics,
      priorWindow: prior.metrics,
      spendDeltaPct: spendDelta,
      anomalyBaseline,
      reservationRightSizing,
      forecast: {
        projected7dSpendUsd:
          current.metrics.spendPerHourUsd * 24 * 7,
        projected30dSpendUsd:
          current.metrics.spendPerHourUsd * 24 * 30,
        confidence:
          current.metrics.successfulExecutions >= 25
            ? "HIGH"
            : current.metrics.successfulExecutions >= 5
              ? "MEDIUM"
              : "LOW",
      },
      activeReservedUsd: currentReservationsUsd,
      activeReservedCapacityUnits: currentReservationsCapacity,
      providers,
      signals,
      recommendations,
    };
  }

  private aggregate(
    events: TreasuryLedgerEvent[],
    windowMs: number,
  ): {
    metrics: TreasuryEconomicUnitMetrics;
    activeCapacityUtilization: (totalCapacity: number) => number;
  } {
    const metrics: MutableTreasuryEconomicUnitMetrics = { ...emptyUnitMetrics() };
    const byReservation = new Map<string, ReservationAccumulator>();

    for (const event of events) {
      const reservationId = event.reservationId;
      if (event.eventType === "RESOURCE_RESERVED") {
        const amount = Math.max(0, numeric(event.amountUsd));
        metrics.reservedCostUsd += amount;
        if (reservationId) {
          const bucket =
            byReservation.get(reservationId) ??
            ({
              reservedUsd: 0,
              consumedUsd: 0,
              releasedUsd: 0,
              consumedCapacityUnits: 0,
              actualTokens: 0,
              consumed: 0,
              verified: 0,
            } satisfies ReservationAccumulator);
          bucket.reservedUsd += amount;
          byReservation.set(reservationId, bucket);
        }
      }

      if (event.eventType === "RESOURCE_CONSUMED") {
        const amount = Math.max(0, numeric(event.amountUsd));
        const capacity = Math.max(0, numeric(event.capacityUnits));
        const tokens = Math.max(0, numeric(event.payload.actualTokens));
        metrics.settledCostUsd += amount;
        metrics.consumedCapacityUnits += capacity;
        metrics.actualTokens += tokens;
        metrics.successfulExecutions += 1;
        if (event.payload.verified === true) {
          metrics.verifiedExecutions += 1;
        }
        if (reservationId) {
          const bucket =
            byReservation.get(reservationId) ??
            ({
              reservedUsd: 0,
              consumedUsd: 0,
              releasedUsd: 0,
              consumedCapacityUnits: 0,
              actualTokens: 0,
              consumed: 0,
              verified: 0,
            } satisfies ReservationAccumulator);
          bucket.consumedUsd += amount;
          bucket.consumedCapacityUnits += capacity;
          bucket.actualTokens += tokens;
          bucket.consumed += 1;
          if (event.payload.verified === true) bucket.verified += 1;
          byReservation.set(reservationId, bucket);
        }
      }

      if (
        event.eventType === "RESERVATION_RELEASED" ||
        event.eventType === "RESERVATION_EXPIRED"
      ) {
        const amount = Math.max(0, numeric(event.amountUsd));
        metrics.releasedCostUsd += amount;
        if (event.eventType === "RESERVATION_EXPIRED") {
          metrics.expiredReservations += 1;
        }
        if (reservationId) {
          const bucket =
            byReservation.get(reservationId) ??
            ({
              reservedUsd: 0,
              consumedUsd: 0,
              releasedUsd: 0,
              consumedCapacityUnits: 0,
              actualTokens: 0,
              consumed: 0,
              verified: 0,
            } satisfies ReservationAccumulator);
          bucket.releasedUsd += amount;
          byReservation.set(reservationId, bucket);
        }
      }

      if (event.eventType === "BUDGET_BREACH") {
        metrics.breachedReservations += 1;
      }

      if (event.eventType === "SPEND_DENIED") {
        metrics.deniedCommands += 1;
      }
    }

    for (const reservation of byReservation.values()) {
      const reserved = Math.max(0, reservation.reservedUsd);
      if (reserved > 0) {
        metrics.reservationUtilization += Math.min(
          1,
          Math.max(0, reservation.consumedUsd / reserved),
        );
      }
    }

    if (byReservation.size > 0) {
      metrics.reservationUtilization /= byReservation.size;
    }

    metrics.releaseRatio =
      metrics.reservedCostUsd > 0
        ? Math.min(
            1,
            Math.max(0, metrics.releasedCostUsd / metrics.reservedCostUsd),
          )
        : 0;

    metrics.costPer1kTokensUsd =
      metrics.actualTokens > 0
        ? (metrics.settledCostUsd / metrics.actualTokens) * 1000
        : undefined;
    metrics.costPerSuccessfulExecutionUsd =
      metrics.successfulExecutions > 0
        ? metrics.settledCostUsd / metrics.successfulExecutions
        : undefined;
    metrics.costPerVerifiedExecutionUsd =
      metrics.verifiedExecutions > 0
        ? metrics.settledCostUsd / metrics.verifiedExecutions
        : undefined;
    metrics.spendPerHourUsd =
      (metrics.settledCostUsd / Math.max(windowMs, 1)) * 3_600_000;

    return {
      metrics,
      activeCapacityUtilization: (totalCapacity: number) =>
        totalCapacity > 0
          ? currentCapacity(metrics, totalCapacity)
          : 0,
    };
  }

  private rightSizingInsights(
    events: TreasuryLedgerEvent[],
  ): TreasuryEconomicRightSizingMetric[] {
    const grouped = new Map<string, number[]>();
    const reservations = new Map<
      string,
      { reservedUsd: number; consumedUsd: number; workloadType: string }
    >();

    for (const event of events) {
      const reservationId = event.reservationId;
      if (!reservationId) continue;

      if (event.eventType === "RESOURCE_RESERVED") {
        reservations.set(reservationId, {
          reservedUsd: Math.max(0, numeric(event.amountUsd)),
          consumedUsd: 0,
          workloadType: eventWorkloadType(event),
        });
      } else if (event.eventType === "RESOURCE_CONSUMED") {
        const existing = reservations.get(reservationId) ?? {
          reservedUsd: 0,
          consumedUsd: 0,
          workloadType: eventWorkloadType(event),
        };
        existing.consumedUsd += Math.max(0, numeric(event.amountUsd));
        reservations.set(reservationId, existing);
      } else if (
        event.eventType === "RESERVATION_RELEASED" ||
        event.eventType === "RESERVATION_EXPIRED"
      ) {
        const existing = reservations.get(reservationId);
        if (existing) {
          const utilization =
            existing.reservedUsd > 0
              ? Math.min(1, Math.max(0, existing.consumedUsd / existing.reservedUsd))
              : 0;
          const list = grouped.get(existing.workloadType) ?? [];
          list.push(utilization);
          grouped.set(existing.workloadType, list);
        }
      }
    }

    for (const [reservationId, existing] of reservations) {
      const hasTerminalEvent = events.some(
        (event) =>
          event.reservationId === reservationId &&
          (event.eventType === "RESERVATION_RELEASED" ||
            event.eventType === "RESERVATION_EXPIRED" ||
            event.eventType === "RESOURCE_CONSUMED"),
      );
      if (!hasTerminalEvent) continue;
      const utilization =
        existing.reservedUsd > 0
          ? Math.min(1, Math.max(0, existing.consumedUsd / existing.reservedUsd))
          : 0;
      if (!grouped.has(existing.workloadType)) {
        grouped.set(existing.workloadType, []);
      }
      if (!grouped.get(existing.workloadType)!.includes(utilization)) {
        grouped.get(existing.workloadType)!.push(utilization);
      }
    }

    return Array.from(grouped.entries()).map(([workloadType, values]) => ({
      workloadType,
      samples: values.length,
      medianUtilization: percentile(values, 0.5),
      p90Utilization: percentile(values, 0.9),
      recommendedReservationMultiplier: Math.min(
        1,
        Math.max(0.25, percentile(values, 0.9) * 1.15),
      ),
      confidence:
        values.length >= 20
          ? "HIGH"
          : values.length >= 5
            ? "MEDIUM"
            : "LOW",
    }));
  }

  private providerMetrics(
    events: TreasuryLedgerEvent[],
  ): TreasuryEconomicProviderMetric[] {
    const buckets = new Map<
      string,
      TreasuryEconomicProviderMetric
    >();

    for (const event of events) {
      if (event.eventType !== "RESOURCE_CONSUMED") continue;
      const { providerId, modelId } = resourceIdentity(event);
      const key = providerId + ":" + (modelId ?? "");
      if (!providerId) continue;

      const existing = buckets.get(key) ?? {
        providerId,
        modelId,
        invocations: 0,
        settledCostUsd: 0,
        actualTokens: 0,
        verifiedExecutions: 0,
        observedPriceConfidence: "LOW",
      };

      const actualTokens = Math.max(
        0,
        numeric(event.payload.actualTokens),
      );
      const settledCostUsd = Math.max(
        0,
        numeric(event.amountUsd),
      );

      buckets.set(key, {
        ...existing,
        invocations: existing.invocations + 1,
        settledCostUsd:
          existing.settledCostUsd + settledCostUsd,
        actualTokens:
          existing.actualTokens + actualTokens,
        verifiedExecutions:
          existing.verifiedExecutions +
          (event.payload.verified === true ? 1 : 0),
        observedPriceConfidence:
          existing.invocations + 1 >= 10
            ? "HIGH"
            : existing.invocations + 1 >= 3
              ? "MEDIUM"
              : "LOW",
      });
    }

    return Array.from(buckets.values()).map((metric) => ({
      ...metric,
      observedPriceConfidence:
        metric.invocations >= 10
          ? "HIGH"
          : metric.invocations >= 3
            ? "MEDIUM"
            : "LOW",
      costPer1kTokensUsd:
        metric.actualTokens > 0
          ? (metric.settledCostUsd / metric.actualTokens) * 1000
          : undefined,
    }));
  }
}

function currentCapacity(
  metrics: TreasuryEconomicUnitMetrics,
  totalCapacity: number,
): number {
  if (totalCapacity <= 0) return 0;
  return Math.min(
    1,
    Math.max(0, metrics.consumedCapacityUnits / totalCapacity),
  );
}
