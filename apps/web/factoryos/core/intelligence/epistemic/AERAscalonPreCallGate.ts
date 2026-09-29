import type {
  AERAssessmentInput,
  AEREngine,
} from "./AEREngine";
import type { AscalonInvocationAdmission } from "./AscalonInvocationGate";
import { AscalonInvocationCoordinator, type AscalonInvocationPermit } from "./AscalonInvocationCoordinator";
import type { EpistemicContext } from "./EpistemicContracts";

/**
 * Bridge from a floor/domain snapshot into the canonical AER Ascalon
 * pre-call admission boundary.
 *
 * The domain supplies the epistemic context construction because AER must not
 * invent facts from an arbitrary floor snapshot.
 */
export interface AERAscalonContextFactory {
  buildAssessmentInput(input: {
    readonly snapshot: unknown;
    readonly availableActions: readonly string[];
    readonly verifiedEvidenceRefs: readonly string[];
  }): AERAssessmentInput;
}

export interface AERAscalonPreCallAdmission extends AscalonInvocationAdmission {
  readonly reservationId?: string;
}

export class AERAscalonPreCallGate {
  public constructor(
    private readonly engine: AEREngine,
    private readonly contextFactory: AERAscalonContextFactory,
    private readonly coordinator = new AscalonInvocationCoordinator(),
  ) {}

  public prepare(input: {
    readonly snapshot: unknown;
    readonly availableActions: readonly string[];
    readonly verifiedEvidenceRefs: readonly string[];
    readonly scopeKey: string;
  }): AERAscalonPreCallAdmission & {
    readonly context?: EpistemicContext;
    readonly permit?: AscalonInvocationPermit;
    readonly commit: () => boolean;
    readonly release: () => boolean;
  } {
    const assessment = this.engine.assess(
      this.contextFactory.buildAssessmentInput(input),
    );

    const permit = assessment.ascalonAdmission.admitted
      ? this.coordinator.prepare({
          context: assessment.context,
          scopeKey: input.scopeKey,
        })
      : null;

    if (!permit) {
      return {
        ...assessment.ascalonAdmission,
        admitted: false,
        reason: assessment.ascalonAdmission.admitted
          ? "ascalon_budget_reservation_failed"
          : assessment.ascalonAdmission.reason,
        contextFingerprint: assessment.context.contextFingerprint,
        context: assessment.context,
        commit: () => false,
        release: () => false,
      };
    }

    return {
      ...assessment.ascalonAdmission,
      admitted: true,
      reservationId: permit.reservation.reservationId,
      context: assessment.context,
      permit,
      commit: () => this.coordinator.commit(permit),
      release: () => this.coordinator.release(permit),
    };
  }

  public complete(permit: AscalonInvocationPermit, modelCallStarted: boolean): boolean {
    return modelCallStarted
      ? this.coordinator.commit(permit)
      : this.coordinator.release(permit);
  }

  public evaluate(input: {
    readonly snapshot: unknown;
    readonly availableActions: readonly string[];
    readonly verifiedEvidenceRefs: readonly string[];
    readonly scopeKey?: string;
  }): AERAscalonPreCallAdmission & {
    readonly context?: EpistemicContext;
  } {
    const prepared = this.prepare({
      ...input,
      scopeKey: input.scopeKey ?? "floor:aer",
    });

    // Compatibility method cannot bracket a model call, so release any
    // reservation immediately. Reservation-aware callers must use prepare().
    if (prepared.permit) {
      prepared.release();
    }

    return {
      ...prepared,
      permit: undefined,
    };
  }
}
