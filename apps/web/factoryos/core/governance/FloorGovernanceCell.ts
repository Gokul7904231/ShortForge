import { randomUUID } from "node:crypto";
import type {
  ActionGateContext,
  ActionProposal,
  AuthorizationGrant,
  FloorGovernanceState,
  FloorSnapshot,
} from "./FloorGovernanceContracts";
import { FloorActionGate } from "./FloorActionGate";
import { FloorActionGraph } from "./FloorActionGraph";
import { FloorBlackboard } from "./FloorBlackboard";
import type { FloorBlackboardJournal } from "./FloorBlackboardJournal";
import type { GuardianDecision } from "../guardian/GuardianContracts";
import type {
  AscalonGuardianAdapter,
} from "./AscalonGuardianAdapter";

export interface GovernanceExecutionResult {
  readonly success: boolean;
  readonly state: FloorGovernanceState;
  readonly reason: string;
  readonly actionName?: string;
  readonly proposalId?: string;
}

export interface FloorGovernanceCellConfig {
  readonly floorId: string;
  readonly guardianId: string;
  readonly actionGraph: FloorActionGraph;
  readonly ascalon: AscalonGuardianAdapter;
  readonly capabilities: readonly string[];
  readonly blackboardJournal?: FloorBlackboardJournal;
}

export class FloorGovernanceCell {
  readonly floorId: string;
  readonly guardianId: string;
  readonly blackboard: FloorBlackboard;
  readonly actionGraph: FloorActionGraph;

  private state: FloorGovernanceState = "BOOT";
  private stateVersion = 0;
  private lastAction: string | "START" = "START";

  private readonly actionGate: FloorActionGate;
  private readonly capabilities: ReadonlySet<string>;
  private grants: AuthorizationGrant[] = [];

  constructor(config: FloorGovernanceCellConfig) {
    this.floorId = config.floorId;
    this.guardianId = config.guardianId;
    this.actionGraph = config.actionGraph;
    this.capabilities = new Set(config.capabilities);
    this.blackboard = new FloorBlackboard(this.floorId, config.blackboardJournal);
    this.actionGate = new FloorActionGate(this.actionGraph, () => this.lastAction);
    this.ascalon = config.ascalon;
  }

  private readonly ascalon: AscalonGuardianAdapter;

  getState(): FloorGovernanceState {
    return this.state;
  }

  getStateVersion(): number {
    return this.stateVersion;
  }

  setState(next: FloorGovernanceState, reason?: string): void {
    const legal: Partial<Record<FloorGovernanceState, FloorGovernanceState[]>> = {
      BOOT: ["READY", "DEGRADED"],
      READY: ["OBSERVING", "EXECUTING", "DEGRADED", "ESCALATED"],
      OBSERVING: ["EXECUTING", "INCIDENT", "DEGRADED", "READY"],
      EXECUTING: ["INSPECTING", "INCIDENT", "DEGRADED", "ESCALATED"],
      INSPECTING: ["READY", "QUARANTINED", "INCIDENT", "DEGRADED"],
      QUARANTINED: ["INCIDENT", "READY", "ESCALATED"],
      INCIDENT: ["DIAGNOSING", "ESCALATED", "OVERSEER_ASSIST", "HUMAN_INTERVENTION"],
      DIAGNOSING: ["HEALING", "ESCALATED", "OVERSEER_ASSIST"],
      HEALING: ["VERIFYING", "DEGRADED", "ESCALATED", "HUMAN_INTERVENTION"],
      VERIFYING: ["READY", "HEALING", "CLOSED", "ESCALATED"],
      DEGRADED: ["OBSERVING", "INCIDENT", "ESCALATED", "OVERSEER_ASSIST"],
      ESCALATED: ["OVERSEER_ASSIST", "HEALING", "HUMAN_INTERVENTION", "READY"],
      OVERSEER_ASSIST: ["HEALING", "VERIFYING", "HUMAN_INTERVENTION", "READY"],
      HUMAN_INTERVENTION: ["OBSERVING", "HEALING", "VERIFYING", "CLOSED"],
      CLOSED: ["READY"],
    };

    if (next === this.state) return;
    if (!legal[this.state]?.includes(next)) {
      throw new Error(`Invalid floor governance transition ${this.state} -> ${next}`);
    }

    const previous = this.state;
    this.state = next;
    this.stateVersion += 1;
    this.blackboard.append(
      "OBSERVATION",
      "FLOOR_GUARDIAN",
      "VERIFIED",
      { event: "STATE_TRANSITION", from: previous, to: next, reason: reason || null }
    );
  }

  setAuthorizationGrants(grants: readonly AuthorizationGrant[]): void {
    this.grants = [...grants];
  }

  createSnapshot(input: Omit<FloorSnapshot, "floorId" | "state" | "stateVersion" | "observedAt">): FloorSnapshot {
    return {
      floorId: this.floorId,
      state: this.state,
      stateVersion: this.stateVersion,
      observedAt: new Date().toISOString(),
      ...input,
    };
  }

  async proposeNext(snapshot: FloorSnapshot): Promise<ActionProposal | null> {
    const availableActions = this.actionGraph
      .getNextActions(this.lastAction)
      .map((action) => action.actionName);

    return this.ascalon.proposeNext({
      snapshot,
      availableActions,
      evidenceRefs: this.blackboard.getVerifiedEvidence().flatMap((entry) => entry.evidenceRefs),
    });
  }

  /**
   * Governs a legacy Guardian decision at the mutation boundary.
   * Existing GuardianKernel already performed observation, auditing and planning;
   * this method binds that decision to an explicit typed action, capability, grant
   * and execution record without making Ascalon authoritative.
   */
  async executeGuardianDecision(
    decision: GuardianDecision,
    snapshot: FloorSnapshot,
    execute: () => Promise<void>
  ): Promise<GovernanceExecutionResult> {
    const actionName =
      decision.action === "QUARANTINE_WORKER"
        ? "floor.quarantine"
        : decision.action === "ESCALATE"
          ? "floor.escalate"
          : "floor.execute";

    this.lastAction = "floor.request_authorization";
    this.blackboard.append(
      "OBSERVATION",
      "FLOOR_GUARDIAN",
      "VERIFIED",
      {
        event: "GUARDIAN_MUTATION_GATE_OPEN",
        action: decision.action,
        targetId: decision.targetId,
      }
    );

    const action = this.actionGraph.getAction(actionName);
    if (!action) {
      return { success: false, state: this.state, reason: "missing_governance_action:" + actionName };
    }

    const grant: AuthorizationGrant = {
      grantId: "guardian_grant_" + randomUUID().replace(/-/g, "").slice(0, 12),
      floorId: this.floorId,
      actionName,
      authorizedBy: "FLOOR_GUARDIAN",
      capability: action.requiredCapability,
      targetId: decision.targetId,
      stateVersion: snapshot.stateVersion,
      expiresAt: new Date(Date.now() + 15_000).toISOString(),
      evidenceRefs: [],
    };
    this.setAuthorizationGrants([grant]);

    const proposal: ActionProposal = {
      proposalId: this.createProposalId(),
      floorId: this.floorId,
      actionName,
      proposer: "FLOOR_GUARDIAN",
      targetId: decision.targetId,
      parameters: decision.parameters || {},
      evidenceRefs: [],
      expectedOutcome: decision.reason,
      expectedPostconditions: [...action.postconditions],
      confidence: decision.confidence,
      stateVersion: snapshot.stateVersion,
      proposedAt: new Date().toISOString(),
      inputTrust: "TRUSTED_SYSTEM_STATE",
    };

    const satisfied = new Set<string>();
    for (const precondition of action.preconditions) {
      if (
        precondition === "floor_ready" ||
        precondition === "governance_cycle_active" ||
        precondition === "candidate_validated" ||
        precondition === "authorization_grant_present"
      ) {
        satisfied.add(precondition);
      }
    }

    return this.authorizeAndExecute(proposal, snapshot, execute, {
      evidenceRefs: new Set(),
      satisfiedPreconditions: satisfied,
    });
  }
  async authorizeAndExecute(
    proposal: ActionProposal,
    snapshot: FloorSnapshot,
    execute: (proposal: ActionProposal) => Promise<void>,
    extraContext: Pick<
      ActionGateContext,
      "evidenceRefs" | "satisfiedPreconditions" | "humanApprovalIds" | "currentFencingEpoch"
    > = {
      evidenceRefs: new Set<string>(),
      satisfiedPreconditions: new Set<string>(),
    }
  ): Promise<GovernanceExecutionResult> {
    const context: ActionGateContext = {
      snapshot,
      evidenceRefs: extraContext.evidenceRefs,
      satisfiedPreconditions: extraContext.satisfiedPreconditions,
      capabilities: this.capabilities,
      grants: this.grants,
      humanApprovalIds: extraContext.humanApprovalIds,
      currentFencingEpoch: extraContext.currentFencingEpoch,
    };

    const gate = this.actionGate.authorizeProposal(proposal, context);
    if (!gate.allowed) {
      this.blackboard.append(
        "VERIFICATION",
        "FLOOR_GUARDIAN",
        "VERIFIED",
        {
          event: "ACTION_DENIED",
          proposalId: proposal.proposalId,
          actionName: proposal.actionName,
          reason: gate.reason,
        },
        proposal.evidenceRefs
      );
      return {
        success: false,
        state: this.state,
        reason: gate.reason,
        actionName: proposal.actionName,
        proposalId: proposal.proposalId,
      };
    }

    await execute(proposal);
    this.lastAction = proposal.actionName;
    this.stateVersion += 1;

    this.blackboard.append(
      "OBSERVATION",
      "SYSTEM",
      "DERIVED",
      {
        event: "ACTION_EXECUTED",
        proposalId: proposal.proposalId,
        actionName: proposal.actionName,
        targetId: proposal.targetId,
      },
      proposal.evidenceRefs
    );

    return {
      success: true,
      state: this.state,
      reason: "executed",
      actionName: proposal.actionName,
      proposalId: proposal.proposalId,
    };
  }

  createProposalId(): string {
    return `proposal_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
}
