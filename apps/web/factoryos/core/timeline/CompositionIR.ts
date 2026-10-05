/**
 * FactoryOS CompositionIR v2
 *
 * OpenCut-informed, renderer-neutral composition model.
 *
 * Authority boundary:
 * - CompositionIR is ShortForge semantic truth.
 * - OpenCut is an optional adapter/backend.
 * - ComputeRouter, Treasurer, OKF and F07 remain outside this module.
 *
 * Time uses the OpenCut-inspired integer-tick model: 120,000 ticks/sec.
 * Ticks are JSON-safe integers; serialization remains deterministic.
 */

export const MEDIA_TIMEBASE = 120_000 as const;
export type MediaTime = number;

/** Explicit synchronization scope for ripple editing; editors never infer linkage. */
export type RippleScope = "LOCAL_TRACK" | "LINKED_TRACKS" | "WHOLE_COMPOSITION";

export interface FrameRate {
  readonly numerator: number;
  readonly denominator: number;
}

export const FRAME_RATE_30: FrameRate = { numerator: 30, denominator: 1 };
export const FRAME_RATE_60: FrameRate = { numerator: 60, denominator: 1 };
export const FRAME_RATE_23976: FrameRate = { numerator: 24000, denominator: 1001 };
export const FRAME_RATE_2997: FrameRate = { numerator: 30000, denominator: 1001 };

export function assertValidFrameRate(rate: FrameRate): void {
  if (!Number.isInteger(rate.numerator) || rate.numerator <= 0) {
    throw new Error("FrameRate.numerator must be a positive integer.");
  }
  if (!Number.isInteger(rate.denominator) || rate.denominator <= 0) {
    throw new Error("FrameRate.denominator must be a positive integer.");
  }
}

export function millisecondsToMediaTime(ms: number): MediaTime {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error("milliseconds must be finite and non-negative.");
  }
  return Math.round((ms * MEDIA_TIMEBASE) / 1000);
}

export function mediaTimeToMilliseconds(ticks: MediaTime): number {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new Error("MediaTime must be a non-negative integer.");
  }
  return (ticks * 1000) / MEDIA_TIMEBASE;
}

export function framesToMediaTime(frames: number, rate: FrameRate): MediaTime {
  assertValidFrameRate(rate);
  if (!Number.isInteger(frames) || frames < 0) {
    throw new Error("Frame count must be a non-negative integer.");
  }
  return Math.round(
    (frames * MEDIA_TIMEBASE * rate.denominator) / rate.numerator,
  );
}

export function mediaTimeToFrames(
  ticks: MediaTime,
  rate: FrameRate,
): number {
  assertValidFrameRate(rate);
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new Error("MediaTime must be a non-negative integer.");
  }
  return Math.round(
    (ticks * rate.numerator) / (MEDIA_TIMEBASE * rate.denominator),
  );
}

export type Interpolation =
  | "LINEAR"
  | "HOLD"
  | "BEZIER";

export interface BezierHandle {
  readonly x: number;
  readonly y: number;
}

export interface Keyframe<T> {
  readonly time: MediaTime;
  readonly value: T;
  readonly interpolation?: Interpolation;
  readonly outHandle?: BezierHandle;
  readonly inHandle?: BezierHandle;
}

export interface Transform2D {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
}

export type AnimatedProperty =
  | "x"
  | "y"
  | "scaleX"
  | "scaleY"
  | "rotationDeg"
  | "opacity";

export type AnimationTrack = {
  readonly property: AnimatedProperty;
  readonly keyframes: readonly Keyframe<number>[];
};

export type EffectScope = "CLIP" | "TRACK" | "SCENE" | "TIMELINE";

export interface EffectNode {
  readonly effectId: string;
  readonly kind: string;
  readonly scope: EffectScope;
  readonly params: Readonly<Record<string, unknown>>;
  readonly enabled?: boolean;
  readonly animations?: readonly AnimationTrack[];
}

export type MaskKind =
  | "RECTANGLE"
  | "ELLIPSE"
  | "STAR"
  | "HEART"
  | "DIAMOND"
  | "SPLIT"
  | "CINEMATIC_BARS";

export interface MaskNode {
  readonly maskId: string;
  readonly kind: MaskKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly feather: number;
  readonly stroke?: number;
  readonly inverted?: boolean;
  readonly animations?: readonly AnimationTrack[];
}

export interface TransitionNode {
  readonly transitionId: string;
  readonly kind: string;
  readonly duration: MediaTime;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface WaveformMetadata {
  readonly sampleRate: number;
  readonly sampleCount: number;
  readonly durationTicks: MediaTime;
  readonly rmsPeaks: readonly number[];
  readonly sourceSha256?: string;
  readonly generatedAt?: string;
}

export type CompositionMediaKind =
  | "VIDEO"
  | "IMAGE"
  | "MOTION_CANVAS"
  | "TEXT"
  | "SHAPE";

export interface CompositionClip {
  readonly id: string;
  readonly kind: CompositionMediaKind;
  readonly assetId?: string;
  readonly src?: string;
  readonly start: MediaTime;
  readonly duration: MediaTime;
  readonly sourceIn?: MediaTime;
  /** Source span consumed by this clip at playbackRate; defaults to duration at 1x. */
  readonly sourceDuration?: MediaTime;
  /** Timeline-to-source speed multiplier; 1 is real time. */
  readonly playbackRate?: number;
  readonly zIndex: number;
  readonly transform?: Partial<Transform2D>;
  readonly animations?: readonly AnimationTrack[];
  readonly effects?: readonly EffectNode[];
  readonly masks?: readonly MaskNode[];
  readonly transitionIn?: TransitionNode;
  readonly transitionOut?: TransitionNode;
  readonly locked?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CompositionTrackKind =
  | "VIDEO"
  | "OVERLAY"
  | "AUDIO_VOICE"
  | "AUDIO_MUSIC"
  | "AUDIO_SFX"
  | "CAPTIONS";

export interface CompositionTrack {
  readonly id: string;
  readonly kind: CompositionTrackKind;
  readonly zIndex: number;
  readonly clips: readonly CompositionClip[];
}

export interface CompositionAudioClip {
  readonly id: string;
  readonly kind: "VOICE" | "MUSIC" | "SFX";
  readonly src: string;
  readonly start: MediaTime;
  readonly duration: MediaTime;
  readonly volume: number;
  readonly sourceIn?: MediaTime;
  readonly sourceDuration?: MediaTime;
  readonly playbackRate?: number;
  readonly fadeIn?: MediaTime;
  readonly fadeOut?: MediaTime;
  readonly verifiedDuration?: MediaTime;
  readonly waveform?: WaveformMetadata;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CompositionWordCue {
  readonly word: string;
  readonly start: MediaTime;
  readonly end: MediaTime;
  readonly confidence?: number;
}

export interface CompositionCaption {
  readonly id: string;
  readonly text: string;
  readonly start: MediaTime;
  readonly end: MediaTime;
  readonly words?: readonly CompositionWordCue[];
  readonly style: {
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly primaryColor: string;
    readonly highlightColor?: string;
    readonly animation: "POP_IN" | "FADE" | "KINETIC_WORD" | "NONE";
  };
}

export interface CompositionCanvas {
  readonly width: number;
  readonly height: number;
  readonly frameRate: FrameRate;
  readonly duration: MediaTime;
  readonly background?: {
    readonly kind: "SOLID" | "GRADIENT" | "BLUR";
    readonly value: string | Readonly<Record<string, unknown>>;
  };
}

export interface CompositionMetadata {
  readonly missionId: string;
  readonly sourceTimelineId?: string;
  readonly scriptId?: string;
  readonly provenanceDigest?: string;
  readonly rendererIntentDigest?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface CompositionIR {
  readonly compositionId: string;
  readonly schemaVersion: "2.0.0";
  readonly canvas: CompositionCanvas;
  readonly tracks: readonly CompositionTrack[];
  readonly audio: readonly CompositionAudioClip[];
  readonly captions: readonly CompositionCaption[];
  readonly metadata: CompositionMetadata;
}

export interface CompositionValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

function validateKeyframes(
  keyframes: readonly Keyframe<number>[],
  owner: string,
): string[] {
  const errors: string[] = [];
  let previous = -1;
  for (const frame of keyframes) {
    if (!Number.isInteger(frame.time) || frame.time < 0) {
      errors.push(`${owner} contains an invalid keyframe time.`);
    }
    if (frame.time <= previous) {
      errors.push(`${owner} keyframes must be strictly increasing.`);
    }
    previous = frame.time;
    if (!Number.isFinite(frame.value)) {
      errors.push(`${owner} contains a non-finite keyframe value.`);
    }
  }
  return errors;
}

export function validateCompositionIR(
  composition: CompositionIR,
): CompositionValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenTrackIds = new Set<string>();
  const seenClipIds = new Set<string>();
  const seenAudioIds = new Set<string>();
  const seenCaptionIds = new Set<string>();

  if (!composition.compositionId) {
    errors.push("Composition must contain a compositionId.");
  }

  if (composition.schemaVersion !== "2.0.0") {
    errors.push("CompositionIR schemaVersion must be 2.0.0.");
  }

  try {
    assertValidFrameRate(composition.canvas.frameRate);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid frame rate.");
  }

  if (composition.canvas.width <= 0 || composition.canvas.height <= 0) {
    errors.push("Composition canvas dimensions must be positive.");
  }

  if (
    !Number.isInteger(composition.canvas.duration) ||
    composition.canvas.duration <= 0
  ) {
    errors.push("Composition duration must be a positive integer MediaTime.");
  }

  for (const track of composition.tracks) {
    if (!track.id) {
      errors.push("Every composition track requires an id.");
    } else if (seenTrackIds.has(track.id)) {
      errors.push(`Duplicate composition track id: ${track.id}.`);
    } else {
      seenTrackIds.add(track.id);
    }

    for (const clip of track.clips) {
      if (!clip.id) {
        errors.push("Every composition clip requires an id.");
      } else if (seenClipIds.has(clip.id)) {
        errors.push(`Duplicate composition clip id: ${clip.id}.`);
      } else {
        seenClipIds.add(clip.id);
      }
      if (!Number.isInteger(clip.start) || clip.start < 0) {
        errors.push(`Clip ${clip.id} has an invalid start time.`);
      }
      if (!Number.isInteger(clip.duration) || clip.duration <= 0) {
        errors.push(`Clip ${clip.id} has an invalid duration.`);
      }
      if (clip.start + clip.duration > composition.canvas.duration) {
        errors.push(`Clip ${clip.id} exceeds composition duration.`);
      }

      for (const animation of clip.animations ?? []) {
        errors.push(...validateKeyframes(animation.keyframes, `Clip ${clip.id}`));
      }

      for (const effect of clip.effects ?? []) {
        for (const animation of effect.animations ?? []) {
          errors.push(...validateKeyframes(
            animation.keyframes,
            `Effect ${effect.effectId}`,
          ));
        }
      }

      for (const mask of clip.masks ?? []) {
        if (mask.feather < 0) {
          errors.push(`Mask ${mask.maskId} feather cannot be negative.`);
        }
      }

      if (clip.transitionIn && clip.transitionIn.duration > clip.duration) {
        errors.push(`Clip ${clip.id} transitionIn exceeds clip duration.`);
      }
      if (clip.transitionOut && clip.transitionOut.duration > clip.duration) {
        errors.push(`Clip ${clip.id} transitionOut exceeds clip duration.`);
      }
    }
  }

  for (const audio of composition.audio) {
    if (audio.volume < 0 || audio.volume > 1) {
      errors.push(`Audio ${audio.id} volume must be within 0..1.`);
    }
    if (audio.start < 0 || audio.duration <= 0 || !Number.isInteger(audio.start) || !Number.isInteger(audio.duration)) {
      errors.push(`Audio ${audio.id} has invalid timing.`);
    }
    if (audio.sourceIn !== undefined && (!Number.isInteger(audio.sourceIn) || audio.sourceIn < 0)) {
      errors.push(`Audio ${audio.id} has invalid sourceIn.`);
    }
    if (audio.sourceDuration !== undefined && (!Number.isInteger(audio.sourceDuration) || audio.sourceDuration <= 0)) {
      errors.push(`Audio ${audio.id} has invalid sourceDuration.`);
    }
    if (audio.playbackRate !== undefined && (!Number.isFinite(audio.playbackRate) || audio.playbackRate <= 0)) {
      errors.push(`Audio ${audio.id} playbackRate must be a finite positive number.`);
    }
    if (audio.fadeIn !== undefined && (audio.fadeIn < 0 || audio.fadeIn > audio.duration)) {
      errors.push(`Audio ${audio.id} fadeIn must be within clip duration.`);
    }
    if (audio.fadeOut !== undefined && (audio.fadeOut < 0 || audio.fadeOut > audio.duration)) {
      errors.push(`Audio ${audio.id} fadeOut must be within clip duration.`);
    }
    if (audio.start + audio.duration > composition.canvas.duration) {
      errors.push(`Audio ${audio.id} exceeds composition duration.`);
    }

    if (audio.waveform) {
      if (audio.waveform.sampleRate <= 0 || audio.waveform.sampleCount < 0) {
        errors.push(`Audio ${audio.id} has invalid waveform metadata.`);
      }
      if (audio.waveform.durationTicks !== audio.duration) {
        warnings.push(`Audio ${audio.id} waveform duration differs from clip duration.`);
      }
    }
  }

  for (const caption of composition.captions) {
    if (!caption.id) {
      errors.push("Every caption requires an id.");
    } else if (seenCaptionIds.has(caption.id)) {
      errors.push(`Duplicate caption id: ${caption.id}.`);
    } else {
      seenCaptionIds.add(caption.id);
    }
    if (caption.start < 0 || caption.end <= caption.start) {
      errors.push(`Caption ${caption.id} has invalid timing.`);
    }
    if (caption.end > composition.canvas.duration) {
      errors.push(`Caption ${caption.id} exceeds composition duration.`);
    }

    let previous = -1;
    for (const cue of caption.words ?? []) {
      if (cue.start < caption.start || cue.end > caption.end || cue.end <= cue.start || !Number.isInteger(cue.start) || !Number.isInteger(cue.end)) {
        errors.push(`Caption ${caption.id} contains an invalid word cue.`);
      }
      if (cue.confidence !== undefined && (cue.confidence < 0 || cue.confidence > 1 || !Number.isFinite(cue.confidence))) {
        errors.push(`Caption ${caption.id} word confidence must be within 0..1.`);
      }
      if (cue.start <= previous) {
        errors.push(`Caption ${caption.id} word cues must be strictly increasing.`);
      }
      previous = cue.start;
    }
  }

  const hasVoice = composition.audio.some((track) => track.kind === "VOICE");
  if (!hasVoice) {
    errors.push("Composition must contain at least one VOICE audio clip.");
  }

  if (composition.canvas.width === 1080 && composition.canvas.height === 1920) {
    // Canonical Shorts target remains the default, but v2 deliberately allows
    // other aspect ratios for future editor interoperability.
  } else {
    warnings.push("Composition is not 1080x1920; verify platform-specific output policy before rendering.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Stable JSON representation for hashing, cache keys and adapter handoff.
 * Object keys are recursively sorted; arrays preserve semantic order.
 */
export function canonicalizeComposition(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(input as Record<string, unknown>).sort()) {
        result[key] = normalize((input as Record<string, unknown>)[key]);
      }
      return result;
    }
    return input;
  };

  const serialized = JSON.stringify(normalize(value));
  if (serialized === undefined) {
    throw new Error("Composition cannot be canonicalized to JSON.");
  }
  return serialized;
}
