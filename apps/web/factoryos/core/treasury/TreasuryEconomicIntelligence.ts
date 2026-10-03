/**
 * ShortForge / FactoryOS — Treasury Economic Intelligence
 *
 * Read-only economic intelligence over Treasury's durable ledger.
 * This layer can measure, correlate, forecast and recommend, but it cannot
 * reserve, settle, release, freeze, unfreeze, mutate pricing, or authorize work.
 */

import type { TreasuryLedgerEvent } from "./TreasuryContracts";
import type { TreasuryService } from "./TreasuryService";

export interface TreasuryEconomicUnitMetrics {
  readonly settledCostUsd: number;
  readonly actualTokens: number;
  readonly actualDurationMs: number;
  readonly reservedCostUsd: number;
  readonly releasedCostUsd: number;
  readonly reservedCapacityUnits: number;
  readonly actualCapacityUnits: number;
  readonly reservationUtilization: number;
  readonly releaseRatio: number;
  readonly successfulExecutions: number;
  readonly verifiedExecutions: number;
  readonly deniedCommands: number;
  readonly breachedReservations: number;
  readonly costPer1kTokensUsd?: number;
  readonly costPerSuccessfulExecutionUsd?: number;
  readonly costPerVerifiedExecutionUsd?: number;
}

export interface TreasuryEconomicProviderMetric {
  readonly providerId: string;
  readonly modelId?: string;
  readonly invocations: number;
  readonly settledCostUsd: number;
  readonly actualTokens: number;
  readonly costPer1kTokensUsd?: number;
}

export interface TreasuryEconomicSignal {
  readonly code:
    | "TREASURY_BREACH_OR_FROZEN"
    | "HIGH_DENIAL_RATE"
    | "RESERVATION_WASTE"
    | "ACTIVE_RESERVATION_PRESSURE"
    | "UNPRICED_OR_UNATTRIBUTED_SPEND";
  readonly severity: "INFO" | "WARNING" | "CRITICAL";
  readonly message: string;
}

export interface TreasuryEconomicRecommendation {
  readonly kind:
    | "REDUCE_WASTE"
    | "RECONCILE_ACTIVE_RESERVATIONS"
    | "REVIEW_ROUTE_ECONOMICS"
    | "INVESTIGATE_DENIALS";
  readonly priority: "LOW" | "MEDIUM" | "HIGH";
  readonly rationale: string;
  readonly actionBoundary: "ADVISORY_ONLY";
}

export interface TreasuryEconomicForecast {
  readonly projected7dSpendUsd: number;
  readonly projected30dSpendUsd: number;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
  readonly measuredSpendPerHourUsd: number;
  readonly basisWindowHours: number;
}

export interface TreasuryEconomicIntelligenceSnapshot {
  readonly version: "1";
  readonly accountId: string;
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly unitMetrics: TreasuryEconomicUnitMetrics;
  readonly spendDeltaPct: number;
  readonly forecast: TreasuryEconomicForecast;
  readonly activeReservedUsd: number;
  readonly activeReservedCapacityUnits: number;
  readonly signals: readonly TreasuryEconomicSignal[];
  readonly recommendations: readonly TreasuryEconomicRecommendation[];
  readonly providers: readonly TreasuryEconomicProviderMetric[];
  readonly evidence: readonly {
    readonly eventCount: number;
    readonly source: "TREASURY_LEDGER";
  }[];
}

export interface TreasuryEconomicIntelligenceAnalyzeOptions {
  readonly windowMs?: number;
  readonly eventLimit?: number;
  readonly now?: Date;
}

type ReservationAccumulator = {
  reservedCostUsd: number;
  reservedCapacityUnits: number;
  settledCostUsd: number;
  releasedCostUsd: number;
  actualCapacityUnits: number;
  actualTokens: number;
  actualDurationMs: number;
  successful: boolean;
  verified: boolean;
  providerId?: string;
  modelId?: string;
};

type ProviderAccumulator = {
  providerId: string;
  modelId?: string;
  invocations: number;
  settledCostUsd: number;
  actualTokens: number;
};

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EVENT_LIMIT = 2_000;

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function eventTime(event: TreasuryLedgerEvent): number {
  const t = new Date(event.occurredAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function eventPayloadNumber(event: TreasuryLedgerEvent, key: string): number {
  return Math.max(0, finite(event.payload?.[key]));
}

function blankReservation(): ReservationAccumulator {
  return {
    reservedCostUsd: 0,
    reservedCapacityUnits: 0,
    settledCostUsd: 0,
    releasedCostUsd: 0,
    actualCapacityUnits: 0,
    actualTokens: 0,
    actualDurationMs: 0,
    successful: false,
    verified: false,
  };
}

function providerFromEvent(
  event: TreasuryLedgerEvent,
): { providerId?: string; modelId?: string } {
  const requests = Array.isArray(event.payload?.resourceRequest)
    ? (event.payload.resourceRequest as Array<Record<string, unknown>>)
    : [];
  const inference = requests.find(
    (request) => String(request.kind || "").toUpperCase() === "INFERENCE",
  );
  return {
    providerId:
      typeof inference?.providerId === "string"
        ? inference.providerId
        : undefined,
    modelId:
      typeof inference?.modelId === "string" ? inference.modelId : undefined,
  };
}

export class TreasuryEconomicIntelligence {
  constructor(private readonly treasury: TreasuryService) {}

  async analyze(
    accountId: string,
    options: TreasuryEconomicIntelligenceAnalyzeOptions = {},
  ): Promise<TreasuryEconomicIntelligenceSnapshot> {
    const now = options.now ?? new Date();
    const windowMs = Math.max(60_000, options.windowMs ?? DEFAULT_WINDOW_MS);
    const eventLimit = Math.max(100, options.eventLimit ?? DEFAULT_EVENT_LIMIT);
    const endMs = now.getTime();
    const startMs = endMs - windowMs;
    const previousStartMs = startMs - windowMs;

    const ledger = this.treasury.getLedger();
    const [account, recentEvents] = await Promise.all([
      ledger.getAccount(accountId),
      ledger.listRecentEvents(accountId, eventLimit),
    ]);
    if (!account) {
      throw new Error("Treasury account not found: " + accountId);
    }

    const events = recentEvents.filter((event) => {
      const t = eventTime(event);
      return t >= previousStartMs && t <= endMs;
    });
    const currentEvents = events.filter((event) => eventTime(event) >= startMs);
    const previousEvents = events.filter(
      (event) => eventTime(event) >= previousStartMs && eventTime(event) < startMs,
    );

    const activeReservations = await ledger.listActiveReservations(accountId);
    const activeReservedUsd = activeReservations.reduce(
      (sum, reservation) => sum + Math.max(0, reservation.reservedCostUsd),
      0,
    );
    const activeReservedCapacityUnits = activeReservations.reduce(
      (sum, reservation) => sum + Math.max(0, reservation.reservedCapacityUnits),
      0,
    );

    const reservations = new Map<string, ReservationAccumulator>();
    const providers = new Map<string, ProviderAccumulator>();
    let deniedCommands = 0;
    let breachedReservations = 0;
    let currentSettledSpend = 0;
    let previousSettledSpend = 0;

    const ensureReservation = (id: string) => {
      const current = reservations.get(id) ?? blankReservation();
      reservations.set(id, current);
      return current;
    };

    for (const event of currentEvents) {
      const reservationId =
        event.reservationId ||
        (typeof event.payload?.reservationId === "string"
          ? String(event.payload.reservationId)
          : event.eventId);

      switch (event.eventType) {
        case "RESOURCE_RESERVED": {
          const row = ensureReservation(reservationId);
          row.reservedCostUsd = Math.max(
            row.reservedCostUsd,
            Math.max(0, finite(event.amountUsd)),
          );
          row.reservedCapacityUnits = Math.max(
            row.reservedCapacityUnits,
            Math.max(0, finite(event.capacityUnits)),
          );
          break;
        }
        case "RESOURCE_CONSUMED": {
          const row = ensureReservation(reservationId);
          row.settledCostUsd = Math.max(
            row.settledCostUsd,
            eventPayloadNumber(event, "actualCostUsd") ||
              Math.max(0, finite(event.amountUsd)),
          );
          row.actualCapacityUnits = Math.max(
            row.actualCapacityUnits,
            eventPayloadNumber(event, "actualCapacityUnits") ||
              Math.max(0, finite(event.capacityUnits)),
          );
          row.actualTokens = Math.max(
            row.actualTokens,
            eventPayloadNumber(event, "actualTokens"),
          );
          row.actualDurationMs = Math.max(
            row.actualDurationMs,
            eventPayloadNumber(event, "actualDurationMs"),
          );
          row.successful = true;
          row.verified = row.verified || event.payload?.verified === true;
          const provider = providerFromEvent(event);
          row.providerId = row.providerId || provider.providerId;
          row.modelId = row.modelId || provider.modelId;

          const key = (provider.providerId || "unknown") + ":" + (provider.modelId || "unknown");
          const aggregate = providers.get(key) ?? {
            providerId: provider.providerId || "unknown",
            modelId: provider.modelId,
            invocations: 0,
            settledCostUsd: 0,
            actualTokens: 0,
          };
          aggregate.invocations += 1;
          aggregate.settledCostUsd +=
            eventPayloadNumber(event, "actualCostUsd") ||
            Math.max(0, finite(event.amountUsd));
          aggregate.actualTokens += eventPayloadNumber(event, "actualTokens");
          providers.set(key, aggregate);
          currentSettledSpend +=
            eventPayloadNumber(event, "actualCostUsd") ||
            Math.max(0, finite(event.amountUsd));
          break;
        }
        case "SPEND_RECONCILED": {
          const row = ensureReservation(reservationId);
          row.settledCostUsd = Math.max(
            row.settledCostUsd,
            eventPayloadNumber(event, "actualCostUsd"),
          );
          row.releasedCostUsd = Math.max(
            row.releasedCostUsd,
            eventPayloadNumber(event, "releasedUsd"),
          );
          break;
        }
        case "RESERVATION_RELEASED":
        case "RESERVATION_EXPIRED": {
          const row = ensureReservation(reservationId);
          row.releasedCostUsd = Math.max(
            row.releasedCostUsd,
            Math.max(0, finite(event.amountUsd)),
          );
          break;
        }
        case "SPEND_DENIED":
          deniedCommands += 1;
          break;
        case "BUDGET_BREACH":
          breachedReservations += 1;
          break;
        default:
          break;
      }
    }

    for (const event of previousEvents) {
      if (event.eventType === "RESOURCE_CONSUMED") {
        previousSettledSpend +=
          eventPayloadNumber(event, "actualCostUsd") ||
          Math.max(0, finite(event.amountUsd));
      }
    }

    const reservationRows = [...reservations.values()];
    const settledCostUsd = reservationRows.reduce(
      (sum, row) => sum + row.settledCostUsd,
      0,
    );
    const reservedCostUsd = reservationRows.reduce(
      (sum, row) => sum + row.reservedCostUsd,
      0,
    );
    const releasedCostUsd = reservationRows.reduce(
      (sum, row) => sum + row.releasedCostUsd,
      0,
    );
    const actualTokens = reservationRows.reduce(
      (sum, row) => sum + row.actualTokens,
      0,
    );
    const actualDurationMs = reservationRows.reduce(
      (sum, row) => sum + row.actualDurationMs,
      0,
    );
    const reservedCapacityUnits = reservationRows.reduce(
      (sum, row) => sum + row.reservedCapacityUnits,
      0,
    );
    const actualCapacityUnits = reservationRows.reduce(
      (sum, row) => sum + row.actualCapacityUnits,
      0,
    );
    const successfulExecutions = reservationRows.filter((row) => row.successful).length;
    const verifiedExecutions = reservationRows.filter((row) => row.verified).length;

    const reservationUtilization = clampRatio(
      reservedCostUsd > 0 ? settledCostUsd / reservedCostUsd : 0,
    );
    const releaseRatio = clampRatio(
      reservedCostUsd > 0 ? releasedCostUsd / reservedCostUsd : 0,
    );

    const unitMetrics: TreasuryEconomicUnitMetrics = {
      settledCostUsd,
      actualTokens,
      actualDurationMs,
      reservedCostUsd,
      releasedCostUsd,
      reservedCapacityUnits,
      actualCapacityUnits,
      reservationUtilization,
      releaseRatio,
      successfulExecutions,
      verifiedExecutions,
      deniedCommands,
      breachedReservations,
      costPer1kTokensUsd:
        actualTokens > 0 ? (settledCostUsd / actualTokens) * 1000 : undefined,
      costPerSuccessfulExecutionUsd:
        successfulExecutions > 0 ? settledCostUsd / successfulExecutions : undefined,
      costPerVerifiedExecutionUsd:
        verifiedExecutions > 0 ? settledCostUsd / verifiedExecutions : undefined,
    };

    const hours = Math.max(windowMs / 3_600_000, 1 / 60);
    const measuredSpendPerHourUsd = settledCostUsd / hours;
    const spendDeltaPct =
      previousSettledSpend > 0
        ? ((currentSettledSpend - previousSettledSpend) / previousSettledSpend) * 100
        : currentSettledSpend > 0
          ? 100
          : 0;

    const confidence =
      successfulExecutions >= 20
        ? "HIGH"
        : successfulExecutions >= 5
          ? "MEDIUM"
          : "LOW";

    const signals: TreasuryEconomicSignal[] = [];
    if (breachedReservations > 0 || account.mode === "FROZEN") {
      signals.push({
        code: "TREASURY_BREACH_OR_FROZEN",
        severity: "CRITICAL",
        message:
          breachedReservations > 0
            ? breachedReservations + " Treasury reservation breach event(s) occurred in the analysis window."
            : "Treasury account is currently frozen.",
      });
    }

    const denialRate =
      deniedCommands / Math.max(1, deniedCommands + successfulExecutions);
    if (denialRate >= 0.25) {
      signals.push({
        code: "HIGH_DENIAL_RATE",
        severity: "WARNING",
        message:
          "Treasury denied " +
          deniedCommands +
          " command(s); denial rate is " +
          (denialRate * 100).toFixed(1) +
          "% of observed activity.",
      });
    }

    if (reservedCostUsd > 0 && reservationUtilization < 0.6) {
      signals.push({
        code: "RESERVATION_WASTE",
        severity: "WARNING",
        message:
          "Settled cost used " +
          (reservationUtilization * 100).toFixed(1) +
          "% of reserved spend; unused reservation headroom is material.",
      });
    }

    if (activeReservedUsd > 0) {
      signals.push({
        code: "ACTIVE_RESERVATION_PRESSURE",
        severity:
          activeReservedUsd > Math.max(1, account.budgetUsd * 0.5)
            ? "WARNING"
            : "INFO",
        message:
          "Active reservations currently hold $" +
          activeReservedUsd.toFixed(4) +
          " and " +
          activeReservedCapacityUnits +
          " capacity unit(s).",
      });
    }

    if (
      settledCostUsd > 0 &&
      [...providers.values()].every((provider) => provider.providerId === "unknown")
    ) {
      signals.push({
        code: "UNPRICED_OR_UNATTRIBUTED_SPEND",
        severity: "INFO",
        message:
          "Settled spend exists without attributable provider/model evidence in the Treasury ledger payload.",
      });
    }

    const recommendations: TreasuryEconomicRecommendation[] = [];
    if (reservationUtilization < 0.8 && reservedCostUsd > 0) {
      recommendations.push({
        kind: "REDUCE_WASTE",
        priority: reservationUtilization < 0.5 ? "HIGH" : "MEDIUM",
        rationale:
          "Reduce reservation envelopes or right-size retry/token ceilings; measured utilization is " +
          (reservationUtilization * 100).toFixed(1) +
          "%.",
        actionBoundary: "ADVISORY_ONLY",
      });
    }
    if (activeReservedUsd > 0) {
      recommendations.push({
        kind: "RECONCILE_ACTIVE_RESERVATIONS",
        priority: "MEDIUM",
        rationale:
          "Review active holds against provider/job state before allowing unnecessary capital or capacity to remain reserved.",
        actionBoundary: "ADVISORY_ONLY",
      });
    }
    if (providers.size > 1) {
      recommendations.push({
        kind: "REVIEW_ROUTE_ECONOMICS",
        priority: "LOW",
        rationale:
          "Multiple provider/model observations exist; compare measured unit economics before changing routing policy.",
        actionBoundary: "ADVISORY_ONLY",
      });
    }
    if (deniedCommands > 0) {
      recommendations.push({
        kind: "INVESTIGATE_DENIALS",
        priority: denialRate >= 0.25 ? "HIGH" : "MEDIUM",
        rationale:
          "Review deterministic Treasury denial reasons before adjusting workload admission or provider configuration.",
        actionBoundary: "ADVISORY_ONLY",
      });
    }

    const providersSnapshot = [...providers.values()]
      .map((provider) => ({
        ...provider,
        costPer1kTokensUsd:
          provider.actualTokens > 0
            ? (provider.settledCostUsd / provider.actualTokens) * 1000
            : undefined,
      }))
      .sort((a, b) => b.settledCostUsd - a.settledCostUsd);

    return {
      version: "1",
      accountId,
      generatedAt: now.toISOString(),
      windowStart: new Date(startMs).toISOString(),
      windowEnd: new Date(endMs).toISOString(),
      unitMetrics,
      spendDeltaPct,
      forecast: {
        projected7dSpendUsd: measuredSpendPerHourUsd * 24 * 7,
        projected30dSpendUsd: measuredSpendPerHourUsd * 24 * 30,
        confidence,
        measuredSpendPerHourUsd,
        basisWindowHours: hours,
      },
      activeReservedUsd,
      activeReservedCapacityUnits,
      signals,
      recommendations,
      providers: providersSnapshot,
      evidence: [{ eventCount: currentEvents.length, source: "TREASURY_LEDGER" }],
    };
  }
}
