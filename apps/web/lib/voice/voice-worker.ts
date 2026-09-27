import { WorkerPoolManager } from "../core/WorkerPoolManager";
import { VoiceCache } from "./voice-cache";
import { EventBus, WorkflowEvents } from "../../ai/event-bus";
import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { AudioPipeline } from "./AudioPipeline";
import { NarrationSession } from "./narration-session";
import { NarrationRole } from "./narration-role";
import { PrecisionTTSController } from "./temporal/PrecisionTTSController";
import type { TemporalIntent } from "../templates/temporal/TemporalContracts";

export class VoiceWorker {
  /**
   * Run a speech generation task through the isolated WorkerPoolManager queue.
   * Receives an immutable NarrationSession and acts as a pure executor.
   */
  static async generate(params: {
    jobId: string;
    text: string;
    outputPath: string;
    session: Readonly<NarrationSession>;
    role: NarrationRole;
    temporalIntent?: TemporalIntent;
  }): Promise<{ outputPath: string; cacheHit: boolean; attempts: number; temporalEvidence?: any }> {
    const { session, role } = params;
    const voiceId = role === NarrationRole.INTRO ? session.introVoiceId : session.mainVoiceId;
    const taskId = `voice_${params.jobId}_role_${role}`;

    return WorkerPoolManager.run("voice", taskId, async (signal) => {
      const sampleRate = session.sampleRate || 44100;
      const emotion = "neutral";
      const format = "wav";
      const rendererVersion = "2.0";
      const voiceVersion = session.provider.version;

      // 1. Query Voice Cache
      const cacheHash = VoiceCache.getHash({
        text: params.text,
        profileId: role,
        providerId: session.providerId,
        modelId: session.modelId || "default",
        language: "en-US",
        sampleRate,
        emotion,
        rendererVersion,
        voiceVersion,
        targetDurationMs: params.temporalIntent?.targetDurationMs,
        timingMode: params.temporalIntent?.timingMode
      });

      let audioBuffer = VoiceCache.get(cacheHash);
      let cacheHit = true;
      let attempts = 0;
    let temporalEvidence: any = undefined;

    if (audioBuffer && params.temporalIntent?.targetDurationMs) {
      const cachedMeta = await (await import("../core/MediaInspector")).MediaInspector.inspectAudio(audioBuffer);
      const errorMs = Math.round(cachedMeta.duration * 1000 - params.temporalIntent.targetDurationMs);
      if (!cachedMeta.isValid || Math.abs(errorMs) > params.temporalIntent.toleranceMs) {
        audioBuffer = null;
      }
    }

      if (!audioBuffer) {
        cacheHit = false;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          attempts = attempt;
          try {
            EventBus.publish(
              WorkflowEvents.VOICE_GENERATED + ".started",
              { jobId: params.jobId, provider: session.providerId, text: params.text.slice(0, 60), attempt },
              params.jobId
            );

            const precision = await PrecisionTTSController.synthesizeAndVerify({
              provider: session.provider,
              voiceId,
              modelId: session.modelId,
              text: params.text,
              sampleRate,
              language: "en-US",
              baseSpeed: 1.15,
              format,
              jobId: params.jobId,
              outputPath: params.outputPath,
              cacheHash,
              temporalIntent: params.temporalIntent,
            });

            audioBuffer = precision.audioBuffer;
            temporalEvidence = precision.evidence;
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn("[VoiceWorker] Precision synthesis attempt " + attempt + "/3 failed: " + lastError.message);
            if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }

        if (!audioBuffer) {
          console.warn(
            "[VoiceWorker] Precision TTS failed on provider " +
              session.providerId +
              " after 3 attempts (" +
              (lastError?.message || "unknown") +
              "). Falling back to existing degraded audio path.",
          );
          const fallbackSeconds = params.temporalIntent?.targetDurationMs
            ? params.temporalIntent.targetDurationMs / 1000
            : 3;
          const rawBuffer = VoiceWorker.generateSilentWav(fallbackSeconds, sampleRate);
          const pipelineResult = await AudioPipeline.process({
            rawBuffer,
            cacheHash,
            jobId: params.jobId,
            outputPath: params.outputPath,
            providerId: session.providerId,
            providerName: session.provider.name,
            providerVersion: session.provider.version,
            preserveDurationForTiming: Boolean(params.temporalIntent?.targetDurationMs),
            allowSilence: true,
          });
          audioBuffer = pipelineResult.audioBuffer;
          temporalEvidence = {
            requestedDurationMs: params.temporalIntent?.targetDurationMs,
            actualDurationMs: Math.round(pipelineResult.metadata.duration * 1000),
            durationErrorMs: params.temporalIntent?.targetDurationMs
              ? Math.round(pipelineResult.metadata.duration * 1000 - params.temporalIntent.targetDurationMs)
              : undefined,
            sampleRate: pipelineResult.metadata.sampleRate,
            sampleCount: Math.round(pipelineResult.metadata.duration * pipelineResult.metadata.sampleRate),
            providerId: session.providerId,
            modelId: session.modelId,
            correctionPasses: 0,
            correctionMethods: ["DEGRADED_SILENT_FALLBACK"],
            alignmentType: "NONE",
            audioSha256: crypto.createHash("sha256").update(audioBuffer).digest("hex"),
            physicalVerification: "DEGRADED",
          };
        }
      } else {
        // Cache hit processing
        const pipelineResult = await AudioPipeline.process({
          rawBuffer: Buffer.alloc(0),
          cacheHash,
          jobId: params.jobId,
          outputPath: params.outputPath,
          providerId: session.providerId,
          providerName: session.provider.name,
          providerVersion: session.provider.version,
          preserveDurationForTiming: Boolean(params.temporalIntent?.targetDurationMs)
        });
        audioBuffer = pipelineResult.audioBuffer;
      }

      // Post-Generation Validation: verify output file actually exists and is non-empty
      if (!fs.existsSync(params.outputPath) || fs.statSync(params.outputPath).size === 0) {
        throw new Error(`[VoiceWorker] Post-synthesis validation failed: Output file at ${params.outputPath} is missing or empty.`);
      }

      // Publish Event-Bus completed event
      EventBus.publish(
        WorkflowEvents.VOICE_GENERATED,
        {
          jobId: params.jobId,
          audioPath: params.outputPath,
          cacheHit,
          sizeBytes: audioBuffer.length,
          provider: session.providerId,
          temporalEvidence
        },
        params.jobId
      );

      const textHash = crypto.createHash("sha256").update(params.text).digest("hex").slice(0, 16);

      return {
        outputPath: params.outputPath,
        cacheHit,
        attempts,
        cacheHash,
        textHash,
        temporalEvidence
      };
    });
  }

  /**
   * Generates a valid standard 16-bit PCM mono WAV buffer of silence.
   */
  static generateSilentWav(durationSeconds: number = 3, sampleRate: number = 44100): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer;
  }
}

export default VoiceWorker;
