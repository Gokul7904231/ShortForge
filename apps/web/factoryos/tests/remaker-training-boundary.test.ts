import { describe, expect, it } from "vitest";
import { AscalonTrajectoryValidator } from "../../../../training/ascalon/validators/AscalonTrajectoryValidator";
import { ScenarioGenerator } from "../../../../training/ascalon/generation/scenario_generator/ScenarioGenerator";

describe("Ascalon ReMaker training boundary", () => {
  it("generates deterministic ReMaker simulation scenarios", () => {
    const a = ScenarioGenerator.generateScenario("REMAKER_SURGICAL_REPAIR", 77);
    const b = ScenarioGenerator.generateScenario("REMAKER_SURGICAL_REPAIR", 77);
    expect(a).toEqual(b);
    expect(a.environment).toBe("SIMULATION");
    expect(a.synthetic).toBe(true);
    expect(a.expectedRemediationAction).toBe("CAP_REMAKER_REPAIR");
  });

  it("admits a fully evidenced ReMaker trajectory", () => {
    const trajectory = {
      trajectoryId: "traj_remaker_01",
      schemaVersion: "1.0.0",
      hierarchyVersion: "8-floor-v2",
      episode: "REMAKER_SURGICAL_REPAIR",
      environment: { environmentType: "SIMULATION" },
      observation: { findingId: "f07_01" },
      decision: { action: "REPAIR" },
      authorization: {
        requested: true,
        authorized: true,
        guardianDecision: "GRANTED",
        capabilityId: "CAP_REMAKER_REPAIR",
        fencingToken: 11,
      },
      execution: {
        tool: "CAP_REMAKER_REPAIR",
        remaker: {
          parentArtifactSha256: "a".repeat(64),
          timelineDigest: "timeline_digest_01",
          preservedNodeIds: ["scene_01"],
          preservedNodeFingerprints: { scene_01: "b".repeat(64) },
        },
      },
      outcome: {
        status: "SUCCESS",
        verified: true,
        verificationEvidenceId: "f07_verification_01",
      },
      provenance: {
        labelSource: "VERIFIED_SIMULATION",
        simulation: true,
        synthetic: true,
        trainingEligible: true,
      },
    };

    const report = AscalonTrajectoryValidator.validate(trajectory);
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("rejects ReMaker trajectories missing safety evidence", () => {
    const report = AscalonTrajectoryValidator.validate({
      trajectoryId: "traj_remaker_bad",
      schemaVersion: "1.0.0",
      hierarchyVersion: "8-floor-v2",
      episode: "REMAKER_SURGICAL_REPAIR",
      environment: { environmentType: "SIMULATION" },
      observation: {},
      decision: { action: "REPAIR" },
      authorization: {
        requested: true,
        authorized: true,
        guardianDecision: "GRANTED",
        capabilityId: "CAP_REMAKER_REPAIR",
        fencingToken: 11,
      },
      execution: {
        tool: "CAP_REMAKER_REPAIR",
        remaker: {
          parentArtifactSha256: "a".repeat(64),
          timelineDigest: "timeline_digest_01",
          preservedNodeIds: [],
          preservedNodeFingerprints: {},
        },
      },
      outcome: {
        status: "SUCCESS",
        verified: false,
      },
      provenance: {
        labelSource: "VERIFIED_SIMULATION",
        simulation: true,
        synthetic: true,
        trainingEligible: true,
      },
    });
    expect(report.valid).toBe(false);
    expect(report.issues.some(i => i.code === "REMAKER_EVIDENCE_INCOMPLETE")).toBe(true);
  });
});
