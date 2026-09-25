/**
 * FactoryOS Distributed Compute Fabric — AMD Compute Provider
 *
 * Bridges ComputeRouter to a real remote AMD render worker.
 * The provider is fail-closed: no AMD credentials/heartbeat/artifact means
 * AMD is unavailable and the router may choose another qualified provider.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { BaseComputeProvider } from "./ComputeProvider";
import {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderConfigValidationResult,
  ProviderHealth,
  ProviderExecutionModel,
  ProviderType,
} from "../contracts/ComputeContracts";
import { ContentAddressedStore } from "../cas/ContentAddressedStore";
import { AmdRenderWorkerAdapter } from "../../fabric/adapters/AmdRenderWorkerAdapter";

export class AmdComputeProvider extends BaseComputeProvider {
  readonly id = "provider_amd_render";
  readonly type: ProviderType = "AMD";
  readonly executionModel: ProviderExecutionModel = "PERSISTENT_WORKER";

  private readonly adapter: AmdRenderWorkerAdapter;
  private readonly cas: ContentAddressedStore;
  private activeJobs = 0;

  constructor() {
    super();
    this.adapter = new AmdRenderWorkerAdapter(
      process.env.AMD_WORKER_ID || "amd_worker_01"
    );
    this.cas = ContentAddressedStore.getInstance();
  }

  public validateConfiguration(): ProviderConfigValidationResult {
    const requiredKeys = ["AMD_WORKER_URL", "AMD_WORKER_SECRET"];
    const missingKeys: string[] = [];

    if (!process.env.AMD_WORKER_URL) {
      missingKeys.push("AMD_WORKER_URL");
    }
    if (!process.env.AMD_WORKER_SECRET) {
      missingKeys.push("AMD_WORKER_SECRET");
    }

    return {
      isConfigured: missingKeys.length === 0,
      requiredKeys,
      missingKeys,
      errors: missingKeys.map(
        (key) => "Missing required environment variable: " + key
      ),
    };
  }

  public async getCapability(): Promise<ProviderCapability> {
    try {
      const remote = await this.adapter.getCapabilities();

      return {
        providerId: this.id,
        providerType: this.type,
        executionModel: this.executionModel,
        cpuCores: remote.cpuCores || 0,
        memoryMb: remote.memoryMb || 0,
        gpuAvailable: remote.gpuCount > 0 && remote.ffmpegAvailable,
        gpuType:
          remote.gpuModel +
          (remote.videoEncoder ? " (" + remote.videoEncoder + ")" : ""),
        operatingSystem: "Linux AMD render worker",
        supportedWorkloads: ["RENDER"],
        estimatedStartupSeconds: 1,
        transferBandwidthMbps: 1000,
        maxConcurrency: remote.maxConcurrency || 1,
        maxJobDurationSeconds: Number(
          process.env.AMD_WORKER_MAX_JOB_SECONDS || 3600
        ),
        isCredentialConfigured: true,
      };
    } catch {
      return {
        providerId: this.id,
        providerType: this.type,
        executionModel: this.executionModel,
        cpuCores: 0,
        memoryMb: 0,
        gpuAvailable: false,
        gpuType: "AMD (unreachable)",
        operatingSystem: "Unknown",
        supportedWorkloads: ["RENDER"],
        estimatedStartupSeconds: 60,
        transferBandwidthMbps: 100,
        maxConcurrency: 0,
        maxJobDurationSeconds: Number(
          process.env.AMD_WORKER_MAX_JOB_SECONDS || 3600
        ),
        isCredentialConfigured: true,
      };
    }
  }

  public async getHealth(): Promise<ProviderHealth> {
    const config = this.validateConfiguration();
    if (!config.isConfigured) {
      return {
        state: "BLOCKED",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        failureReason: config.errors.join("; "),
        activeJobs: 0,
        successRate: 0,
        avgLatencyMs: 0,
      };
    }

    const start = Date.now();

    try {
      const heartbeat = await this.adapter.heartbeat();
      if (!heartbeat.acknowledged) {
        return {
          state: "DEGRADED",
          lastCheckedAt: new Date().toISOString(),
          consecutiveFailures: 1,
          failureReason: "AMD worker is configured but not ready.",
          activeJobs: this.activeJobs,
          successRate: 0.5,
          avgLatencyMs: Date.now() - start,
        };
      }

      return {
        state: "HEALTHY",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        activeJobs: this.activeJobs,
        successRate: 0.99,
        avgLatencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        state: "BLOCKED",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 3,
        failureReason:
          "AMD worker heartbeat failed: " +
          (error?.message || String(error)),
        activeJobs: this.activeJobs,
        successRate: 0,
        avgLatencyMs: Date.now() - start,
      };
    }
  }

  public async isAvailable(): Promise<boolean> {
    const health = await this.getHealth();
    const cap = await this.getCapability();
    return (
      health.state === "HEALTHY" &&
      cap.gpuAvailable &&
      this.activeJobs < cap.maxConcurrency
    );
  }

  public async executeJob(
    job: ComputeJob,
    onProgress?: (msg: string) => void
  ): Promise<ExecutionReceipt> {
    const startedAt = Date.now();
    const executionId =
      "exec_amd_" + job.jobId + "_" + Date.now().toString(36);

    if (job.workloadType !== "RENDER") {
      return this.failedReceipt(
        job,
        executionId,
        64,
        "AMD provider only supports RENDER workloads."
      );
    }

    this.activeJobs++;

    try {
      const localRenderIntent =
        ((job.manifest as any)?.localRenderIntent ||
          job.manifest) as Record<string, any>;

      if (!Array.isArray(localRenderIntent?.scenes)) {
        return this.failedReceipt(
          job,
          executionId,
          65,
          "AMD provider requires a LocalRenderIntent with scenes."
        );
      }

      onProgress?.("Preparing render manifest for AMD worker.");

      const stagedIntent = await this.stageLocalInputs(
        job.jobId,
        localRenderIntent,
        onProgress
      );

      onProgress?.("Submitting render to AMD worker.");

      const submission = await this.adapter.submitRender({
        jobId: job.jobId,
        executionId,
        localRenderIntent: stagedIntent,
        compilerPlan: (job.manifest as any)?.compilerPlan,
        metadata: {
          missionId: job.missionId,
          factoryExecutionId: job.factoryExecutionId,
        },
      });

      onProgress?.(
        "AMD worker accepted " + submission.jobId + " (" + submission.status + ")."
      );

      const timeoutMs = Math.max(
        60_000,
        Math.min(
          job.timeoutMs || 900_000,
          Number(process.env.AMD_WORKER_MAX_JOB_SECONDS || 3600) * 1000
        )
      );

      const remote = await this.adapter.waitForCompletion(
        submission.jobId,
        timeoutMs
      );

      if (
        remote.status !== "completed" ||
        !remote.result?.artifactSha256
      ) {
        return this.failedReceipt(
          job,
          executionId,
          1,
          remote.error ||
            "AMD worker did not produce a verified artifact receipt.",
          Date.now() - startedAt,
          remote
        );
      }

      onProgress?.("Downloading physical AMD artifact for CAS verification.");

      const downloaded = await this.adapter.downloadArtifact(job.jobId);
      if (downloaded.sha256 !== remote.result.artifactSha256) {
        throw new Error(
          "AMD artifact digest mismatch between job receipt and artifact endpoint."
        );
      }

      const tmpDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "factoryos-amd-")
      );
      const tmpPath = path.join(tmpDir, job.jobId + ".mp4");

      try {
        await fs.writeFile(tmpPath, downloaded.bytes);

        const artifact = await this.cas.putFile(
          tmpPath,
          "output_mp4",
          downloaded.contentType || "video/mp4",
          {
            jobId: job.jobId,
            executionId,
            provider: "AMD",
            remoteArtifactSha256: downloaded.sha256,
            remoteVideoUrl: remote.result.videoUrl,
            durationSeconds: remote.result.durationSeconds,
            width: remote.result.width,
            height: remote.result.height,
            fps: remote.result.fps,
            codec: remote.result.codec,
            encoder: remote.result.encoder,
          }
        );

        if (artifact.sha256 !== downloaded.sha256) {
          throw new Error(
            "AMD artifact failed local CAS integrity verification."
          );
        }

        return {
          receiptId: "rcpt_" + executionId,
          executionId,
          jobId: job.jobId,
          factoryExecutionId: job.factoryExecutionId,
          providerId: this.id,
          providerType: this.type,
          executionModel: this.executionModel,
          status: "COMPLETED",
          exitCode: 0,
          outputArtifacts: [artifact],
          metrics: {
            startupTimeMs: 500,
            executionTimeMs:
              remote.result.renderTimeMs || Math.max(0, Date.now() - startedAt),
            transferTimeMs: Math.max(0, Date.now() - startedAt),
            totalTimeMs: Date.now() - startedAt,
          },
          stdoutSnippet:
            "AMD worker completed physical render using " +
            (remote.result.encoder || "configured encoder") +
            ".",
          sha256Proof: artifact.sha256,
          verifiedAt: new Date().toISOString(),
          rawReceipt: remote.result as Record<string, any>,
        };
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    } catch (error: any) {
      return this.failedReceipt(
        job,
        executionId,
        1,
        error?.message || String(error),
        Date.now() - startedAt
      );
    } finally {
      this.activeJobs = Math.max(0, this.activeJobs - 1);
    }
  }

  private failedReceipt(
    job: ComputeJob,
    executionId: string,
    exitCode: number,
    reason: string,
    totalTimeMs = 0,
    rawReceipt?: unknown
  ): ExecutionReceipt {
    return {
      receiptId: "rcpt_" + executionId,
      executionId,
      jobId: job.jobId,
      factoryExecutionId: job.factoryExecutionId,
      providerId: this.id,
      providerType: this.type,
      executionModel: this.executionModel,
      status: "FAILED",
      exitCode,
      outputArtifacts: [],
      metrics: {
        startupTimeMs: 0,
        executionTimeMs: 0,
        transferTimeMs: 0,
        totalTimeMs,
      },
      failureReason: reason,
      rawReceipt:
        rawReceipt && typeof rawReceipt === "object"
          ? (rawReceipt as Record<string, any>)
          : undefined,
    };
  }

  private async stageLocalInputs(
    jobId: string,
    intent: Record<string, any>,
    onProgress?: (msg: string) => void
  ): Promise<Record<string, any>> {
    const clone = JSON.parse(JSON.stringify(intent));
    const replacements = new Map<string, string>();
    const filePaths = new Set<string>();

    const allowedRoots = [
      path.resolve(process.cwd(), "data"),
      path.resolve(process.cwd(), "generated"),
      path.resolve(process.cwd(), "public"),
    ];

    const walk = (value: any, key = ""): void => {
      if (typeof value === "string") {
        if (
          key !== "output_path" &&
          path.isAbsolute(value) &&
          allowedRoots.some((root) => value === root || value.startsWith(root + path.sep))
        ) {
          filePaths.add(path.resolve(value));
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) walk(item, key);
        return;
      }

      if (value && typeof value === "object") {
        for (const [childKey, childValue] of Object.entries(value)) {
          walk(childValue, childKey);
        }
      }
    };

    walk(clone);

    for (const filePath of filePaths) {
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        if (stat.size > Number(process.env.AMD_MAX_INPUT_FILE_MB || 250) * 1024 * 1024) {
          throw new Error(
            "AMD input file is too large to stage: " + filePath
          );
        }

        const staged = await this.adapter.uploadInput(jobId, filePath);
        replacements.set(filePath, staged.remotePath);
        onProgress?.("Staged AMD input: " + path.basename(filePath));
      } catch (error: any) {
        throw new Error(
          "Failed to stage AMD input " +
            filePath +
            ": " +
            (error?.message || String(error))
        );
      }
    }

    const replace = (value: any): any => {
      if (typeof value === "string") {
        return replacements.get(path.resolve(value)) || value;
      }
      if (Array.isArray(value)) {
        return value.map(replace);
      }
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, replace(v)])
        );
      }
      return value;
    };

    return replace(clone);
  }
}
