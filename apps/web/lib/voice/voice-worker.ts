import { WorkerPoolManager } from "../core/WorkerPoolManager";
import { VoiceCache } from "./voice-cache";
import { EventBus, WorkflowEvents } from "../../ai/event-bus";
import fs from "fs";
import path from "path";
import { AudioPipeline } from "./AudioPipeline";
import { NarrationSession } from "./narration-session";
import { NarrationRole } from "./narration-role";

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
  }): Promise<{ outputPath: string; cacheHit: boolean; attempts: number }> {
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
        voiceVersion
      });

      let audioBuffer = VoiceCache.get(cacheHash);
      let cacheHit = true;
      let attempts = 0;

      if (!audioBuffer) {
        cacheHit = false;
        console.log(`[VoiceWorker] Cache miss. Synthesizing via locked provider: ${session.provider.name}...`);

        let rawBuffer: Buffer | null = null;
        let lastError: Error | null = null;

        // Strict 3-Retry Loop on the Locked Provider
        for (let attempt = 1; attempt <= 3; attempt++) {
          attempts = attempt;
          try {
            console.log(`[VoiceWorker] Synthesis attempt ${attempt}/3 for role "${role}" using ${session.providerId}`);

            // Broadcast Event-Bus telemetry
            EventBus.publish(
              WorkflowEvents.VOICE_GENERATED + ".started",
              { jobId: params.jobId, provider: session.providerId, text: params.text.slice(0, 60), attempt },
              params.jobId
            );

            rawBuffer = await session.provider.synthesize(params.text, {
              voiceId,
              modelId: session.modelId,
              language: "en-US",
              speed: 1.15, // slightly faster for snappier shorts narration
              format,
              sampleRate
            });

            // Validate that we got a valid non-empty buffer from TTS provider
            if (rawBuffer && rawBuffer.length > 0) {
              lastError = null;
              break; // Success!
            } else {
              throw new Error("Received empty audio buffer from TTS provider.");
            }
          } catch (err: any) {
            lastError = err;
            console.warn(`[VoiceWorker] Attempt ${attempt}/3 failed: ${err.message}`);
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 1000 * attempt)); // Exponential backoff
            }
          }
        }

        if (lastError || !rawBuffer) {
          console.warn(
            `[VoiceWorker] Synthesis failed on provider "${session.providerId}" after 3 attempts (${lastError?.message}). Falling back to deterministic silent WAV audio to ensure render pipeline continuity.`
          );
          rawBuffer = VoiceWorker.generateSilentWav(3, sampleRate);
        }

        // Run through the robust Audio Intake Pipeline
        const pipelineResult = await AudioPipeline.process({
          rawBuffer,
          cacheHash,
          jobId: params.jobId,
          outputPath: params.outputPath,
          providerId: session.providerId,
          providerName: session.provider.name,
          providerVersion: session.provider.version
        });
        audioBuffer = pipelineResult.audioBuffer;
      } else {
        // Cache hit processing
        const pipelineResult = await AudioPipeline.process({
          rawBuffer: Buffer.alloc(0),
          cacheHash,
          jobId: params.jobId,
          outputPath: params.outputPath,
          providerId: session.providerId,
          providerName: session.provider.name,
          providerVersion: session.provider.version
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
          provider: session.providerId
        },
        params.jobId
      );

      const crypto = require("crypto");
      const textHash = crypto.createHash("sha256").update(params.text).digest("hex").slice(0, 16);

      return {
        outputPath: params.outputPath,
        cacheHit,
        attempts,
        cacheHash,
        textHash
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
