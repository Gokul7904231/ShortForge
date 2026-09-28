import { randomUUID } from "node:crypto";
import type {
  ActionPreconditions,
  FloorActionContext,
  FloorActionDefinition,
  FloorActionProposal,
  ProposalAssessment,
} from "./FloorActionGraphContracts";

export class FloorActionGraph {
  private readonly definitions = new Map<string, FloorActionDefinition>();

  constructor(definitions: readonly FloorActionDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: FloorActionDefinition): void {
    if (!definition.actionId.trim()) {
      throw new Error("Floor actionId must not be empty");
    }
    if (this.definitions.has(definition.actionId)) {
      throw new Error("Duplicate floor action: " + definition.actionId);
    }
    if (definition.version < 1) {
      throw new Error("Invalid floor action version: " + definition.actionId);
    }
    this.definitions.set(definition.actionId, structuredClone(definition));
  }

  get(actionId: string): FloorActionDefinition | null {
    const definition = this.definitions.get(actionId);
    return definition ? structuredClone(definition) : null;
  }

  list(): FloorActionDefinition[] {
    return Array.from(this.definitions.values()).map((definition) => structuredClone(definition));
  }

  /**
   * Returns actions that are structurally eligible from the current state.
   * This is not authorization. It only filters the graph.
   */
  candidates(context: FloorActionContext): FloorActionDefinition[] {
    return this.list().filter((definition) => {
      if (!definition.preconditions.states?.includes(context.state)) return false;
      if (!definition.actorRoles.includes(context.actorRole)) return false;
      return (
        this.hasCapabilities(definition.preconditions, context) &&
        this.hasTrustedEvidence(definition.preconditions, context) &&
        this.hasFlags(definition.preconditions, context)
      );
    });
  }

  /**
   * Validates an Ascalon/council proposal against the immutable action vocabulary.
   * It never grants authority and never executes anything.
   */
  assessProposal(
    proposal: FloorActionProposal,
    context: FloorActionContext,
  ): ProposalAssessment {
    const definition = this.definitions.get(proposal.actionId);
    if (!definition) {
      return {
        admissible: false,
        reasons: ["Unknown action: " + proposal.actionId],
        missingCapabilities: [],
        missingTrustedEvidence: [],
      };
    }

    const reasons: string[] = [];

    if (proposal.floorId !== context.floorId) {
      reasons.push(
        "Proposal floor " + proposal.floorId + " does not match context floor " + context.floorId,
      );
    }

    if (!definition.actorRoles.includes(proposal.proposedBy)) {
      reasons.push(
        "Role " + proposal.proposedBy + " cannot propose action " + proposal.actionId,
      );
    }

    if (definition.preconditions.states && !definition.preconditions.states.includes(context.state)) {
      reasons.push("Action " + proposal.actionId + " is not valid from state " + context.state);
    }

    if (!this.hasFlags(definition.preconditions, context)) {
      reasons.push("Required floor flags are not satisfied");
    }

    const missingCapabilities = this.missingCapabilities(definition.preconditions, context);
    if (missingCapabilities.length) {
      reasons.push("Missing capabilities: " + missingCapabilities.join(", "));
    }

    const missingTrustedEvidence = this.missingTrustedEvidence(definition.preconditions, context);
    if (missingTrustedEvidence.length) {
      reasons.push("Missing trusted evidence: " + missingTrustedEvidence.join(", "));
    }

    return {
      admissible: reasons.length === 0,
      reasons,
      missingCapabilities,
      missingTrustedEvidence,
      action: structuredClone(definition),
    };
  }

  createProposal(
    input: Omit<FloorActionProposal, "proposalId" | "createdAt">,
  ): FloorActionProposal {
    return {
      ...input,
      proposalId: "proposal_" + randomUUID().replace(/-/g, "").slice(0, 16),
      createdAt: new Date().toISOString(),
      parameters: structuredClone(input.parameters),
      evidenceIds: [...input.evidenceIds],
    };
  }

  private hasCapabilities(
    preconditions: ActionPreconditions,
    context: FloorActionContext,
  ): boolean {
    return this.missingCapabilities(preconditions, context).length === 0;
  }

  private missingCapabilities(
    preconditions: ActionPreconditions,
    context: FloorActionContext,
  ): string[] {
    const capabilities = new Set(context.capabilities);
    return (preconditions.requiredCapabilities ?? []).filter(
      (capability) => !capabilities.has(capability),
    );
  }

  private hasTrustedEvidence(
    preconditions: ActionPreconditions,
    context: FloorActionContext,
  ): boolean {
    return this.missingTrustedEvidence(preconditions, context).length === 0;
  }

  private missingTrustedEvidence(
    preconditions: ActionPreconditions,
    context: FloorActionContext,
  ): string[] {
    const trustedTypes = new Set(
      context.evidence
        .filter((evidence) => evidence.trust === "TRUSTED")
        .map((evidence) => evidence.evidenceType),
    );

    return (preconditions.requiredTrustedEvidence ?? []).filter(
      (type) => !trustedTypes.has(type),
    );
  }

  private hasFlags(
    preconditions: ActionPreconditions,
    context: FloorActionContext,
  ): boolean {
    const flags = context.flags ?? {};
    return Object.entries(preconditions.requiredFlags ?? {}).every(
      ([key, expected]) => flags[key] === expected,
    );
  }
}

export const createStandardFloorActionGraph = (): FloorActionGraph =>
  new FloorActionGraph([
    {
      actionId: "observe_floor",
      version: 1,
      description: "Collect bounded floor observations without mutation.",
      risk: "LOW",
      reversibility: "REVERSIBLE",
      mutation: false,
      requiresGuardianAuthorization: false,
      actorRoles: ["ASCALON", "INSTRUCTOR", "ADVISOR", "AUDITOR", "GUARDIAN"],
      capability: "floor.observe",
      preconditions: { states: ["READY", "DEGRADED", "OBSERVING", "VERIFYING"] },
      outcome: {
        outputs: ["FloorObservation"],
        postconditions: ["observation_recorded"],
        verificationRequired: false,
        nextStates: ["OBSERVING", "ANALYZING"],
      },
    },
    {
      actionId: "analyze_floor",
      version: 1,
      description: "Synthesize verified observations into hypotheses and candidate transitions.",
      risk: "LOW",
      reversibility: "REVERSIBLE",
      mutation: false,
      requiresGuardianAuthorization: false,
      actorRoles: ["ASCALON", "INSTRUCTOR", "ADVISOR"],
      capability: "floor.analyze",
      preconditions: { states: ["OBSERVING", "INCIDENT", "DIAGNOSING"] },
      outcome: {
        outputs: ["FloorAnalysis"],
        postconditions: ["analysis_recorded"],
        verificationRequired: false,
        nextStates: ["ANALYZING", "VALIDATING", "DIAGNOSING"],
      },
    },
    {
      actionId: "validate_candidate",
      version: 1,
      description: "Check a candidate action against contracts, evidence, capability and floor state.",
      risk: "MEDIUM",
      reversibility: "REVERSIBLE",
      mutation: false,
      requiresGuardianAuthorization: false,
      actorRoles: ["ASCALON", "INSTRUCTOR", "ADVISOR", "AUDITOR"],
      capability: "floor.validate",
      preconditions: { states: ["ANALYZING", "VALIDATING", "DIAGNOSING"] },
      outcome: {
        outputs: ["ProposalAssessment"],
        postconditions: ["candidate_validated"],
        verificationRequired: true,
        nextStates: ["VALIDATING", "AWAITING_AUTHORIZATION", "HEALING"],
      },
    },
    {
      actionId: "execute_repair",
      version: 1,
      description: "Perform a bounded repair whose exact scope was previously authorized by the Guardian.",
      risk: "HIGH",
      reversibility: "COMPENSATABLE",
      mutation: true,
      requiresGuardianAuthorization: true,
      actorRoles: ["FG_HEALER", "COMMON_HEALER", "WORKER"],
      capability: "floor.repair.execute",
      preconditions: {
        states: ["AWAITING_AUTHORIZATION", "HEALING"],
        requiredTrustedEvidence: ["RepairPlan"],
      },
      outcome: {
        outputs: ["RepairReceipt"],
        postconditions: ["mutation_applied"],
        verificationRequired: true,
        nextStates: ["EXECUTING", "VERIFYING", "HEALING"],
      },
    },
    {
      actionId: "verify_effect",
      version: 1,
      description: "Independently verify the physical and semantic effect of an executed action.",
      risk: "MEDIUM",
      reversibility: "REVERSIBLE",
      mutation: false,
      requiresGuardianAuthorization: false,
      actorRoles: ["AUDITOR", "GUARDIAN"],
      capability: "floor.verify",
      preconditions: {
        states: ["EXECUTING", "VERIFYING"],
        requiredTrustedEvidence: ["ExecutionReceipt"],
      },
      outcome: {
        outputs: ["VerificationReceipt"],
        postconditions: ["effect_verified"],
        verificationRequired: true,
        nextStates: ["VERIFYING", "READY", "HEALING", "ESCALATED"],
      },
    },
    {
      actionId: "close_incident",
      version: 1,
      description: "Close only after repair verification and independent audit evidence exist.",
      risk: "HIGH",
      reversibility: "COMPENSATABLE",
      mutation: true,
      requiresGuardianAuthorization: true,
      actorRoles: ["GUARDIAN"],
      capability: "floor.incident.close",
      preconditions: {
        states: ["VERIFYING"],
        requiredTrustedEvidence: ["VerificationReceipt", "AuditorFinding"],
      },
      outcome: {
        outputs: ["ClosureReceipt"],
        postconditions: ["incident_closed"],
        verificationRequired: true,
        nextStates: ["CLOSED", "READY"],
      },
    },
  ]);
