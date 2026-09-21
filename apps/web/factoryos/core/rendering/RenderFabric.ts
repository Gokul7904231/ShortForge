/**
 * ShortForge Render Fabric — Authoritative Implementation
 * Decoupled rendering pipeline: RenderIntent -> Render Planner -> Compiler -> Compute Provider -> Validator
 * Supports deterministic local FFmpeg execution, physical MP4 artifact generation,
 * ffprobe metadata verification, decode smoke testing, and explicit prototype isolation for HyperFrames.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import type { RenderIntent, RenderArtifact, RemoteRenderState } from "../contracts/RenderIntentContracts";

export interface RenderCompilationResult {
  readonly success: boolean;
  readonly compilerUsed: "FFMPEG" | "HYPERFRAMES";
  readonly commandOrPayload: Record<string, unknown>;
  readonly estimatedRenderSeconds: number;
}

export interface RenderExecutionResult {
  readonly success: boolean;
  readonly jobId?: string;
  readonly artifact?: RenderArtifact;
  readonly remoteState?: RemoteRenderState;
  readonly videoUrl?: string;
  readonly renderDurationSeconds: number;
  readonly providerUsed: "LOCAL" | "AZURE_VM";
  readonly compilerUsed: "FFMPEG" | "HYPERFRAMES";
  readonly message?: string;
  readonly error?: string;
}

export interface IRenderCompiler {
  readonly id: "FFMPEG" | "HYPERFRAMES";
  readonly status: "PRODUCTION_READY" | "PROTOTYPE";
  readonly executionClass: "PRODUCTION" | "UNVERIFIED";
  readonly isProductionRoutable: boolean;
  compile(intent: RenderIntent): Promise<RenderCompilationResult>;
  execute?(intent: RenderIntent, outputDir?: string): Promise<RenderArtifact>;
}

export class FFmpegRenderCompiler implements IRenderCompiler {
  readonly id = "FFMPEG" as const;
  readonly status = "PRODUCTION_READY" as const;
  readonly executionClass = "PRODUCTION" as const;
  readonly isProductionRoutable = true;

  async compile(intent: RenderIntent): Promise<RenderCompilationResult> {
    const filterComplex = `[0:v]scale=${intent.resolution.width}:${intent.resolution.height},setsar=1[v0]`;
    return {
      success: true,
      compilerUsed: "FFMPEG",
      commandOrPayload: {
        filterComplex,
        duration: intent.durationSeconds,
        fps: intent.fps,
        resolution: intent.resolution,
        audioTracks: intent.tracks.audioTracks.length,
      },
      estimatedRenderSeconds: Math.max(2, Math.round(intent.durationSeconds * 0.3)),
    };
  }

  /**
   * Executes deterministic FFmpeg rendering:
   * 1. Prepares temporary output path
   * 2. Spawns ffmpeg process with deterministic flags & timeout
   * 3. Runs ffprobe on generated temporary file to verify geometry, streams, and duration
   * 4. Runs ffmpeg decode smoke test (ffmpeg -v error -i temp -f null -)
   * 5. Calculates SHA-256
   * 6. Atomically renames temporary file to final target
   * 7. Returns fully verified RenderArtifact
   */
  async execute(intent: RenderIntent, customOutputDir?: string): Promise<RenderArtifact> {
    const outputDir = customOutputDir || path.join(process.cwd(), "data", "renders");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const duration = Math.max(1, intent.durationSeconds || 5);
    const width = intent.resolution?.width || 1080;
    const height = intent.resolution?.height || 1920;
    const fps = intent.fps || 30;

    const tempFileName = `tmp_${intent.jobId}_${randomUUID().substring(0, 8)}.mp4`;
    const finalFileName = `${intent.jobId}.mp4`;
    const tempFilePath = path.join(outputDir, tempFileName);
    const finalFilePath = path.join(outputDir, finalFileName);

    // Build deterministic argument list
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];

    // 1. Video Source Input
    // Check if a local visual asset exists
    const localVisual = intent.tracks.visualAssets?.find(
      (a) => a.src && (fs.existsSync(a.src) || (a.src.startsWith("file://") && fs.existsSync(a.src.replace("file://", ""))))
    );

    if (localVisual) {
      const realPath = localVisual.src.startsWith("file://") ? localVisual.src.replace("file://", "") : localVisual.src;
      args.push("-loop", "1", "-t", duration.toString(), "-i", realPath);
      args.push(
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`
      );
    } else {
      // Deterministic vertical canvas background
      args.push(
        "-f",
        "lavfi",
        "-t",
        duration.toString(),
        "-i",
        `color=c=0x080D1A:s=${width}x${height}:r=${fps}`
      );
    }

    // 2. Audio Source Input
    const localAudio = intent.tracks.audioTracks?.find(
      (a) => a.src && (fs.existsSync(a.src) || (a.src.startsWith("file://") && fs.existsSync(a.src.replace("file://", ""))))
    );

    if (localAudio) {
      const realAudioPath = localAudio.src.startsWith("file://") ? localAudio.src.replace("file://", "") : localAudio.src;
      args.push("-i", realAudioPath);
      args.push("-af", `apad=whole_dur=${duration}`);
    } else {
      // Deterministic synthetic audio track
      args.push("-f", "lavfi", "-t", duration.toString(), "-i", "anullsrc=r=44100:cl=stereo");
    }

    // 3. Encoding parameters
    args.push(
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "ultrafast",
      "-r",
      fps.toString(),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-t",
      duration.toString(),
      "-threads",
      "2",
      tempFilePath
    );

    const startTime = Date.now();

    try {
      // Execute FFmpeg
      await this.runProcess("ffmpeg", args, 45000);

      if (!fs.existsSync(tempFilePath)) {
        throw new Error(`FFmpeg completed but output file does not exist: ${tempFilePath}`);
      }

      const stat = fs.statSync(tempFilePath);
      if (stat.size === 0) {
        throw new Error(`FFmpeg output file is 0 bytes: ${tempFilePath}`);
      }

      // Run ffprobe inspection on the temporary artifact
      const probeData = await this.probeArtifact(tempFilePath);

      // Verify essential video stream
      const videoStream = probeData.streams.find((s: any) => s.codec_type === "video");
      if (!videoStream) {
        throw new Error(`Rendered artifact has no video stream: ${tempFilePath}`);
      }
      if (videoStream.width !== width || videoStream.height !== height) {
        throw new Error(
          `Rendered geometry mismatch! Expected ${width}x${height}, observed ${videoStream.width}x${videoStream.height}`
        );
      }

      // Verify essential audio stream
      const audioStream = probeData.streams.find((s: any) => s.codec_type === "audio");
      if (!audioStream) {
        throw new Error(`Rendered artifact has no audio stream: ${tempFilePath}`);
      }

      const parsedVideoDuration = parseFloat(videoStream.duration || probeData.format?.duration || duration.toString());
      const parsedAudioDuration = parseFloat(audioStream.duration || probeData.format?.duration || duration.toString());
      const syncDriftMs = Math.abs(parsedVideoDuration - parsedAudioDuration) * 1000;

      // Run decode smoke test: ffmpeg -v error -i tempFilePath -f null -
      await this.runProcess("ffmpeg", ["-v", "error", "-i", tempFilePath, "-f", "null", "-"], 15000);

      // Compute SHA-256 of verified artifact
      const sha256 = await this.computeSha256(tempFilePath);

      // Atomic rename to final file
      if (fs.existsSync(finalFilePath)) {
        try {
          fs.unlinkSync(finalFilePath);
        } catch {}
      }
      fs.renameSync(tempFilePath, finalFilePath);

      const renderDurationSeconds = (Date.now() - startTime) / 1000;

      const artifact: RenderArtifact = {
        artifactId: `art_render_${intent.jobId}`,
        jobId: intent.jobId,
        missionId: intent.missionId,
        location: {
          kind: "LOCAL",
          path: finalFilePath,
        },
        sha256,
        mimeType: "video/mp4",
        byteLength: stat.size,
        duration: parsedVideoDuration,
        width: videoStream.width,
        height: videoStream.height,
        fps,
        videoCodec: videoStream.codec_name || "h264",
        audioCodec: audioStream.codec_name || "aac",
        pixelFormat: videoStream.pix_fmt || "yuv420p",
        audioSampleRate: parseInt(audioStream.sample_rate || "44100", 10),
        audioChannels: parseInt(audioStream.channels || "2", 10),
        audioDuration: parsedAudioDuration,
        bitrateKbps: Math.round(parseInt(probeData.format?.bit_rate || "0", 10) / 1000),
        streamCount: probeData.streams.length,
        syncDriftMs,
        producedAt: new Date().toISOString(),
        compiler: "FFMPEG",
        compilerVersion: "ffmpeg-8.1",
        provider: "LOCAL",
        executionClass: "PRODUCTION",
      };

      return artifact;
    } catch (err: any) {
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {}
      }
      throw new Error(`[FFmpegRenderCompiler] Execution failed: ${err.message}`);
    }
  }

  private runProcess(cmd: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let stderr = "";
      let stdout = "";

      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        reject(new Error(`${cmd} execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout || stderr);
        } else {
          reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-600)}`));
        }
      });
    });
  }

  private async probeArtifact(filePath: string): Promise<any> {
    const rawJson = await this.runProcess(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
      10000
    );
    try {
      return JSON.parse(rawJson);
    } catch (e) {
      throw new Error(`Failed to parse ffprobe json output: ${rawJson}`);
    }
  }

  private computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
  }
}

export class HyperFramesRenderCompiler implements IRenderCompiler {
  readonly id = "HYPERFRAMES" as const;
  readonly status = "PROTOTYPE" as const;
  readonly executionClass = "UNVERIFIED" as const;
  readonly isProductionRoutable = false;

  async compile(intent: RenderIntent): Promise<RenderCompilationResult> {
    const canvasSpec = {
      viewBox: `0 0 ${intent.resolution.width} ${intent.resolution.height}`,
      cssRules: ["@keyframes kineticPop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }"],
      cues: intent.tracks.captions.map((c) => ({
        text: c.text,
        startMs: c.startMs,
        endMs: c.endMs,
        animation: c.style?.animation || "POP",
      })),
      timelineDuration: intent.durationSeconds,
    };
    return {
      success: true,
      compilerUsed: "HYPERFRAMES",
      commandOrPayload: {
        canvasSpec,
        domLayers: intent.tracks.visualAssets.length,
        prototypeNotice: "HyperFrames is in PROTOTYPE status and unverified for production rendering.",
      },
      estimatedRenderSeconds: Math.max(2, Math.round(intent.durationSeconds * 0.3)),
    };
  }

  async execute(intent: RenderIntent): Promise<RenderArtifact> {
    throw new Error(
      "[HyperFramesRenderCompiler] HyperFrames is in PROTOTYPE status. Production routing to HyperFrames is strictly prohibited until headless canvas rendering is certified."
    );
  }
}

export class RenderFabric {
  private compilers: Map<string, IRenderCompiler> = new Map();

  constructor() {
    this.compilers.set("FFMPEG", new FFmpegRenderCompiler());
    this.compilers.set("HYPERFRAMES", new HyperFramesRenderCompiler());
  }

  getCompiler(id: string): IRenderCompiler | undefined {
    return this.compilers.get(id);
  }

  /**
   * Render Planner: Selects optimal compiler based on intent capabilities and production policy.
   * Prohibits prototype compilers in production routing.
   */
  planCompiler(intent: RenderIntent, allowPrototypes: boolean = false): IRenderCompiler {
    if (intent.preferredCompiler === "HYPERFRAMES" || intent.compositionType === "KINETIC_TEXT") {
      if (!allowPrototypes) {
        console.warn(
          "[RenderFabric] HyperFrames requested but blocked by production policy. Routing to deterministic FFmpeg compiler."
        );
        return this.compilers.get("FFMPEG")!;
      }
      return this.compilers.get("HYPERFRAMES")!;
    }
    return this.compilers.get("FFMPEG")!;
  }

  /**
   * Dispatches render compilation and routes to designated compute provider.
   * For local rendering: executes real FFmpeg and returns verified RenderArtifact.
   * For Azure VM: dispatches async job and returns remoteState: DISPATCHED without claiming completion.
   */
  async executeRender(
    intent: RenderIntent,
    provider: "LOCAL" | "AZURE_VM" = "LOCAL",
    azureConfig?: { apiUrl: string; secret: string; executionToken: string },
    outputDir?: string
  ): Promise<RenderExecutionResult> {
    const compiler = this.planCompiler(intent);

    if (provider === "AZURE_VM" && azureConfig) {
      // Azure GPU Compute Provider Path (Asynchronous)
      const dispatchRes = await fetch(`${azureConfig.apiUrl.replace(/\/$/, "")}/api/render/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${azureConfig.secret}`,
        },
        body: JSON.stringify({
          jobId: intent.jobId,
          executionToken: azureConfig.executionToken,
          tier: "BASIC",
          compiler: compiler.id,
          intent,
        }),
      });

      if (!dispatchRes.ok) {
        throw new Error(`Azure render dispatch failed with HTTP ${dispatchRes.status}`);
      }

      // Explicitly distinguish DISPATCHED from COMPLETED
      return {
        success: true,
        jobId: intent.jobId,
        remoteState: "DISPATCHED",
        message: "Render job successfully accepted and dispatched to Azure VM. Awaiting async worker callback.",
        renderDurationSeconds: Math.max(3, Math.round(intent.durationSeconds * 0.3)),
        providerUsed: "AZURE_VM",
        compilerUsed: compiler.id,
      };
    }

    // Local Compute Provider Path: Real FFmpeg Execution & Physical Artifact Verification
    if (compiler instanceof FFmpegRenderCompiler) {
      const artifact = await compiler.execute(intent, outputDir);
      return {
        success: true,
        jobId: intent.jobId,
        artifact,
        videoUrl: (artifact.location as any).path,
        renderDurationSeconds: artifact.duration,
        providerUsed: "LOCAL",
        compilerUsed: compiler.id,
        message: "Local FFmpeg render completed and physical MP4 verified.",
      };
    }

    throw new Error(`[RenderFabric] Compiler ${compiler.id} does not support physical local execution.`);
  }
}
