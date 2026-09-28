import { FloorActionGraph } from "./FloorActionGraph";

/**
 * Canonical bounded-autonomy action graph for a governed ShortForge floor.
 *
 * This is intentionally small. A floor can extend it with domain actions,
 * but every mutation still flows through an explicit contract and transition.
 */
export function createDefaultFloorActionGraph(): FloorActionGraph {
  const graph = new FloorActionGraph();

  graph.registerAction({
    actionName: "floor.observe",
    description: "Read the current floor state and produce trusted observations.",
    actorProposers: ["ASCALON", "FLOOR_GUARDIAN", "INSTRUCTOR", "AUDITOR"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.read",
    reversibility: "REVERSIBLE",
    risk: "LOW",
    humanApproval: "NEVER",
    preconditions: ["floor_ready"],
    requiredEvidence: [],
    resourceScope: ["floor_state"],
    mutationScope: [],
    postconditions: ["observation_recorded"],
    failureTransitions: ["floor.escalate"],
  });

  graph.registerAction({
    actionName: "floor.analyze",
    description: "Build bounded hypotheses and candidate actions from trusted state.",
    actorProposers: ["ASCALON", "ADVISOR", "INSTRUCTOR"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.analyze",
    reversibility: "REVERSIBLE",
    risk: "LOW",
    humanApproval: "NEVER",
    preconditions: ["observation_recorded"],
    requiredEvidence: [],
    resourceScope: ["floor_blackboard"],
    mutationScope: [],
    postconditions: ["candidate_actions_produced"],
    failureTransitions: ["floor.escalate"],
  });

  graph.registerAction({
    actionName: "floor.validate",
    description: "Validate candidate action against evidence, contracts and policy inputs.",
    actorProposers: ["INSTRUCTOR", "AUDITOR", "FLOOR_GUARDIAN"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.validate",
    reversibility: "REVERSIBLE",
    risk: "MEDIUM",
    humanApproval: "NEVER",
    preconditions: ["candidate_actions_produced"],
    requiredEvidence: [],
    resourceScope: ["floor_blackboard"],
    mutationScope: [],
    postconditions: ["candidate_validated"],
    failureTransitions: ["floor.quarantine", "floor.escalate"],
  });

  graph.registerAction({
    actionName: "floor.request_authorization",
    description: "Request a bounded authority grant for a selected action.",
    actorProposers: ["ASCALON", "ADVISOR", "FLOOR_GUARDIAN"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.authorize",
    reversibility: "REVERSIBLE",
    risk: "MEDIUM",
    humanApproval: "NEVER",
    preconditions: ["candidate_validated"],
    requiredEvidence: [],
    resourceScope: ["floor_authorization"],
    mutationScope: [],
    postconditions: ["authorization_grant_present"],
    failureTransitions: ["floor.escalate"],
  });

  graph.registerAction({
    actionName: "floor.execute",
    description: "Execute an already authorized typed action through a bounded worker.",
    actorProposers: ["ASCALON", "FLOOR_GUARDIAN", "FG_HEALER", "COMMON_HEALER"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.execute",
    reversibility: "COMPENSATABLE",
    risk: "HIGH",
    humanApproval: "WHEN_REQUIRED",
    preconditions: ["candidate_validated", "authorization_grant_present"],
    requiredEvidence: [],
    resourceScope: ["declared_resource_scope"],
    mutationScope: ["declared_mutation_scope"],
    postconditions: ["physical_effect_recorded"],
    failureTransitions: ["floor.quarantine", "floor.escalate"],
  });

  graph.registerAction({
    actionName: "floor.verify",
    description: "Independently inspect the physical result and evidence.",
    actorProposers: ["AUDITOR", "FLOOR_GUARDIAN"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.verify",
    reversibility: "REVERSIBLE",
    risk: "MEDIUM",
    humanApproval: "NEVER",
    preconditions: ["physical_effect_recorded"],
    requiredEvidence: [],
    resourceScope: ["floor_output"],
    mutationScope: [],
    postconditions: ["verification_receipt_present"],
    failureTransitions: ["floor.escalate", "floor.quarantine"],
  });

  graph.registerAction({
    actionName: "floor.close",
    description: "Close the governed action cycle after independent proof.",
    actorProposers: ["FLOOR_GUARDIAN"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.close",
    reversibility: "REVERSIBLE",
    risk: "HIGH",
    humanApproval: "NEVER",
    preconditions: ["verification_receipt_present"],
    requiredEvidence: ["verification_receipt"],
    resourceScope: ["floor_state"],
    mutationScope: ["governance_state"],
    postconditions: ["cycle_closed"],
    failureTransitions: ["floor.escalate"],
  });

  graph.registerAction({
    actionName: "floor.quarantine",
    description: "Contain a failing border or local resource without propagating it.",
    actorProposers: ["AUDITOR", "FLOOR_GUARDIAN", "FG_HEALER"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.quarantine",
    reversibility: "COMPENSATABLE",
    risk: "HIGH",
    humanApproval: "NEVER",
    preconditions: ["candidate_validated"],
    requiredEvidence: [],
    resourceScope: ["affected_resource"],
    mutationScope: ["quarantine_state"],
    postconditions: ["propagation_blocked"],
    failureTransitions: ["floor.escalate"],
  });

  graph.registerAction({
    actionName: "floor.escalate",
    description: "Escalate a boundary breach, unresolved conflict or high-risk decision.",
    actorProposers: ["ASCALON", "INSTRUCTOR", "ADVISOR", "AUDITOR", "FLOOR_GUARDIAN", "FG_HEALER", "COMMON_HEALER"],
    requiredAuthority: "FLOOR_GUARDIAN",
    requiredCapability: "floor.escalate",
    reversibility: "REVERSIBLE",
    risk: "MEDIUM",
    humanApproval: "NEVER",
    preconditions: ["governance_cycle_active"],
    requiredEvidence: [],
    resourceScope: ["incident_record"],
    mutationScope: ["incident_state"],
    postconditions: ["overseer_notification_emitted"],
    failureTransitions: [],
  });

  graph.registerAction({
    actionName: "floor.human_approval",
    description: "Wait for and record an explicit human approval for a gated action.",
    actorProposers: ["HUMAN"],
    requiredAuthority: "HUMAN",
    requiredCapability: "floor.human_approval",
    reversibility: "REVERSIBLE",
    risk: "LOW",
    humanApproval: "ALWAYS",
    preconditions: ["authorization_pending"],
    requiredEvidence: [],
    resourceScope: ["approval_record"],
    mutationScope: ["approval_state"],
    postconditions: ["human_approval_present"],
    failureTransitions: ["floor.escalate"],
  });

  graph.registerTransition({ from: "START", to: "floor.observe", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.observe", to: "floor.analyze", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.observe", to: "floor.escalate", on: "FAILURE" });
  graph.registerTransition({ from: "floor.analyze", to: "floor.validate", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.analyze", to: "floor.escalate", on: "FAILURE" });
  graph.registerTransition({ from: "floor.validate", to: "floor.request_authorization", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.validate", to: "floor.quarantine", on: "FAILURE" });
  graph.registerTransition({ from: "floor.validate", to: "floor.escalate", on: "DENIED" });
  graph.registerTransition({ from: "floor.request_authorization", to: "floor.execute", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.request_authorization", to: "floor.quarantine", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.request_authorization", to: "floor.escalate", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.request_authorization", to: "floor.human_approval", on: "WAITING_APPROVAL" });
  graph.registerTransition({ from: "floor.request_authorization", to: "floor.escalate", on: "DENIED" });
  graph.registerTransition({ from: "floor.human_approval", to: "floor.execute", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.human_approval", to: "floor.escalate", on: "DENIED" });
  graph.registerTransition({ from: "floor.execute", to: "floor.verify", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.execute", to: "floor.quarantine", on: "FAILURE" });
  graph.registerTransition({ from: "floor.verify", to: "floor.close", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.verify", to: "floor.escalate", on: "FAILURE" });
  graph.registerTransition({ from: "floor.close", to: "floor.observe", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.quarantine", to: "floor.escalate", on: "FAILURE" });
  graph.registerTransition({ from: "floor.quarantine", to: "floor.analyze", on: "SUCCESS" });
  graph.registerTransition({ from: "floor.escalate", to: "floor.observe", on: "SUCCESS" });

  return graph;
}
