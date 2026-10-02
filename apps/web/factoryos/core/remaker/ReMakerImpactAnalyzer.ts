import type { TimelineIR } from "../timeline/TimelineIR";
import { createHash } from "node:crypto";
import type { ReMakerFrameRange, ReMakerTargetScope } from "./ReMakerContracts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) =>
    JSON.stringify(key) + ":" + stableStringify(record[key])
  ).join(",") + "}";
}

export interface ReMakerImpact {
  readonly directNodeIds: readonly string[];
  readonly renderSceneIds: readonly string[];
  readonly preservedNodeIds: readonly string[];
  readonly preservedNodeFingerprints: Readonly<Record<string, string>>;
  readonly frameRange: ReMakerFrameRange;
  readonly blastRadiusFrames: number;
}

function toFrame(valueMs: number, fps: number): number {
  return Math.floor((valueMs / 1000) * fps);
}

function computeEndFrame(valueMs: number, fps: number): number {
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

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new Error(
        "[ReMakerImpactAnalyzer] Surgical repair requires a resolvable temporal target."
      );
    }

    const rawStartFrame = toFrame(startMs, fps);
    const rawEndFrame = computeEndFrame(endMs, fps);
    const startFrame = Math.max(0, rawStartFrame - haloFrames);
    const endFrame = Math.min(
      Math.max(0, Math.ceil((timeline.totalDurationMs / 1000) * fps) - 1),
      rawEndFrame + haloFrames
    );

    const renderSceneIds = timeline.visualTracks
      .filter((clip) => {
        const clipStart = toFrame(clip.timelineStartMs, fps);
        const clipEnd = computeEndFrame(clip.timelineStartMs + clip.durationMs, fps);
        return clipEnd >= startFrame && clipStart <= endFrame;
      })
      .map((clip) => clip.clipId);

    // A pure frame/region target has no logical node ID; the overlapping
    // visual scenes become its changed render nodes.
    if (direct.size === 0) {
      for (const sceneId of renderSceneIds) direct.add(sceneId);
    }

    if (direct.size === 0) {
      throw new Error(
        "[ReMakerImpactAnalyzer] Surgical repair window does not intersect any renderable TimelineIR scene."
      );
    }

    const preserved: string[] = [];
    const preservedFingerprints: Record<string, string> = {};
    const addPreserved = (id: string, node: unknown) => {
      preserved.push(id);
      preservedFingerprints[id] = createHash("sha256")
        .update(stableStringify(node))
        .digest("hex");
    };
    for (const clip of timeline.visualTracks) {
      if (!direct.has(clip.clipId)) addPreserved(clip.clipId, clip);
    }
    for (const audio of timeline.audioTracks) {
      if (!direct.has(audio.audioId)) addPreserved(audio.audioId, audio);
    }
    for (const subtitle of timeline.subtitleTracks) {
      if (!direct.has(subtitle.subtitleId)) addPreserved(subtitle.subtitleId, subtitle);
    }

    return Object.freeze({
      directNodeIds: Object.freeze(Array.from(direct)),
      renderSceneIds: Object.freeze(renderSceneIds),
      preservedNodeIds: Object.freeze(preserved),
      preservedNodeFingerprints: Object.freeze(preservedFingerprints),
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
