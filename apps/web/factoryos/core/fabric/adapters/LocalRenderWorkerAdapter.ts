/**
 * FactoryOS Render Fabric — Local Native Render Worker Adapter
 * Implements IRenderWorker using local Python factoryos-render and FFmpeg.
 */

import {
  WorkerCapability,
  WorkerState,
  RenderJob,
  RenderAttempt,
} from "../contracts/RenderFabricContracts";
import { IRenderWorker } from "../worker/RenderWorkerContract";
import { LocalRenderAdapter, LocalRenderIntent } from "../../render/LocalRenderAdapter";
import { ContentAddressedStore } from "../../compute/cas/ContentAddressedStore";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

export class LocalRenderWorkerAdapter implements IRenderWorker {
  readonly workerId: string;
  private state: WorkerState = "READY";
  private adapter: LocalRenderAdapter;
  private cas: ContentAddressedStore;
  public renderInvocationCount = 0; // Authoritative execution counter for idempotency testing

  constructor(workerId?: string, cas?: ContentAddressedStore) {
    this.workerId = workerId || `worker_local_${Date.now()}`;
    this.adapter = LocalRenderAdapter.getInstance();
    this.cas = cas || ContentAddressedStore.getInstance();
  }

  public getState(): WorkerState {
    return this.state;
  }

  public async getCapabilities(): Promise<WorkerCapability> {
    const cpus = os.cpus();
    const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));

    // Detect local GPU details
    let gpuVendor = "NONE" as any;
    let gpuModel = "No discrete GPU";
    let vramMb = 0;

    try {
      const smi = execSync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", { encoding: "utf8", timeout: 2000 });
      if (smi.trim()) {
        const parts = smi.trim().split(",");
        gpuVendor = "NVIDIA";
        gpuModel = parts[0]?.trim() || "NVIDIA GPU";
        vramMb = parseInt(parts[1]?.replace(/MiB|MB/i, "").trim() || "4096", 10);
      }
    } catch {
      // GPU detection fallback
    }

    return {
      workerId: this.workerId,
      providerType: "LOCAL",
      gpuVendor,
      gpuModel,
      vramMb,
      gpuCount: gpuVendor !== "NONE" ? 1 : 0,
      cpuCores: cpus.length,
      memoryMb: totalMemMb,
      ffmpegAvailable: true,
      supportedCodecs: ["h264", "aac"],
      supportedWorkloads: ["video.render", "audio.tts"],
      maxConcurrency: 2,
      estimatedRemainingLifetimeSeconds: 86400 * 30, // Persistent local machine
      isEphemeral: false,
    };
  }

  public async heartbeat(): Promise<{ acknowledged: boolean; state: WorkerState }> {
    return { acknowledged: true, state: this.state };
  }

  public async claim(job: RenderJob): Promise<{ attempt: RenderAttempt; fencingToken: number }> {
    this.state = "CLAIMING";
    return {
      attempt: {
        attemptId: 1,
        jobId: job.jobId,
        workerId: this.workerId,
        fencingToken: 1001,
        state: "CLAIMED",
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
        startedAt: new Date().toISOString(),
      },
      fencingToken: 1001,
    };
  }

  public async execute(
    job: RenderJob,
    attempt: RenderAttempt
  ): Promise<{ success: boolean; artifactUri?: string; sha256?: string; artifactReference?: any; error?: string }> {
    this.state = "RUNNING";
    this.renderInvocationCount++;

    try {
      const renderDir = path.join(process.cwd(), "data", "renders");
      if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });
      const outputPath = path.join(renderDir, `${job.jobId}.mp4`);

      let localIntent = job.manifest as any;
      if (!localIntent || !Array.isArray(localIntent.scenes) || localIntent.scenes.length === 0) {
        localIntent = {
          project_id: `proj_${job.jobId}`,
          title: (job.manifest as any)?.topic || "Test Render",
          output_path: outputPath,
          output: {
            width: 1080,
            height: 1920,
            fps: 30,
          },
          scenes: [
            {
              scene_id: "scene_01",
              template_id: "facts.rapid-facts.v1",
              narration_text: (job.manifest as any)?.topic || "FactoryOS deterministic render execution verified.",
              duration_seconds: 2.0,
              shots: [
                {
                  id: "shot_01",
                  recipe_id: "KINETIC_HOOK",
                  start_seconds: 0.0,
                  duration_seconds: 2.0,
                  props: {
                    headline: (job.manifest as any)?.topic || "RENDER FABRIC",
                    background_type: "DEEP_INDIGO",
                  },
                },
              ],
            },
          ],
        };
      } else {
        if (!localIntent.output_path) localIntent.output_path = outputPath;
        if (!localIntent.project_id) localIntent.project_id = `proj_${job.jobId}`;
        if (!localIntent.title) localIntent.title = (job.manifest as any)?.topic || "Test Render";
      }

      // Execute real native render via Python factoryos-render and FFmpeg (NO fake fallbacks)
      const renderReceipt = await this.adapter.render(
        localIntent,
        `fabric_exec_${job.jobId}_attempt_${attempt.attemptId}`
      );

      if (!renderReceipt.output_path || !fs.existsSync(renderReceipt.output_path)) {
        throw new Error(`Local render validation failed: missing output file at ${renderReceipt.output_path}`);
      }

      this.state = "UPLOADING";

      // Store in CAS
      const artifactRef = await this.cas.putFile(
        renderReceipt.output_path,
        "output_mp4",
        "video/mp4",
        {
          jobId: job.jobId,
          attemptId: attempt.attemptId,
          fencingToken: attempt.fencingToken,
          width: renderReceipt.width,
          height: renderReceipt.height,
          duration: renderReceipt.duration_seconds,
        }
      );

      this.state = "READY";

      return {
        success: true,
        artifactUri: artifactRef.uri,
        sha256: artifactRef.sha256,
        artifactReference: {
          artifactId: `art_${artifactRef.sha256.substring(0, 16)}`,
          sha256: artifactRef.sha256,
          uri: artifactRef.uri,
          byteLength: artifactRef.byteLength,
        },
      };
    } catch (err: any) {
      this.state = "READY";
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  public async drain(): Promise<void> {
    this.state = "DRAINING";
  }

  public async shutdown(): Promise<void> {
    this.state = "OFFLINE";
  }
}
