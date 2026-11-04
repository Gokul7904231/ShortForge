/**
 * Storybeat — Canonical Narrative & Timing Representation for ShortForge Visual Director
 * 
 * Represents an audio-anchored semantic beat within an editorial short.
 * Directly bounds narrative text to physical audio duration from VoiceFabric,
 * extracting focal entities, factual claims, and dramatic purpose.
 */

export type StorybeatRole =
  | "hook"
  | "setup"
  | "question"
  | "option"
  | "think"
  | "reveal"
  | "explanation"
  | "fact"
  | "outro";

export interface StorybeatEntity {
  name: string;
  type: "person" | "location" | "concept" | "date" | "object" | "organization";
  isFocal: boolean;
  wikidataId?: string;
}

export interface StorybeatAudioTiming {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  /** Frame position ceiling at 30fps */
  startFrame: number;
  endFrame: number;
  frameCount: number;
  audioTrackRef?: string;
  hasSpokenAudio: boolean;
}

export interface Storybeat {
  id: string;
  index: number;
  role: StorybeatRole;
  transcript: string;
  audioTiming: StorybeatAudioTiming;
  entities: StorybeatEntity[];
  claims: string[];
  emotionalTone: "curious" | "dramatic" | "urgent" | "celebratory" | "analytical" | "neutral";
  continuityGroupId?: string;
  visualIntent: string;
}

export function createStorybeat(params: {
  id: string;
  index: number;
  role: StorybeatRole;
  transcript: string;
  startSeconds: number;
  durationSeconds: number;
  hasSpokenAudio?: boolean;
  entities?: StorybeatEntity[];
  claims?: string[];
  emotionalTone?: Storybeat["emotionalTone"];
  continuityGroupId?: string;
  visualIntent?: string;
  fps?: number;
}): Storybeat {
  const fps = params.fps || 30;
  const startSeconds = params.startSeconds;
  const durationSeconds = params.durationSeconds;
  const endSeconds = startSeconds + durationSeconds;

  const startFrame = Math.round(startSeconds * fps);
  const frameCount = Math.max(1, Math.ceil(durationSeconds * fps));
  const endFrame = startFrame + frameCount;

  return {
    id: params.id,
    index: params.index,
    role: params.role,
    transcript: params.transcript,
    audioTiming: {
      startSeconds,
      endSeconds,
      durationSeconds,
      startFrame,
      endFrame,
      frameCount,
      hasSpokenAudio: params.hasSpokenAudio ?? (params.transcript.trim().length > 0),
    },
    entities: params.entities || [],
    claims: params.claims || [],
    emotionalTone: params.emotionalTone || "neutral",
    continuityGroupId: params.continuityGroupId,
    visualIntent: params.visualIntent || params.transcript,
  };
}

