import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { CounselPacket } from "./FloorGovernanceContracts";

export type FloorCouncilSessionState =
  | "CREATED"
  | "INSTRUCTOR_REVIEW"
  | "ADVISOR_REVIEW"
  | "AUDITOR_REVIEW"
  | "SYNTHESIS"
  | "CLOSED"
  | "ESCALATED";

export interface FloorCouncilMemoryItem {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly provenance: string;
  readonly qualityScore: number;
}

export interface FloorCouncilMemoryContext {
  readonly snapshotId: string;
  readonly generatedAt: string;
  readonly items: readonly FloorCouncilMemoryItem[];
}

export interface FloorCouncilMemoryReference {
  readonly snapshotId: string;
  readonly generatedAt: string;
  readonly itemIds: readonly string[];
}

export interface FloorCouncilSessionRecord {
  readonly sessionId: string;
  readonly proposalId: string;
  readonly floorId: string;
  readonly stateVersion: number;
  readonly actionName: string;
  readonly proposalFingerprint: string;
  readonly contextFingerprint?: string;
  readonly memoryContext?: FloorCouncilMemoryReference;
  readonly state: FloorCouncilSessionState;
  readonly phaseTrace: readonly string[];
  readonly counselPackets: readonly CounselPacket[];
  readonly conflicts: readonly string[];
  readonly decision?: "APPROVE" | "REJECT" | "ESCALATE";
  readonly reason?: string;
  readonly recoveryReason?: string;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface FloorCouncilSessionStore {
  create(record: FloorCouncilSessionRecord): void;
  save(record: FloorCouncilSessionRecord): void;
  get(sessionId: string): FloorCouncilSessionRecord | null;
  listOpen(): FloorCouncilSessionRecord[];
  markEscalated(sessionId: string, reason: string): FloorCouncilSessionRecord | null;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  ) ?? "null";
}

function recordHash(record: FloorCouncilSessionRecord, previousHash: string): string {
  return createHash("sha256")
    .update(previousHash + ":" + canonicalize(record))
    .digest("hex");
}

interface JournalRecord {
  readonly record: FloorCouncilSessionRecord;
  readonly previousHash: string;
  readonly hash: string;
}

export function proposalFingerprint(input: {
  floorId: string;
  stateVersion: number;
  actionName: string;
  proposer: string;
  targetId?: string;
  evidenceRefs: readonly string[];
  parameters: Record<string, unknown>;
}): string {
  return createHash("sha256").update(canonicalize(input), "utf8").digest("hex");
}

export class DiskFloorCouncilSessionStore implements FloorCouncilSessionStore {
  private readonly file: string;

  constructor(baseDir: string | undefined, floorId: string) {
    const root = baseDir || path.join(process.cwd(), "data", "factoryos_state");
    const safeFloorId = floorId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const dir = path.join(root, "governance", "council-sessions");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, safeFloorId + ".jsonl");
  }

  create(record: FloorCouncilSessionRecord): void {
    this.save(record);
  }

  save(record: FloorCouncilSessionRecord): void {
    let previousHash = "GENESIS";
    if (fs.existsSync(this.file)) {
      const lines = fs.readFileSync(this.file, "utf-8").split("\n").filter(Boolean);
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]) as JournalRecord;
        previousHash = last.hash;
      }
    }

    const hash = recordHash(record, previousHash);
    const journal: JournalRecord = { record, previousHash, hash };
    fs.appendFileSync(this.file, JSON.stringify(journal) + "\n", "utf8");
  }

  get(sessionId: string): FloorCouncilSessionRecord | null {
    return this.loadAll().find((record) => record.sessionId === sessionId) || null;
  }

  listOpen(): FloorCouncilSessionRecord[] {
    return this.loadAll().filter(
      (record) => record.state !== "CLOSED" && record.state !== "ESCALATED"
    );
  }

  markEscalated(sessionId: string, reason: string): FloorCouncilSessionRecord | null {
    const current = this.get(sessionId);
    if (!current) return null;

    const next: FloorCouncilSessionRecord = {
      ...current,
      state: "ESCALATED",
      recoveryReason: reason,
      updatedAt: new Date().toISOString(),
    };
    this.save(next);
    return next;
  }

  private loadAll(): FloorCouncilSessionRecord[] {
    if (!fs.existsSync(this.file)) return [];
    const lines = fs.readFileSync(this.file, "utf-8").split("\n").filter(Boolean);
    const records: FloorCouncilSessionRecord[] = [];
    let previousHash = "GENESIS";

    for (const line of lines) {
      try {
        const journal = JSON.parse(line) as JournalRecord;
        const expected = recordHash(journal.record, previousHash);
        if (journal.previousHash !== previousHash || journal.hash !== expected) break;
        records.push(journal.record);
        previousHash = journal.hash;
      } catch {
        break;
      }
    }

    const latest = new Map<string, FloorCouncilSessionRecord>();
    for (const record of records) latest.set(record.sessionId, record);
    return [...latest.values()].map((record) => structuredClone(record));
  }
}

export class InMemoryFloorCouncilSessionStore implements FloorCouncilSessionStore {
  private readonly records = new Map<string, FloorCouncilSessionRecord>();

  create(record: FloorCouncilSessionRecord): void {
    this.records.set(record.sessionId, structuredClone(record));
  }

  save(record: FloorCouncilSessionRecord): void {
    this.records.set(record.sessionId, structuredClone(record));
  }

  get(sessionId: string): FloorCouncilSessionRecord | null {
    const record = this.records.get(sessionId);
    return record ? structuredClone(record) : null;
  }

  listOpen(): FloorCouncilSessionRecord[] {
    return [...this.records.values()]
      .filter((record) => record.state !== "CLOSED" && record.state !== "ESCALATED")
      .map((record) => structuredClone(record));
  }

  markEscalated(sessionId: string, reason: string): FloorCouncilSessionRecord | null {
    const current = this.records.get(sessionId);
    if (!current) return null;

    const next: FloorCouncilSessionRecord = {
      ...current,
      state: "ESCALATED",
      recoveryReason: reason,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(sessionId, structuredClone(next));
    return structuredClone(next);
  }
}
