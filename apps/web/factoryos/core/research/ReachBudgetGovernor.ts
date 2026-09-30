import type { ReachProviderId } from "./ReachContracts";

export type DecodoBudgetCapability =
  | "DECODO_FAST_SEARCH"
  | "DECODO_WEB_STANDARD"
  | "DECODO_WEB_JS"
  | "DECODO_WEB_PREMIUM"
  | "DECODO_WEB_PREMIUM_JS";

interface BudgetBucket {
  capacity: number;
  reserved: number;
  used: number;
}

export interface ReachBudgetSnapshot {
  readonly capability: DecodoBudgetCapability;
  readonly capacity: number;
  readonly reserved: number;
  readonly used: number;
  readonly available: number;
}

export interface BudgetReservation {
  readonly reservationId: string;
  readonly capability: DecodoBudgetCapability;
  readonly provider: ReachProviderId;
  readonly units: number;
}

export class DecodoBudgetGovernor {
  private readonly buckets = new Map<DecodoBudgetCapability, BudgetBucket>();

  constructor(
    capacity: Partial<Record<DecodoBudgetCapability, number>> = {},
  ) {
    const capabilities: DecodoBudgetCapability[] = [
      "DECODO_FAST_SEARCH",
      "DECODO_WEB_STANDARD",
      "DECODO_WEB_JS",
      "DECODO_WEB_PREMIUM",
      "DECODO_WEB_PREMIUM_JS",
    ];

    for (const capability of capabilities) {
      const raw = capacity[capability];
      this.buckets.set(capability, {
        capacity: Math.max(
          0,
          Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : 0,
        ),
        reserved: 0,
        used: 0,
      });
    }
  }

  reserve(
    capability: DecodoBudgetCapability,
    provider: ReachProviderId,
    units = 1,
  ): BudgetReservation | null {
    const bucket = this.buckets.get(capability);
    const normalizedUnits = Math.max(1, Math.floor(units));

    if (
      !bucket ||
      bucket.capacity - bucket.reserved - bucket.used < normalizedUnits
    ) {
      return null;
    }

    bucket.reserved += normalizedUnits;

    return {
      reservationId:
        "decodo_res_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8),
      capability,
      provider,
      units: normalizedUnits,
    };
  }

  commit(reservation: BudgetReservation): void {
    const bucket = this.buckets.get(reservation.capability);
    if (!bucket) return;

    bucket.reserved = Math.max(0, bucket.reserved - reservation.units);
    bucket.used += reservation.units;
  }

  release(reservation: BudgetReservation): void {
    const bucket = this.buckets.get(reservation.capability);
    if (!bucket) return;

    bucket.reserved = Math.max(0, bucket.reserved - reservation.units);
  }

  remaining(capability: DecodoBudgetCapability): number {
    const bucket = this.buckets.get(capability);
    return bucket
      ? Math.max(0, bucket.capacity - bucket.reserved - bucket.used)
      : 0;
  }

  snapshot(): ReachBudgetSnapshot[] {
    return [...this.buckets.entries()].map(([capability, bucket]) => ({
      capability,
      capacity: bucket.capacity,
      reserved: bucket.reserved,
      used: bucket.used,
      available: Math.max(
        0,
        bucket.capacity - bucket.reserved - bucket.used,
      ),
    }));
  }

  resetForTesting(): void {
    for (const bucket of this.buckets.values()) {
      bucket.reserved = 0;
      bucket.used = 0;
    }
  }
}
