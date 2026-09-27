import crypto from "node:crypto";
import type { VoiceProvider } from "../voice-provider";
import { AudioPipeline } from "../AudioPipeline";
import { MediaInspector, type AudioMetadata } from "../../core/MediaInspector";
import type {
  TemporalEvidence,
  TemporalIntent,
  TTSTimingCapabilities,
} from "../../templates/temporal/TemporalContracts";

export class TemporalTimingUnsatisfiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporalTimingUnsatisfiedError";
  }
}

export interface PrecisionTTSResult {
  audioBuffer: Buffer;
  metadata: AudioMetadata;
  evidence: TemporalEvidence;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export class PrecisionTTSController {
  static async synthesizeAndVerify(params: {
    provider: VoiceProvider;
    voiceId: string;
    modelId?: string;
    text: string;
    sampleRate: number;
    language: string;
    baseSpeed: number;
    format: string;
    jobId: string;
    outputPath: string;
    cacheHash: string;
    temporalIntent?: TemporalIntent;
  }): Promise<PrecisionTTSResult> {
    const capabilities: TTSTimingCapabilities = params.provider.timingCapabilities ?? {
      exactDuration: false,
      speedControl: false,
      ssmlBreaks: false,
      wordTimestamps: false,
      sentenceTimestamps: false,
      characterTimestamps: false,
      phonemeTimestamps: false,
      postStretchSafe: false,
      pitchPreservingStretch: false,
      deterministicDuration: false,
    };

    const intent = params.temporalIntent;
    const maxPasses = intent?.correction.maxResynthesisPasses ?? 0;

    let speed = params.baseSpeed;
    let lastBuffer: Buffer | null = null;
    let lastMetadata: AudioMetadata | null = null;
    const correctionMethods: string[] = [];
    let correctionPasses = 0;

    for (let attempt = 0; attempt <= maxPasses; attempt++) {
      const rawBuffer = await params.provider.synthesize(params.text, {
        voiceId: params.voiceId,
        modelId: params.modelId,
        speed,
        language: params.language,
        format: params.format,
        sampleRate: params.sampleRate,
      });

      const rawMeta = await MediaInspector.inspectAudio(rawBuffer);
      if (!rawMeta.isValid || rawMeta.duration <= 0) {
        throw new Error(
          "[PrecisionTTSController] Provider " + params.provider.id + " returned invalid audio (" + rawMeta.duration + "s).",
        );
      }

      lastBuffer = rawBuffer;
      lastMetadata = rawMeta;

      if (!intent?.targetDurationMs) break;

      const targetMs = intent.targetDurationMs;
      const errorMs = Math.round(rawMeta.duration * 1000 - targetMs);
      if (Math.abs(errorMs) <= intent.toleranceMs) break;

      const durationRatio = (rawMeta.duration * 1000) / targetMs;
      const needsSlowerSpeech = durationRatio < 1;

      if (
        capabilities.speedControl &&
        intent.correction.allowRateCorrection &&
        attempt < maxPasses &&
        Number.isFinite(durationRatio)
      ) {
        const minSpeed = capabilities.minSpeed ?? 0.5;
        const maxSpeed = capabilities.maxSpeed ?? 2.0;
        const proposedSpeed = clamp(speed * durationRatio, minSpeed, maxSpeed);

        if (Math.abs(proposedSpeed - speed) >= 0.005) {
          speed = proposedSpeed;
          correctionPasses += 1;
          correctionMethods.push(needsSlowerSpeech ? "RATE_DOWN" : "RATE_UP");
          continue;
        }
      }

      break;
    }

    if (!lastBuffer || !lastMetadata) {
      throw new Error("[PrecisionTTSController] No usable audio was produced by " + params.provider.id + ".");
    }

    const preserveDuration = Boolean(intent?.targetDurationMs);
    const processed = await AudioPipeline.process({
      rawBuffer: lastBuffer,
      cacheHash: params.cacheHash,
      jobId: params.jobId,
      outputPath: params.outputPath,
      providerId: params.provider.id,
      providerName: params.provider.name,
      providerVersion: params.provider.version,
      preserveDurationForTiming: preserveDuration,
    });

    let finalBuffer = processed.audioBuffer;
    let finalMetadata = processed.metadata;

    if (intent?.targetDurationMs) {
      const targetMs = intent.targetDurationMs;
      const finalErrorMs = Math.round(finalMetadata.duration * 1000 - targetMs);
      const ratio = (finalMetadata.duration * 1000) / targetMs;

      if (
        Math.abs(finalErrorMs) > intent.toleranceMs &&
        intent.correction.allowTimeStretch &&
        capabilities.postStretchSafe &&
        Number.isFinite(ratio) &&
        ratio > 0 &&
        Math.max(ratio, 1 / ratio) <= intent.correction.maxStretchRatio
      ) {
        correctionPasses += 1;
        correctionMethods.push("MICRO_TIME_STRETCH");
        const correctionHash = params.cacheHash + "-timing-" + correctionPasses + "-" + Math.round(ratio * 100000);
        const corrected = await AudioPipeline.process({
          rawBuffer: finalBuffer,
          cacheHash: correctionHash,
          jobId: params.jobId + "_timing_" + correctionPasses,
          outputPath: params.outputPath,
          providerId: params.provider.id,
          providerName: params.provider.name,
          providerVersion: params.provider.version,
          speedMultiplier: ratio,
          preserveDurationForTiming: true,
        });
        finalBuffer = corrected.audioBuffer;
        finalMetadata = corrected.metadata;
      }
    }

    const requestedDurationMs = intent?.targetDurationMs;
    const actualDurationMs = Math.round(finalMetadata.duration * 1000);
    const durationErrorMs =
      requestedDurationMs === undefined ? undefined : actualDurationMs - requestedDurationMs;

    const sampleRate = finalMetadata.sampleRate || params.sampleRate;
    const sampleCount = Math.max(0, Math.round(finalMetadata.duration * sampleRate));
    const withinTolerance =
      requestedDurationMs === undefined ||
      Math.abs(durationErrorMs ?? 0) <= (intent?.toleranceMs ?? 40);

    if (!withinTolerance && intent?.timingMode === "EXACT") {
      throw new TemporalTimingUnsatisfiedError(
        "[PrecisionTTSController] Exact timing failed for " +
          params.provider.id +
          ": requested=" +
          requestedDurationMs +
          "ms actual=" +
          actualDurationMs +
          "ms error=" +
          durationErrorMs +
          "ms",
      );
    }

    const evidence: TemporalEvidence = {
      requestedDurationMs,
      actualDurationMs,
      durationErrorMs,
      sampleRate,
      sampleCount,
      providerId: params.provider.id,
      modelId: params.modelId,
      correctionPasses,
      correctionMethods,
      alignmentType: capabilities.wordTimestamps ? "PROVIDER" : "NONE",
      audioSha256: sha256(finalBuffer),
      physicalVerification: finalMetadata.isValid
        ? withinTolerance
          ? "PASS"
          : "DEGRADED"
        : "FAIL",
    };

    return {
      audioBuffer: finalBuffer,
      metadata: finalMetadata,
      evidence,
    };
  }
}

export default PrecisionTTSController;
