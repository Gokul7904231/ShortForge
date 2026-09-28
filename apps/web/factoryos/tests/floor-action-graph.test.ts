import { describe, expect, it } from "vitest";
import { AscalonGuardianAdapter } from "../core/floor/AscalonGuardianAdapter";
import { createStandardFloorActionGraph } from "../core/floor/FloorActionGraph";
import type {
  FloorActionContext,
  GuardianAuthorization,
} from "../core/floor/FloorActionGraphContracts";

describe("Floor Governance Cell — Action Graph foundation", () => {
  const graph = createStandardFloorActionGraph();

  const analysisContext: FloorActionContext = {
    floorId: "floor03_asset_realization",
    state: "ANALYZING",
    actorId: "ascalon-floor03",
    actorRole: "ASCALON",
    capabilities: ["floor.analyze"],
    evidence: [],
  };

  it("keeps the action vocabulary explicit and typed", () => {
    expect(graph.get("execute_repair")?.requiresGuardianAuthorization).toBe(true);
    expect(graph.get("execute_repair")?.mutation).toBe(true);
    expect(graph.get("execute_repair")?.risk).toBe("HIGH");
    expect(graph.get("close_incident")?.actorRoles).toEqual(["GUARDIAN"]);
  });

  it("lets Ascalon propose but not self-authorize", () => {
    const adapter = new AscalonGuardianAdapter(graph);
    const result = adapter.propose(
      {
        floorId: "floor03_asset_realization",
        actionId: "validate_candidate",
        targetId: "asset-plan-123",
        parameters: {},
        rationale: "Candidate requires validation",
        evidenceIds: [],
        proposedBy: "ASCALON",
        confidence: 0.91,
      },
      analysisContext,
    );

    expect(result.admissible).toBe(true);
    expect(result.proposal.proposalId).toMatch(/^proposal_/);
  });

  it("rejects an unknown action instead of allowing model-invented tools", () => {
    const adapter = new AscalonGuardianAdapter(graph);
    const result = adapter.propose(
      {
        floorId: "floor03_asset_realization",
        actionId: "delete_factory_everything",
        targetId: "factory",
        parameters: {},
        rationale: "Malicious invented action",
        evidenceIds: [],
        proposedBy: "ASCALON",
      },
      analysisContext,
    );

    expect(result.admissible).toBe(false);
    expect(result.reasons.join(" ")).toContain("Unknown action");
  });

  it("treats untrusted evidence as insufficient for mutation", () => {
    const context: FloorActionContext = {
      floorId: "floor03_asset_realization",
      state: "HEALING",
      actorId: "fg-healer-floor03",
      actorRole: "FG_HEALER",
      capabilities: ["floor.repair.execute"],
      evidence: [
        {
          evidenceId: "attack-1",
          evidenceType: "RepairPlan",
          trust: "UNTRUSTED",
        },
      ],
    };

    const adapter = new AscalonGuardianAdapter(graph);
    const result = adapter.propose(
      {
        floorId: context.floorId,
        actionId: "execute_repair",
        targetId: "asset-123",
        parameters: {},
        rationale: "Repair from untrusted evidence",
        evidenceIds: ["attack-1"],
        proposedBy: "FG_HEALER",
      },
      context,
    );

    expect(result.admissible).toBe(false);
    expect(result.reasons.join(" ")).toContain("Missing trusted evidence");
  });

  it("requires a Guardian grant before a high-impact repair can become executable", () => {
    const adapter = new AscalonGuardianAdapter(graph);
    const proposal = adapter.propose(
      {
        floorId: "floor03_asset_realization",
        actionId: "execute_repair",
        targetId: "asset-123",
        parameters: { mode: "bounded" },
        rationale: "Repair a verified asset failure",
        evidenceIds: ["repair-plan-1"],
        proposedBy: "FG_HEALER",
      },
      {
        floorId: "floor03_asset_realization",
        state: "HEALING",
        actorId: "fg-healer-floor03",
        actorRole: "FG_HEALER",
        capabilities: ["floor.repair.execute"],
        evidence: [
          {
            evidenceId: "repair-plan-1",
            evidenceType: "RepairPlan",
            trust: "TRUSTED",
          },
        ],
      },
    );

    expect(proposal.admissible).toBe(true);

    const auth: GuardianAuthorization = {
      authorizationId: "guard-auth-1",
      floorId: "floor03_asset_realization",
      actionId: "execute_repair",
      targetId: "asset-123",
      authorizedBy: "GUARDIAN",
      issuedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      actionScope: ["asset-123"],
      fencingEpoch: 12,
    };

    const request = adapter.authorize(proposal.proposal, auth);
    expect(request.authorization.fencingEpoch).toBe(12);
    expect(request.requestId).toMatch(/^action_/);
  });

  it("refuses a mismatched Guardian authorization", () => {
    const adapter = new AscalonGuardianAdapter(graph);
    const proposal = graph.createProposal({
      floorId: "floor03_asset_realization",
      actionId: "observe_floor",
      targetId: "floor03_asset_realization",
      parameters: {},
      rationale: "Observe floor",
      evidenceIds: [],
      proposedBy: "ASCALON",
    });

    expect(() =>
      adapter.authorize(proposal, {
        authorizationId: "bad-auth",
        floorId: proposal.floorId,
        actionId: "execute_repair",
        targetId: proposal.targetId,
        authorizedBy: "GUARDIAN",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30000).toISOString(),
        actionScope: [],
      }),
    ).toThrow("Authorization action does not match proposal action");
  });
});
