/**
 * Floor 06 — Canonical physical render artifact verifier.
 *
 * This verifier is a pre-F07 admission gate: provider claims are treated as
 * untrusted observations until the control plane re-checks bytes and media
 * decodability from the artifact itself.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  ArtifactRef,
  ArtifactVerificationEvidence,
} from "../../compute/contracts/ComputeContracts";

const execFileAsync = promisify(execFile);

export interface RenderArtifactVerificationExpectation {
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
  durationToleranceSeconds?: number;
  videoCodec?: string;
  audioCodec?: string;
  requireAudio?: boolean;
}

export interface RenderArtifactVerificationRequest {
  artifact: ArtifactRef;
  expected?: RenderArtifactVerificationExpectation;
  approvedRoots?: string[];
}

interface FFprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

interface FFprobePayload {
  format?: {
    format_name?: string;
    duration?: string;
  };
  streams?: FFprobeStream[];
}

export class RenderArtifactVerifier {
  public static readonly verifierId = "f06_physical_render_verifier_v1";

  public async verify(
    request: RenderArtifactVerificationRequest
  ): Promise<ArtifactVerificationEvidence> {
    const checks: string[] = [];
    let artifactPath = "";

    try {
      artifactPath = await this.resolveAndContain(
        request.artifact.uri,
        request.approvedRoots || [process.cwd()]
      );

      const stat = await fs.stat(artifactPath);
      if (!stat.isFile()) {
        throw new Error("Artifact path is not a regular file.");
      }
      if (stat.size <= 0) {
        throw new Error("Artifact has zero bytes.");
      }
      checks.push("PHYSICAL_FILE_ON_DISK");

      const actualSha256 = await this.sha256(artifactPath);
      if (actualSha256 !== request.artifact.sha256) {
        throw new Error(
          `SHA-256 mismatch: receipt=${request.artifact.sha256}, physical=${actualSha256}`
        );
      }
      checks.push("SHA256_BYTE_DIGEST");

      if (request.artifact.byteLength !== stat.size) {
        throw new Error(
          `Byte-length mismatch: receipt=${request.artifact.byteLength}, physical=${stat.size}`
        );
      }
      checks.push("BYTE_LENGTH_MATCH");

      const probe = await this.ffprobe(artifactPath);
      const formatName = probe.format?.format_name || "";
      if (!formatName.split(",").includes("mp4")) {
        throw new Error(
          `Container validation failed: expected MP4, observed '${formatName || "unknown"}'.`
        );
      }
      checks.push("FFPROBE_CONTAINER");

      const streams = probe.streams || [];
      const video = streams.find((stream) => stream.codec_type === "video");
      const audio = streams.find((stream) => stream.codec_type === "audio");

      if (!video) {
        throw new Error("Container validation failed: no video stream present.");
      }

      if (request.expected?.requireAudio !== false && !audio) {
        throw new Error("Container validation failed: required audio stream is missing.");
      }

      const width = numberOrUndefined(video.width);
      const height = numberOrUndefined(video.height);
      const fps = parseFrameRate(video.avg_frame_rate || video.r_frame_rate);
      const durationSeconds =
        numberOrUndefined(video.duration) ??
        numberOrUndefined(probe.format?.duration);

      if (request.expected?.width !== undefined && width !== request.expected.width) {
        throw new Error(
          `Width mismatch: expected ${request.expected.width}, observed ${width ?? "unknown"}.`
        );
      }

      if (request.expected?.height !== undefined && height !== request.expected.height) {
        throw new Error(
          `Height mismatch: expected ${request.expected.height}, observed ${height ?? "unknown"}.`
        );
      }

      if (
        request.expected?.fps !== undefined &&
        (fps === undefined || Math.abs(fps - request.expected.fps) > 0.02)
      ) {
        throw new Error(
          `FPS mismatch: expected ${request.expected.fps}, observed ${fps ?? "unknown"}.`
        );
      }

      if (
        request.expected?.durationSeconds !== undefined &&
        (durationSeconds === undefined ||
          Math.abs(
            durationSeconds - request.expected.durationSeconds
          ) >
            (request.expected.durationToleranceSeconds ??
              Math.max(0.05, 2 / Math.max(request.expected.fps || fps || 30, 1))))
      ) {
        throw new Error(
          `Duration mismatch: expected ${request.expected.durationSeconds}, observed ${durationSeconds ?? "unknown"}.`
        );
      }

      if (
        request.expected?.videoCodec &&
        video.codec_name !== request.expected.videoCodec
      ) {
        throw new Error(
          `Video codec mismatch: expected ${request.expected.videoCodec}, observed ${video.codec_name || "unknown"}.`
        );
      }

      if (
        request.expected?.audioCodec &&
        audio?.codec_name !== request.expected.audioCodec
      ) {
        throw new Error(
          `Audio codec mismatch: expected ${request.expected.audioCodec}, observed ${audio?.codec_name || "unknown"}.`
        );
      }

      checks.push("FFPROBE_STREAM_METRIC");
      await this.decodeSmoke(artifactPath);
      checks.push("FFMPEG_DECODE_SMOKE");

      return {
        status: "PASS",
        verifierId: RenderArtifactVerifier.verifierId,
        verifiedAt: new Date().toISOString(),
        artifactPath,
        sha256: actualSha256,
        byteLength: stat.size,
        container: formatName,
        videoCodec: video.codec_name,
        audioCodec: audio?.codec_name,
        width,
        height,
        fps,
        durationSeconds,
        decodeSmoke: "PASS",
        checks,
      };
    } catch (error: any) {
      let sha256 = request.artifact.sha256;
      let byteLength = request.artifact.byteLength;

      try {
        const stat = await fs.stat(artifactPath || request.artifact.uri);
        byteLength = stat.size;
        sha256 = await this.sha256(artifactPath || request.artifact.uri);
      } catch {
        // Preserve provider-reported identity only when physical observation failed.
      }

      return {
        status: "FAIL",
        verifierId: RenderArtifactVerifier.verifierId,
        verifiedAt: new Date().toISOString(),
        artifactPath: artifactPath || request.artifact.uri,
        sha256,
        byteLength,
        container: "unknown",
        decodeSmoke: "FAIL",
        checks,
        failureReason: error?.message || String(error),
      };
    }
  }

  private async resolveAndContain(uri: string, approvedRoots: string[]): Promise<string> {
    let candidate = uri;

    if (candidate.startsWith("file://")) {
      candidate = new URL(candidate).pathname;
      if (process.platform === "win32" && /^\/[A-Za-z]:/.test(candidate)) {
        candidate = candidate.slice(1);
      }
    }

    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      throw new Error(
        "Remote artifact URIs are not admitted by the F06 physical verifier; providers must stage verified bytes into CAS."
      );
    }

    if (candidate.startsWith("cas://")) {
      throw new Error(
        "Unresolved CAS URI is not admitted; F06 requires a physically addressable CAS path before verification."
      );
    }

    const resolved = path.resolve(candidate);
    const stat = await fs.lstat(resolved);
    if (stat.isSymbolicLink()) {
      throw new Error("Artifact path is a symlink; physical verification requires the canonical CAS file.");
    }

    const real = await fs.realpath(resolved);
    const roots = await Promise.all(
      approvedRoots.map(async (root) => {
        try {
          return await fs.realpath(path.resolve(root));
        } catch {
          return path.resolve(root);
        }
      })
    );

    const contained = roots.some((root) => {
      const rootNorm = path.normalize(root);
      const realNorm = path.normalize(real);
      return realNorm === rootNorm || realNorm.startsWith(rootNorm + path.sep);
    });

    if (!contained) {
      throw new Error(`Artifact path escapes approved storage roots: ${real}`);
    }

    return real;
  }

  private async sha256(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const file = await fs.open(filePath, "r");
    try {
      for await (const chunk of file.readableWebStream()) {
        hash.update(Buffer.from(chunk));
      }
      return hash.digest("hex");
    } finally {
      await file.close();
    }
  }

  private async ffprobe(filePath: string): Promise<FFprobePayload> {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        filePath,
      ],
      { maxBuffer: 2 * 1024 * 1024, timeout: 15_000 }
    );

    return JSON.parse(stdout) as FFprobePayload;
  }

  private async decodeSmoke(filePath: string): Promise<void> {
    await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", filePath, "-f", "null", "-"],
      { maxBuffer: 1 * 1024 * 1024, timeout: 30_000 }
    );
  }
}

function numberOrUndefined(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFrameRate(value?: string): number | undefined {
  if (!value) return undefined;
  if (value.includes("/")) {
    const [n, d] = value.split("/").map(Number);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return undefined;
    return n / d;
  }
  return numberOrUndefined(value);
}
