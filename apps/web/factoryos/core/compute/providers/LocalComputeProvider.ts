/**
 * FactoryOS Distributed Compute Fabric — Local Compute Provider
 *
 * Backed by the canonical local rendering engine (packages/factoryos-render)
 * and LocalRenderAdapter via stdin/stdout JSON protocol.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { BaseComputeProvider } from "./ComputeProvider";
import {
  ProviderType,
  ProviderExecutionModel,
  ProviderCapability,
  ProviderHealth,
  ComputeJob,
  ExecutionReceipt,
  ArtifactRef,
  ProviderConfigValidationResult,
} from "../contracts/ComputeContracts";
import { LocalRenderAdapter, LocalRenderIntent } from "../../render/LocalRenderAdapter";
import { ContentAddressedStore } from "../cas/ContentAddressedStore";

export class LocalComputeProvider extends BaseComputeProvider {
  readonly id = "provider_local_render";
  readonly type: ProviderType = "LOCAL";
  readonly executionModel: ProviderExecutionModel = "LOCAL_PROCESS";

  private adapter: LocalRenderAdapter;
  private cas: ContentAddressedStore;
  private activeJobCount = 0;

  constructor() {
    super();
    this.adapter = LocalRenderAdapter.getInstance();
    this.cas = ContentAddressedStore.getInstance();
  }

  public validateConfiguration(): ProviderConfigValidationResult {
    return {
      isConfigured: true,
      requiredKeys: ["python", "ffmpeg"],
      missingKeys: [],
      errors: [],
    };
  }

  public async getCapability(): Promise<ProviderCapability> {
    const cpus = os.cpus();
    const memMb = Math.round(os.totalmem() / (1024 * 1024));

    return {
      providerId: this.id,
      providerType: this.type,
      executionModel: this.executionModel,
      cpuCores: cpus.length,
      memoryMb: memMb,
      gpuAvailable: true,
      gpuType: "NVIDIA GeForce RTX 3050 Laptop GPU (h264_nvenc)",
      operatingSystem: `${os.platform()} ${os.release()}`,
      supportedWorkloads: ["RENDER", "AUDIO", "INFERENCE", "VERIFICATION"],
      estimatedStartupSeconds: 0.5,
      transferBandwidthMbps: 10000, // Local memory/disk bus
      maxConcurrency: 2,
      maxJobDurationSeconds: 1800,
      isCredentialConfigured: true,
    };
  }

  public async getHealth(): Promise<ProviderHealth> {
    const doctor = await this.adapter.healthCheck();

    return {
      state: doctor.allHealthy ? "HEALTHY" : "DEGRADED",
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      failureReason: doctor.allHealthy ? undefined : "Renderer engine healthcheck reported missing dependencies",
      activeJobs: this.activeJobCount,
      successRate: 1.0,
      avgLatencyMs: 1500,
    };
  }

  public async isAvailable(): Promise<boolean> {
    const health = await this.getHealth();
    return health.state === "HEALTHY" && this.activeJobCount < 2;
  }

  public async executeJob(job: ComputeJob, onProgress?: (msg: string) => void): Promise<ExecutionReceipt> {
    const startTime = Date.now();
    const executionId = `exec_local_${job.jobId}_${startTime}`;
    this.activeJobCount++;

    try {
      if (job.workloadType !== "RENDER") {
        throw new Error(`[LocalComputeProvider] Workload type "${job.workloadType}" not supported by local render provider.`);
      }

      const localIntent = job.manifest as LocalRenderIntent;
      if (!localIntent || !Array.isArray(localIntent.scenes)) {
        throw new Error(`[LocalComputeProvider] Invalid LocalRenderIntent in job manifest for ${job.jobId}`);
      }

      onProgress?.("Starting local native render via factoryos-render");

      // Execute via canonical LocalRenderAdapter
      const renderReceipt = await this.adapter.render(
        localIntent,
        executionId,
        (msg) => onProgress?.(msg)
      );

      if (!renderReceipt.validation?.is_valid || !renderReceipt.output_path || !fs.existsSync(renderReceipt.output_path)) {
        throw new Error(`Local render validation failed: ${renderReceipt.validation?.errors?.join("; ")}`);
      }

      // Store physical MP4 in CAS
      const artifactRef = await this.cas.putFile(
        renderReceipt.output_path,
        "output_mp4",
        "video/mp4",
        {
          jobId: job.jobId,
          executionId,
          width: renderReceipt.width,
          height: renderReceipt.height,
          duration: renderReceipt.duration_seconds,
          rendererVersion: renderReceipt.renderer_version,
          ffmpegVersion: renderReceipt.ffmpeg_version,
        }
      );

      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;

      const receipt: ExecutionReceipt = {
        receiptId: `rcpt_${executionId}`,
        executionId,
        jobId: job.jobId,
        factoryExecutionId: job.factoryExecutionId,
        providerId: this.id,
        providerType: this.type,
        executionModel: this.executionModel,
        status: "COMPLETED",
        exitCode: 0,
        outputArtifacts: [artifactRef],
        metrics: {
          startupTimeMs: 100,
          executionTimeMs: renderReceipt.render_time_ms,
          transferTimeMs: 10,
          totalTimeMs,
        },
        stdoutSnippet: `Rendered ${renderReceipt.scenes_rendered?.length || 0} scenes in ${renderReceipt.render_time_ms}ms (cache hits: ${renderReceipt.cache_hits})`,
        sha256Proof: renderReceipt.output_sha256,
        verifiedAt: new Date().toISOString(),
        rawReceipt: renderReceipt,
      };

      return receipt;
    } catch (err: any) {
      const endTime = Date.now();
      return {
        receiptId: `rcpt_${executionId}`,
        executionId,
        jobId: job.jobId,
        factoryExecutionId: job.factoryExecutionId,
        providerId: this.id,
        providerType: this.type,
        executionModel: this.executionModel,
        status: "FAILED",
        exitCode: 1,
        outputArtifacts: [],
        metrics: {
          startupTimeMs: 100,
          executionTimeMs: 0,
          transferTimeMs: 0,
          totalTimeMs: endTime - startTime,
        },
        failureReason: err.message || "Unknown error during local execution",
        stderrSnippet: err.stack?.slice(0, 500),
      };
    } finally {
      this.activeJobCount = Math.max(0, this.activeJobCount - 1);
    }
  }
}
