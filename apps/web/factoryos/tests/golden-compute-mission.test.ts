import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GOLDEN_SHORT_001 } from "../../../../testing/scenarios/golden/golden-short-001";
import { RenderFabric } from "../core/fabric/RenderFabric";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import type { RenderIntent } from "../core/contracts/RenderIntentContracts";

describe("Golden compute mission", () => {
  it("runs the golden render boundary through ComputePool -> RenderFabric -> CAS -> F07", async () => {
    const outputDir = path.resolve(process.cwd(), ".okf", "golden-compute-mission");
    fs.mkdirSync(outputDir, { recursive: true });

    const durationSeconds = GOLDEN_SHORT_001.goal.durationSeconds || 3;
    const intent: RenderIntent = {
      intentId: "golden-compute-intent",
      jobId: "golden-compute-mission",
      missionId: "golden-short-001-compute",
      compositionType: "FACTS_SHORTS",
      durationSeconds,
      fps: 30,
      resolution: { width: 1080, height: 1920 },
      tracks: {
        visualAssets: [
          {
            id: "golden-background",
            type: "SHAPE",
            src: "navy",
            zIndex: 0,
            startSeconds: 0,
            durationSeconds,
          },
        ],
        audioTracks: [],
        captions: [
          {
            id: "golden-caption",
            text: GOLDEN_SHORT_001.goal.topic,
            startMs: 0,
            endMs: Math.round(durationSeconds * 1000),
            style: {},
          },
        ],
      },
      preferredCompiler: "FFMPEG",
      constraints: {},
      createdAt: new Date().toISOString(),
    };

    const fabric = new RenderFabric();
    const result = await fabric.executeRender(intent, {
      preferredProviderType: "LOCAL",
      outputDir,
    });

    expect(result.success).toBe(true);
    expect(result.providerUsed).toBe("DISTRIBUTED");
    expect(result.compilerUsed).toBe("FFMPEG");
    expect(result.receipt.status).toBe("COMPLETED");
    expect(result.receipt.providerId).toBe("provider_local_render");
    expect(result.artifact).toBeDefined();

    const artifact = result.artifact!;
    expect(fs.existsSync(artifact.location.path)).toBe(true);
    expect(artifact.sha256).toHaveLength(64);
    expect(artifact.width).toBe(1080);
    expect(artifact.height).toBe(1920);

    const cas = ContentAddressedStore.getInstance();
    const casRef = result.receipt.outputArtifacts[0];
    expect(casRef?.sha256).toBe(artifact.sha256);
    expect(await cas.has(artifact.sha256)).toBe(true);
    expect(await cas.verify(casRef!)).toBe(true);

    const f07 = await VerificationEngine.auditMediaArtifact({
      jobId: artifact.jobId,
      artifact,
      aspectRatio: "9:16",
    });

    expect(f07.passed).toBe(true);
    expect(f07.overallStatus).toBe("PASSED");
    expect(f07.hardGates.artifactExists).toBe(true);
    expect(f07.hardGates.validContainer).toBe(true);
    expect(f07.hardGates.videoStreamPresent).toBe(true);
    expect(f07.hardGates.audioStreamPresent).toBe(true);
    expect(f07.hardGates.exact9x16Geometry).toBe(true);
    expect(f07.hardGates.decodeSmokePassed).toBe(true);
  }, 60_000);
});
