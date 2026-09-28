import { describe, expect, it } from "vitest";
import { FloorCouncil } from "../core/governance/FloorCouncil";
import { FloorGovernanceCell } from "../core/governance/FloorGovernanceCell";
import { createDefaultFloorActionGraph } from "../core/governance/DefaultFloorActionGraph";
import type {
  ActionProposal,
  CounselPacket,
  FloorSnapshot,
} from "../core/governance/FloorGovernanceContracts";
import type { AscalonProposalContext, AscalonGuardianAdapter } from "../core/governance/AscalonGuardianAdapter";

function makeSnapshot(): FloorSnapshot {
  return {
    floorId: "floor02_scripting",
    state: "READY",
    stateVersion: 1,
    observedAt: new Date().toISOString(),
    jobs: [],
    workers: [],
    resources: [],
    activeIncidents: [],
    constraints: [],
  };
}

function makeProposal(actionName = "floor.observe"): ActionProposal {
  return {
    proposalId: "proposal_wave4_01",
    floorId: "floor02_scripting",
    actionName,
    proposer: "ASCALON",
    parameters: {},
    evidenceRefs: [],
    expectedOutcome: "Trusted floor observation recorded.",
    expectedPostconditions: ["observation_recorded"],
    confidence: 0.9,
    stateVersion: 1,
    proposedAt: new Date().toISOString(),
    inputTrust: "TRUSTED_SYSTEM_STATE",
  };
}

function supportingAdvisor(): CounselPacket {
  return {
    counselId: "advisor_support",
    floorId: "floor02_scripting",
    recommendation: "SUPPORT:floor.observe",
    supportingEvidence: [],
    constraints: [],
    uncertainty: 0.1,
    conflictsWith: [],
    urgency: "LOW",
    expectedOutcome: "Observation is bounded and safe.",
    rejectionConditions: [],
    provenance: "test_advisor",
    createdAt: new Date().toISOString(),
    ministerRole: "ADVISOR",
  };
}

class StubAscalon implements AscalonGuardianAdapter {
  constructor(private readonly proposal: ActionProposal) {}

  async proposeNext(_context: AscalonProposalContext): Promise<ActionProposal | null> {
    return this.proposal;
  }
}

describe("Floor Governance Cell — Wave 4 Council", () => {
  it("approves a proposal only when Instructor, Advisor, and Auditor agree", async () => {
    const council = new FloorCouncil({
      advisor: async () => supportingAdvisor(),
    });
    const graph = createDefaultFloorActionGraph();
    const action = graph.getAction("floor.observe")!;

    const review = await council.reviewProposal({
      snapshot: makeSnapshot(),
      proposal: makeProposal(),
      action,
      currentAction: "START",
      nextActions: ["floor.observe"],
      verifiedEvidenceRefs: [],
    });

    expect(review.decision).toBe("APPROVE");
    expect(review.counselPackets.map((packet) => packet.ministerRole)).toEqual([
      "INSTRUCTOR",
      "ADVISOR",
      "AUDITOR",
    ]);
  });

  it("escalates rather than self-authorizing when Advisor disagrees", async () => {
    const council = new FloorCouncil({
      advisor: async () => ({
        ...supportingAdvisor(),
        recommendation: "CHALLENGE:floor.execute",
        uncertainty: 0.1,
        conflictsWith: ["floor.execute"],
      }),
    });
    const graph = createDefaultFloorActionGraph();
    const action = graph.getAction("floor.observe")!;

    const review = await council.reviewProposal({
      snapshot: makeSnapshot(),
      proposal: makeProposal(),
      action,
      currentAction: "START",
      nextActions: ["floor.observe"],
      verifiedEvidenceRefs: [],
    });

    expect(review.decision).toBe("ESCALATE");
    expect(review.conflicts).toContain("ADVISOR_DISAGREES");
  });

  it("rejects stale or untrusted proposals at deterministic council boundaries", async () => {
    const council = new FloorCouncil({
      advisor: async () => supportingAdvisor(),
    });
    const graph = createDefaultFloorActionGraph();
    const action = graph.getAction("floor.observe")!;

    const stale = await council.reviewProposal({
      snapshot: makeSnapshot(),
      proposal: {
        ...makeProposal(),
        stateVersion: 99,
      },
      action,
      currentAction: "START",
      nextActions: ["floor.observe"],
      verifiedEvidenceRefs: [],
    });
    expect(stale.decision).toBe("REJECT");
    expect(stale.conflicts).toContain("INSTRUCTOR_REJECTED_PROPOSAL");

    const untrusted = await council.reviewProposal({
      snapshot: makeSnapshot(),
      proposal: {
        ...makeProposal(),
        inputTrust: "UNTRUSTED_EVIDENCE",
      },
      action,
      currentAction: "START",
      nextActions: ["floor.observe"],
      verifiedEvidenceRefs: [],
    });
    expect(untrusted.decision).toBe("REJECT");
    expect(untrusted.conflicts).toContain("AUDITOR_REJECTED_PROPOSAL");
  });

  it("gates an Ascalon proposal through the Council before returning it", async () => {
    const graph = createDefaultFloorActionGraph();
    const cell = new FloorGovernanceCell({
      floorId: "floor02_scripting",
      guardianId: "guardian_floor02_scripting",
      actionGraph: graph,
      ascalon: new StubAscalon(makeProposal()),
      capabilities: ["floor.read", "floor.analyze", "floor.validate"],
      council: new FloorCouncil({ advisor: async () => supportingAdvisor() }),
    });

    cell.setState("READY");
    const proposal = await cell.proposeNext(makeSnapshot());
    expect(proposal?.actionName).toBe("floor.observe");
    expect(
      cell.blackboard
        .getEntries()
        .some((entry) => entry.kind === "RECOMMENDATION" && entry.author === "ADVISOR")
    ).toBe(true);
  });

  it("fails closed when the Advisor runtime is unavailable", async () => {
    const graph = createDefaultFloorActionGraph();
    const cell = new FloorGovernanceCell({
      floorId: "floor02_scripting",
      guardianId: "guardian_floor02_scripting",
      actionGraph: graph,
      ascalon: new StubAscalon(makeProposal()),
      capabilities: ["floor.read", "floor.analyze", "floor.validate"],
      council: new FloorCouncil(),
    });

    cell.setState("READY");
    const proposal = await cell.proposeNext(makeSnapshot());
    expect(proposal).toBeNull();
    expect(
      cell.blackboard
        .getEntries()
        .some((entry) => entry.kind === "CONFLICT" && entry.author === "SYSTEM")
    ).toBe(true);
  });
});
