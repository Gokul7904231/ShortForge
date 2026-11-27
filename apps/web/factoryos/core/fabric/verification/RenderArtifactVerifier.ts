/**
 * Floor 06 — Canonical physical render artifact verifier.
 *
 * This verifier is a pre-F07 admission gate: provider claims are treated as
 * untrusted observations until the control plane re-checks bytes and media
 * decodability from the artifact itself against ShortForge doctrine.
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
  width: number;
  height: number;
  fps: number;
  durationSeconds?: number;
  durationToleranceSeconds?: number;
  expectedTotalFrames?: number;
  videoCodec: string;
  audioCodec: string;
  requireAudio: boolean;
}

export interface RenderArtifactVerificationRequest {
  artifact: ArtifactRef;
  expected: RenderArtifactVerificationExpectation;
  approvedRoots?: string[];
}

interface FFprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
  color_range?: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
  duration_ts?: number;
  time_base?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  nb_read_frames?: string;
}

interface FFprobePayload {
  format?: {
    format_name?: string;
    duration?: string;
  };
  streams?: FFprobeStream[];
}

interface LoudnormMetrics {
  inputI: number;
  inputTp: number;
}

const DOCTRINE_WIDTH = 1080;
const DOCTRINE_HEIGHT = 1920;
const DOCTRINE_FPS = 30;
const DOCTRINE_AUDIO_SAMPLE_RATE = 48000;
const DOCTRINE_AUDIO_CHANNELS = 2;
const DOCTRINE_SAMPLES_PER_FRAME = DOCTRINE_AUDIO_SAMPLE_RATE / DOCTRINE_FPS; // 1600
const DOCTRINE_MAX_AV_DRIFT_SEC = 1 / DOCTRINE_FPS + 1e-4; // 33.3ms (F07 threshold 40ms)
const DOCTRINE_TARGET_LUFS = -14.0;
const DOCTRINE_LUFS_TOLERANCE = 1.0;
const DOCTRINE_MAX_TRUE_PEAK_DBTP = -1.0;
const SAFE_AREA_TOP_PX = 160;
const SAFE_AREA_BOTTOM_PX = 320;
const SAFE_AREA_RIGHT_PX = 120;
const SAFE_AREA_EDGE_THRESHOLD = 80;
const SAFE_AREA_MAX_EDGE_PIXELS = 20;

export class RenderArtifactVerifier {
  public static readonly verifierId = "f06_physical_render_verifier_v2";

  public async verify(
    request: RenderArtifactVerificationRequest
  ): Promise<ArtifactVerificationEvidence> {
    const checks: string[] = [];
    let artifactPath = "";

    try {
      if (!request.expected) {
        throw new Error("Verification request missing mandatory 'expected' policy.");
      }
      if (!request.artifact.uri) {
        throw new Error("Artifact receipt is missing a physical URI.");
      }
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
      if (!audio) {
        throw new Error("Container validation failed: required audio stream is missing.");
      }

      const width = numberOrUndefined(video.width);
      const height = numberOrUndefined(video.height);
      const fps = parseFrameRate(video.r_frame_rate || video.avg_frame_rate);
      const videoDuration =
        numberOrUndefined(video.duration) ??
        numberOrUndefined(probe.format?.duration);
      const audioDuration = numberOrUndefined(audio.duration);

      // G1: geometry == 1080x1920
      const expectedWidth = request.expected.width || DOCTRINE_WIDTH;
      const expectedHeight = request.expected.height || DOCTRINE_HEIGHT;
      if (width !== DOCTRINE_WIDTH || height !== DOCTRINE_HEIGHT || width !== expectedWidth || height !== expectedHeight) {
        throw new Error(
          `G1 geometry mismatch: expected ${DOCTRINE_WIDTH}x${DOCTRINE_HEIGHT}, observed ${width ?? "unknown"}x${height ?? "unknown"}.`
        );
      }
      checks.push("G1_GEOMETRY");

      // G2: r_frame_rate == 30/1 exactly (reject 30000/1001, 24, 18)
      if (video.r_frame_rate !== "30/1" || request.expected.fps !== DOCTRINE_FPS) {
        throw new Error(
          `G2 r_frame_rate mismatch: expected 30/1, observed '${video.r_frame_rate || "unknown"}' (policy fps=${request.expected.fps}).`
        );
      }
      checks.push("G2_EXACT_FPS");

      // G3: pix_fmt == yuv420p
      if (video.pix_fmt !== "yuv420p") {
        throw new Error(
          `G3 pix_fmt mismatch: expected yuv420p, observed '${video.pix_fmt || "unknown"}'.`
        );
      }
      checks.push("G3_PIX_FMT");

      // G4: color_space/primaries/trc == bt709, range == tv
      if (
        video.color_space !== "bt709" ||
        video.color_primaries !== "bt709" ||
        video.color_transfer !== "bt709" ||
        video.color_range !== "tv"
      ) {
        throw new Error(
          `G4 color mismatch: expected bt709/bt709/bt709/tv, observed ${video.color_space || "unknown"}/${video.color_primaries || "unknown"}/${video.color_transfer || "unknown"}/${video.color_range || "unknown"}.`
        );
      }
      checks.push("G4_COLOR_BT709");

      if (video.codec_name !== request.expected.videoCodec) {
        throw new Error(
          `Video codec mismatch: expected ${request.expected.videoCodec}, observed ${video.codec_name || "unknown"}.`
        );
      }

      // G5: audio sample_rate == 48000, channels == 2, codec == aac
      const sampleRate = numberOrUndefined(audio.sample_rate);
      const channels = numberOrUndefined(audio.channels);
      if (
        sampleRate !== DOCTRINE_AUDIO_SAMPLE_RATE ||
        channels !== DOCTRINE_AUDIO_CHANNELS ||
        audio.codec_name !== "aac" ||
        audio.codec_name !== request.expected.audioCodec
      ) {
        throw new Error(
          `G5 audio format mismatch: expected 48000Hz/2ch/aac, observed ${sampleRate ?? "unknown"}Hz/${channels ?? "unknown"}ch/${audio.codec_name || "unknown"}.`
        );
      }
      checks.push("G5_AUDIO_FORMAT");

      if (
        request.expected.durationSeconds !== undefined &&
        (videoDuration === undefined ||
          Math.abs(videoDuration - request.expected.durationSeconds) >
            (request.expected.durationToleranceSeconds ??
              Math.max(0.05, 2 / DOCTRINE_FPS)))
      ) {
        throw new Error(
          `Duration mismatch: expected ${request.expected.durationSeconds}, observed ${videoDuration ?? "unknown"}.`
        );
      }

      // G8: |audio_duration - video_duration| <= 1 frame (33.3ms)
      if (
        videoDuration === undefined ||
        audioDuration === undefined ||
        Math.abs(audioDuration - videoDuration) > DOCTRINE_MAX_AV_DRIFT_SEC
      ) {
        const driftMs =
          videoDuration !== undefined && audioDuration !== undefined
            ? Math.round(Math.abs(audioDuration - videoDuration) * 10000) / 10
            : "unknown";
        throw new Error(
          `G8 A/V drift exceeded: |audio - video| = ${driftMs}ms > 33.3ms.`
        );
      }
      checks.push("G8_AV_DRIFT");

      // G9: faststart (moov box precedes mdat)
      await this.verifyFaststart(artifactPath);
      checks.push("G9_FASTSTART");

      // G10: nb_read_frames == expected total_frames
      const nbReadFrames = numberOrUndefined(video.nb_read_frames);
      const expectedTotalFrames =
        request.expected.expectedTotalFrames ??
        (request.expected.durationSeconds !== undefined
          ? Math.round(request.expected.durationSeconds * DOCTRINE_FPS)
          : Math.round(videoDuration * DOCTRINE_FPS));
      if (nbReadFrames === undefined || nbReadFrames !== expectedTotalFrames) {
        throw new Error(
          `G10 frame count mismatch: expected nb_read_frames=${expectedTotalFrames}, observed ${nbReadFrames ?? "unknown"}.`
        );
      }
      checks.push("G10_FRAME_COUNT");

      // G11: sample-exactness (master audio samples == total_frames * 1600)
      const expectedSamples = nbReadFrames * DOCTRINE_SAMPLES_PER_FRAME;
      const actualSamples =
        audio.time_base === "1/48000" && typeof audio.duration_ts === "number"
          ? audio.duration_ts
          : Math.round(audioDuration * DOCTRINE_AUDIO_SAMPLE_RATE);
      if (actualSamples !== expectedSamples) {
        throw new Error(
          `G11 sample-exactness mismatch: expected ${expectedSamples} samples (${nbReadFrames} * 1600), observed ${actualSamples}.`
        );
      }
      checks.push("G11_SAMPLE_EXACT");

      // G6 & G7: integrated loudness == -14 +-1 LUFS, true peak <= -1.0 dBTP
      const loudnorm = await this.measureLoudnorm(artifactPath);
      if (Math.abs(loudnorm.inputI - DOCTRINE_TARGET_LUFS) > DOCTRINE_LUFS_TOLERANCE) {
        throw new Error(
          `G6 loudness out of range: expected -14 +-1 LUFS, observed ${loudnorm.inputI.toFixed(2)} LUFS.`
        );
      }
      checks.push("G6_LOUDNESS");

      if (loudnorm.inputTp > DOCTRINE_MAX_TRUE_PEAK_DBTP) {
        throw new Error(
          `G7 true peak exceeded: expected <= -1.0 dBTP, observed ${loudnorm.inputTp.toFixed(2)} dBTP.`
        );
      }
      checks.push("G7_TRUE_PEAK");

      // G12: safe-area (no text pixels in top 160 / bottom 320 / right 120 bands)
      await this.verifySafeArea(artifactPath, videoDuration);
      checks.push("G12_SAFE_AREA");

      checks.push("FFPROBE_STREAM_METRIC");

      // Full decode smoke (zero stderr)
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
        audioCodec: audio.codec_name,
        width,
        height,
        fps,
        durationSeconds: videoDuration,
        decodeSmoke: "PASS",
        checks,
      };
    } catch (error: any) {
      let sha256 = request.artifact.sha256;
      let byteLength = request.artifact.byteLength;

      try {
        const fallbackPath = artifactPath || request.artifact.uri;
        if (fallbackPath) {
          const stat = await fs.stat(fallbackPath);
          byteLength = stat.size;
          sha256 = await this.sha256(fallbackPath);
        }
      } catch {
        // Preserve provider-reported identity only when physical observation failed.
      }

      return {
        status: "FAIL",
        verifierId: RenderArtifactVerifier.verifierId,
        verifiedAt: new Date().toISOString(),
        artifactPath: artifactPath || request.artifact.uri || "<unresolved>",
        sha256,
        byteLength,
        container: "unknown",
        decodeSmoke: "FAIL",
        checks,
        failureReason: error?.message || String(error),
      };
    }
  }

  private async verifyFaststart(filePath: string): Promise<void> {
    const file = await fs.open(filePath, "r");
    try {
      const stat = await file.stat();
      let offset = 0;
      let moovOffset = -1;
      let mdatOffset = -1;
      const headerBuf = Buffer.alloc(16);

      while (offset + 8 <= stat.size) {
        const { bytesRead } = await file.read(headerBuf, 0, 16, offset);
        if (bytesRead < 8) break;
        const size32 = headerBuf.readUInt32BE(0);
        const boxType = headerBuf.subarray(4, 8).toString("ascii");

        if (boxType === "moov" && moovOffset === -1) moovOffset = offset;
        if (boxType === "mdat" && mdatOffset === -1) mdatOffset = offset;

        let boxSize = size32;
        if (size32 === 1) {
          if (bytesRead < 16) break;
          boxSize = Number(headerBuf.readBigUInt64BE(8));
        } else if (size32 === 0) {
          break;
        }
        if (boxSize < 8) break;
        offset += boxSize;
      }

      if (moovOffset === -1 || mdatOffset === -1) {
        throw new Error(
          `G9 faststart check failed: missing moov (${moovOffset}) or mdat (${mdatOffset}) box.`
        );
      }
      if (moovOffset > mdatOffset) {
        throw new Error(
          `G9 faststart violation: mdat (${mdatOffset}) precedes moov (${moovOffset}).`
        );
      }
    } finally {
      await file.close();
    }
  }

  private async measureLoudnorm(filePath: string): Promise<LoudnormMetrics> {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        filePath,
        "-af",
        "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
      ],
      { maxBuffer: 2 * 1024 * 1024, timeout: 30_000 }
    );

    const start = stderr.lastIndexOf("{");
    const end = stderr.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("G6/G7 loudnorm measurement failed: JSON output missing.");
    }
    const parsed = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
    const inputI = Number(parsed.input_i);
    const inputTp = Number(parsed.input_tp);
    if (!Number.isFinite(inputI) || !Number.isFinite(inputTp)) {
      throw new Error("G6/G7 loudnorm measurement failed: non-finite LUFS/dBTP.");
    }
    return { inputI, inputTp };
  }

  private async verifySafeArea(filePath: string, durationSeconds: number): Promise<void> {
    const sampleTimes = [
      Math.min(0.2, durationSeconds * 0.25),
      durationSeconds * 0.5,
      Math.max(0.0, durationSeconds - 0.2),
    ];

    for (const t of sampleTimes) {
      const { stdout } = await execFileAsync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-ss",
          t.toFixed(3),
          "-i",
          filePath,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "-",
        ],
        {
          encoding: "buffer",
          maxBuffer: DOCTRINE_WIDTH * DOCTRINE_HEIGHT * 3 + 1024,
          timeout: 15_000,
        }
      );

      const expectedLen = DOCTRINE_WIDTH * DOCTRINE_HEIGHT * 3;
      if (!Buffer.isBuffer(stdout) || stdout.length < expectedLen) {
        continue;
      }

      let edgePixels = 0;
      const stride = DOCTRINE_WIDTH * 3;
      const bottomStartY = DOCTRINE_HEIGHT - SAFE_AREA_BOTTOM_PX;
      const rightStartX = DOCTRINE_WIDTH - SAFE_AREA_RIGHT_PX;

      for (let y = 1; y < DOCTRINE_HEIGHT; y += 1) {
        const inVertMargin = y < SAFE_AREA_TOP_PX || y >= bottomStartY;
        const xStart = inVertMargin ? 1 : rightStartX;
        const rowOffset = y * stride;
        const prevRowOffset = (y - 1) * stride;

        for (let x = xStart; x < DOCTRINE_WIDTH; x += 1) {
          const idx = rowOffset + x * 3;
          const leftIdx = idx - 3;
          const upIdx = prevRowOffset + x * 3;

          const luma =
            (stdout[idx] * 299 + stdout[idx + 1] * 587 + stdout[idx + 2] * 114) / 1000;
          const lumaLeft =
            (stdout[leftIdx] * 299 + stdout[leftIdx + 1] * 587 + stdout[leftIdx + 2] * 114) / 1000;
          const lumaUp =
            (stdout[upIdx] * 299 + stdout[upIdx + 1] * 587 + stdout[upIdx + 2] * 114) / 1000;

          if (
            Math.abs(luma - lumaLeft) >= SAFE_AREA_EDGE_THRESHOLD ||
            Math.abs(luma - lumaUp) >= SAFE_AREA_EDGE_THRESHOLD
          ) {
            edgePixels++;
            if (edgePixels > SAFE_AREA_MAX_EDGE_PIXELS) {
              throw new Error(
                `G12 safe-area violation at t=${t.toFixed(2)}s (y=${y}, x=${x}): detected high-contrast overlay pixels in restricted band.`
              );
            }
          }
        }
      }
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
        "-count_frames",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        filePath,
      ],
      { maxBuffer: 2 * 1024 * 1024, timeout: 20_000 }
    );

    return JSON.parse(stdout) as FFprobePayload;
  }

  private async decodeSmoke(filePath: string): Promise<void> {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", filePath, "-f", "null", "-"],
      { maxBuffer: 1 * 1024 * 1024, timeout: 30_000 }
    );
    if (stderr && stderr.trim().length > 0) {
      throw new Error(`Full decode smoke produced stderr: ${stderr.trim().slice(0, 300)}`);
    }
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
