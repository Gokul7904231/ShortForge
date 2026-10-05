import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { millisecondsToMediaTime, type CompositionIR } from "../core/timeline/CompositionIR";
import { DurableEditor } from "../core/editor/DurableEditor";
import { DiskEditorRevisionStore, InMemoryEditorRevisionStore } from "../core/editor/EditorRevisionStore";
import type { EditorCommandEnvelope } from "../core/editor/EditorContracts";

function composition(): CompositionIR {
  const duration = millisecondsToMediaTime(10_000);
  return {
    compositionId: "durable-editor-comp",
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
        id: "clip",
        kind: "IMAGE",
        assetId: "asset",
        src: "cas://asset",
        start: 0,
        duration,
        zIndex: 0,
      }],
    }],
    audio: [{
      id: "voice",
      kind: "VOICE",
      src: "cas://voice",
      start: 0,
      duration,
      volume: 1,
    }],
    captions: [],
    metadata: { missionId: "mission-durable-editor" },
  };
}

function moveCommand(sessionId: string, revision: number, commandId: string, startMs: number): EditorCommandEnvelope {
  return {
    commandId,
    sessionId,
    expectedRevision: revision,
    actor: { kind: "AGENT", id: "ascalon" },
    command: {
      type: "MOVE_CLIP",
      trackId: "video",
      clipId: "clip",
      start: millisecondsToMediaTime(startMs),
    },
  };
}

describe("Durable editor revision graph", () => {
  it("persists commands across editor restarts and makes command IDs restart-safe", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shortforge-editor-"));
    try {
      const storeA = new DiskEditorRevisionStore(dir);
      const editorA = new DurableEditor(storeA);

      await editorA.open({
        sessionId: "session-a",
        compositionId: "durable-editor-comp",
        revision: 0,
        mode: "EDIT",
        actor: { kind: "AGENT", id: "ascalon" },
      }, composition());

      const first = await editorA.apply(moveCommand("session-a", 0, "cmd-durable-1", 500));
      expect(first.accepted).toBe(true);
      expect(first.revision).toBe(1);

      const checkpoint = await editorA.checkpoint("session-a", "before second edit");

      const second = await editorA.apply(moveCommand("session-a", 1, "cmd-durable-2", 1000));
      expect(second.accepted).toBe(true);
      expect(second.revision).toBe(2);

      const editorB = new DurableEditor(new DiskEditorRevisionStore(dir));
      await editorB.open({
        sessionId: "session-b",
        compositionId: "durable-editor-comp",
        revision: 0,
        mode: "EDIT",
        actor: { kind: "AGENT", id: "ascalon" },
      }, composition());

      const restoredHead = await editorB.getDocument("session-b");
      expect(restoredHead.revision).toBe(2);
      expect(restoredHead.compositionHash).toBe(second.compositionHash);

      const retry = await editorB.apply(moveCommand("session-b", 0, "cmd-durable-1", 500));
      expect(retry.accepted).toBe(true);
      expect(retry.revision).toBe(1);
      expect(retry.commandDigestSha256).toBe(first.commandDigestSha256);

      const restore = await editorB.restore("session-b", checkpoint.checkpointId);
      expect(restore.accepted).toBe(true);
      expect(restore.revision).toBe(3);

      const replay = await editorB.replay("durable-editor-comp");
      expect(replay.valid).toBe(true);
      expect(replay.revisionCount).toBe(4);
      expect(replay.finalCompositionHashSha256).toBe(restore.compositionHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("implements undo/redo as immutable navigation revisions", async () => {
    const editor = new DurableEditor(new InMemoryEditorRevisionStore());
    await editor.open({
      sessionId: "session-history",
      compositionId: "durable-editor-comp",
      revision: 0,
      mode: "EDIT",
      actor: { kind: "AGENT", id: "ascalon" },
    }, composition());

    const a = await editor.apply(moveCommand("session-history", 0, "cmd-a", 500));
    const b = await editor.apply(moveCommand("session-history", 1, "cmd-b", 1000));
    expect(a.revision).toBe(1);
    expect(b.revision).toBe(2);

    const undo1 = await editor.undo("session-history");
    expect(undo1.accepted).toBe(true);
    expect(undo1.revision).toBe(3);
    expect((await editor.getDocument("session-history")).composition.tracks[0].clips[0].start)
      .toBe(millisecondsToMediaTime(500));

    const undo2 = await editor.undo("session-history");
    expect(undo2.accepted).toBe(true);
    expect(undo2.revision).toBe(4);
    expect((await editor.getDocument("session-history")).composition.tracks[0].clips[0].start)
      .toBe(0);

    const redo = await editor.redo("session-history");
    expect(redo.accepted).toBe(true);
    expect(redo.revision).toBe(5);
    expect((await editor.getDocument("session-history")).composition.tracks[0].clips[0].start)
      .toBe(millisecondsToMediaTime(500));

    const history = await editor.listHistory("session-history");
    expect(history.map((item) => item.kind)).toEqual([
      "ROOT",
      "COMMAND",
      "COMMAND",
      "UNDO",
      "UNDO",
      "REDO",
    ]);

    const operations = await editor.listOperations("session-history");
    expect(operations).toHaveLength(6);
    expect(operations.map((item) => item.kind)).toEqual(history.map((item) => item.kind));
  });

  it("clears redo history when a new command diverges after undo", async () => {
    const editor = new DurableEditor(new InMemoryEditorRevisionStore());
    await editor.open({
      sessionId: "session-diverge",
      compositionId: "durable-editor-comp",
      revision: 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: "user" },
    }, composition());

    await editor.apply({
      commandId: "cmd-a",
      sessionId: "session-diverge",
      expectedRevision: 0,
      actor: { kind: "HUMAN", id: "user" },
      command: { type: "MOVE_CLIP", trackId: "video", clipId: "clip", start: millisecondsToMediaTime(500) },
    });
    await editor.undo("session-diverge");

    const divergent = await editor.apply({
      commandId: "cmd-c",
      sessionId: "session-diverge",
      expectedRevision: 2,
      actor: { kind: "HUMAN", id: "user" },
      command: { type: "MOVE_CLIP", trackId: "video", clipId: "clip", start: millisecondsToMediaTime(1500) },
    });
    expect(divergent.accepted).toBe(true);

    const redo = await editor.redo("session-diverge");
    expect(redo.accepted).toBe(false);
    expect(redo.error).toBe("EDITOR_REDO_UNAVAILABLE");

    const replay = await editor.replay("durable-editor-comp");
    expect(replay.valid).toBe(true);
    expect(replay.finalCompositionHashSha256).toBe((await editor.getDocument("session-diverge")).compositionHash);
  });
});
