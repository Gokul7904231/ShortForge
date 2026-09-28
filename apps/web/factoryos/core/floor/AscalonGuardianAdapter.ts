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
   * Converts a proposal into an executable request only when:
   * 1. the action exists and explicitly requires Guardian authorization;
   * 2. the proposal is structurally admissible in the supplied context;
   * 3. a separate Guardian-issued authorization exactly binds floor/action/target;
   * 4. the authorization is still valid.
   */
  authorize(
    proposal: FloorActionProposal,
    context: FloorActionContext,
    authorization: GuardianAuthorization,
  ): AuthorizedActionRequest {
    const definition = this.actionGraph.get(proposal.actionId);
    if (!definition) {
      throw new Error("Cannot authorize an unknown floor action");
    }
    if (!definition.requiresGuardianAuthorization) {
      throw new Error("Action does not require Guardian authorization");
    }

    const assessment = this.actionGraph.assessProposal(proposal, context);
    if (!assessment.admissible) {
      throw new Error(
        "Proposal is not structurally admissible: " + assessment.reasons.join("; "),
      );
    }

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
    if (!authorization.actionScope.includes(proposal.targetId)) {
      throw new Error("Guardian authorization does not cover proposal target");
    }

    return {
      requestId: "action_" + randomUUID().replace(/-/g, "").slice(0, 16),
      proposal: structuredClone(proposal),
      authorization: structuredClone(authorization),
    };
  }
}
