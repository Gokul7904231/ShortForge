/**
 * Treasury-owned generation entitlement policy.
 *
 * This module defines entitlement limits and period identity without performing
 * any persistence or admission. Persistence/admission remains in Treasury.
 */
export type TreasuryEntitlementTier = "BASIC" | "PRO" | "ADMIN" | "OWNER";

export interface TreasuryEntitlementPolicyConfig {
  readonly basicLifetimeLimit: number;
  readonly proMonthlyLimit: number;
}

export interface TreasuryEntitlementPeriod {
  readonly periodType: "LIFETIME" | "CALENDAR_MONTH";
  readonly periodKey: string;
  readonly start?: string;
  readonly end?: string;
}

export const defaultTreasuryEntitlementPolicy = (): TreasuryEntitlementPolicyConfig => ({
  basicLifetimeLimit: Math.max(
    1,
    Number.parseInt(
      process.env.BASIC_GENERATION_LIMIT || "5",
      10,
    ) || 5,
  ),
  proMonthlyLimit: 8,
});

export function resolveTreasuryEntitlementTier(
  role = "USER",
): TreasuryEntitlementTier {
  const normalized = String(role).toUpperCase();
  if (normalized === "OWNER") return "OWNER";
  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "PRO") return "PRO";
  return "BASIC";
}

export function entitlementPeriod(
  tier: TreasuryEntitlementTier,
  date = new Date(),
): TreasuryEntitlementPeriod {
  if (tier !== "PRO") {
    return {
      periodType: "LIFETIME",
      periodKey: "lifetime",
    };
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const periodKey =
    String(year) + "-" + String(month + 1).padStart(2, "0");
  const start = new Date(
    Date.UTC(year, month, 1, 0, 0, 0, 0),
  ).toISOString();
  const end = new Date(
    Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - 1,
  ).toISOString();

  return {
    periodType: "CALENDAR_MONTH",
    periodKey,
    start,
    end,
  };
}

export function entitlementAccountId(
  userId: string,
  tier: TreasuryEntitlementTier,
  date = new Date(),
): string {
  return (
    "quota:" +
    userId +
    ":" +
    entitlementPeriod(tier, date).periodKey
  );
}

export function entitlementLimit(
  tier: TreasuryEntitlementTier,
  config = defaultTreasuryEntitlementPolicy(),
): number {
  if (tier === "ADMIN" || tier === "OWNER") return Infinity;
  return tier === "PRO"
    ? config.proMonthlyLimit
    : config.basicLifetimeLimit;
}
