import type {
  ActionGateContext,
  ActionGateDecision,
  ActionProposal,
  AuthorizationGrant,
} from "./FloorGovernanceContracts";
import { FloorActionGraph } from "./FloorActionGraph";

export class FloorActionGate {
  constructor(
    private readonly graph: FloorActionGraph,
    private readonly lastAction: () => string | "START"
  ) {}

  authorizeProposal(
    proposal: ActionProposal,
    context: ActionGateContext
  ): ActionGateDecision {
    const action = this.graph.getAction(proposal.actionName);
    if (!action) {
      return { allowed: false, reason: `unknown_action:${proposal.actionName}` };
    }

    if (proposal.floorId !== context.snapshot.floorId) {
      return { allowed: false, reason: "cross_floor_action" };
    }

    if (proposal.stateVersion !== context.snapshot.stateVersion) {
      return { allowed: false, reason: "stale_state_version" };
    }

    if (
      !action.actorProposers.includes(proposal.proposer)
    ) {
      return { allowed: false, reason: "proposer_not_allowed_for_action" };
    }

    if (
      !context.capabilities.has(action.requiredCapability)
    ) {
      return { allowed: false, reason: "required_capability_missing" };
    }

    for (const evidenceRef of action.requiredEvidence) {
      if (!context.evidenceRefs.has(evidenceRef) && !proposal.evidenceRefs.includes(evidenceRef)) {
        return { allowed: false, reason: `required_evidence_missing:${evidenceRef}` };
      }
    }

    if (!this.graph.canTransition(this.lastAction(), proposal.actionName)) {
      return { allowed: false, reason: "invalid_action_graph_transition" };
    }

    const grant = this.findGrant(proposal, context);
    if (!grant) {
      return { allowed: false, reason: "missing_authorization_grant" };
    }

    if (action.humanApproval === "ALWAYS") {
      const approvalId = grant.grantId;
      if (!context.humanApprovalIds?.has(approvalId)) {
        return { allowed: false, reason: "human_approval_required" };
      }
    }

    if (action.reversibility === "IRREVERSIBLE" && !grant.authorizedBy) {
      return { allowed: false, reason: "irreversible_action_requires_authority" };
    }

    if (
      grant.expiresAt &&
      new Date(grant.expiresAt).getTime() <= Date.now()
    ) {
      return { allowed: false, reason: "authorization_grant_expired" };
    }

    if (
      grant.capability !== action.requiredCapability ||
      !context.capabilities.has(grant.capability)
    ) {
      return { allowed: false, reason: "authorization_capability_mismatch" };
    }

    if (
      grant.targetId &&
      proposal.targetId &&
      grant.targetId !== proposal.targetId
    ) {
      return { allowed: false, reason: "authorization_target_mismatch" };
    }

    if (
      grant.fencingEpoch !== undefined &&
      context.currentFencingEpoch !== undefined &&
      grant.fencingEpoch !== context.currentFencingEpoch
    ) {
      return { allowed: false, reason: "stale_fencing_epoch" };
    }

    if (
      grant.authorizedBy === "OVERSEER" &&
      action.requiredAuthority === "FLOOR_GUARDIAN"
    ) {
      // Higher authority is acceptable.
    } else if (
      grant.authorizedBy !== action.requiredAuthority &&
      !(action.requiredAuthority === "FLOOR_GUARDIAN" && grant.authorizedBy === "HUMAN")
    ) {
      return {
        allowed: false,
        reason: `authority_mismatch:${grant.authorizedBy}:${action.requiredAuthority}`,
      };
    }

    return { allowed: true, reason: "authorized", action, grant };
  }

  private findGrant(
    proposal: ActionProposal,
    context: ActionGateContext
  ): AuthorizationGrant | undefined {
    return context.grants.find(
      (grant) =>
        grant.floorId === proposal.floorId &&
        grant.actionName === proposal.actionName &&
        grant.capability === this.graph.getAction(proposal.actionName)?.requiredCapability &&
        grant.stateVersion === context.snapshot.stateVersion &&
        new Date(grant.expiresAt).getTime() > Date.now()
    );
  }
}
