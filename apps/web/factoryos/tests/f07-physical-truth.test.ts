import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { F07PhysicalArtifactVerifier } from "../core/verification/youtube/physical/F07PhysicalArtifactVerifier";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import { F07PreTrainingAdmission } from "../core/verification/youtube/F07PreTrainingAdmission";

const measurements = {
  fileExists: true,
  byteLength: 14,
  hasFtypBox: true,
  decodeSmokePassed: true,
  width: 1080,
  height: 1920,
  videoCodec: "h264",
  audioCodec: "aac",
  videoDuration: 2,
  audioDuration: 2,
  syncDriftMs: 0,
  pixelFormat: "yuv420p",
  fps: 30,
  bitrateKbps: 512,
  streamCount: 2,
  audioSampleRate: 48000,
  audioChannels: 2,
};

describe("F07 independent physical truth boundary", () => {
  it("binds the declared CAS identity to fresh physical bytes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-f07-"));
    const source = path.join(tempDir, "candidate.mp4");
    fs.writeFileSync(source, Buffer.from("shortforge-f07"));

    const cas = ContentAddressedStore.resetInstanceForTesting(path.join(tempDir, "cas"));
    const ref = await cas.putFile(source, "test_video", "video/mp4");

    vi.spyOn(VerificationEngine, "probeMediaFile").mockResolvedValue(measurements);
    const result = await F07PhysicalArtifactVerifier.verify({
      artifactSha256: ref.sha256,
      artifactCasRef: "cas://" + ref.sha256,
    });

    expect(result.source).toBe("CAS");
    expect(result.casBound).toBe(true);
    expect(result.actualSha256).toBe(ref.sha256);
    expect(result.sha256MatchesExpected).toBe(true);
    expect(result.byteLength).toBe(ref.byteLength);
  });

  it("rejects a forged CAS identity even when the caller supplies valid-looking measurements", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-f07-"));
    const source = path.join(tempDir, "candidate.mp4");
    fs.writeFileSync(source, Buffer.from("shortforge-f07"));

    const cas = ContentAddressedStore.resetInstanceForTesting(path.join(tempDir, "cas"));
    const ref = await cas.putFile(source, "test_video", "video/mp4");
    vi.spyOn(VerificationEngine, "probeMediaFile").mockResolvedValue(measurements);

    await expect(
      F07PhysicalArtifactVerifier.verify({
        artifactSha256: "a".repeat(64),
        artifactCasRef: "cas://" + ref.sha256,
      })
    ).rejects.toThrow(/identity mismatch/);
  });

  it("does not admit training until every required truth boundary is evidenced", () => {
    const denied = F07PreTrainingAdmission.evaluate({
      topologyCanonical: true,
      physicalProbeIndependent: true,
      casBoundArtifactRequired: true,
      policySnapshotIntervalBound: false,
      policySourcesFresh: true,
      receiptCryptographicallySigned: true,
      authorizationDurable: true,
      replayProtectionVerified: true,
      noSyntheticProductionSuccess: true,
      lineageInvalidationVerified: true,
      testSuitesPassed: true,
    });

    expect(denied.admitted).toBe(false);
    expect(denied.blockingChecks).toContain("policySnapshotIntervalBound");
  });
});
