import { describe, expect, it } from "vitest";
import { millisecondsToMediaTime, type CompositionIR } from "../core/timeline/CompositionIR";
import { InMemoryEditor } from "../core/editor/EditorCommandEngine";
import type { EditorCommandEnvelope } from "../core/editor/EditorContracts";

function composition(): CompositionIR {
  const duration = millisecondsToMediaTime(12_000);
  return {
    compositionId: "editor-comp",
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
    metadata: { missionId: "mission-editor" },
  };
}

describe("ShortForge editor contract", () => {
  it("opens and applies a deterministic edit command with cryptographic receipts", async () => {
    const editor = new InMemoryEditor();
    await editor.open({
      sessionId: "session-1",
      compositionId: "editor-comp",
      revision: 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: "user-1" },
    }, composition());

    const input: EditorCommandEnvelope = {
      commandId: "cmd-1",
      sessionId: "session-1",
      expectedRevision: 0,
      actor: { kind: "HUMAN", id: "user-1" },
      command: {
        type: "TRIM_CLIP",
        trackId: "video",
        clipId: "clip",
        start: millisecondsToMediaTime(1_000),
        end: millisecondsToMediaTime(8_000),
      },
    };

    const receipt = await editor.apply(input);
    expect(receipt.accepted).toBe(true);
    expect(receipt.revision).toBe(1);
    expect(receipt.compositionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.commandDigestSha256).toMatch(/^[a-f0-9]{64}$/);

    const document = await editor.getDocument("session-1");
    expect(document.composition.tracks[0].clips[0].duration)
      .toBe(millisecondsToMediaTime(7_000));
  });

  it("fails closed on stale edits and review/read-only sessions", async () => {
    const editor = new InMemoryEditor();
    const base = composition();

    await editor.open({
      sessionId: "session-2",
      compositionId: base.compositionId,
      revision: 0,
      mode: "EDIT",
      actor: { kind: "AGENT", id: "ascalon" },
    }, base);

    const staleCommand: EditorCommandEnvelope = {
      commandId: "cmd-stale",
      sessionId: "session-2",
      expectedRevision: 7,
      actor: { kind: "AGENT", id: "ascalon" },
      command: {
        type: "MOVE_CLIP",
        trackId: "video",
        clipId: "clip",
        start: millisecondsToMediaTime(500),
      },
    };

    const stale = await editor.apply(staleCommand);
    expect(stale.accepted).toBe(false);
    expect(stale.error).toBe("EDITOR_REVISION_CONFLICT");

    for (const mode of ["READ_ONLY", "REVIEW"] as const) {
      const sessionId = `session-${mode.toLowerCase()}`;
      await editor.open({
        sessionId,
        compositionId: base.compositionId,
        revision: 0,
        mode,
        actor: { kind: "HUMAN", id: "reviewer" },
      }, base);

      const readonlyReceipt = await editor.apply({
        ...staleCommand,
        commandId: `cmd-${mode.toLowerCase()}`,
        sessionId,
        expectedRevision: 0,
        actor: { kind: "HUMAN", id: "reviewer" },
      });

      expect(readonlyReceipt.accepted).toBe(false);
      expect(readonlyReceipt.error).toBe("EDITOR_READ_ONLY");
    }
  });

  it("enforces actor identity and idempotent command application", async () => {
    const editor = new InMemoryEditor();
    const base = composition();

    await editor.open({
      sessionId: "session-idempotent",
      compositionId: base.compositionId,
      revision: 0,
      mode: "EDIT",
      actor: { kind: "AGENT", id: "ascalon" },
    }, base);

    const command: EditorCommandEnvelope = {
      commandId: "cmd-once",
      sessionId: "session-idempotent",
      expectedRevision: 0,
      actor: { kind: "AGENT", id: "ascalon" },
      command: {
        type: "MOVE_CLIP",
        trackId: "video",
        clipId: "clip",
        start: millisecondsToMediaTime(500),
      },
    };

    const first = await editor.apply(command);
    const retry = await editor.apply(command);

    expect(first.accepted).toBe(true);
    expect(retry).toEqual(first);
    expect((await editor.getDocument("session-idempotent")).revision).toBe(1);

    const actorMismatch = await editor.apply({
      ...command,
      commandId: "cmd-actor-mismatch",
      expectedRevision: 1,
      actor: { kind: "HUMAN", id: "attacker" },
    });
    expect(actorMismatch.accepted).toBe(false);
    expect(actorMismatch.error).toBe("EDITOR_ACTOR_MISMATCH");

    const reused = await editor.apply({
      ...command,
      command: {
        ...command.command,
        start: millisecondsToMediaTime(600),
      },
    });
    expect(reused.accepted).toBe(false);
    expect(reused.error).toBe("EDITOR_COMMAND_ID_REUSE");
  });

  it("executes Studio transform, keyframe, background, and transition commands through the canonical command engine", async () => {
    const editor = new InMemoryEditor();
    const base = composition();
    await editor.open({
      sessionId: "studio-session",
      compositionId: base.compositionId,
      revision: 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: "studio-user" },
    }, base);

    const commands: EditorCommandEnvelope[] = [
      {
        commandId: "studio-transform",
        sessionId: "studio-session",
        expectedRevision: 0,
        actor: { kind: "HUMAN", id: "studio-user" },
        command: {
          type: "SET_CLIP_TRANSFORM",
          trackId: "video",
          clipId: "clip",
          transform: { x: 120, y: -80, scaleX: 1.15, scaleY: 1.15, rotationDeg: 8, opacity: 0.9 },
        },
      },
      {
        commandId: "studio-keyframes",
        sessionId: "studio-session",
        expectedRevision: 1,
        actor: { kind: "HUMAN", id: "studio-user" },
        command: {
          type: "SET_CLIP_ANIMATIONS",
          trackId: "video",
          clipId: "clip",
          animations: [{
            property: "x",
            keyframes: [
              { time: 0, value: -200 },
              { time: millisecondsToMediaTime(2_000), value: 200 },
            ],
          }],
        },
      },
      {
        commandId: "studio-background",
        sessionId: "studio-session",
        expectedRevision: 2,
        actor: { kind: "HUMAN", id: "studio-user" },
        command: {
          type: "SET_CANVAS_BACKGROUND",
          background: {
            kind: "GRADIENT",
            value: { start: "#101828", end: "#5b21b6", direction: "VERTICAL" },
          },
        },
      },
      {
        commandId: "studio-transition",
        sessionId: "studio-session",
        expectedRevision: 3,
        actor: { kind: "HUMAN", id: "studio-user" },
        command: {
          type: "SET_TRANSITION",
          trackId: "video",
          clipId: "clip",
          edge: "IN",
          transition: {
            transitionId: "studio-transition-node",
            kind: "FADE",
            duration: millisecondsToMediaTime(500),
          },
        },
      },
    ];

    for (const command of commands) {
      const receipt = await editor.apply(command);
      expect(receipt.accepted, JSON.stringify(receipt)).toBe(true);
    }

    const document = await editor.getDocument("studio-session");
    const clip = document.composition.tracks[0].clips[0];
    expect(clip.transform?.x).toBe(120);
    expect(clip.transform?.opacity).toBe(0.9);
    expect(clip.animations?.[0]?.keyframes).toHaveLength(2);
    expect(document.composition.canvas.background?.kind).toBe("GRADIENT");
    expect(clip.transitionIn?.kind).toBe("FADE");
    expect(document.revision).toBe(4);
  });

  it("rejects a session/composition identity mismatch", async () => {
    const editor = new InMemoryEditor();
    await expect(editor.open({
      sessionId: "session-mismatch",
      compositionId: "other-composition",
      revision: 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: "user" },
    }, composition())).rejects.toThrow("EDITOR_COMPOSITION_ID_MISMATCH");
  });
});