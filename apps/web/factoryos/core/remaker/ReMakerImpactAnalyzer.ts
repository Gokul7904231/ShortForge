import type { TimelineIR } from "../timeline/TimelineIR";
import type { ReMakerFrameRange, ReMakerTargetScope } from "./ReMakerContracts";

export interface ReMakerImpact {
  readonly directNodeIds: readonly string[];
  readonly preservedNodeIds: readonly string[];
  readonly frameRange: ReMakerFrameRange;
  readonly blastRadiusFrames: number;
}

function toFrame(valueMs: number, fps: number): number {
  return Math.floor((valueMs / 1000) * fps);
}

function endFrame(valueMs: number, fps: number): number {
  return Math.max(0, Math.ceil((valueMs / 1000) * fps) - 1);
}

export class ReMakerImpactAnalyzer {
  public static analyze(
    timeline: TimelineIR,
    target: ReMakerTargetScope,
    haloFrames = 2
  ): ReMakerImpact {
    const fps = timeline.canvas.fps;
    const direct = new Set<string>();
    let startMs = Number.POSITIVE_INFINITY;
    let endMs = Number.NEGATIVE_INFINITY;

    const sceneIds = new Set(target.sceneIds || []);
    const clipIds = new Set(target.clipIds || []);
    const audioIds = new Set(target.audioIds || []);
    const subtitleIds = new Set(target.subtitleIds || []);

    for (const clip of timeline.visualTracks) {
      if (clipIds.has(clip.clipId) || sceneIds.has(clip.clipId)) {
        direct.add(clip.clipId);
        startMs = Math.min(startMs, clip.timelineStartMs);
        endMs = Math.max(endMs, clip.timelineStartMs + clip.durationMs);
      }
    }

    for (const audio of timeline.audioTracks) {
      if (audioIds.has(audio.audioId)) {
        direct.add(audio.audioId);
        startMs = Math.min(startMs, audio.timelineStartMs);
        endMs = Math.max(endMs, audio.timelineStartMs + audio.durationMs);
      }
    }

    for (const subtitle of timeline.subtitleTracks) {
      if (subtitleIds.has(subtitle.subtitleId)) {
        direct.add(subtitle.subtitleId);
        startMs = Math.min(startMs, subtitle.startMs);
        endMs = Math.max(endMs, subtitle.endMs);
      }
    }

    if (target.frameRangeMs) {
      startMs = Math.min(startMs, target.frameRangeMs.startMs);
      endMs = Math.max(endMs, target.frameRangeMs.endMs);
    }

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || direct.size === 0) {
      throw new Error(
        "[ReMakerImpactAnalyzer] Surgical repair requires an explicit target that resolves to at least one TimelineIR node."
      );
    }

    const rawStartFrame = toFrame(startMs, fps);
    const rawEndFrame = endFrame(endMs, fps);
    const startFrame = Math.max(0, rawStartFrame - haloFrames);
    const endFrame = Math.min(
      Math.max(0, Math.ceil((timeline.totalDurationMs / 1000) * fps) - 1),
      rawEndFrame + haloFrames
    );

    const preserved: string[] = [];
    for (const clip of timeline.visualTracks) {
      if (!direct.has(clip.clipId)) preserved.push(clip.clipId);
    }
    for (const audio of timeline.audioTracks) {
      if (!direct.has(audio.audioId)) preserved.push(audio.audioId);
    }
    for (const subtitle of timeline.subtitleTracks) {
      if (!direct.has(subtitle.subtitleId)) preserved.push(subtitle.subtitleId);
    }

    return Object.freeze({
      directNodeIds: Object.freeze(Array.from(direct)),
      preservedNodeIds: Object.freeze(preserved),
      frameRange: Object.freeze({
        startFrame,
        endFrame,
        haloBeforeFrames: rawStartFrame - startFrame,
        haloAfterFrames: endFrame - rawEndFrame,
      }),
      blastRadiusFrames: endFrame - startFrame + 1,
    });
  }
}
