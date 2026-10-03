/**
 * Bounded Treasury Economic Advice projection for Ascalon/GLiDE.
 *
 * This is intentionally a projection, not a capability/authority interface.
 * It contains no Treasury service handle and cannot reserve, settle, release,
 * freeze, unfreeze, or mutate price data.
 */
import type { TreasuryEconomicIntelligenceSnapshot } from "./TreasuryEconomicIntelligence";

export interface TreasuryEconomicAdvice {
  readonly version: "1";
  readonly authorityClass: "SHADOW_ONLY";
  readonly canAuthorizeSpend: false;
  readonly accountId: string;
  readonly generatedAt: string;
  readonly spend: {
    readonly settledCostUsd: number;
    readonly spendDeltaPct: number;
    readonly spendPerHourUsd: number;
  };
  readonly utilization: {
    readonly reservationUtilization: number;
    readonly releaseRatio: number;
    readonly activeReservedUsd: number;
    readonly activeReservedCapacityUnits: number;
  };
  readonly unitEconomics: {
    readonly costPer1kTokensUsd?: number;
    readonly costPerSuccessfulExecutionUsd?: number;
    readonly costPerVerifiedExecutionUsd?: number;
  };
  readonly pressure: {
    readonly frozen: boolean;
    readonly breachCount: number;
    readonly deniedCommands: number;
  };
  readonly routeHints: readonly {
    readonly providerId: string;
    readonly modelId?: string;
    readonly costPer1kTokensUsd?: number;
  }[];
  readonly recommendations: readonly {
    readonly kind: string;
    readonly priority: "LOW" | "MEDIUM" | "HIGH";
    readonly rationale: string;
  }[];
}

export function projectTreasuryEconomicAdvice(
  snapshot: TreasuryEconomicIntelligenceSnapshot,
): TreasuryEconomicAdvice {
  return {
    version: "1",
    authorityClass: "SHADOW_ONLY",
    canAuthorizeSpend: false,
    accountId: snapshot.accountId,
    generatedAt: snapshot.generatedAt,
    spend: {
      settledCostUsd: snapshot.unitMetrics.settledCostUsd,
      spendDeltaPct: snapshot.spendDeltaPct,
      spendPerHourUsd: snapshot.unitMetrics.spendPerHourUsd,
    },
    utilization: {
      reservationUtilization:
        snapshot.unitMetrics.reservationUtilization,
      releaseRatio: snapshot.unitMetrics.releaseRatio,
      activeReservedUsd: snapshot.activeReservedUsd,
      activeReservedCapacityUnits:
        snapshot.activeReservedCapacityUnits,
    },
    unitEconomics: {
      costPer1kTokensUsd:
        snapshot.unitMetrics.costPer1kTokensUsd,
      costPerSuccessfulExecutionUsd:
        snapshot.unitMetrics.costPerSuccessfulExecutionUsd,
      costPerVerifiedExecutionUsd:
        snapshot.unitMetrics.costPerVerifiedExecutionUsd,
    },
    pressure: {
      frozen: snapshot.signals.some(
        (signal) =>
          signal.code === "TREASURY_BREACH_OR_FROZEN" &&
          signal.severity === "CRITICAL",
      ),
      breachCount: snapshot.unitMetrics.breachedReservations,
      deniedCommands: snapshot.unitMetrics.deniedCommands,
    },
    routeHints: snapshot.providers
      .slice()
      .sort(
        (a, b) =>
          (a.costPer1kTokensUsd ?? Infinity) -
          (b.costPer1kTokensUsd ?? Infinity),
      )
      .slice(0, 8)
      .map((provider) => ({
        providerId: provider.providerId,
        modelId: provider.modelId,
        costPer1kTokensUsd: provider.costPer1kTokensUsd,
      })),
    recommendations: snapshot.recommendations.slice(0, 8).map(
      (recommendation) => ({
        kind: recommendation.kind,
        priority: recommendation.priority,
        rationale: recommendation.rationale,
      }),
    ),
  };
}
