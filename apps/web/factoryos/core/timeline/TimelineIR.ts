/**
 * FactoryOS v3 — TimelineIR (Timeline Intermediate Representation / EDL)
 * Assimilates clean-room patterns from browser-use/video-use:
 * 1. Semantic word-level transcript alignment acts as the primary synchronization axis.
 * 2. Visual cuts and motion keyframes are structured as discrete timeline nodes.
 * 3. Deterministic serialization guarantees reproducible renders without LLM frame flooding.
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
  readonly volume: number; // 0.0 to 1.0
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
    readonly width: number;  // 1080
    readonly height: number; // 1920
    readonly fps: number;    // 30 or 60
    readonly aspectRatio: "9:16";
  };
  readonly totalDurationMs: number;
  readonly visualTracks: TimelineClipNode[];
  readonly audioTracks: TimelineAudioNode[];
  readonly subtitleTracks: TimelineSubtitleNode[];
  readonly provenanceDigest: string; // SHA-256 hash of deterministic timeline AST
}

export class TimelineIRValidator {
  /**
   * Validates structural invariants of TimelineIR.
   */
  public static validate(timeline: TimelineIR): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (timeline.totalDurationMs <= 0) {
      errors.push("Timeline totalDurationMs must be strictly positive.");
    }

    if (timeline.canvas.width !== 1080 || timeline.canvas.height !== 1920) {
      errors.push("Timeline canvas must be standard vertical shorts format (1080x1920).");
    }

    // Verify clips do not exceed total duration
    for (const clip of timeline.visualTracks) {
      if (clip.timelineStartMs + clip.durationMs > timeline.totalDurationMs + 100) { // allow 100ms tolerance
        errors.push(`Visual clip ${clip.clipId} extends beyond total timeline duration.`);
      }
    }

    // Verify voice audio exists
    const hasVoice = timeline.audioTracks.some((t) => t.trackType === "VOICE");
    if (!hasVoice) {
      errors.push("Timeline must contain at least one VOICE track.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
