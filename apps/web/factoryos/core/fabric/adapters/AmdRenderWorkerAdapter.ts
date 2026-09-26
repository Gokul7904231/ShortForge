/**
 * FactoryOS Render Fabric — AMD Remote Worker Adapter
 *
 * Provider-neutral control-plane adapter for a real AMD render worker.
 * The web/control-plane process never assumes it has an AMD GPU locally.
 *
 * Connection contract:
 *   AMD_WORKER_URL    -> https://<amd-worker>/...
 *   AMD_WORKER_SECRET -> bearer credential
 *
 * The AMD host exposes:
 *   GET  /health
 *   GET  /ready
 *   GET  /capabilities
 *   POST /api/factoryos/render/jobs
 *   GET  /api/factoryos/render/jobs/:jobId
 *   GET  /api/factoryos/render/jobs/:jobId/artifact
 */

import {
  WorkerCapability,
  WorkerState,
  RenderJob,
  RenderAttempt,
} from "../contracts/RenderFabricContracts";
import { IRenderWorker } from "../worker/RenderWorkerContract";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface AmdRemoteCapabilities {
  ready: boolean;
  workerId: string;
  gpuVendor: "AMD";
  gpuModel: string;
  vramMb: number;
  gpuCount: number;
  cpuCores: number;
  memoryMb: number;
  rocmVersion?: string;
  ffmpegAvailable: boolean;
  videoEncoder?: string;
  hardwareVideoEncode?: boolean;
  maxConcurrency: number;
  isEphemeral: boolean;
}

export interface AmdRemoteJobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  error?: string;
  result?: {
    artifactSha256?: string;
    byteLength?: number;
    videoUrl?: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
    encoder?: string;
    renderTimeMs?: number;
  };
}

export interface AmdRenderSubmission {
  jobId: string;
  executionId: string;
  localRenderIntent: Record<string, any>;
  compilerPlan?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class AmdRenderWorkerAdapter implements IRenderWorker {
  readonly workerId: string;
  private readonly workerUrl?: string;
  private readonly workerSecret?: string;
  private state: WorkerState = "OFFLINE";
  private readonly pollIntervalMs: number;

  constructor(workerId?: string) {
    this.workerId =
      workerId ||
      process.env.AMD_WORKER_ID ||
      "worker_amd_remote_" + Date.now();

    this.workerUrl = this.normalizeUrl(process.env.AMD_WORKER_URL);
    this.workerSecret = process.env.AMD_WORKER_SECRET;
    this.pollIntervalMs = Math.max(
      250,
      Number(process.env.AMD_WORKER_POLL_MS || 1000)
    );

    if (this.workerUrl && this.workerSecret) {
      this.state = "BOOTING";
    }
  }

  public getState(): WorkerState {
    return this.state;
  }

  public getConfigurationStatus(): {
    isConfigured: boolean;
    error?: string;
  } {
    if (!this.workerUrl) {
      return {
        isConfigured: false,
        error: "AMD_WORKER_URL is not configured.",
      };
    }

    if (!this.workerSecret) {
      return {
        isConfigured: false,
        error: "AMD_WORKER_SECRET is not configured.",
      };
    }

    return { isConfigured: true };
  }

  public async getCapabilities(): Promise<WorkerCapability> {
    const remote = await this.fetchJson<AmdRemoteCapabilities>("/capabilities");

    return {
      workerId: remote.workerId || this.workerId,
      providerType: "AMD",
      gpuVendor: "AMD",
      gpuModel: remote.gpuModel || "AMD GPU",
      vramMb: Number(remote.vramMb || 0),
      gpuCount: Number(remote.gpuCount || 0),
      cpuCores: Number(remote.cpuCores || 0),
      memoryMb: Number(remote.memoryMb || 0),
      rocmVersion: remote.rocmVersion,
      ffmpegAvailable: Boolean(remote.ffmpegAvailable),
      videoEncoder: remote.videoEncoder,
      hardwareVideoEncode: remote.videoEncoder === "h264_vaapi",
      supportedCodecs: ["h264", "hevc", "av1"],
      supportedWorkloads: ["video.render"],
      maxConcurrency: Number(remote.maxConcurrency || 1),
      estimatedRemainingLifetimeSeconds: remote.isEphemeral
        ? 86400
        : 86400 * 365,
      isEphemeral: Boolean(remote.isEphemeral),
    };
  }

  public async heartbeat(): Promise<{
    acknowledged: boolean;
    state: WorkerState;
  }> {
    const config = this.getConfigurationStatus();
    if (!config.isConfigured) {
      this.state = "OFFLINE";
      return { acknowledged: false, state: this.state };
    }

    try {
      const ready = await this.fetchJson<{
        status?: string;
        workerId?: string;
      }>("/ready");

      if (ready.status === "ready") {
        this.state = "READY";
        return { acknowledged: true, state: this.state };
      }

      this.state = "DEGRADED";
      return { acknowledged: false, state: this.state };
    } catch {
      this.state = "OFFLINE";
      return { acknowledged: false, state: this.state };
    }
  }

  public async submitRender(
    request: AmdRenderSubmission
  ): Promise<{ jobId: string; status: string }> {
    const response = await this.fetchJson<{ jobId: string; status: string }>(
      "/api/factoryos/render/jobs",
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );

    this.state = "RUNNING";
    return response;
  }

  public async uploadInput(jobId: string, filePath: string): Promise<{
    remotePath: string;
    sha256: string;
    byteLength: number;
  }> {
    const bytes = await fs.readFile(filePath);

    const response = await this.fetchRaw("/api/factoryos/render/inputs", {
      method: "POST",
      headers: {
        "X-Job-Id": jobId,
        "X-Filename": path.basename(filePath),
        "Content-Type": "application/octet-stream",
      },
      body: bytes as unknown as BodyInit,
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        "[AmdRenderWorkerAdapter] AMD input upload failed HTTP " +
          response.status +
          ": " +
          text.slice(0, 500)
      );
    }

    return JSON.parse(text) as {
      remotePath: string;
      sha256: string;
      byteLength: number;
    };
  }

  public async getRemoteJobStatus(
    jobId: string
  ): Promise<AmdRemoteJobStatus> {
    return this.fetchJson<AmdRemoteJobStatus>(
      "/api/factoryos/render/jobs/" + encodeURIComponent(jobId)
    );
  }

  public async waitForCompletion(
    jobId: string,
    timeoutMs: number
  ): Promise<AmdRemoteJobStatus> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.getRemoteJobStatus(jobId);

      if (
        status.status === "completed" ||
        status.status === "failed" ||
        status.status === "cancelled"
      ) {
        this.state = status.status === "completed" ? "READY" : "DEGRADED";
        return status;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.pollIntervalMs)
      );
    }

    this.state = "DEGRADED";
    throw new Error(
      "[AmdRenderWorkerAdapter] Remote AMD job " +
        jobId +
        " timed out after " +
        timeoutMs +
        "ms."
    );
  }

  public async downloadArtifact(jobId: string): Promise<{
    bytes: Buffer;
    sha256: string;
    contentType: string;
  }> {
    const response = await this.fetchRaw(
      "/api/factoryos/render/jobs/" +
        encodeURIComponent(jobId) +
        "/artifact"
    );

    const sha256 = response.headers.get("x-artifact-sha256");
    if (!sha256) {
      throw new Error(
        "[AmdRenderWorkerAdapter] AMD artifact response did not include X-Artifact-SHA256."
      );
    }

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      sha256,
      contentType: response.headers.get("content-type") || "video/mp4",
    };
  }

  public async execute(
    job: RenderJob,
    _attempt: RenderAttempt
  ): Promise<{
    success: boolean;
    artifactUri?: string;
    sha256?: string;
    artifactReference?: any;
    error?: string;
  }> {
    try {
      const localRenderIntent =
        ((job.manifest as any)?.localRenderIntent ||
          job.manifest) as Record<string, any>;

      if (!Array.isArray(localRenderIntent?.scenes)) {
        throw new Error(
          "AMD worker requires a LocalRenderIntent in job.manifest.localRenderIntent."
        );
      }

      await this.submitRender({
        jobId: job.jobId,
        executionId:
          "fabric_exec_" +
          job.jobId +
          "_attempt_" +
          job.activeAttemptId,
        localRenderIntent,
        compilerPlan: (job.manifest as any)?.compilerPlan,
        metadata: {
          missionId: job.missionId,
          fencingToken: job.activeFencingToken,
          workerId: this.workerId,
        },
      });

      const completed = await this.waitForCompletion(
        job.jobId,
        job.requirements.timeoutMs || 900000
      );

      if (
        completed.status !== "completed" ||
        !completed.result?.artifactSha256
      ) {
        return {
          success: false,
          error:
            completed.error ||
            "AMD worker completed without an artifact receipt.",
        };
      }

      return {
        success: true,
        artifactUri: completed.result.videoUrl,
        sha256: completed.result.artifactSha256,
        artifactReference: {
          artifactId:
            "amd_" +
            completed.result.artifactSha256.substring(0, 16),
          sha256: completed.result.artifactSha256,
          uri: completed.result.videoUrl,
          byteLength: completed.result.byteLength || 0,
        },
      };
    } catch (error: any) {
      this.state = "DEGRADED";
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  public async drain(): Promise<void> {
    this.state = "DRAINING";
  }

  public async shutdown(): Promise<void> {
    this.state = "OFFLINE";
  }

  private normalizeUrl(value?: string): string | undefined {
    if (!value) return undefined;
    return value.trim().replace(/\/+$/, "");
  }

  private async fetchJson<T>(
    requestPath: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await this.fetchRaw(requestPath, init);
    const text = await response.text();

    if (!text) {
      return {} as T;
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(
        "[AmdRenderWorkerAdapter] Invalid JSON response from AMD worker: " +
          text.slice(0, 500)
      );
    }

    if (!response.ok) {
      throw new Error(
        "[AmdRenderWorkerAdapter] AMD worker HTTP " +
          response.status +
          ": " +
          JSON.stringify(payload).slice(0, 1000)
      );
    }

    return payload as T;
  }

  private async fetchRaw(
    requestPath: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const config = this.getConfigurationStatus();
    if (!config.isConfigured) {
      throw new Error(
        "[AmdRenderWorkerAdapter] " +
          (config.error || "AMD worker is not configured.")
      );
    }

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", "Bearer " + this.workerSecret);

    if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(this.workerUrl + requestPath, {
      ...init,
      headers,
      signal: init.signal || AbortSignal.timeout(10000),
    });
  }
}
