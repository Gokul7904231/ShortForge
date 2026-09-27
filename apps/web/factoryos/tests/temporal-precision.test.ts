import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
import { TemporalCompiler } from "../../lib/templates/temporal/TemporalCompiler";
import { PrecisionTTSController } from "../../lib/voice/temporal/PrecisionTTSController";
import type { VoiceProvider } from "../../lib/voice/voice-provider";
import { AudioPipeline } from "../../lib/voice/AudioPipeline";

function makeToneWav(durationSeconds: number, sampleRate = 44100): Buffer {
  const channels = 1;
  const bits = 16;
  const blockAlign = channels * bits / 8;
  const dataSize = Math.floor(durationSeconds * sampleRate) * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < dataSize / 2; i += 1) {
    const t = i / sampleRate;
    buffer.writeInt16LE(Math.floor(Math.sin(2 * Math.PI * 440 * t) * 8000), 44 + i * 2);
  }
  return buffer;
}

const fakeProvider: VoiceProvider = {
  id: "test-precision",
  name: "Test Precision Provider",
  version: "1.0.0",
  supportsStreaming: false,
  supportsSSML: false,
  supportsEmotion: false,
  supportsVoiceCloning: false,
  supportsLanguages: ["en"],
  timingCapabilities: {
    exactDuration: false,
    speedControl: true,
    minSpeed: 0.5,
    maxSpeed: 2,
    ssmlBreaks: false,
    wordTimestamps: false,
    sentenceTimestamps: false,
    characterTimestamps: false,
    phonemeTimestamps: false,
    postStretchSafe: true,
    pitchPreservingStretch: false,
    deterministicDuration: true,
  },
  async health() {
    return { online: true, latencyMs: 1 };
  },
  async benchmark() {
    return { latencyMs: 1, coldStartMs: 1, warmStartMs: 1, wordsPerSec: 3, rtf: 0.1 };
  },
  async synthesize(_text, options) {
    const base = 2.5;
    const speed = options.speed ?? 1;
    return makeToneWav(base / speed, options.sampleRate ?? 44100);
  },
};

describe("TemporalCompiler", () => {
  it("allocates a deterministic beat plan that lands exactly on the target", () => {
    const template: any = {
      identity: { id: "facts.test.v1", version: "1.0.0" },
      outputPolicy: { fps: 30, targetDurationRange: [30, 60] },
      storyStructure: [
        { stepName: "Hook", purpose: "hook", shotRecipeId: "KINETIC_HOOK", recommendedDurationSeconds: 2 },
        { stepName: "Body", purpose: "body", shotRecipeId: "STAT", recommendedDurationSeconds: 4 },
        { stepName: "CTA", purpose: "cta", shotRecipeId: "OUTRO_CTA", recommendedDurationSeconds: 2 },
      ],
    };

    const plan = TemporalCompiler.compileTemplate(template, 60000, 30);

    expect(plan.targetDurationMs).toBe(60000);
    expect(plan.targetDurationFrames).toBe(1800);
    expect(plan.beats[0].startMs).toBe(0);
    expect(plan.beats.reduce((sum, beat) => sum + beat.durationMs, 0)).toBe(60000);
    expect(plan.beats[plan.beats.length - 1].startMs + plan.beats[plan.beats.length - 1].durationMs).toBe(60000);
  });
});

describe("PrecisionTTSController", () => {
  it("corrects measured TTS duration using physical audio measurement", async () => {
    const outputPath = ".tmp-temporal-precision-" + crypto.randomUUID() + ".wav";
    const jobId = "temporal-test-" + Date.now();
    const cacheHash = "temporal-test-" + Date.now();

    try {
      const result = await PrecisionTTSController.synthesizeAndVerify({
        provider: fakeProvider,
        voiceId: "test",
        text: "hello timing",
        sampleRate: 44100,
        language: "en",
        baseSpeed: 1,
        format: "wav",
        jobId,
        outputPath,
        cacheHash,
        temporalIntent: TemporalCompiler.intentForAudioTarget({
          targetDurationMs: 2000,
          timingMode: "EXACT",
          toleranceMs: 50,
          maxResynthesisPasses: 2,
          allowRateCorrection: true,
          allowTimeStretch: true,
          maxStretchRatio: 1.10,
        }),
      });

      expect(result.evidence.correctionPasses).toBeGreaterThan(0);
      expect(Math.abs(result.evidence.durationErrorMs ?? 9999)).toBeLessThanOrEqual(50);

      const inspected = await AudioPipeline.stepValidate(result.audioBuffer);
      expect(inspected.isValid).toBe(true);
      expect(inspected.duration).toBeGreaterThan(1.95);
      expect(inspected.duration).toBeLessThan(2.05);
    } finally {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  });
});
