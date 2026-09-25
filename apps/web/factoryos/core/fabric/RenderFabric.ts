/**
 * FactoryOS Floor 06 — Canonical Render Fabric
 *
 * Single production rendering entry point:
 *   RenderIntent -> compiler planning -> ComputeGateway -> ComputeRouter -> provider -> artifact receipt
 *
 * Compiler selection lives here.
 * Physical execution/provider selection lives in the distributed Compute Fabric.
 * Worker lifecycle, leases, fencing, reconciliation, and CAS remain in core/fabric + core/compute.
 */

import * as path from "node:path";
import type {
  RenderIntent,
  RenderArtifact,
} from "../contracts/RenderIntentContracts";
import { ComputeGateway } from "../compute/gateway/ComputeGateway";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderType,
} from "../compute/contracts/ComputeContracts";
import type { LocalRenderIntent } from "../render/LocalRenderAdapter";

export interface RenderCompilationResult {
  readonly success: boolean;
  readonly compilerUsed: "FFMPEG" | "HYPERFRAMES";
  readonly commandOrPayload: Record<string, unknown>;
  readonly estimatedRenderSeconds: number;
}

export interface RenderExecutionResult {
  readonly success: boolean;
  readonly jobId: string;
  readonly artifact?: RenderArtifact;
  readonly videoUrl?: string;
  readonly renderDurationSeconds: number;
  readonly providerUsed: "DISTRIBUTED";
  readonly compilerUsed: "FFMPEG" | "HYPERFRAMES";
  readonly receipt: ExecutionReceipt;
  readonly message?: string;
}

export interface IRenderCompiler {
  readonly id: "FFMPEG" | "HYPERFRAMES";
  readonly status: "PRODUCTION_READY" | "PROTOTYPE";
  readonly executionClass: "PRODUCTION" | "UNVERIFIED";
  readonly isProductionRoutable: boolean;
  compile(intent: RenderIntent): Promise<RenderCompilationResult>;
}

export class FFmpegRenderCompiler implements IRenderCompiler {
  readonly id = "FFMPEG" as const;
  readonly status = "PRODUCTION_READY" as const;
  readonly executionClass = "PRODUCTION" as const;
  readonly isProductionRoutable = true;

  async compile(intent: RenderIntent): Promise<RenderCompilationResult> {
    return {
      success: true,
      compilerUsed: "FFMPEG",
      commandOrPayload: {
        duration: intent.durationSeconds,
        fps: intent.fps,
        resolution: intent.resolution,
        audioTracks: intent.tracks.audioTracks.length,
        visualAssets: intent.tracks.visualAssets.length,
      },
      estimatedRenderSeconds: Math.max(2, Math.round(intent.durationSeconds * 0.3)),
    };
  }
}

export class HyperFramesRenderCompiler implements IRenderCompiler {
  readonly id = "HYPERFRAMES" as const;
  readonly status = "PROTOTYPE" as const;
  readonly executionClass = "UNVERIFIED" as const;
  readonly isProductionRoutable = false;

  async compile(intent: RenderIntent): Promise<RenderCompilationResult> {
    return {
      success: true,
      compilerUsed: "HYPERFRAMES",
      commandOrPayload: {
        viewBox: `0 0 ${intent.resolution.width} ${intent.resolution.height}`,
        cues: intent.tracks.captions.map((cue) => ({
          text: cue.text,
          startMs: cue.startMs,
          endMs: cue.endMs,
          animation: cue.style?.animation || "POP",
        })),
        timelineDuration: intent.durationSeconds,
        prototypeNotice:
          "HyperFrames is prototype-only and cannot be physically executed through the production Render Fabric.",
      },
      estimatedRenderSeconds: Math.max(2, Math.round(intent.durationSeconds * 0.3)),
    };
  }
}

export interface RenderFabricExecutionOptions {
  readonly localRenderIntent?: LocalRenderIntent;
  readonly preferredProviderType?: ProviderType;
  readonly outputDir?: string;
}

export class RenderFabric {
  private readonly compilers = new Map<string, IRenderCompiler>();
  private readonly computeGateway: ComputeGateway;

  constructor() {
    this.compilers.set("FFMPEG", new FFmpegRenderCompiler());
    this.compilers.set("HYPERFRAMES", new HyperFramesRenderCompiler());
    this.computeGateway = ComputeGateway.getInstance();
  }

  public getCompiler(id: string): IRenderCompiler | undefined {
    return this.compilers.get(id);
  }

  public getComputeRouter() {
    return this.computeGateway.getRouter();
  }

  public planCompiler(
    intent: RenderIntent,
    allowPrototypes = false
  ): IRenderCompiler {
    if (
      intent.preferredCompiler === "HYPERFRAMES" ||
      intent.compositionType === "KINETIC_TEXT"
    ) {
      if (!allowPrototypes) {
        return this.compilers.get("FFMPEG")!;
      }
      return this.compilers.get("HYPERFRAMES")!;
    }

    return this.compilers.get("FFMPEG")!;
  }

  /**
   * The only F06 physical-render entry point.
   *
   * RenderFabric never directly spawns FFmpeg or calls a provider endpoint.
   * It creates a ComputeJob and delegates to ComputeRouter.
   */
  public async executeRender(
    intent: RenderIntent,
    options: RenderFabricExecutionOptions = {}
  ): Promise<RenderExecutionResult> {
    const compiler = this.planCompiler(intent);

    if (!compiler.isProductionRoutable) {
      throw new Error(
        `[RenderFabric] Compiler ${compiler.id} is not production-routable.`
      );
    }

    const compilation = await compiler.compile(intent);
    if (!compilation.success) {
      throw new Error(
        `[RenderFabric] Compiler ${compiler.id} failed to produce a render plan.`
      );
    }

    const localRenderIntent =
      options.localRenderIntent ||
      this.normalizeLocalRenderIntent(
        intent,
        options.outputDir
          ? path.join(options.outputDir, `${intent.jobId}.mp4`)
          : undefined
      );

    const computeJob: ComputeJob = {
      jobId: intent.jobId,
      factoryExecutionId: `factory_render_${intent.intentId}`,
      missionId: intent.missionId,
      workloadType: "RENDER",
      manifest: {
        renderIntent: intent,
        localRenderIntent,
        compilerPlan: compilation.commandOrPayload,
      },
      inputArtifacts: {
        bundleId: `bundle_${intent.intentId}`,
        artifacts: [],
        createdTimestamp: Date.now(),
      },
      requirements: {
        workloadType: "RENDER",
        gpuRequired: intent.constraints.hardwareAccel === true,
        estimatedDurationSeconds: intent.durationSeconds,
        networkAccessRequired: false,
        diskSpaceMb: 1024,
      },
      priority: "HIGH",
      timeoutMs: Math.max(60000, Math.ceil(intent.durationSeconds * 5000)),
      createdAt: intent.createdAt,
    };

    const startedAt = Date.now();
    const { receipt } = await this.computeGateway.submitJob(
      computeJob,
      (message) => console.debug(`[RenderFabric] ${message}`),
      options.preferredProviderType
    );

    if (receipt.status !== "COMPLETED") {
      throw new Error(
        `[RenderFabric] ComputeRouter did not complete the render: ${receipt.failureReason || receipt.status}`
      );
    }

    const artifactRef = receipt.outputArtifacts[0];
    if (!artifactRef?.sha256 || !artifactRef.uri) {
      throw new Error(
        "[RenderFabric] Provider returned COMPLETED without a physical artifact receipt."
      );
    }

    const raw = receipt.rawReceipt || {};
    const validation = raw.validation || {};

    const artifact: RenderArtifact = {
      artifactId: artifactRef.artifactId,
      jobId: intent.jobId,
      missionId: intent.missionId,
      location: { kind: "LOCAL", path: artifactRef.uri },
      sha256: artifactRef.sha256,
      mimeType: artifactRef.mimeType === "video/webm" ? "video/webm" : "video/mp4",
      byteLength: artifactRef.byteLength,
      duration: Number(
        validation.duration_seconds || raw.duration_seconds || intent.durationSeconds
      ),
      width: Number(validation.width || raw.width || intent.resolution.width),
      height: Number(validation.height || raw.height || intent.resolution.height),
      fps: Number(validation.fps || raw.fps || intent.fps),
      videoCodec: String(validation.codec || raw.video_codec || "h264"),
      audioCodec: raw.audio_codec ? String(raw.audio_codec) : "aac",
      producedAt: new Date().toISOString(),
      compiler: compiler.id,
      compilerVersion: String(raw.renderer_version || "distributed"),
      provider: "DISTRIBUTED",
      executionClass: "PRODUCTION",
    };

    return {
      success: true,
      jobId: intent.jobId,
      artifact,
      videoUrl: artifactRef.uri,
      renderDurationSeconds: receipt.metrics.totalTimeMs
        ? receipt.metrics.totalTimeMs / 1000
        : (Date.now() - startedAt) / 1000,
      providerUsed: "DISTRIBUTED",
      compilerUsed: compiler.id,
      receipt,
      message: `ComputeRouter routed ${intent.jobId} through ${receipt.providerId} and returned verified artifact ${artifactRef.sha256}.`,
    };
  }

  private normalizeLocalRenderIntent(
    intent: RenderIntent,
    explicitOutputPath?: string
  ): LocalRenderIntent {
    const captionText = intent.tracks.captions
      .map((cue) => cue.text.trim())
      .filter(Boolean)
      .join(" ");

    const scenes =
      intent.tracks.visualAssets.length > 0
        ? intent.tracks.visualAssets.map((asset) => {
            const overlappingCues = intent.tracks.captions.filter(
              (cue) =>
                cue.startMs < (asset.startSeconds + asset.durationSeconds) * 1000 &&
                cue.endMs > asset.startSeconds * 1000
            );

            return {
              scene_id: asset.id,
              template_id: `render.${asset.type.toLowerCase()}.v1`,
              narration_text:
                overlappingCues
                  .map((cue) => cue.text.trim())
                  .filter(Boolean)
                  .join(" ") ||
                captionText ||
                intent.compositionType,
              duration_seconds: asset.durationSeconds,
              shots: [
                {
                  id: `shot_${asset.id}`,
                  recipe_id: "RENDER_ASSET",
                  start_seconds: 0,
                  duration_seconds: asset.durationSeconds,
                  props: {
                    source: asset.src,
                    assetType: asset.type,
                    transform: asset.transform,
                  },
                },
              ],
            };
          })
        : [
            {
              scene_id: "scene_01",
              template_id: "facts.rapid-facts.v1",
              narration_text: captionText || intent.compositionType,
              duration_seconds: intent.durationSeconds,
              shots: [],
            },
          ];

    const primaryAudio = intent.tracks.audioTracks[0];

    return {
      project_id: intent.missionId || intent.intentId,
      title: `ShortForge ${intent.compositionType}`,
      output_path:
        explicitOutputPath ||
        path.join(process.cwd(), "data", "renders", `${intent.jobId}.mp4`),
      scenes,
      output: {
        width: intent.resolution.width,
        height: intent.resolution.height,
        fps: intent.fps,
        video_codec: "h264",
        audio_codec: "aac",
      },
      safe_area: {
        top: 160,
        bottom: 320,
        left: 60,
        right: 120,
      },
      metadata: {
        intentId: intent.intentId,
        compositionType: intent.compositionType,
        captions: intent.tracks.captions,
        audioTrack: primaryAudio,
      },
    };
  }
}
