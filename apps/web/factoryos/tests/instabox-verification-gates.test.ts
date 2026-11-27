import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { RenderArtifactVerifier } from "../core/fabric/verification/RenderArtifactVerifier";
import { VerificationEngine } from "../core/verification/VerificationEngine";

describe("InstaBox Strict Verification & F07 Hard Gates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "data", `test_verify_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  it("Hard Gate: rejects corrupt file with invalid container", async () => {
    const corruptFile = path.join(tempDir, "corrupt.mp4");
    fs.writeFileSync(corruptFile, Buffer.from("NOT_A_VALID_MP4_HEADER"));

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId: "job-corrupt-test",
      videoUrl: corruptFile,
      scriptText: "Test Script",
      sceneCount: 1,
    });

    expect(audit.passed).toBe(false);
    expect(audit.overallStatus).toBe("FAILED");
    expect(audit.hardGates.validContainer).toBe(false);
    expect(audit.hardGates.videoStreamPresent).toBe(false);
  });

  it("Hard Gate: rejects missing physical artifact", async () => {
    const missingFile = path.join(tempDir, "non_existent.mp4");

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId: "job-missing-test",
      videoUrl: missingFile,
      scriptText: "Test Script",
      sceneCount: 1,
    });

    expect(audit.passed).toBe(false);
    expect(audit.overallStatus).toBe("FAILED");
    expect(audit.hardGates.artifactExists).toBe(false);
  });

  it("Hard Gate: F06 verifier rejects SHA-256 mismatch", async () => {
    const dummyFile = path.join(tempDir, "dummy.mp4");
    fs.writeFileSync(dummyFile, Buffer.from("dummy mp4 content"));

    const verifier = new RenderArtifactVerifier();
    const result = await verifier.verify({
      artifact: {
        artifactId: "art-test-dummy",
        role: "output_mp4",
        sha256: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        byteLength: 17,
        mimeType: "video/mp4",
        uri: dummyFile,
      },
      approvedRoots: [tempDir, process.cwd()],
      expected: {
        width: 1080,
        height: 1920,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        requireAudio: true,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failureReason).toContain("SHA-256 mismatch");
  });
});
