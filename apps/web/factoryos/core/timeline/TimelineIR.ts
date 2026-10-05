import type { TemporalEvidence } from "../../../lib/templates/temporal/TemporalContracts";
import {
  MEDIA_TIMEBASE,
  validateCompositionIR,
  millisecondsToMediaTime,
  type CompositionIR,
  type CompositionAudioClip,
  type CompositionCaption,
  type CompositionClip,
  type CompositionTrack,
  type FrameRate,
  type Keyframe,
} from "./CompositionIR";

/**
 * FactoryOS TimelineIR v1 — backward-compatible semantic timeline.
 *
 * CompositionIR v2 adds the OpenCut-informed editing primitives while this
 * interface remains accepted by existing F05/ReMaker consumers.
 */

export interface WordTimestampCue {
  readonly word: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly confidence?: number;
}

export interface TimelineClipNode {
  readonly clipId: string;
  readonly assetId: string;
  readonly assetType: "IMAGE" | "VIDEO_SEGMENT" | "MOTION_CANVAS";
  readonly src: string;
  readonly timelineStartMs: number;
  readonly durationMs: number;
  readonly zIndex: number;
  readonly motion?: {
    readonly type: "ZOOM_IN" | "ZOOM_OUT" | "PAN_LEFT" | "PAN_RIGHT" | "STATIC";
    readonly startScale: number;
    readonly endScale: number;
  };
}

export interface TimelineAudioNode {
  readonly audioId: string;
  readonly trackType: "VOICE" | "BACKGROUND_MUSIC" | "SFX";
  readonly src: string;
  readonly timelineStartMs: number;
  readonly durationMs: number;
  readonly volume: number;
  readonly verifiedDurationMs?: number;
  readonly verifiedSampleRate?: number;
  readonly verifiedSampleCount?: number;
  readonly temporalEvidence?: TemporalEvidence;
  readonly fadeInMs?: number;
  readonly fadeOutMs?: number;
}

export interface TimelineSubtitleNode {
  readonly subtitleId: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly wordCues?: WordTimestampCue[];
  readonly style: {
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly primaryColor: string;
    readonly highlightColor?: string;
    readonly animation: "POP_IN" | "FADE" | "KINETIC_WORD" | "NONE";
  };
}

export interface TimelineIR {
  readonly timelineId: string;
  readonly schemaVersion: "1.0.0";
  readonly missionId: string;
  readonly compositionType: "FACTS_SHORTS" | "NARRATIVE_STORY" | "QUIZ_SHORTS" | "VIRAL_HOOK";
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly aspectRatio: "9:16";
  };
  readonly totalDurationMs: number;
  readonly visualTracks: TimelineClipNode[];
  readonly audioTracks: TimelineAudioNode[];
  readonly subtitleTracks: TimelineSubtitleNode[];
  readonly provenanceDigest: string;
  readonly compositionV2?: CompositionIR;
}

export function frameRateFromFps(fps: number): FrameRate {
  if (fps === 23.976) return { numerator: 24000, denominator: 1001 };
  if (fps === 29.97) return { numerator: 30000, denominator: 1001 };
  if (fps === 59.94) return { numerator: 60000, denominator: 1001 };
  if (Number.isInteger(fps) && fps > 0) return { numerator: fps, denominator: 1 };
  throw new Error("Unsupported fps value: " + fps);
}

function mapLegacyMotion(clip: TimelineClipNode): Pick<CompositionClip, "animations"> {
  if (!clip.motion || clip.motion.type === "STATIC") return {};

  const start = millisecondsToMediaTime(clip.timelineStartMs);
  const end = start + millisecondsToMediaTime(clip.durationMs);

  if (clip.motion.type === "ZOOM_IN" || clip.motion.type === "ZOOM_OUT") {
    const keyframes: Keyframe<number>[] = [
      { time: start, value: clip.motion.startScale, interpolation: "BEZIER" },
      { time: end, value: clip.motion.endScale, interpolation: "BEZIER" },
    ];
    return {
      animations: [
        { property: "scaleX", keyframes },
        { property: "scaleY", keyframes },
      ],
    };
  }

  const direction = clip.motion.type === "PAN_LEFT" ? -1 : 1;
  return {
    animations: [{
      property: "x",
      keyframes: [
        { time: start, value: -0.1 * direction, interpolation: "BEZIER" },
        { time: end, value: 0.1 * direction, interpolation: "BEZIER" },
      ],
    }],
  };
}

/** Deterministically upgrades legacy TimelineIR into CompositionIR v2. */
export function upgradeTimelineIR(timeline: TimelineIR): CompositionIR {
  const duration = millisecondsToMediaTime(timeline.totalDurationMs);

  const visualClips: CompositionClip[] = timeline.visualTracks.map((clip) => ({
    id: clip.clipId,
    kind:
      clip.assetType === "IMAGE"
        ? "IMAGE"
        : clip.assetType === "MOTION_CANVAS"
          ? "MOTION_CANVAS"
          : "VIDEO",
    assetId: clip.assetId,
    src: clip.src,
    start: millisecondsToMediaTime(clip.timelineStartMs),
    duration: millisecondsToMediaTime(clip.durationMs),
    sourceIn: 0,
    sourceDuration: millisecondsToMediaTime(clip.durationMs),
    zIndex: clip.zIndex,
    ...mapLegacyMotion(clip),
  }));

  const tracks: CompositionTrack[] = [{
    id: "video-main",
    kind: "VIDEO",
    zIndex: 0,
    clips: visualClips,
  }];

  const audio: CompositionAudioClip[] = timeline.audioTracks.map((track) => ({
    id: track.audioId,
    kind:
      track.trackType === "VOICE"
        ? "VOICE"
        : track.trackType === "SFX"
          ? "SFX"
          : "MUSIC",
    src: track.src,
    start: millisecondsToMediaTime(track.timelineStartMs),
    duration: millisecondsToMediaTime(track.durationMs),
    volume: track.volume,
    fadeIn:
      track.fadeInMs !== undefined
        ? millisecondsToMediaTime(track.fadeInMs)
        : undefined,
    fadeOut:
      track.fadeOutMs !== undefined
        ? millisecondsToMediaTime(track.fadeOutMs)
        : undefined,
    verifiedDuration:
      track.verifiedDurationMs !== undefined
        ? millisecondsToMediaTime(track.verifiedDurationMs)
        : undefined,
    waveform:
      track.verifiedSampleRate !== undefined &&
      track.verifiedSampleCount !== undefined
        ? {
            sampleRate: track.verifiedSampleRate,
            sampleCount: track.verifiedSampleCount,
            durationTicks: millisecondsToMediaTime(track.durationMs),
            rmsPeaks: [],
          }
        : undefined,
  }));

  const captions: CompositionCaption[] = timeline.subtitleTracks.map((caption) => ({
    id: caption.subtitleId,
    text: caption.text,
    start: millisecondsToMediaTime(caption.startMs),
    end: millisecondsToMediaTime(caption.endMs),
    words: caption.wordCues?.map((cue) => ({
      word: cue.word,
      start: millisecondsToMediaTime(cue.startMs),
      end: millisecondsToMediaTime(cue.endMs),
      confidence: cue.confidence,
    })),
    style: {
      fontFamily: caption.style.fontFamily,
      fontSize: caption.style.fontSize,
      primaryColor: caption.style.primaryColor,
      highlightColor: caption.style.highlightColor,
      animation: caption.style.animation,
    },
  }));

  return {
    compositionId: timeline.timelineId,
    schemaVersion: "2.0.0",
    canvas: {
      width: timeline.canvas.width,
      height: timeline.canvas.height,
      frameRate: frameRateFromFps(timeline.canvas.fps),
      duration,
    },
    tracks,
    audio,
    captions,
    metadata: {
      missionId: timeline.missionId,
      sourceTimelineId: timeline.timelineId,
      provenanceDigest: timeline.provenanceDigest,
    },
  };
}

export class TimelineIRValidator {
  public static validate(timeline: TimelineIR): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (timeline.totalDurationMs <= 0) {
      errors.push("Timeline totalDurationMs must be strictly positive.");
    }

    if (timeline.canvas.width !== 1080 || timeline.canvas.height !== 1920) {
      errors.push("Timeline canvas must be standard vertical shorts format (1080x1920).");
    }

    for (const clip of timeline.visualTracks) {
      if (clip.timelineStartMs < 0 || clip.durationMs <= 0) {
        errors.push("Visual clip " + clip.clipId + " has invalid timing.");
      }
      if (clip.timelineStartMs + clip.durationMs > timeline.totalDurationMs + 100) {
        errors.push("Visual clip " + clip.clipId + " extends beyond total timeline duration.");
      }
    }

    const hasVoice = timeline.audioTracks.some((t) => t.trackType === "VOICE");
    if (!hasVoice) errors.push("Timeline must contain at least one VOICE track.");

    if (timeline.compositionV2) {
      const v2 = validateCompositionIR(timeline.compositionV2);
      errors.push(...v2.errors);
    }

    return { valid: errors.length === 0, errors };
  }

  public static validateV2(timeline: TimelineIR): ReturnType<typeof validateCompositionIR> {
    return validateCompositionIR(timeline.compositionV2 ?? upgradeTimelineIR(timeline));
  }
}

export { MEDIA_TIMEBASE, millisecondsToMediaTime };
export type { CompositionIR };
