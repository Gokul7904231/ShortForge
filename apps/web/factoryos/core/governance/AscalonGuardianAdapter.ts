import type {
  ActionProposal,
  FloorSnapshot,
} from "./FloorGovernanceContracts";

export interface AscalonPreCallAdmission {
  readonly admitted: boolean;
  readonly reason: string;
  readonly contextFingerprint: string;
  readonly reservationId?: string;
}

export interface AscalonProposalContext {
  readonly snapshot: FloorSnapshot;
  readonly availableActions: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly preCallAdmission?: AscalonPreCallAdmission;
}

export interface AscalonGuardianAdapter {
  proposeNext(context: AscalonProposalContext): Promise<ActionProposal | null>;
}

/**
 * Runtime seam for the future Ascalon inference gateway.
 *
 * This adapter is deliberately proposal-only. It cannot execute tools,
 * mint capabilities, or grant authority.
 *
 * When requirePreCallAdmission=true, the wrapped proposer is never invoked
 * without an admitted AER pre-call decision.
 */
export class ProposalOnlyAscalonAdapter implements AscalonGuardianAdapter {
  constructor(
    private readonly proposer: (
      context: AscalonProposalContext
    ) => Promise<ActionProposal | null>,
    private readonly requirePreCallAdmission = true,
  ) {}

  async proposeNext(context: AscalonProposalContext): Promise<ActionProposal | null> {
    if (this.requirePreCallAdmission && !context.preCallAdmission?.admitted) {
      return null;
    }

    const proposal = await this.proposer(context);
    if (!proposal) return null;
    if (proposal.proposer !== "ASCALON") {
      throw new Error("Ascalon adapter may emit only ASCALON proposals");
    }
    if (proposal.floorId !== context.snapshot.floorId) {
      throw new Error("Ascalon proposal crossed floor boundary");
    }
    if (proposal.stateVersion !== context.snapshot.stateVersion) {
      throw new Error("Ascalon proposal is stale for the current floor state");
    }
    return proposal;
  }
}
