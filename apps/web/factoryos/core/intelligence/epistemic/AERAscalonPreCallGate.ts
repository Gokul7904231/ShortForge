import type {
  AERAssessmentInput,
  AEREngine,
} from "./AEREngine";
import type { AscalonInvocationAdmission } from "./AscalonInvocationGate";
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

export class AERAscalonPreCallGate {
  public constructor(
    private readonly engine: AEREngine,
    private readonly contextFactory: AERAscalonContextFactory,
  ) {}

  public evaluate(input: {
    readonly snapshot: unknown;
    readonly availableActions: readonly string[];
    readonly verifiedEvidenceRefs: readonly string[];
  }): AscalonInvocationAdmission & {
    readonly context?: EpistemicContext;
  } {
    const assessment = this.engine.assess(
      this.contextFactory.buildAssessmentInput(input),
    );

    return {
      ...assessment.ascalonAdmission,
      context: assessment.context,
    };
  }
}
