import { afterEach, describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { RenderArtifactVerifier } from "../core/fabric/verification/RenderArtifactVerifier";
import { ComputeRouter } from "../core/compute/router/ComputeRouter";
import { BaseComputeProvider } from "../core/compute/providers/ComputeProvider";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderHealth,
  ProviderType,
} from "../core/compute/contracts/ComputeContracts";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

async function sha256(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function makeMp4(filePath: string): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x180:r=30:d=0.5",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:sample_rate=48000:duration=0.5",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      filePath,
    ],
    { timeout: 30_000 }
  );
}

async function makeRoot(): Promise<string> {
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  const root = await fs.mkdtemp(
    path.join(process.cwd(), "data", "f06-admission-test-")
  );
  tempRoots.push(root);
  return root;
}

function artifactRef(filePath: string, digest: string, role = "output_mp4") {
  return {
    artifactId: "test_" + digest.slice(0, 16),
    role,
    sha256: digest,
    byteLength: 0,
    mimeType: "video/mp4",
    uri: filePath,
  };
}

function provider(
  id: string,
  startup: number,
  execute: (job: ComputeJob) => Promise<ExecutionReceipt>
): BaseComputeProvider {
  return new (class extends BaseComputeProvider {
    readonly id = id;
    readonly type: ProviderType = "LOCAL";
    readonly executionModel = "LOCAL_PROCESS" as const;

    async getCapability(): Promise<ProviderCapability> {
      return {
        providerId: id,
        providerType: "LOCAL",
        executionModel: this.executionModel,
        cpuCores: 8,
        memoryMb: 16000,
        gpuAvailable: false,
        gpuType: "CPU",
        operatingSystem: "test",
        supportedWorkloads: ["RENDER"],
        estimatedStartupSeconds: startup,
        transferBandwidthMbps: 10000,
        maxConcurrency: 4,
        maxJobDurationSeconds: 3600,
        isCredentialConfigured: true,
      };
    }

    async getHealth(): Promise<ProviderHealth> {
      return {
        state: "HEALTHY",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        activeJobs: 0,
        successRate: 1,
        avgLatencyMs: 1,
      };
    }

    async isAvailable(): Promise<boolean> {
      return true;
    }

    async executeJob(job: ComputeJob): Promise<ExecutionReceipt> {
      return execute(job);
    }
  })();
}

function renderJob(jobId: string): ComputeJob {
  return {
    jobId,
    factoryExecutionId: "factory_" + jobId,
    workloadType: "RENDER",
    manifest: {
      localRenderIntent: {
        output: {
          width: 320,
          height: 180,
          fps: 30,
          video_codec: "h264",
          audio_codec: "aac",
        },
      },
    },
    inputArtifacts: {
      bundleId: "input_" + jobId,
      artifacts: [],
      createdTimestamp: Date.now(),
    },
    requirements: {
      estimatedDurationSeconds: 0.5,
      diskSpaceMb: 1,
      workloadType: "RENDER",
    },
    priority: "HIGH",
    timeoutMs: 60_000,
    createdAt: new Date().toISOString(),
  };
}

describe("F06 physical render admission", () => {
  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("accepts decoder-valid MP4 only after SHA, size, ffprobe and decode checks", async () => {
    const root = await makeRoot();
    const videoPath = path.join(root, "valid.mp4");
    await makeMp4(videoPath);
    const digest = await sha256(videoPath);
    const size = (await fs.stat(videoPath)).size;

    const result = await new RenderArtifactVerifier().verify({
      artifact: {
        ...artifactRef(videoPath, digest),
        byteLength: size,
      },
      approvedRoots: [process.cwd()],
      expected: {
        width: 320,
        height: 180,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        requireAudio: true,
      },
    });

    expect(result.status).toBe("PASS");
    expect(result.checks).toEqual(
      expect.arrayContaining([
        "PHYSICAL_FILE_ON_DISK",
        "SHA256_BYTE_DIGEST",
        "BYTE_LENGTH_MATCH",
        "FFPROBE_CONTAINER",
        "FFPROBE_STREAM_METRIC",
        "FFMPEG_DECODE_SMOKE",
      ])
    );
    expect(result.decodeSmoke).toBe("PASS");
  });

  it("rejects a provider artifact that has the right digest but is not valid media", async () => {
    const root = await makeRoot();
    const badPath = path.join(root, "corrupt.mp4");
    await fs.writeFile(badPath, Buffer.from("this is not an mp4"));
    const digest = await sha256(badPath);
    const size = (await fs.stat(badPath)).size;

    const result = await new RenderArtifactVerifier().verify({
      artifact: {
        ...artifactRef(badPath, digest),
        byteLength: size,
      },
      approvedRoots: [process.cwd()],
      expected: { width: 320, height: 180, fps: 30 },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failureReason).toMatch(/Container validation failed|Invalid data|unknown/i);
  });

  it("fails closed when the physical digest differs from the provider receipt", async () => {
    const root = await makeRoot();
    const videoPath = path.join(root, "tampered.mp4");
    await makeMp4(videoPath);
    const originalDigest = await sha256(videoPath);
    await fs.appendFile(videoPath, Buffer.from("tamper"));
    const size = (await fs.stat(videoPath)).size;

    const result = await new RenderArtifactVerifier().verify({
      artifact: {
        ...artifactRef(videoPath, originalDigest),
        byteLength: size - "tamper".length,
      },
      approvedRoots: [process.cwd()],
    });

    expect(result.status).toBe("FAIL");
    expect(result.failureReason).toMatch(/SHA-256 mismatch|Byte-length mismatch/);
  });


  it("fails over when the first provider times out", async () => {
    const root = await makeRoot();
    const validPath = path.join(root, "valid-timeout-failover.mp4");
    await makeMp4(validPath);
    const validDigest = await sha256(validPath);
    const validSize = (await fs.stat(validPath)).size;

    const router = new ComputeRouter({
      policyVersion: "f06-test-timeout-1",
      allowedProviders: ["LOCAL"],
      preferredOrder: ["LOCAL"],
      maxRetries: 1,
      failoverAllowed: true,
      preferLocalForShortVideos: false,
      shortVideoThresholdSeconds: 60,
      allowSimulatedInTest: false,
    });

    router.registerProvider(
      provider("provider_timeout", 0.1, async () => ({
        receiptId: "receipt_timeout",
        executionId: "exec_timeout",
        jobId: "job_f06_timeout",
        factoryExecutionId: "factory_job_f06_timeout",
        providerId: "provider_timeout",
        providerType: "LOCAL",
        executionModel: "LOCAL_PROCESS",
        status: "FAILED",
        exitCode: 124,
        outputArtifacts: [],
        metrics: { startupTimeMs: 1, executionTimeMs: 2, transferTimeMs: 0, totalTimeMs: 3 },
        failureReason: "TIMED_OUT",
      })),
    );
    router.registerProvider(
      provider("provider_recovery", 0.5, async () => ({
        receiptId: "receipt_recovery_" + validDigest.slice(0, 8),
        executionId: "exec_recovery",
        jobId: "job_f06_timeout",
        factoryExecutionId: "factory_job_f06_timeout",
        providerId: "provider_recovery",
        providerType: "LOCAL",
        executionModel: "LOCAL_PROCESS",
        status: "COMPLETED",
        exitCode: 0,
        outputArtifacts: [{
          artifactId: "artifact_recovery",
          role: "output_mp4",
          sha256: validDigest,
          byteLength: validSize,
          mimeType: "video/mp4",
          uri: validPath,
        }],
        metrics: { startupTimeMs: 1, executionTimeMs: 1, transferTimeMs: 1, totalTimeMs: 3 },
      })),
    );

    const result = await router.dispatchWithFailover(renderJob("job_f06_timeout"));
    expect(result.receipt.status).toBe("COMPLETED");
    expect(result.receipt.providerId).toBe("provider_recovery");
    expect(result.receipt.artifactVerification?.status).toBe("PASS");
    expect(result.failovers.join(" | ")).toContain("provider_timeout");
  });

  it("fails over to a second provider when the first provider returns a corrupt completed artifact", async () => {
    const root = await makeRoot();
    const validPath = path.join(root, "valid-failover.mp4");
    const corruptPath = path.join(root, "corrupt-failover.mp4");
    await makeMp4(validPath);
    await fs.writeFile(corruptPath, Buffer.from("corrupt"));

    const validDigest = await sha256(validPath);
    const corruptDigest = await sha256(corruptPath);
    const validSize = (await fs.stat(validPath)).size;
    const corruptSize = (await fs.stat(corruptPath)).size;

    const makeReceipt = (artifactPath: string, digest: string, size: number): ExecutionReceipt => ({
      receiptId: "receipt_" + digest.slice(0, 8),
      executionId: "exec_" + digest.slice(0, 8),
      jobId: "job_f06_failover",
      factoryExecutionId: "factory_job_f06_failover",
      providerId: artifactPath.includes("corrupt") ? "provider_bad" : "provider_good",
      providerType: "LOCAL",
      executionModel: "LOCAL_PROCESS",
      status: "COMPLETED",
      exitCode: 0,
      outputArtifacts: [
        {
          artifactId: "artifact_" + digest.slice(0, 16),
          role: "output_mp4",
          sha256: digest,
          byteLength: size,
          mimeType: "video/mp4",
          uri: artifactPath,
        },
      ],
      metrics: {
        startupTimeMs: 1,
        executionTimeMs: 1,
        transferTimeMs: 1,
        totalTimeMs: 3,
      },
    });

    const router = new ComputeRouter({
      policyVersion: "f06-test-1",
      allowedProviders: ["LOCAL"],
      preferredOrder: ["LOCAL"],
      maxRetries: 1,
      failoverAllowed: true,
      preferLocalForShortVideos: false,
      shortVideoThresholdSeconds: 60,
      allowSimulatedInTest: false,
    });

    router.registerProvider(
      provider("provider_bad", 0.1, async () =>
        makeReceipt(corruptPath, corruptDigest, corruptSize)
      )
    );
    router.registerProvider(
      provider("provider_good", 0.5, async () =>
        makeReceipt(validPath, validDigest, validSize)
      )
    );

    const result = await router.dispatchWithFailover(renderJob("job_f06_failover"));

    expect(result.receipt.status).toBe("COMPLETED");
    expect(result.receipt.providerId).toBe("provider_good");
    expect(result.receipt.artifactVerification?.status).toBe("PASS");
    expect(result.failovers.join(" | ")).toMatch(
      /physical verification|F06_PHYSICAL_ARTIFACT_REJECTED/
    );
  });
});
