import { createHash, randomUUID } from "node:crypto";
import {
  canonicalizeComposition,
  validateCompositionIR,
  type CompositionIR,
} from "../timeline/CompositionIR";
import {
  changedClipIds,
  applyEditorCommand,
} from "./EditorCommandEngine";
import type {
  EditorActor,
  EditorCommandEnvelope,
  EditorDocument,
  EditorReceipt,
  EditorSession,
  ShortForgeEditorAPI,
} from "./EditorContracts";
import type {
  AppendEditorRevisionInput,
  DurableEditorHistoryAPI,
  EditorCheckpoint,
  EditorReplayReport,
  EditorRevisionNode,
  EditorRevisionStore,
  EditorOperationRecord,
} from "./EditorRevisionContracts";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compositionHash(composition: CompositionIR): string {
  return sha256(canonicalizeComposition(composition));
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

function deterministicControlCommandId(
  sessionId: string,
  action: "UNDO" | "REDO" | "RESTORE",
  headRevisionId: string,
  targetRevisionId: string,
): string {
  return sha256(
    canonicalizeComposition({
      sessionId,
      action,
      headRevisionId,
      targetRevisionId,
    }),
  );
}

function actorEqual(a: EditorActor, b: EditorActor): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function receipt(
  commandId: string,
  accepted: boolean,
  revision: number,
  composition: CompositionIR,
  before: CompositionIR | undefined,
  error?: string,
  commandDigestSha256?: string,
): EditorReceipt {
  return {
    commandId,
    accepted,
    revision,
    compositionHash: compositionHash(composition),
    changedClipIds: before ? changedClipIds(before, composition) : [],
    commandDigestSha256,
    error,
  };
}

export class DurableEditor implements ShortForgeEditorAPI, DurableEditorHistoryAPI {
  private readonly sessions = new Map<string, EditorSession>();

  constructor(private readonly store: EditorRevisionStore) {}

  async open(session: EditorSession, composition: CompositionIR): Promise<EditorDocument> {
    const report = validateCompositionIR(composition);
    if (!report.valid) {
      throw new Error(`Editor rejected invalid composition: ${report.errors.join("; ")}`);
    }
    if (session.compositionId !== composition.compositionId) {
      throw new Error("EDITOR_COMPOSITION_ID_MISMATCH");
    }

    const head = await this.store.initialize(composition, session.actor);
    this.sessions.set(session.sessionId, {
      ...session,
      revision: head.revision,
    });

    return {
      composition: head.composition,
      revision: head.revision,
      compositionHash: head.compositionHashSha256,
    };
  }

  private async getSession(sessionId: string): Promise<EditorSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("EDITOR_SESSION_NOT_FOUND");
    return session;
  }

  private async getHead(sessionId: string): Promise<EditorRevisionNode> {
    const session = await this.getSession(sessionId);
    const head = await this.store.getHead(session.compositionId);
    if (!head) throw new Error("EDITOR_COMPOSITION_NOT_INITIALIZED");
    this.sessions.set(sessionId, { ...session, revision: head.revision });
    return head;
  }

  async apply(input: EditorCommandEnvelope): Promise<EditorReceipt> {
    const session = await this.getSession(input.sessionId);
    const existing = await this.store.findCommand(session.compositionId, input.commandId);

    if (existing) {
      const digest = commandDigest(input);
      if (existing.commandDigestSha256 !== digest) {
        return receipt(
          input.commandId,
          false,
          existing.revision,
          existing.composition,
          undefined,
          "EDITOR_COMMAND_ID_REUSE",
          digest,
        );
      }
      const parent = existing.parentRevisionId
        ? await this.store.getRevision(existing.parentRevisionId)
        : undefined;
      return receipt(
        existing.commandId,
        true,
        existing.revision,
        existing.composition,
        parent?.composition,
        undefined,
        existing.commandDigestSha256,
      );
    }

    if (!actorEqual(input.actor, session.actor)) {
      const head = await this.getHead(input.sessionId);
      return receipt(input.commandId, false, head.revision, head.composition, undefined, "EDITOR_ACTOR_MISMATCH", commandDigest(input));
    }

    if (session.mode !== "EDIT") {
      const head = await this.getHead(input.sessionId);
      return receipt(input.commandId, false, head.revision, head.composition, undefined, "EDITOR_READ_ONLY", commandDigest(input));
    }

    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      const head = await this.getHead(input.sessionId);
      return receipt(input.commandId, false, head.revision, head.composition, undefined, "EDITOR_INVALID_EXPECTED_REVISION", commandDigest(input));
    }

    const head = await this.getHead(input.sessionId);
    const digest = commandDigest(input);
    if (input.expectedRevision !== head.revision) {
      return receipt(input.commandId, false, head.revision, head.composition, undefined, "EDITOR_REVISION_CONFLICT", digest);
    }

    try {
      const next = applyEditorCommand(head.composition, input.command);
      const validation = validateCompositionIR(next);
      if (!validation.valid) {
        return receipt(input.commandId, false, head.revision, head.composition, undefined, `EDITOR_VALIDATION_FAILED: ${validation.errors.join("; ")}`, digest);
      }

      const revisionId = randomUUID();
      const append: AppendEditorRevisionInput = {
        compositionId: head.compositionId,
        parentRevisionId: head.revisionId,
        parentRevision: head.revision,
        kind: "COMMAND",
        actor: input.actor,
        commandId: input.commandId,
        commandDigestSha256: digest,
        command: input.command,
        composition: next,
        compositionHashSha256: compositionHash(next),
        history: { cursorRevisionId: revisionId, redoStackRevisionIds: [] },
        operationId: randomUUID(),
        revisionId,
        createdAt: new Date().toISOString(),
      };

      const committed = await this.store.appendRevision(append);
      this.sessions.set(input.sessionId, { ...session, revision: committed.revision });
      return receipt(committed.commandId!, true, committed.revision, committed.composition, head.composition, undefined, committed.commandDigestSha256);
    } catch (error) {
      const fresh = await this.getHead(input.sessionId);
      const message = error instanceof Error ? error.message : "EDITOR_COMMAND_FAILED";
      return receipt(input.commandId, false, fresh.revision, fresh.composition, undefined, message, digest);
    }
  }

  async getDocument(sessionId: string): Promise<EditorDocument> {
    const head = await this.getHead(sessionId);
    return {
      composition: head.composition,
      revision: head.revision,
      compositionHash: head.compositionHashSha256,
    };
  }

  async undo(sessionId: string): Promise<EditorReceipt> {
    const session = await this.getSession(sessionId);
    if (session.mode !== "EDIT") {
      const head = await this.getHead(sessionId);
      return receipt(
        "undo-rejected",
        false,
        head.revision,
        head.composition,
        undefined,
        "EDITOR_READ_ONLY",
      );
    }

    const head = await this.getHead(sessionId);
    const cursor = await this.store.getRevision(head.history.cursorRevisionId);
    if (!cursor || !cursor.parentRevisionId) {
      return receipt("undo-unavailable", false, head.revision, head.composition, undefined, "EDITOR_UNDO_UNAVAILABLE");
    }

    const target = await this.store.getRevision(cursor.parentRevisionId);
    if (!target) return receipt("undo-unavailable", false, head.revision, head.composition, undefined, "EDITOR_HISTORY_CORRUPT");

    const commandId = "control:undo:" + deterministicControlCommandId(sessionId, "UNDO", head.revisionId, target.revisionId);
    const digest = sha256(canonicalizeComposition({
      actor: session.actor,
      action: "UNDO",
      headRevisionId: head.revisionId,
      targetRevisionId: target.revisionId,
    }));
    const revisionId = randomUUID();

    try {
      const committed = await this.store.appendRevision({
        compositionId: head.compositionId,
        parentRevisionId: head.revisionId,
        parentRevision: head.revision,
        kind: "UNDO",
        actor: session.actor,
        commandId,
        commandDigestSha256: digest,
        restoreFromRevisionId: target.revisionId,
        composition: target.composition,
        compositionHashSha256: target.compositionHashSha256,
        history: {
          cursorRevisionId: target.revisionId,
          redoStackRevisionIds: [...head.history.redoStackRevisionIds, cursor.revisionId],
        },
        operationId: randomUUID(),
        revisionId,
        createdAt: new Date().toISOString(),
      });
      this.sessions.set(sessionId, { ...session, revision: committed.revision });
      return receipt(committed.commandId!, true, committed.revision, committed.composition, head.composition, undefined, committed.commandDigestSha256);
    } catch (error) {
      const fresh = await this.getHead(sessionId);
      return receipt(
        commandId,
        false,
        fresh.revision,
        fresh.composition,
        undefined,
        error instanceof Error ? error.message : "EDITOR_UNDO_FAILED",
        digest,
      );
    }
  }

  async redo(sessionId: string): Promise<EditorReceipt> {
    const session = await this.getSession(sessionId);
    if (session.mode !== "EDIT") {
      const head = await this.getHead(sessionId);
      return receipt("redo-rejected", false, head.revision, head.composition, undefined, "EDITOR_READ_ONLY");
    }

    const head = await this.getHead(sessionId);
    const targetRevisionId = head.history.redoStackRevisionIds.at(-1);
    if (!targetRevisionId) {
      return receipt("redo-unavailable", false, head.revision, head.composition, undefined, "EDITOR_REDO_UNAVAILABLE");
    }

    const target = await this.store.getRevision(targetRevisionId);
    if (!target) return receipt("redo-unavailable", false, head.revision, head.composition, undefined, "EDITOR_HISTORY_CORRUPT");

    const commandId = "control:redo:" + deterministicControlCommandId(sessionId, "REDO", head.revisionId, target.revisionId);
    const digest = sha256(canonicalizeComposition({
      actor: session.actor,
      action: "REDO",
      headRevisionId: head.revisionId,
      targetRevisionId: target.revisionId,
    }));
    const revisionId = randomUUID();

    try {
      const committed = await this.store.appendRevision({
        compositionId: head.compositionId,
        parentRevisionId: head.revisionId,
        parentRevision: head.revision,
        kind: "REDO",
        actor: session.actor,
        commandId,
        commandDigestSha256: digest,
        restoreFromRevisionId: target.revisionId,
        composition: target.composition,
        compositionHashSha256: target.compositionHashSha256,
        history: {
          cursorRevisionId: target.revisionId,
          redoStackRevisionIds: head.history.redoStackRevisionIds.slice(0, -1),
        },
        operationId: randomUUID(),
        revisionId,
        createdAt: new Date().toISOString(),
      });
      this.sessions.set(sessionId, { ...session, revision: committed.revision });
      return receipt(committed.commandId!, true, committed.revision, committed.composition, head.composition, undefined, committed.commandDigestSha256);
    } catch (error) {
      const fresh = await this.getHead(sessionId);
      return receipt(
        commandId,
        false,
        fresh.revision,
        fresh.composition,
        undefined,
        error instanceof Error ? error.message : "EDITOR_REDO_FAILED",
        digest,
      );
    }
  }

  async checkpoint(sessionId: string, reason?: string): Promise<EditorCheckpoint> {
    const head = await this.getHead(sessionId);
    const checkpoint: EditorCheckpoint = {
      checkpointId: "chk_" + randomUUID().replace(/-/g, "").slice(0, 16),
      compositionId: head.compositionId,
      revisionId: head.revisionId,
      revision: head.revision,
      composition: head.composition,
      compositionHashSha256: head.compositionHashSha256,
      reason,
      createdAt: new Date().toISOString(),
    };
    await this.store.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  async restore(sessionId: string, checkpointId: string): Promise<EditorReceipt> {
    const session = await this.getSession(sessionId);
    if (session.mode !== "EDIT") {
      const head = await this.getHead(sessionId);
      return receipt("restore-rejected", false, head.revision, head.composition, undefined, "EDITOR_READ_ONLY");
    }

    const head = await this.getHead(sessionId);
    const checkpoint = await this.store.getCheckpoint(head.compositionId, checkpointId);
    if (!checkpoint) {
      return receipt("restore-missing", false, head.revision, head.composition, undefined, "EDITOR_CHECKPOINT_NOT_FOUND");
    }

    const commandId = "control:restore:" + deterministicControlCommandId(sessionId, "RESTORE", head.revisionId, checkpoint.revisionId);
    const digest = sha256(canonicalizeComposition({
      actor: session.actor,
      action: "RESTORE",
      headRevisionId: head.revisionId,
      targetRevisionId: checkpoint.revisionId,
      checkpointId,
    }));
    const revisionId = randomUUID();

    try {
      const committed = await this.store.appendRevision({
        compositionId: head.compositionId,
        parentRevisionId: head.revisionId,
        parentRevision: head.revision,
        kind: "RESTORE",
        actor: session.actor,
        commandId,
        commandDigestSha256: digest,
        restoreFromRevisionId: checkpoint.revisionId,
        composition: checkpoint.composition,
        compositionHashSha256: checkpoint.compositionHashSha256,
        history: { cursorRevisionId: checkpoint.revisionId, redoStackRevisionIds: [] },
        operationId: randomUUID(),
        revisionId,
        createdAt: new Date().toISOString(),
      });
      this.sessions.set(sessionId, { ...session, revision: committed.revision });
      return receipt(committed.commandId!, true, committed.revision, committed.composition, head.composition, undefined, committed.commandDigestSha256);
    } catch (error) {
      const fresh = await this.getHead(sessionId);
      return receipt(
        commandId,
        false,
        fresh.revision,
        fresh.composition,
        undefined,
        error instanceof Error ? error.message : "EDITOR_RESTORE_FAILED",
        digest,
      );
    }
  }

  async replay(compositionId: string): Promise<EditorReplayReport> {
    const rows = await this.store.listRevisions(compositionId);
    if (rows.length === 0) {
      return { valid: false, compositionId, revisionCount: 0, error: "EDITOR_HISTORY_NOT_FOUND", checkedRevisionIds: [] };
    }

    const byId = new Map(rows.map((row) => [row.revisionId, row]));
    let current: EditorRevisionNode | null = null;
    const checked: string[] = [];

    for (const row of rows) {
      checked.push(row.revisionId);

      if (row.kind === "ROOT") {
        if (row.revision !== 0 || row.parentRevisionId) {
          return { valid: false, compositionId, revisionCount: rows.length, error: "EDITOR_ROOT_INVALID", checkedRevisionIds: checked };
        }
        current = row;
      } else {
        if (!current || row.parentRevisionId !== current.revisionId || row.revision !== current.revision + 1) {
          return { valid: false, compositionId, revisionCount: rows.length, error: `EDITOR_REVISION_CHAIN_BROKEN:${row.revisionId}`, checkedRevisionIds: checked };
        }

        if (row.kind === "COMMAND") {
          if (!row.command) {
            return { valid: false, compositionId, revisionCount: rows.length, error: `EDITOR_OPERATION_MISSING_COMMAND:${row.revisionId}`, checkedRevisionIds: checked };
          }
          try {
            current = {
              ...row,
              composition: applyEditorCommand(current.composition, row.command),
            };
          } catch (error) {
            return {
              valid: false,
              compositionId,
              revisionCount: rows.length,
              error: `EDITOR_REPLAY_COMMAND_FAILED:${row.revisionId}:${String(error)}`,
              checkedRevisionIds: checked,
            };
          }
        } else {
          if (!row.restoreFromRevisionId) {
            return { valid: false, compositionId, revisionCount: rows.length, error: `EDITOR_CONTROL_OPERATION_MISSING_TARGET:${row.revisionId}`, checkedRevisionIds: checked };
          }
          const target = byId.get(row.restoreFromRevisionId);
          if (!target) {
            return { valid: false, compositionId, revisionCount: rows.length, error: `EDITOR_RESTORE_TARGET_MISSING:${row.revisionId}`, checkedRevisionIds: checked };
          }
          current = { ...row, composition: target.composition };
        }
      }

      const actualHash = compositionHash(current.composition);
      if (actualHash !== row.compositionHashSha256) {
        return { valid: false, compositionId, revisionCount: rows.length, error: `EDITOR_REPLAY_HASH_MISMATCH:${row.revisionId}`, checkedRevisionIds: checked };
      }
      const validation = validateCompositionIR(row.composition);
      if (!validation.valid) {
        return { valid: false, compositionId, revisionCount: rows.length, error: `EDITOR_REPLAY_INVALID_COMPOSITION:${row.revisionId}`, checkedRevisionIds: checked };
      }
    }

    return {
      valid: true,
      compositionId,
      revisionCount: rows.length,
      replayedThroughRevisionId: rows[rows.length - 1].revisionId,
      finalComposition: rows[rows.length - 1].composition,
      finalCompositionHashSha256: rows[rows.length - 1].compositionHashSha256,
      checkedRevisionIds: checked,
    };
  }

  async listHistory(sessionId: string): Promise<EditorRevisionNode[]> {
    const session = await this.getSession(sessionId);
    return this.store.listRevisions(session.compositionId);
  }

  async listOperations(sessionId: string): Promise<EditorOperationRecord[]> {
    const session = await this.getSession(sessionId);
    return this.store.listOperations(session.compositionId);
  }

  async listCheckpoints(sessionId: string): Promise<EditorCheckpoint[]> {
    const session = await this.getSession(sessionId);
    return this.store.listCheckpoints(session.compositionId);
  }
}
