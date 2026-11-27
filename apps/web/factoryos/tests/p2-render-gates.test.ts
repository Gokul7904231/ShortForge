import { describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { RenderArtifactVerifier } from "../core/fabric/verification/RenderArtifactVerifier";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const FIXTURES_ROOT = path.join(REPO_ROOT, "tests", "fixtures", "media");

function makeRequest(filePath: string, durationSeconds = 2.0) {
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return {
    artifact: {
      artifactId: `art_${path.basename(filePath, ".mp4")}`,
      role: "output_mp4",
      sha256,
      byteLength: bytes.length,
      mimeType: "video/mp4",
      uri: filePath,
    },
    approvedRoots: [FIXTURES_ROOT, REPO_ROOT],
    expected: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSeconds,
      videoCodec: "h264",
      audioCodec: "aac",
      requireAudio: true,
    },
  };
}

describe("P2 Unconditional Media Doctrine Gates (G1-G12)", () => {
  const verifier = new RenderArtifactVerifier();
  const goodPath = path.join(FIXTURES_ROOT, "good", "doctrine_valid.mp4");

  it("PASSES all 12 unconditional gates + decode smoke on doctrine_valid.mp4", async () => {
    const result = await verifier.verify(makeRequest(goodPath, 2.0));
    expect(result.status).toBe("PASS");
    expect(result.decodeSmoke).toBe("PASS");
    for (const gate of [
      "G1_GEOMETRY",
      "G2_EXACT_FPS",
      "G3_PIX_FMT",
      "G4_COLOR_BT709",
      "G5_AUDIO_FORMAT",
      "G6_LOUDNESS",
      "G7_TRUE_PEAK",
      "G8_AV_DRIFT",
      "G9_FASTSTART",
      "G10_FRAME_COUNT",
      "G11_SAMPLE_EXACT",
      "G12_SAFE_AREA",
    ]) {
      expect(result.checks).toContain(gate);
    }
  }, 30000);

  const badCases: Array<{
    gate: string;
    file: string;
    durationSeconds?: number;
    expectedError: RegExp;
  }> = [
    { gate: "G1", file: "bad_g01_geometry_720x1280.mp4", expectedError: /G1|Width|Height|geometry/i },
    { gate: "G2", file: "bad_g02_fps_2997.mp4", expectedError: /G2|r_frame_rate|FPS/i },
    { gate: "G3", file: "bad_g03_pixfmt_yuv444p.mp4", expectedError: /G3|pix_fmt/i },
    { gate: "G4", file: "bad_g04_color_bt601_pc.mp4", expectedError: /G4|color/i },
    { gate: "G5", file: "bad_g05_audio_mono_44100.mp4", expectedError: /G5|sample_rate|channels|audio/i },
    { gate: "G6", file: "bad_g06_loudness_quiet.mp4", expectedError: /G6|loudness|LUFS/i },
    { gate: "G7", file: "bad_g07_truepeak_clip.mp4", expectedError: /G7|true peak|dBTP/i },
    { gate: "G8", file: "bad_g08_av_drift_300ms.mp4", expectedError: /G8|drift/i },
    { gate: "G9", file: "bad_g09_no_faststart.mp4", expectedError: /G9|faststart|moov/i },
    { gate: "G10", file: "bad_g10_frame_count_mismatch.mp4", durationSeconds: 2.0, expectedError: /G10|nb_read_frames|frame/i },
    { gate: "G11", file: "bad_g11_sample_count_mismatch.mp4", expectedError: /G11|sample/i },
    { gate: "G12", file: "bad_g12_safe_area_violation.mp4", expectedError: /G12|safe-area/i },
  ];

  for (const tc of badCases) {
    it(`REJECTS ${tc.gate} bad fixture (${tc.file})`, async () => {
      const badPath = path.join(FIXTURES_ROOT, "bad", tc.file);
      const result = await verifier.verify(makeRequest(badPath, tc.durationSeconds ?? 2.0));
      expect(result.status).toBe("FAIL");
      expect(result.failureReason).toMatch(tc.expectedError);
    }, 30000);
  }
});
