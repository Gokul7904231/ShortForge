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
  TreasuryReservation,
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

export interface TreasuryEconomicIntelligenceSnapshot {
  readonly accountId: string;
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly unitMetrics: TreasuryEconomicUnitMetrics;
  readonly priorWindow: TreasuryEconomicUnitMetrics;
  readonly spendDeltaPct: number;
  readonly activeReservedUsd: number;
  readonly activeReservedCapacityUnits: number;
  readonly providers: readonly TreasuryEconomicProviderMetric[];
  readonly signals: readonly TreasuryEconomicSignal[];
  readonly recommendations: readonly TreasuryEconomicRecommendation[];
}

type ReservationAccumulator = {
  reservedUsd: number;
  consumedUsd: number;
  releasedUsd: number;
  consumedCapacityUnits: number;
  actualTokens: number;
  consumed: number;
  verified: number;
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

    const breachCount = current.breachedReservations;
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

    if (current.releaseRatio >= 0.35 && current.reservedCostUsd >= 0.01) {
      signals.push({
        code: "HIGH_RESERVATION_WASTE",
        severity: "WARNING",
        message:
          "A large fraction of reserved monetary capacity has recently been released instead of consumed.",
        evidence: {
          releaseRatio: current.releaseRatio,
          reservedCostUsd: current.reservedCostUsd,
        },
      });
      recommendations.push({
        kind: "REDUCE_RESERVATION_SIZE",
        priority: "MEDIUM",
        rationale:
          "Tighten default reservation envelopes for workloads that consistently consume less than their holds.",
        evidence: {
          releaseRatio: current.releaseRatio,
          reservedCostUsd: current.reservedCostUsd,
        },
        actionBoundary: "OVERSEER",
      });
    }

    if (
      current.activeCapacityUtilization(
        report.account.availableCapacityUnits +
          report.account.reservedCapacityUnits,
      ) >= 0.8
    ) {
      signals.push({
        code: "CAPACITY_PRESSURE",
        severity: "WARNING",
        message:
          "Scarce compute capacity is highly utilized; economic intelligence recommends protecting capacity from discretionary work.",
        evidence: {
          reservedCapacityUnits: currentReservationsCapacity,
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

    if (current.deniedCommands > 0) {
      signals.push({
        code: "TREASURY_DENIALS_PRESENT",
        severity: "WARNING",
        message:
          "Recent commands were denied by Treasury; this is a control signal, not an error to bypass.",
        evidence: { deniedCommands: current.deniedCommands },
      });
    }

    if (current.settledCostUsd > 0 && current.actualTokens === 0) {
      signals.push({
        code: "MISSING_TOKEN_MEASUREMENT",
        severity: "WARNING",
        message:
          "Settled spend exists without token measurements; unit economics are incomplete for those executions.",
        evidence: { settledCostUsd: current.settledCostUsd },
      });
      recommendations.push({
        kind: "REVIEW_PRICE_DATA",
        priority: "MEDIUM",
        rationale:
          "Improve provider usage measurement before using token-normalized economics for routing advice.",
        evidence: { settledCostUsd: current.settledCostUsd },
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
      current.settledCostUsd,
      prior.settledCostUsd,
    );
    if (Math.abs(spendDelta) >= 50 && current.settledCostUsd >= 0.01) {
      signals.push({
        code: "SPEND_REGIME_CHANGE",
        severity: "INFO",
        message:
          "Current-window settled spend changed materially relative to the immediately preceding window.",
        evidence: {
          spendDeltaPct: spendDelta,
          currentSettledCostUsd: current.settledCostUsd,
          priorSettledCostUsd: prior.settledCostUsd,
        },
      });
    }

    if (
      current.reservationUtilization < 0.5 &&
      current.reservedCostUsd >= 0.01
    ) {
      recommendations.push({
        kind: "REDUCE_WASTE",
        priority: "MEDIUM",
        rationale:
          "Recent reservations are consuming less than half of held monetary value.",
        evidence: {
          reservationUtilization: current.reservationUtilization,
          reservedCostUsd: current.reservedCostUsd,
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
    const metrics = emptyUnitMetrics();
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
        totalCapacity > 0 ? currentCapacity(metrics, totalCapacity) : 0,
    };
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
      });
    }

    return Array.from(buckets.values()).map((metric) => ({
      ...metric,
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
