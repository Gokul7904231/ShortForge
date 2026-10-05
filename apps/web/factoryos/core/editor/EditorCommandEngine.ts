import { canonicalizeComposition, validateCompositionIR, type CompositionIR } from "../timeline/CompositionIR";
import { moveClip, retimeClip, rippleDelete, splitClip, trimClip } from "../timeline/TimelineTransforms";
import type {
  EditorCommand,
  EditorCommandEnvelope,
  EditorDocument,
  EditorReceipt,
  EditorSession,
  ShortForgeEditorAPI,
} from "./EditorContracts";

function hashDocument(composition: CompositionIR): string {
  // Composition canonicalization is intentionally deterministic. The editor
  // exposes the canonical payload string here; cryptographic hashing remains
  // the responsibility of the upstream receipt/CAS layer.
  return canonicalizeComposition(composition);
}

function changedClipIds(command: EditorCommand): string[] {
  switch (command.type) {
    case "SPLIT_CLIP":
    case "MOVE_CLIP":
    case "TRIM_CLIP":
    case "RETIME_CLIP":
    case "ADD_EFFECT":
    case "ADD_MASK":
    case "SET_TRANSITION":
      return [command.clipId];
    case "RIPPLE_DELETE":
      return [];
  }
}

function applyCommand(composition: CompositionIR, command: EditorCommand): CompositionIR {
  switch (command.type) {
    case "SPLIT_CLIP":
      return splitClip(composition, command.trackId, command.clipId, command.splitTime);
    case "TRIM_CLIP":
      return trimClip(composition, command.trackId, command.clipId, command.start, command.end);
    case "MOVE_CLIP":
      return moveClip(composition, command.trackId, command.clipId, command.start);
    case "RIPPLE_DELETE":
      return rippleDelete(composition, command.trackId, command.start, command.end);
    case "RETIME_CLIP":
      return retimeClip(composition, command.trackId, command.clipId, command.duration);
    case "ADD_EFFECT":
      return {
        ...composition,
        tracks: composition.tracks.map((track) =>
          track.id !== command.trackId
            ? track
            : {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id !== command.clipId
                    ? clip
                    : {
                        ...clip,
                        effects: [...(clip.effects ?? []), command.effect],
                      },
                ),
              },
        ),
      };
    case "ADD_MASK":
      return {
        ...composition,
        tracks: composition.tracks.map((track) =>
          track.id !== command.trackId
            ? track
            : {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id !== command.clipId
                    ? clip
                    : {
                        ...clip,
                        masks: [...(clip.masks ?? []), command.mask],
                      },
                ),
              },
        ),
      };
    case "SET_TRANSITION":
      return {
        ...composition,
        tracks: composition.tracks.map((track) =>
          track.id !== command.trackId
            ? track
            : {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id !== command.clipId
                    ? clip
                    : command.edge === "IN"
                      ? { ...clip, transitionIn: command.transition }
                      : { ...clip, transitionOut: command.transition },
                ),
              },
        ),
      };
  }
}

export class InMemoryEditor implements ShortForgeEditorAPI {
  private readonly sessions = new Map<
    string,
    { session: EditorSession; composition: CompositionIR }
  >();

  async open(session: EditorSession, composition: CompositionIR): Promise<EditorDocument> {
    const validation = validateCompositionIR(composition);
    if (!validation.valid) {
      throw new Error(`Editor rejected invalid composition: ${validation.errors.join("; ")}`);
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
        error: "EDITOR_SESSION_NOT_FOUND",
      };
    }

    if (state.session.mode === "READ_ONLY") {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
        error: "EDITOR_READ_ONLY",
      };
    }

    if (input.expectedRevision !== state.session.revision) {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
        error: "EDITOR_REVISION_CONFLICT",
      };
    }

    try {
      const next = applyCommand(state.composition, input.command);
      const validation = validateCompositionIR(next);
      if (!validation.valid) {
        return {
          commandId: input.commandId,
          accepted: false,
          revision: state.session.revision,
          compositionHash: hashDocument(state.composition),
          changedClipIds: [],
          error: `EDITOR_VALIDATION_FAILED: ${validation.errors.join("; ")}`,
        };
      }

      const revision = state.session.revision + 1;
      state.composition = next;
      state.session = { ...state.session, revision };

      return {
        commandId: input.commandId,
        accepted: true,
        revision,
        compositionHash: hashDocument(next),
        changedClipIds: changedClipIds(input.command),
      };
    } catch (error) {
      return {
        commandId: input.commandId,
        accepted: false,
        revision: state.session.revision,
        compositionHash: hashDocument(state.composition),
        changedClipIds: [],
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
