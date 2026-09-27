import { z } from "zod";

export const TemporalTimingModeSchema = z.enum(["FLEXIBLE", "BOUNDED", "EXACT"]);
export type TemporalTimingMode = z.infer<typeof TemporalTimingModeSchema>;

export const TemporalAlignmentGranularitySchema = z.enum([
  "SENTENCE",
  "WORD",
  "CHARACTER",
  "PHONEME",
]);
export type TemporalAlignmentGranularity = z.infer<typeof TemporalAlignmentGranularitySchema>;

export const TemporalPausePolicySchema = z.enum(["NONE", "CONTROLLED", "GRAMMAR"]);
export type TemporalPausePolicy = z.infer<typeof TemporalPausePolicySchema>;

export const TemporalQuantizationSchema = z.enum(["FRAME", "AUDIO_SAMPLE", "MIXED"]);
export type TemporalQuantization = z.infer<typeof TemporalQuantizationSchema>;

export const TemporalContractSchema = z.object({
  video: z.object({
    targetDurationMs: z.number().int().positive().optional(),
    toleranceMs: z.number().int().nonnegative().default(40),
    quantization: TemporalQuantizationSchema.default("MIXED"),
    fpsRef: z.string().default("TEMPLATE_OUTPUT_FPS"),
  }).default({}),
  narration: z.object({
    allocation: z.enum(["SCENE", "BEAT", "GLOBAL"]).default("BEAT"),
    timingMode: TemporalTimingModeSchema.default("BOUNDED"),
    targetDurationMs: z.number().int().positive().optional(),
    minDurationMs: z.number().int().positive().optional(),
    maxDurationMs: z.number().int().positive().optional(),
  }).default({}),
  pacing: z.object({
    preferredRateWpm: z.number().positive().optional(),
    minRateMultiplier: z.number().positive().default(0.75),
    maxRateMultiplier: z.number().positive().default(1.25),
    pausePolicy: TemporalPausePolicySchema.default("CONTROLLED"),
  }).default({}),
  alignment: z.object({
    granularity: TemporalAlignmentGranularitySchema.default("WORD"),
    required: z.boolean().default(false),
  }).default({}),
  correction: z.object({
    maxResynthesisPasses: z.number().int().nonnegative().max(5).default(2),
    allowRateCorrection: z.boolean().default(true),
    allowTextRepair: z.boolean().default(true),
    allowTimeStretch: z.boolean().default(true),
    allowPadding: z.boolean().default(false),
    maxStretchRatio: z.number().positive().default(1.10),
  }).default({}),
  quality: z.object({
    preservePitch: z.boolean().default(true),
    rejectClipping: z.boolean().default(true),
    rejectCorruption: z.boolean().default(true),
  }).default({}),
});
export type TemporalContract = z.infer<typeof TemporalContractSchema>;

export interface TemporalBeatPlan {
  beatId: string;
  startMs: number;
  durationMs: number;
  speechBudgetMs: number;
  pauseBudgetMs: number;
  visualOnlyBudgetMs: number;
  transitionBudgetMs: number;
}

export interface TemporalPlanIR {
  schemaVersion: "1.0.0";
  templateId: string;
  templateVersion: string;
  targetDurationMs: number;
  targetDurationFrames: number;
  fps: number;
  frameTimebase: string;
  beats: TemporalBeatPlan[];
  contract: TemporalContract;
  provenance: {
    compilerVersion: string;
    source: "TEMPLATE_DEFINITION";
  };
}

export interface TemporalIntent {
  targetDurationMs?: number;
  timingMode: TemporalTimingMode;
  toleranceMs: number;
  alignmentGranularity: TemporalAlignmentGranularity;
  pausePolicy: TemporalPausePolicy;
  correction: {
    maxResynthesisPasses: number;
    allowRateCorrection: boolean;
    allowTimeStretch: boolean;
    maxStretchRatio: number;
  };
}

export interface TemporalEvidence {
  requestedDurationMs?: number;
  actualDurationMs: number;
  durationErrorMs?: number;
  sampleRate: number;
  sampleCount: number;
  leadingSilenceMs?: number;
  trailingSilenceMs?: number;
  providerId: string;
  modelId?: string;
  correctionPasses: number;
  correctionMethods: string[];
  alignmentType: "PROVIDER" | "FORCED" | "NONE";
  alignmentRef?: string;
  audioSha256: string;
  physicalVerification: "PASS" | "FAIL" | "DEGRADED";
}

export interface TTSTimingCapabilities {
  exactDuration: boolean;
  minExactDurationMs?: number;
  maxExactDurationMs?: number;
  speedControl: boolean;
  minSpeed?: number;
  maxSpeed?: number;
  ssmlBreaks: boolean;
  wordTimestamps: boolean;
  sentenceTimestamps: boolean;
  characterTimestamps: boolean;
  phonemeTimestamps: boolean;
  postStretchSafe: boolean;
  pitchPreservingStretch: boolean;
  deterministicDuration: boolean;
}
