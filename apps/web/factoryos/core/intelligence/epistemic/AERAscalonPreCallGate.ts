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
  }): {
    readonly admission: AERAscalonPreCallAdmission;
    readonly context?: EpistemicContext;
    readonly permit?: AscalonInvocationPermit;
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
        admission: {
          ...assessment.ascalonAdmission,
          admitted: false,
          reason: assessment.ascalonAdmission.admitted
            ? "ascalon_budget_reservation_failed"
            : assessment.ascalonAdmission.reason,
          contextFingerprint: assessment.context.contextFingerprint,
        },
        context: assessment.context,
      };
    }

    return {
      admission: {
        ...assessment.ascalonAdmission,
        admitted: true,
        reservationId: permit.reservation.reservationId,
      },
      context: assessment.context,
      permit,
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

    // Compatibility method: callers that only have evaluate() receive the
    // admission decision, while reservation-aware callers should use prepare().
    // A successful reservation is immediately released here because evaluate()
    // cannot safely bracket the actual model call.
    if (prepared.permit) {
      this.complete(prepared.permit, false);
    }

    return {
      ...prepared.admission,
      context: prepared.context,
    };
  }
}
