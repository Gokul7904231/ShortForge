import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Collection, Db } from "mongodb";
import { canonicalizeComposition, validateCompositionIR, type CompositionIR } from "../timeline/CompositionIR";
import type { EditorActor } from "./EditorContracts";
import type {
  AppendEditorRevisionInput,
  EditorCheckpoint,
  EditorOperationRecord,
  EditorRevisionNode,
  EditorRevisionStore,
} from "./EditorRevisionContracts";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function validateRevisionInput(input: AppendEditorRevisionInput): void {
  const report = validateCompositionIR(input.composition);
  if (!report.valid) {
    throw new Error(`EDITOR_PERSISTENCE_INVALID_COMPOSITION: ${report.errors.join("; ")}`);
  }
  if (input.parentRevision < 0 || !Number.isInteger(input.parentRevision)) {
    throw new Error("EDITOR_PERSISTENCE_INVALID_PARENT_REVISION");
  }
  if (!/^([a-f0-9]{64})$/i.test(input.compositionHashSha256)) {
    throw new Error("EDITOR_PERSISTENCE_INVALID_COMPOSITION_HASH");
  }
  if (input.kind === "COMMAND" && (!input.commandId || !input.command || !input.commandDigestSha256)) {
    throw new Error("EDITOR_PERSISTENCE_COMMAND_METADATA_REQUIRED");
  }
}

function assertCheckpointValid(checkpoint: EditorCheckpoint): void {
  const report = validateCompositionIR(checkpoint.composition);
  if (!report.valid) {
    throw new Error(`EDITOR_CHECKPOINT_INVALID_COMPOSITION: ${report.errors.join("; ")}`);
  }
  if (!checkpoint.checkpointId || !checkpoint.compositionId || !checkpoint.revisionId) {
    throw new Error("EDITOR_CHECKPOINT_INVALID_IDENTITY");
  }
  if (!Number.isInteger(checkpoint.revision) || checkpoint.revision < 0) {
    throw new Error("EDITOR_CHECKPOINT_INVALID_REVISION");
  }
  const expectedHash = sha256(canonicalizeComposition(checkpoint.composition));
  if (expectedHash !== checkpoint.compositionHashSha256) {
    throw new Error("EDITOR_CHECKPOINT_HASH_MISMATCH");
  }
}

function toOperation(node: EditorRevisionNode): EditorOperationRecord {
  return {
    operationId: node.operationId,
    compositionId: node.compositionId,
    revisionId: node.revisionId,
    parentRevisionId: node.parentRevisionId,
    kind: node.kind,
    actor: node.actor,
    commandId: node.commandId,
    commandDigestSha256: node.commandDigestSha256,
    command: node.command,
    restoreFromRevisionId: node.restoreFromRevisionId,
    createdAt: node.createdAt,
  };
}

function materialize(input: AppendEditorRevisionInput, revision: number): EditorRevisionNode {
  return clone({
    revisionId: input.revisionId,
    compositionId: input.compositionId,
    revision,
    parentRevisionId: input.parentRevisionId,
    kind: input.kind,
    actor: input.actor,
    commandId: input.commandId,
    commandDigestSha256: input.commandDigestSha256,
    command: input.command,
    restoreFromRevisionId: input.restoreFromRevisionId,
    composition: input.composition,
    compositionHashSha256: input.compositionHashSha256,
    history: input.history,
    operationId: input.operationId,
    createdAt: input.createdAt,
  });
}

export class InMemoryEditorRevisionStore implements EditorRevisionStore {
  private readonly revisions = new Map<string, EditorRevisionNode>();
  private readonly byComposition = new Map<string, EditorRevisionNode[]>();
  private readonly checkpoints = new Map<string, EditorCheckpoint>();

  async initialize(composition: CompositionIR, actor: EditorActor): Promise<EditorRevisionNode> {
    const report = validateCompositionIR(composition);
    if (!report.valid) throw new Error(report.errors.join("; "));

    const existing = await this.getHead(composition.compositionId);
    if (existing) return existing;

    const revisionId = randomUUID();
    const node: EditorRevisionNode = {
      revisionId,
      compositionId: composition.compositionId,
      revision: 0,
      kind: "ROOT",
      actor,
      composition: clone(composition),
      compositionHashSha256: sha256(canonicalizeComposition(composition)),
      history: { cursorRevisionId: revisionId, redoStackRevisionIds: [] },
      operationId: randomUUID(),
      createdAt: nowIso(),
    };
    this.revisions.set(revisionId, node);
    this.byComposition.set(composition.compositionId, [node]);
    return clone(node);
  }

  async getHead(compositionId: string): Promise<EditorRevisionNode | null> {
    const rows = this.byComposition.get(compositionId) ?? [];
    return rows.length ? clone(rows[rows.length - 1]) : null;
  }

  async getRevision(revisionId: string): Promise<EditorRevisionNode | null> {
    const node = this.revisions.get(revisionId);
    return node ? clone(node) : null;
  }

  async getRevisionByNumber(compositionId: string, revision: number): Promise<EditorRevisionNode | null> {
    const node = (this.byComposition.get(compositionId) ?? []).find((item) => item.revision === revision);
    return node ? clone(node) : null;
  }

  async getChildren(revisionId: string): Promise<EditorRevisionNode[]> {
    const result: EditorRevisionNode[] = [];
    for (const node of this.revisions.values()) {
      if (node.parentRevisionId === revisionId) result.push(clone(node));
    }
    return result.sort((a, b) => a.revision - b.revision);
  }

  async findCommand(compositionId: string, commandId: string): Promise<EditorRevisionNode | null> {
    const rows = this.byComposition.get(compositionId) ?? [];
    const node = rows.find((item) => item.commandId === commandId);
    return node ? clone(node) : null;
  }

  async appendRevision(input: AppendEditorRevisionInput): Promise<EditorRevisionNode> {
    validateRevisionInput(input);
    const existingCommand = input.commandId
      ? await this.findCommand(input.compositionId, input.commandId)
      : null;
    if (existingCommand) {
      if (existingCommand.commandDigestSha256 !== input.commandDigestSha256) {
        throw new Error("EDITOR_COMMAND_ID_REUSE");
      }
      return existingCommand;
    }

    const head = await this.getHead(input.compositionId);
    if (!head || head.revision !== input.parentRevision || head.revisionId !== input.parentRevisionId) {
      throw new Error("EDITOR_REVISION_CONFLICT");
    }

    const node = materialize(input, head.revision + 1);
    this.revisions.set(node.revisionId, node);
    const rows = this.byComposition.get(input.compositionId) ?? [];
    rows.push(node);
    this.byComposition.set(input.compositionId, rows);
    return clone(node);
  }

  async listRevisions(compositionId: string): Promise<EditorRevisionNode[]> {
    return clone((this.byComposition.get(compositionId) ?? []).sort((a, b) => a.revision - b.revision));
  }

  async listOperations(compositionId: string): Promise<EditorOperationRecord[]> {
    return (await this.listRevisions(compositionId)).map(toOperation);
  }

  async saveCheckpoint(checkpoint: EditorCheckpoint): Promise<void> {
    assertCheckpointValid(checkpoint);
    const key = `${checkpoint.compositionId}:${checkpoint.checkpointId}`;
    if (this.checkpoints.has(key)) throw new Error("EDITOR_CHECKPOINT_ALREADY_EXISTS");
    this.checkpoints.set(key, clone(checkpoint));
  }

  async getCheckpoint(compositionId: string, checkpointId: string): Promise<EditorCheckpoint | null> {
    const item = this.checkpoints.get(`${compositionId}:${checkpointId}`);
    return item ? clone(item) : null;
  }

  async listCheckpoints(compositionId: string): Promise<EditorCheckpoint[]> {
    return [...this.checkpoints.values()]
      .filter((item) => item.compositionId === compositionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(clone);
  }
}

interface DiskJournalEnvelope {
  readonly type: "REVISION";
  readonly revision: EditorRevisionNode;
  readonly operation: EditorOperationRecord;
}

export class DiskEditorRevisionStore implements EditorRevisionStore {
  constructor(private readonly baseDir: string) {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private compositionDir(compositionId: string): string {
    const id = sha256(compositionId).slice(0, 24);
    const dir = path.join(this.baseDir, "editor-revisions", id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private journalFile(compositionId: string): string {
    return path.join(this.compositionDir(compositionId), "journal.jsonl");
  }

  private checkpointDir(compositionId: string): string {
    const dir = path.join(this.compositionDir(compositionId), "checkpoints");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private readRows(compositionId: string): EditorRevisionNode[] {
    const file = this.journalFile(compositionId);
    if (!fs.existsSync(file)) return [];

    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    const rows: EditorRevisionNode[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        const envelope = JSON.parse(line) as DiskJournalEnvelope;
        if (envelope.type !== "REVISION") throw new Error("EDITOR_JOURNAL_INVALID_TYPE");
        rows.push(envelope.revision);
      } catch (error) {
        // A crash can leave a partial final JSONL line. Any non-final corruption
        // is fail-closed because it could hide history.
        if (index === lines.length - 1) break;
        throw new Error(`EDITOR_JOURNAL_CORRUPT: ${String(error)}`);
      }
    }
    return rows.sort((a, b) => a.revision - b.revision);
  }

  private appendEnvelope(compositionId: string, envelope: DiskJournalEnvelope): void {
    const file = this.journalFile(compositionId);
    const fd = fs.openSync(file, "a");
    try {
      fs.writeSync(fd, JSON.stringify(envelope) + "\n", undefined, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  async initialize(composition: CompositionIR, actor: EditorActor): Promise<EditorRevisionNode> {
    const report = validateCompositionIR(composition);
    if (!report.valid) throw new Error(report.errors.join("; "));
    const existing = await this.getHead(composition.compositionId);
    if (existing) return existing;

    const revisionId = randomUUID();
    const node: EditorRevisionNode = {
      revisionId,
      compositionId: composition.compositionId,
      revision: 0,
      kind: "ROOT",
      actor,
      composition: clone(composition),
      compositionHashSha256: sha256(canonicalizeComposition(composition)),
      history: { cursorRevisionId: revisionId, redoStackRevisionIds: [] },
      operationId: randomUUID(),
      createdAt: nowIso(),
    };
    this.appendEnvelope(composition.compositionId, { type: "REVISION", revision: node, operation: toOperation(node) });
    return clone(node);
  }

  async getHead(compositionId: string): Promise<EditorRevisionNode | null> {
    const rows = this.readRows(compositionId);
    return rows.length ? clone(rows[rows.length - 1]) : null;
  }

  async getRevision(revisionId: string): Promise<EditorRevisionNode | null> {
    for (const compositionId of this.listCompositionIds()) {
      const row = this.readRows(compositionId).find((item) => item.revisionId === revisionId);
      if (row) return clone(row);
    }
    return null;
  }

  private listCompositionIds(): string[] {
    const root = path.join(this.baseDir, "editor-revisions");
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory());
  }

  async getRevisionByNumber(compositionId: string, revision: number): Promise<EditorRevisionNode | null> {
    const row = this.readRows(compositionId).find((item) => item.revision === revision);
    return row ? clone(row) : null;
  }

  async getChildren(revisionId: string): Promise<EditorRevisionNode[]> {
    for (const compositionId of this.listCompositionIds()) {
      const rows = this.readRows(compositionId).filter((item) => item.parentRevisionId === revisionId);
      if (rows.length) return clone(rows.sort((a, b) => a.revision - b.revision));
    }
    return [];
  }

  async findCommand(compositionId: string, commandId: string): Promise<EditorRevisionNode | null> {
    const row = this.readRows(compositionId).find((item) => item.commandId === commandId);
    return row ? clone(row) : null;
  }

  async appendRevision(input: AppendEditorRevisionInput): Promise<EditorRevisionNode> {
    validateRevisionInput(input);
    const existing = input.commandId ? await this.findCommand(input.compositionId, input.commandId) : null;
    if (existing) {
      if (existing.commandDigestSha256 !== input.commandDigestSha256) throw new Error("EDITOR_COMMAND_ID_REUSE");
      return existing;
    }

    const head = await this.getHead(input.compositionId);
    if (!head || head.revision !== input.parentRevision || head.revisionId !== input.parentRevisionId) {
      throw new Error("EDITOR_REVISION_CONFLICT");
    }

    const node = materialize(input, head.revision + 1);
    this.appendEnvelope(input.compositionId, { type: "REVISION", revision: node, operation: toOperation(node) });
    return clone(node);
  }

  async listRevisions(compositionId: string): Promise<EditorRevisionNode[]> {
    return clone(this.readRows(compositionId));
  }

  async listOperations(compositionId: string): Promise<EditorOperationRecord[]> {
    return clone(this.readRows(compositionId).map(toOperation));
  }

  async saveCheckpoint(checkpoint: EditorCheckpoint): Promise<void> {
    const file = path.join(this.checkpointDir(checkpoint.compositionId), `${checkpoint.checkpointId}.json`);
    if (fs.existsSync(file)) throw new Error("EDITOR_CHECKPOINT_ALREADY_EXISTS");
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), "utf8");
    const fd = fs.openSync(tmp, "r");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  }

  async getCheckpoint(compositionId: string, checkpointId: string): Promise<EditorCheckpoint | null> {
    const file = path.join(this.checkpointDir(compositionId), `${checkpointId}.json`);
    if (!fs.existsSync(file)) return null;
    try { return clone(JSON.parse(fs.readFileSync(file, "utf8")) as EditorCheckpoint); }
    catch (error) { throw new Error(`EDITOR_CHECKPOINT_CORRUPT: ${String(error)}`); }
  }

  async listCheckpoints(compositionId: string): Promise<EditorCheckpoint[]> {
    const dir = this.checkpointDir(compositionId);
    return fs.readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as EditorCheckpoint)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

type MongoDocument = EditorRevisionNode & { _id?: unknown };
type MongoCheckpointDocument = EditorCheckpoint & { _id?: unknown };

export class MongoEditorRevisionStore implements EditorRevisionStore {
  private readonly revisions: Collection<MongoDocument>;
  private readonly checkpoints: Collection<MongoCheckpointDocument>;
  private indexesPromise: Promise<void> | null = null;

  constructor(private readonly db: Db) {
    this.revisions = db.collection("editor_revision_journal");
    this.checkpoints = db.collection("editor_checkpoints");
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.indexesPromise) {
      this.indexesPromise = Promise.all([
        this.revisions.createIndex({ compositionId: 1, revision: 1 }, { unique: true }),
        this.revisions.createIndex({ revisionId: 1 }, { unique: true }),
        this.revisions.createIndex({ compositionId: 1, commandId: 1 }, { unique: true, sparse: true }),
        this.revisions.createIndex({ compositionId: 1, createdAt: 1 }),
        this.revisions.createIndex({ parentRevisionId: 1 }),
        this.checkpoints.createIndex({ compositionId: 1, checkpointId: 1 }, { unique: true }),
        this.checkpoints.createIndex({ compositionId: 1, revision: -1 }),
      ]).then(() => undefined);
    }
    await this.indexesPromise;
  }

  async initialize(composition: CompositionIR, actor: EditorActor): Promise<EditorRevisionNode> {
    await this.ensureIndexes();
    const existing = await this.getHead(composition.compositionId);
    if (existing) return existing;

    const revisionId = randomUUID();
    const node: EditorRevisionNode = {
      revisionId,
      compositionId: composition.compositionId,
      revision: 0,
      kind: "ROOT",
      actor,
      composition: clone(composition),
      compositionHashSha256: sha256(canonicalizeComposition(composition)),
      history: { cursorRevisionId: revisionId, redoStackRevisionIds: [] },
      operationId: randomUUID(),
      createdAt: nowIso(),
    };

    try {
      await this.revisions.insertOne(clone(node));
    } catch {
      const raceWinner = await this.getHead(composition.compositionId);
      if (raceWinner) return raceWinner;
      throw new Error("EDITOR_PERSISTENCE_ROOT_INSERT_FAILED");
    }
    return clone(node);
  }

  async getHead(compositionId: string): Promise<EditorRevisionNode | null> {
    await this.ensureIndexes();
    const doc = await this.revisions.findOne(
      { compositionId },
      { sort: { revision: -1 } },
    );
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return clone(rest as EditorRevisionNode);
  }

  async getRevision(revisionId: string): Promise<EditorRevisionNode | null> {
    await this.ensureIndexes();
    const doc = await this.revisions.findOne({ revisionId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return clone(rest as EditorRevisionNode);
  }

  async getRevisionByNumber(compositionId: string, revision: number): Promise<EditorRevisionNode | null> {
    await this.ensureIndexes();
    const doc = await this.revisions.findOne({ compositionId, revision });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return clone(rest as EditorRevisionNode);
  }

  async getChildren(revisionId: string): Promise<EditorRevisionNode[]> {
    await this.ensureIndexes();
    const docs = await this.revisions.find({ parentRevisionId: revisionId }).sort({ revision: 1 }).toArray();
    return docs.map(({ _id, ...rest }) => clone(rest as EditorRevisionNode));
  }

  async findCommand(compositionId: string, commandId: string): Promise<EditorRevisionNode | null> {
    await this.ensureIndexes();
    const doc = await this.revisions.findOne({ compositionId, commandId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return clone(rest as EditorRevisionNode);
  }

  async appendRevision(input: AppendEditorRevisionInput): Promise<EditorRevisionNode> {
    await this.ensureIndexes();
    validateRevisionInput(input);

    const existing = input.commandId
      ? await this.findCommand(input.compositionId, input.commandId)
      : null;
    if (existing) {
      if (existing.commandDigestSha256 !== input.commandDigestSha256) throw new Error("EDITOR_COMMAND_ID_REUSE");
      return existing;
    }

    const head = await this.getHead(input.compositionId);
    if (!head || head.revision !== input.parentRevision || head.revisionId !== input.parentRevisionId) {
      throw new Error("EDITOR_REVISION_CONFLICT");
    }

    const node = materialize(input, head.revision + 1);
    try {
      await this.revisions.insertOne(clone(node));
    } catch (error) {
      const existingCommand = input.commandId
        ? await this.findCommand(input.compositionId, input.commandId)
        : null;
      if (existingCommand) {
        if (existingCommand.commandDigestSha256 !== input.commandDigestSha256) throw new Error("EDITOR_COMMAND_ID_REUSE");
        return existingCommand;
      }
      throw new Error(`EDITOR_REVISION_CONFLICT: ${String(error)}`);
    }
    return clone(node);
  }

  async listRevisions(compositionId: string): Promise<EditorRevisionNode[]> {
    await this.ensureIndexes();
    const docs = await this.revisions.find({ compositionId }).sort({ revision: 1 }).toArray();
    return docs.map(({ _id, ...rest }) => clone(rest as EditorRevisionNode));
  }

  async listOperations(compositionId: string): Promise<EditorOperationRecord[]> {
    const rows = await this.listRevisions(compositionId);
    return rows.map(toOperation);
  }

  async saveCheckpoint(checkpoint: EditorCheckpoint): Promise<void> {
    assertCheckpointValid(checkpoint);
    await this.ensureIndexes();
    try {
      await this.checkpoints.insertOne(clone(checkpoint));
    } catch {
      const existing = await this.getCheckpoint(checkpoint.compositionId, checkpoint.checkpointId);
      if (existing) throw new Error("EDITOR_CHECKPOINT_ALREADY_EXISTS");
      throw new Error("EDITOR_CHECKPOINT_SAVE_FAILED");
    }
  }

  async getCheckpoint(compositionId: string, checkpointId: string): Promise<EditorCheckpoint | null> {
    await this.ensureIndexes();
    const doc = await this.checkpoints.findOne({ compositionId, checkpointId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return clone(rest as EditorCheckpoint);
  }

  async listCheckpoints(compositionId: string): Promise<EditorCheckpoint[]> {
    await this.ensureIndexes();
    const docs = await this.checkpoints.find({ compositionId }).sort({ createdAt: 1 }).toArray();
    return docs.map(({ _id, ...rest }) => clone(rest as EditorCheckpoint));
  }
}
