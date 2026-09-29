import { randomUUID } from "node:crypto";
import type {
  EpistemicBudget,
  EpistemicUsage,
} from "./EpistemicContracts";

export interface EpistemicBudgetReservationRequest {
  readonly scopeKey: string;
  readonly budget: EpistemicBudget;
  readonly usage: EpistemicUsage;
  readonly mode: "MICRO" | "DEEP";
  readonly costUnits: number;
  readonly estimatedTimeMs: number;
  readonly ttlMs?: number;
}

export interface EpistemicBudgetReservation {
  readonly reservationId: string;
  readonly scopeKey: string;
  readonly mode: "MICRO" | "DEEP";
  readonly costUnits: number;
  readonly estimatedTimeMs: number;
  readonly expiresAt: number;
}

interface MutableReservation extends EpistemicBudgetReservation {}

function pruneExpired(
  reservations: Map<string, MutableReservation>,
  now: number,
): void {
  for (const [id, reservation] of reservations) {
    if (reservation.expiresAt <= now) reservations.delete(id);
  }
}

/**
 * Process-local atomic reservation store.
 *
 * A production distributed implementation should back the same contract with
 * an atomic database/lease primitive. AER never assumes local state is globally
 * authoritative.
 */
export class InMemoryEpistemicBudgetReservationStore {
  private readonly reservations = new Map<string, MutableReservation>();

  public reserve(
    request: EpistemicBudgetReservationRequest,
    now = Date.now(),
  ): EpistemicBudgetReservation | null {
    if (!request.scopeKey.trim()) {
      throw new Error("[AER budget] scopeKey is required");
    }

    const costUnits = Math.max(0, request.costUnits);
    const estimatedTimeMs = Math.max(0, request.estimatedTimeMs);
    const ttlMs = Math.max(1000, request.ttlMs ?? 30_000);

    pruneExpired(this.reservations, now);

    const active = [...this.reservations.values()].filter(
      (reservation) => reservation.scopeKey === request.scopeKey,
    );

    const reservedCost = active.reduce(
      (sum, reservation) => sum + reservation.costUnits,
      0,
    );
    const reservedTimeMs = active.reduce(
      (sum, reservation) => sum + reservation.estimatedTimeMs,
      0,
    );
    const reservedDeep = active.filter((r) => r.mode === "DEEP").length;
    const reservedMicro = active.filter((r) => r.mode === "MICRO").length;

    const nextCost = request.usage.costUnits + reservedCost + costUnits;
    const nextTime = request.usage.elapsedMs + reservedTimeMs + estimatedTimeMs;
    const nextDeep =
      request.usage.deepCalls +
      reservedDeep +
      (request.mode === "DEEP" ? 1 : 0);
    const nextMicro =
      request.usage.microCalls +
      reservedMicro +
      (request.mode === "MICRO" ? 1 : 0);

    if (
      nextCost > request.budget.maxCostUnits ||
      nextTime > request.budget.maxEpistemicTimeMs ||
      nextDeep > request.budget.maxDeepCalls ||
      nextMicro > request.budget.maxMicroCalls
    ) {
      return null;
    }

    const reservation: MutableReservation = {
      reservationId: "aer_resv_" + randomUUID().replace(/-/g, "").slice(0, 16),
      scopeKey: request.scopeKey,
      mode: request.mode,
      costUnits,
      estimatedTimeMs,
      expiresAt: now + ttlMs,
    };

    this.reservations.set(reservation.reservationId, reservation);
    return { ...reservation };
  }

  public release(reservationId: string): boolean {
    return this.reservations.delete(reservationId);
  }

  public commit(reservationId: string): boolean {
    return this.reservations.delete(reservationId);
  }

  public list(scopeKey?: string, now = Date.now()): readonly EpistemicBudgetReservation[] {
    pruneExpired(this.reservations, now);
    return [...this.reservations.values()]
      .filter((reservation) => !scopeKey || reservation.scopeKey === scopeKey)
      .map((reservation) => ({ ...reservation }));
  }

  public clear(): void {
    this.reservations.clear();
  }
}
