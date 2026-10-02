import { describe, expect, it } from "vitest";
import { ReMakerHandoff } from "../core/remaker/ReMakerHandoff";
import type { RemediationCase } from "../core/verification/youtube/remediation/RemediationCase";

function eligibleCase(): RemediationCase {
  return {
    caseId: "case_g05_01",
    policyId: "YT.RIGHTS",
    severity: "REPAIRABLE" as any,
    finding: "Unverified asset",
    evidence: ["ev_asset_01"],
    affectedStages: ["F03"],
    repairObjective: "Replace the unverified asset",
    allowedActions: ["replace asset"],
    forbiddenShallowRepairs: ["font-only change"],
    preserve: ["verified facts"],
    rerunRequired: ["render", "f07"],
    createdAt: new Date().toISOString(),
    remediationOwner: "REMAKER",
    remakerEligible: true,
    recommendedReMakerAction: "REPLACE_ASSET",
  };
}

describe("ReMakerHandoff", () => {
  it("creates a ReMaker request only from a ReMaker-owned case and explicit scope", () => {
    const request = ReMakerHandoff.create({
      caseItem: eligibleCase(),
      missionId: "m_01",
      targetScope: {
        kind: "VISUAL_ASSET",
        sceneIds: ["scene_02"],
      },
      parentArtifact: {
        artifactId: "art_01",
        sha256: "a".repeat(64),
        byteLength: 1000,
        casRef: "cas://art_01",
        timelineDigest: "b".repeat(64),
        revision: 2,
      },
      authorization: {
        capabilityId: "CAP_REMAKER_REPAIR",
        grantId: "grant_01",
        fencingToken: 10,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        authorizedBy: "guardian_01",
      },
      requestedChangeDigest: "c".repeat(64),
      budget: { maxAttempts: 2, maxDurationMs: 10000 },
    });

    expect(request.action).toBe("REPLACE_ASSET");
    expect(request.target.sceneIds).toEqual(["scene_02"]);
    expect(request.authorization.grantId).toBe("grant_01");
  });

  it("rejects non-ReMaker remediation cases", () => {
    expect(() =>
      ReMakerHandoff.create({
        caseItem: {
          ...eligibleCase(),
          remakerEligible: false,
          remediationOwner: "UPSTREAM_FLOOR",
        },
        missionId: "m_01",
        targetScope: { kind: "VISUAL_ASSET", sceneIds: ["scene_02"] },
        parentArtifact: {
          artifactId: "art_01",
          sha256: "a".repeat(64),
          byteLength: 1000,
          casRef: "cas://art_01",
          timelineDigest: "b".repeat(64),
          revision: 2,
        },
        authorization: {
          capabilityId: "CAP_REMAKER_REPAIR",
          grantId: "grant_01",
          fencingToken: 10,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          authorizedBy: "guardian_01",
        },
        requestedChangeDigest: "c".repeat(64),
        budget: { maxAttempts: 2, maxDurationMs: 10000 },
      })
    ).toThrow(/not authorized for ReMaker ownership/);
  });
});
