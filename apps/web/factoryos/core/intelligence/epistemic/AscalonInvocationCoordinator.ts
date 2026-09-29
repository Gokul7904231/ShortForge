import type { EpistemicContext } from "./EpistemicContracts";
import { AscalonInvocationGate, type AscalonInvocationAdmission } from "./AscalonInvocationGate";
import {
  InMemoryEpistemicBudgetReservationStore,
  type EpistemicBudgetReservation,
} from "./EpistemicBudgetReservation";

export interface AscalonInvocationPermit {
  readonly admission: AscalonInvocationAdmission;
  readonly reservation: EpistemicBudgetReservation;
}

/**
 * Canonical pre-call coordinator:
 * admission -> atomic reservation -> model invocation -> commit/release.
 *
 * The coordinator does not invoke Ascalon itself.
 */
export class AscalonInvocationCoordinator {
  public constructor(
    private readonly gate = new AscalonInvocationGate(),
    private readonly reservations = new InMemoryEpistemicBudgetReservationStore(),
  ) {}

  public prepare(input: {
    readonly context: EpistemicContext;
    readonly scopeKey: string;
    readonly ttlMs?: number;
  }): AscalonInvocationPermit | null {
    const admission = this.gate.evaluate({ context: input.context });

    if (!admission.admitted) return null;

    const reservation = this.reservations.reserve({
      scopeKey: input.scopeKey,
      budget: input.context.budgets,
      usage: input.context.usage,
      mode: "DEEP",
      costUnits: input.context.cognitiveRecommendation.estimatedCostUnits,
      estimatedTimeMs: input.context.cognitiveRecommendation.estimatedLatencyMs,
      ttlMs: input.ttlMs,
    });

    if (!reservation) return null;

    return {
      admission,
      reservation,
    };
  }

  public commit(permit: AscalonInvocationPermit): boolean {
    return this.reservations.commit(permit.reservation.reservationId);
  }

  public release(permit: AscalonInvocationPermit): boolean {
    return this.reservations.release(permit.reservation.reservationId);
  }

  public listReservations(scopeKey?: string): readonly EpistemicBudgetReservation[] {
    return this.reservations.list(scopeKey);
  }
}
