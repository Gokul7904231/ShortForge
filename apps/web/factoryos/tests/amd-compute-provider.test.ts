import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { AmdComputeProvider } from "../core/compute/providers/AmdComputeProvider";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import type { ComputeJob } from "../core/compute/contracts/ComputeContracts";

describe("AMD ComputeProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AMD_WORKER_URL = "http://amd-worker.test";
    process.env.AMD_WORKER_SECRET = "test-secret";
    process.env.AMD_WORKER_ID = "amd-test-01";
    process.env.AMD_WORKER_POLL_MS = "1";

    const casDir = path.join(
      process.cwd(),
      "data",
      "amd-provider-test-cas-" + Date.now()
    );
    ContentAddressedStore.resetInstanceForTesting(casDir);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("blocks AMD when the worker is not configured", async () => {
    delete process.env.AMD_WORKER_URL;
    delete process.env.AMD_WORKER_SECRET;

    const provider = new AmdComputeProvider();
    const health = await provider.getHealth();

    expect(health.state).toBe("BLOCKED");
  });

  it("executes a remote render and stores the physical artifact in CAS", async () => {
    const bytes = Buffer.from("factoryos-amd-test-mp4");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    let statusPolls = 0;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const responseHeaders = new Headers({
          "Content-Type": "application/json",
        });

        if (url.endsWith("/ready")) {
          return new Response(
            JSON.stringify({ status: "ready", workerId: "amd-test-01" }),
            { status: 200, headers: responseHeaders }
          );
        }

        if (url.endsWith("/capabilities")) {
          return new Response(
            JSON.stringify({
              ready: true,
              workerId: "amd-test-01",
              gpuVendor: "AMD",
              gpuModel: "AMD Test GPU",
              vramMb: 16384,
              gpuCount: 1,
              cpuCores: 16,
              memoryMb: 32768,
              ffmpegAvailable: true,
              videoEncoder: "h264_vaapi",
              maxConcurrency: 1,
              isEphemeral: false,
            }),
            { status: 200, headers: responseHeaders }
          );
        }

        if (url.endsWith("/api/factoryos/render/jobs")) {
          return new Response(
            JSON.stringify({ jobId: "job_amd_test_01", status: "queued" }),
            { status: 202, headers: responseHeaders }
          );
        }

        if (url.endsWith("/api/factoryos/render/jobs/job_amd_test_01")) {
          statusPolls += 1;
          const completed = statusPolls >= 2;
          return new Response(
            JSON.stringify({
              jobId: "job_amd_test_01",
              status: completed ? "completed" : "processing",
              result: completed
                ? {
                    artifactSha256: sha256,
                    byteLength: bytes.length,
                    durationSeconds: 2,
                    width: 1080,
                    height: 1920,
                    fps: 30,
                    codec: "h264",
                    encoder: "h264_vaapi",
                    renderTimeMs: 25,
                  }
                : undefined,
            }),
            { status: 200, headers: responseHeaders }
          );
        }

        if (url.endsWith("/api/factoryos/render/jobs/job_amd_test_01/artifact")) {
          return new Response(bytes, {
            status: 200,
            headers: new Headers({
              "Content-Type": "video/mp4",
              "X-Artifact-SHA256": sha256,
            }),
          });
        }

        if (init?.method === "POST") {
          return new Response(JSON.stringify({}), {
            status: 200,
            headers: responseHeaders,
          });
        }

        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: responseHeaders,
        });
      });

    const provider = new AmdComputeProvider();
    const job: ComputeJob = {
      jobId: "job_amd_test_01",
      factoryExecutionId: "factory_amd_test_01",
      workloadType: "RENDER",
      manifest: {
        localRenderIntent: {
          project_id: "job_amd_test_01",
          title: "AMD provider test",
          output_path: "/not-used/output.mp4",
          scenes: [
            {
              scene_id: "scene_01",
              template_id: "test",
              narration_text: "AMD provider test",
              duration_seconds: 2,
              shots: [],
            },
          ],
        },
      },
      inputArtifacts: {
        bundleId: "bundle_amd_test",
        artifacts: [],
        createdTimestamp: Date.now(),
      },
      requirements: {
        workloadType: "RENDER",
        gpuRequired: true,
        estimatedDurationSeconds: 2,
        networkAccessRequired: true,
        diskSpaceMb: 10,
      },
      priority: "HIGH",
      timeoutMs: 30_000,
      createdAt: new Date().toISOString(),
    };

    const receipt = await provider.executeJob(job);

    expect(fetchMock).toHaveBeenCalled();
    expect(receipt.status).toBe("COMPLETED");
    expect(receipt.providerType).toBe("AMD");
    expect(receipt.outputArtifacts).toHaveLength(1);
    expect(receipt.outputArtifacts[0].sha256).toBe(sha256);

    const storedPath = receipt.outputArtifacts[0].uri!;
    expect(fs.existsSync(storedPath)).toBe(true);
    expect(
      await ContentAddressedStore.getInstance().verify(receipt.outputArtifacts[0])
    ).toBe(true);
  });
});
