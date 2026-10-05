import { createHash } from "node:crypto";
import {
  canonicalizeComposition,
  validateCompositionIR,
  type CompositionIR,
} from "../timeline/CompositionIR";
import { moveClip, retimeClip, rippleDelete, splitClip, trimClip } from "../timeline/TimelineTransforms";
import type {
  EditorActor,
  EditorCommand,
  EditorCommandEnvelope,
  EditorDocument,
  EditorReceipt,
  EditorSession,
  ShortForgeEditorAPI,
} from "./EditorContracts";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashDocument(composition: CompositionIR): string {
  return sha256(canonicalizeComposition(composition));
}

function actorEqual(a: EditorActor, b: EditorActor): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function commandDigest(input: EditorCommandEnvelope): string {
  return sha256(
    canonicalizeComposition({
      actor: input.actor,
      expectedRevision: input.expectedRevision,
      command: input.command,
    }),
  );
}

export function changedClipIds(before: CompositionIR, after: CompositionIR): string[] {
  const beforeMap = new Map<string, string>();
  const afterMap = new Map<string, string>();

  for (const track of before.tracks) {
    for (const clip of track.clips) {
      beforeMap.set(clip.id, canonicalizeComposition(clip));
    }
  }

  for (const track of after.tracks) {
    for (const clip of track.clips) {
      afterMap.set(clip.id, canonicalizeComposition(clip));
    }
  }

  return [...new Set([...beforeMap.keys(), ...afterMap.keys()])]
    .filter((id) => beforeMap.get(id) !== afterMap.get(id));
}

function updateClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  updater: (clip: CompositionIR["tracks"][number]["clips"][number]) => CompositionIR["tracks"][number]["clips"][number],
): CompositionIR {
  let found = false;
  const tracks = composition.tracks.map((track) => {
    if (track.id !== trackId) return track;
    return {
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== clipId) return clip;
        found = true;
        return updater(clip);
      }),
    };
  });
  if (!found) throw new Error(`Unknown clip: ${clipId}`);
  return { ...composition, tracks };
}

export function applyEditorCommand(composition: CompositionIR, command: EditorCommand): CompositionIR {
  switch (command.type) {
    case "SPLIT_CLIP":
      return splitClip(composition, command.trackId, command.clipId, command.splitTime);
    case "TRIM_CLIP":
      return trimClip(composition, command.trackId, command.clipId, command.start, command.end);
    case "MOVE_CLIP":
      return moveClip(composition, command.trackId, command.clipId, command.start);
    case "RIPPLE_DELETE":
      return rippleDelete(composition, command.trackId, command.start, command.end, {
        scope: command.scope,
        linkedTrackIds: command.linkedTrackIds,
        includeAudio: command.includeAudio,
        includeCaptions: command.includeCaptions,
      });
    case "RETIME_CLIP":
      return retimeClip(composition, command.trackId, command.clipId, command.duration);
    case "SET_CLIP_TRANSFORM":
      return updateClip(composition, command.trackId, command.clipId, (clip) => ({
        ...clip,
        transform: {
          ...(clip.transform ?? {}),
          ...command.transform,
        },
      }));
    case "SET_CLIP_ANIMATIONS":
      return updateClip(composition, command.trackId, command.clipId, (clip) => ({
        ...clip,
        animations: [...command.animations],
      }));
    case "SET_CANVAS_BACKGROUND":
      return {
        ...composition,
        canvas: {
          ...composition.canvas,
          background: command.background,
        },
      };
    case "ADD_EFFECT":
      return updateClip(composition, command.trackId, command.clipId, (clip) => ({
        ...clip,
        effects: [...(clip.effects ?? []), command.effect],
      }));
    case "ADD_MASK":
      return updateClip(composition, command.trackId, command.clipId, (clip) => ({
        ...clip,
        masks: [...(clip.masks ?? []), command.mask],
      }));
    case "SET_TRANSITION":
      return updateClip(composition, command.trackId, command.clipId, (clip) =>
        command.edge === "IN"
          ? { ...clip, transitionIn: command.transition }
          : { ...clip, transitionOut: command.transition },
      );
  }
}

export class InMemoryEditor implements ShortForgeEditorAPI {
  private readonly sessions = new Map<
    string,
    { session: EditorSession; composition: CompositionIR }
  >();
  private readonly acceptedCommands = new Map<
    string,
    { digest: string; receipt: EditorReceipt }
  >();

  async open(session: EditorSession, composition: CompositionIR): Promise<EditorDocument> {
    const validation = validateCompositionIR(composition);
    if (!validation.valid) {
      throw new Error(`Editor rejected invalid composition: ${validation.errors.join("; ")}`);
    }
    if (session.compositionId !== composition.compositionId) {
      throw new Error("EDITOR_COMPOSITION_ID_MISMATCH");
    }
    if (!Number.isInteger(session.revision) || session.revision < 0) {
      throw new Error("EDITOR_INVALID_SESSION_REVISION");
    }

    for (const key of this.acceptedCommands.keys()) {
      if (key.startsWith(`${session.sessionId}:`)) {
        this.acceptedCommands.delete(key);
      }
    }

    this.sessions.set(session.sessionId, { session, composition });
    return this.getDocument(session.sessionId);
  }

  async apply(input: EditorCommandEnvelope): Promise<EditorReceipt> {
    const state = this.sessions.get(input.sessionId);
    if (!state) {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: -1,
        compositionHash: "",
        changedClipIds: [],
        commandDigestSha256: commandDigest(input),
        error: "EDITOR_SESSION_NOT_FOUND",
      };
    }

    const digest = commandDigest(input);
    const cacheKey = `${input.sessionId}:${input.commandId}`;
    const previous = this.acceptedCommands.get(cacheKey);

    if (previous) {
      if (previous.digest !== digest) {
        return {
          commandId: input.commandId,
          accepted: false,
          revision: state.session.revision,
          compositionHash: hashDocument(state.composition),
          changedClipIds: [],
          commandDigestSha256: digest,
          error: "EDITOR_COMMAND_ID_REUSE",
        };
      }
      return previous.receipt;
    }

    if (!actorEqual(input.actor, state.session.actor)) {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
        commandDigestSha256: digest,
        error: "EDITOR_ACTOR_MISMATCH",
      };
    }

    if (state.session.mode !== "EDIT") {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
        commandDigestSha256: digest,
        error: "EDITOR_READ_ONLY",
      };
    }

    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
        commandDigestSha256: digest,
        error: "EDITOR_INVALID_EXPECTED_REVISION",
      };
    }

    if (input.expectedRevision !== state.session.revision) {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
        commandDigestSha256: digest,
        error: "EDITOR_REVISION_CONFLICT",
      };
    }

    try {
      const before = state.composition;
      const next = applyEditorCommand(before, input.command);
      const validation = validateCompositionIR(next);

      if (!validation.valid) {
        return {
          commandId: input.commandId,
          accepted: false,
          revision: state.session.revision,
          compositionHash: hashDocument(before),
          changedClipIds: [],
          commandDigestSha256: digest,
          error: `EDITOR_VALIDATION_FAILED: ${validation.errors.join("; ")}`,
        };
      }

      const revision = state.session.revision + 1;
      state.composition = next;
      state.session = { ...state.session, revision };

      const receipt: EditorReceipt = {
        commandId: input.commandId,
        accepted: true,
        revision,
        compositionHash: hashDocument(next),
        changedClipIds: changedClipIds(before, next),
        commandDigestSha256: digest,
      };

      this.acceptedCommands.set(cacheKey, { digest, receipt });
      return receipt;
    } catch (error) {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
        commandDigestSha256: digest,
        error: error instanceof Error ? error.message : "EDITOR_COMMAND_FAILED",
      };
    }
  }

  async getDocument(sessionId: string): Promise<EditorDocument> {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error("EDITOR_SESSION_NOT_FOUND");

    return {
      composition: state.composition,
      revision: state.session.revision,
      compositionHash: hashDocument(state.composition),
    };
  }
}
