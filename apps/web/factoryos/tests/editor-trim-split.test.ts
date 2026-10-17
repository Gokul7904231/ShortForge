import { describe, expect, it } from "vitest";

import { InMemoryEditor } from "../core/editor/EditorCommandEngine";
import type { EditorCommandEnvelope } from "../core/editor/EditorContracts";
import {
  millisecondsToMediaTime,
  type CompositionIR,
  validateCompositionIR,
} from "../core/timeline/CompositionIR";

function composition(): CompositionIR {
  const duration = millisecondsToMediaTime(12_000);
  return {
    compositionId: "editor-trim-split",
    schemaVersion: "2.0.0",
    canvas: {
      width: 1080,
      height: 1920,
      frameRate: { numerator: 30, denominator: 1 },
      duration,
    },
    tracks: [{
      id: "video",
      kind: "VIDEO",
      zIndex: 0,
      clips: [{
        id: "clip-main",
        kind: "VIDEO",
        assetId: "source-video",
        src: "cas://" + "a".repeat(64),
        start: 0,
        duration: millisecondsToMediaTime(10_000),
        sourceIn: 0,
        sourceDuration: millisecondsToMediaTime(10_000),
        zIndex: 0,
      }],
    }],
    audio: [{
      id: "voice",
      kind: "VOICE",
      src: "cas://" + "b".repeat(64),
      start: 0,
      duration,
      volume: 1,
    }],
    captions: [],
    metadata: { missionId: "editor-trim-split-test" },
  };
}

async function openEditor(sessionId: string) {
  const editor = new InMemoryEditor();
  const value = composition();
  const actor = { kind: "HUMAN" as const, id: "editor-test-user" };
  await editor.open({
    sessionId,
    compositionId: value.compositionId,
    revision: 0,
    mode: "EDIT",
    actor,
  }, value);
  return { editor, actor, value };
}

function envelope(
  sessionId: string,
  actor: EditorCommandEnvelope["actor"],
  expectedRevision: number,
  command: EditorCommandEnvelope["command"],
): EditorCommandEnvelope {
  return {
    commandId: "cmd-" + sessionId + "-" + command.type,
    sessionId,
    actor,
    expectedRevision,
    command,
  };
}

describe("native editor trim and split controls", () => {
  it("splits the selected clip at the playhead into source-contiguous clips", async () => {
    const sessionId = "split-session";
    const { editor, actor } = await openEditor(sessionId);
    const receipt = await editor.apply(envelope(
      sessionId,
      actor,
      0,
      {
        type: "SPLIT_CLIP",
        trackId: "video",
        clipId: "clip-main",
        splitTime: millisecondsToMediaTime(4_000),
      },
    ));

    expect(receipt.accepted).toBe(true);
    expect(receipt.revision).toBe(1);
    const document = await editor.getDocument(sessionId);
    const clips = document.composition.tracks[0]!.clips;
    expect(clips.map((clip) => clip.id)).toEqual(["clip-main:a", "clip-main:b"]);
    expect(clips[0]!.duration).toBe(millisecondsToMediaTime(4_000));
    expect(clips[1]!.start).toBe(millisecondsToMediaTime(4_000));
    expect(clips[0]!.sourceIn).toBe(0);
    expect(clips[1]!.sourceIn).toBe(millisecondsToMediaTime(4_000));
    expect(clips[0]!.sourceDuration! + clips[1]!.sourceDuration!)
      .toBe(millisecondsToMediaTime(10_000));
    expect(validateCompositionIR(document.composition).valid).toBe(true);
  });

  it("trims the timeline range and maintains source offset/duration", async () => {
    const sessionId = "trim-session";
    const { editor, actor } = await openEditor(sessionId);
    const receipt = await editor.apply(envelope(
      sessionId,
      actor,
      0,
      {
        type: "TRIM_CLIP",
        trackId: "video",
        clipId: "clip-main",
        start: millisecondsToMediaTime(1_000),
        end: millisecondsToMediaTime(8_000),
      },
    ));

    expect(receipt.accepted).toBe(true);
    const document = await editor.getDocument(sessionId);
    const clip = document.composition.tracks[0]!.clips[0]!;
    expect(clip.start).toBe(millisecondsToMediaTime(1_000));
    expect(clip.duration).toBe(millisecondsToMediaTime(7_000));
    expect(clip.sourceIn).toBe(millisecondsToMediaTime(1_000));
    expect(clip.sourceDuration).toBe(millisecondsToMediaTime(7_000));
    expect(validateCompositionIR(document.composition).valid).toBe(true);
  });

  it("rejects a split at a clip edge without changing the revision", async () => {
    const sessionId = "split-edge-session";
    const { editor, actor } = await openEditor(sessionId);
    const receipt = await editor.apply(envelope(
      sessionId,
      actor,
      0,
      {
        type: "SPLIT_CLIP",
        trackId: "video",
        clipId: "clip-main",
        splitTime: millisecondsToMediaTime(10_000),
      },
    ));
    expect(receipt.accepted).toBe(false);
    expect(receipt.revision).toBe(0);
    expect(receipt.error).toContain("splitTime must fall strictly inside the clip");
    expect((await editor.getDocument(sessionId)).composition.tracks[0]!.clips).toHaveLength(1);
  });
});
