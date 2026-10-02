import { describe, expect, it } from "vitest";
import { ReMakerEngine } from "../core/remaker/ReMakerEngine";
import { ReMakerImpactAnalyzer } from "../core/remaker/ReMakerImpactAnalyzer";
import type { ReMakerExecutionPort, ReMakerPlan } from "../core/remaker/ReMakerContracts";
import type { TimelineIR } from "../core/timeline/TimelineIR";

function timeline(): TimelineIR {
  return {
    timelineId: "tl_01",
    schemaVersion: "1.0.0",
    missionId: "m_01",
    compositionType: "FACTS_SHORTS",
    canvas: { width: 1080, height: 1920, fps: 30, aspectRatio: "9:16" },
    totalDurationMs: 10000,
    visualTracks: [
      { clipId: "scene_01", assetId: "a1", assetType: "IMAGE", src: "cas://a1", timelineStartMs: 0, durationMs: 5000, zIndex: 1 },
      { clipId: "scene_02", assetId: "a2", assetType: "IMAGE", src: "cas://a2", timelineStartMs: 5000, durationMs: 5000, zIndex: 1 },
    ],
    audioTracks: [
      { audioId: "voice_01", trackType: "VOICE", src: "cas://v1", timelineStartMs: 0, durationMs: 10000, volume: 1, verifiedDurationMs: 10000 },
    ],
    subtitleTracks: [
      {
        subtitleId: "cap_01",
        text: "hello",
        startMs: 1000,
        endMs: 2000,
        style: { fontFamily: "Inter", fontSize: 64, primaryColor: "#fff", animation: "NONE" },
      },
    ],
    provenanceDigest: "timeline_digest_01",
  };
}

function request() {
  return {
    repairId: "repair_01",
    caseId: "case_01",
    missionId: "m_01",
    policyId: "YT.TEST",
    action: "REBUILD_SCENE" as const,
    target: { kind: "VISUAL_ASSET" as const, sceneIds: ["scene_02"] },
    allowedActions: ["regenerate scene"],
    forbiddenActions: [],
    requestedChangeDigest: "d".repeat(64),
    parentArtifact: {
      artifactId: "art_old",
      sha256: "a".repeat(64),
      byteLength: 1000,
      casRef: "cas://old",
      timelineDigest: "timeline_digest_01",
      revision: 1,
    },
    authorization: {
      capabilityId: "CAP_REMAKER_REPAIR" as const,
      grantId: "grant_01",
      fencingToken: 4,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      authorizedBy: "FLOOR_GUARDIAN",
    },
    budget: { maxAttempts: 2, maxDurationMs: 10_000 },
    evidenceRefs: ["ev_01"],
    reason: "Replace defective scene asset.",
    createdAt: new Date().toISOString(),
    timeline: timeline(),
  };
}

describe("ReMaker v2", () => {
  it("computes a narrow frame window and preserves unrelated nodes", () => {
    const impact = ReMakerImpactAnalyzer.analyze(
      timeline(),
      { kind: "VISUAL_ASSET", sceneIds: ["scene_02"] },
      2
    );
    expect(impact.directNodeIds).toEqual(["scene_02"]);
    expect(impact.renderSceneIds).toEqual(["scene_02"]);
    expect(impact.preservedNodeIds).toContain("scene_01");
    expect(impact.frameRange.startFrame).toBe(148);
    expect(impact.frameRange.endFrame).toBe(299);
  });

  it("rejects a repair action not authorized by the case", () => {
    expect(() =>
      new ReMakerEngine().plan({
        ...request(),
        allowedActions: ["font-only change"],
      })
    ).toThrow(/allowed action set/);
  });

  it("is idempotent for the same repair parent and target", async () => {
    let calls = 0;
    const port: ReMakerExecutionPort = {
      async execute(plan: ReMakerPlan) {
        calls += 1;
        return {
          candidateArtifact: {
            artifactId: "art_new",
            sha256: "b".repeat(64),
            byteLength: 2000,
            uri: "cas://new",
            mimeType: "video/mp4",
          },
          changedNodeIds: [...plan.changedNodeIds],
          preservedNodeIds: [...plan.preservedNodeIds],
          rendererReceiptId: "render_01",
          physicalValidation: { passed: true, decodeSmokePassed: true },
        };
      },
    };

    const engine = new ReMakerEngine();
    const first = await engine.execute(request(), port);
    const second = await engine.execute(request(), port);

    expect(first.termination).toBe("COMPLETED");
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(calls).toBe(1);
  });

  it("fails closed when the execution port violates preservation", async () => {
    const port: ReMakerExecutionPort = {
      async execute(plan: ReMakerPlan) {
        return {
          candidateArtifact: {
            artifactId: "art_new",
            sha256: "c".repeat(64),
            byteLength: 2000,
            uri: "cas://new",
            mimeType: "video/mp4",
          },
          changedNodeIds: [...plan.changedNodeIds],
          preservedNodeIds: [],
        };
      },
    };

    const receipt = await new ReMakerEngine().execute(request(), port);
    expect(receipt.termination).toBe("EXECUTION_FAILED");
    expect(receipt.f07Required).toBe(true);
  });
});
