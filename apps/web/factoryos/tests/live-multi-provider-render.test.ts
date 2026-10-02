import { describe, expect, it } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { RenderFabric } from "../core/fabric/RenderFabric";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import type { ProviderType } from "../core/compute/contracts/ComputeContracts";

const provider = (process.env.LIVE_COMPUTE_PROVIDER_TYPE || "").trim().toUpperCase() as ProviderType;

const credentialsPresent = (() => {
  switch (provider) {
    case "AMD":
      return Boolean(process.env.AMD_WORKER_URL && process.env.AMD_WORKER_SECRET);
    case "KAGGLE":
      return Boolean(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY);
    case "DAYTONA":
      return Boolean(process.env.DAYTONA_API_KEY);
    case "MODAL":
      return Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET);
    default:
      return false;
  }
})();

const supported = new Set<ProviderType>(["AMD", "KAGGLE", "DAYTONA", "MODAL"]);

describe("live multi-provider compute", () => {
  it("runs a physical render through the selected non-local provider and verifies CAS + F07", async () => {
    if (process.env.RUN_LIVE_COMPUTE !== "1") return;
    if (!supported.has(provider)) throw new Error("Unsupported LIVE_COMPUTE_PROVIDER_TYPE: " + provider);
    if (!credentialsPresent) throw new Error("Missing credentials for live provider: " + provider);

    const outputDir = path.resolve(process.cwd(), ".okf", "live-compute-smoke", provider.toLowerCase());
    fs.mkdirSync(outputDir, { recursive: true });
    const durationSeconds = 2;

    const result = await new RenderFabric().executeRender(
      {
        intentId: "live-" + provider.toLowerCase(),
        jobId: "live-" + provider.toLowerCase() + "-" + Date.now().toString(36),
        missionId: "live-compute-mission",
        compositionType: "FACTS_SHORTS",
        durationSeconds,
        fps: 30,
        resolution: { width: 1080, height: 1920 },
        tracks: {
          visualAssets: [
            {
              id: "live-background",
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
              text: "ShortForge distributed render smoke",
              startMs: 0,
              endMs: durationSeconds * 1000,
              style: {},
            },
          ],
        },
        preferredCompiler: "FFMPEG",
        constraints: {},
        createdAt: new Date().toISOString(),
      },
      {
        preferredProviderType: provider,
        outputDir,
      },
    );

    expect(result.receipt.status).toBe("COMPLETED");
    expect(result.receipt.providerType).toBe(provider);
    expect(result.artifact).toBeDefined();

    const artifact = result.artifact!;
    expect(fs.existsSync(artifact.location.path)).toBe(true);
    expect(artifact.sha256).toHaveLength(64);

    const cas = ContentAddressedStore.getInstance();
    expect(await cas.verify(result.receipt.outputArtifacts[0]!)).toBe(true);

    const f07 = await VerificationEngine.auditMediaArtifact({
      jobId: artifact.jobId,
      artifact,
      aspectRatio: "9:16",
    });
    expect(f07.passed).toBe(true);
    expect(f07.overallStatus).toBe("PASSED");
    expect(result.receipt.admissionRecord?.selectedProviderType).toBe(provider);
  }, 10 * 60_000);
});