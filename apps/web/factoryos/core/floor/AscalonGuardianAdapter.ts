import { randomUUID } from "node:crypto";
import type {
  AuthorizedActionRequest,
  FloorActionContext,
  FloorActionProposal,
  GuardianAuthorization,
} from "./FloorActionGraphContracts";
import { FloorActionGraph } from "./FloorActionGraph";

export class AscalonGuardianAdapter {
  constructor(private readonly actionGraph: FloorActionGraph) {}

  /**
   * Turns model/council output into a typed proposal.
   * This method never authorizes or executes the proposed action.
   */
  propose(
    input: Omit<FloorActionProposal, "proposalId" | "createdAt">,
    context: FloorActionContext,
  ): {
    proposal: FloorActionProposal;
    admissible: boolean;
    reasons: readonly string[];
  } {
    const proposal = this.actionGraph.createProposal(input);
    const assessment = this.actionGraph.assessProposal(proposal, context);

    return {
      proposal,
      admissible: assessment.admissible,
      reasons: assessment.reasons,
    };
  }

  /**
   * Converts a proposal into an executable request only when a separate,
   * Guardian-issued authorization exactly binds floor/action/target.
   */
  authorize(
    proposal: FloorActionProposal,
    authorization: GuardianAuthorization,
  ): AuthorizedActionRequest {
    if (authorization.authorizedBy !== "GUARDIAN") {
      throw new Error("Only the Floor Guardian can authorize a floor action");
    }
    if (authorization.floorId !== proposal.floorId) {
      throw new Error("Authorization floor does not match proposal floor");
    }
    if (authorization.actionId !== proposal.actionId) {
      throw new Error("Authorization action does not match proposal action");
    }
    if (authorization.targetId !== proposal.targetId) {
      throw new Error("Authorization target does not match proposal target");
    }
    if (new Date(authorization.expiresAt).getTime() <= Date.now()) {
      throw new Error("Guardian authorization has expired");
    }

    return {
      requestId: "action_" + randomUUID().replace(/-/g, "").slice(0, 16),
      proposal: structuredClone(proposal),
      authorization: structuredClone(authorization),
    };
  }
}
