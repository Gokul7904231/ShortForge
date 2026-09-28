import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { BlackboardEntry } from "./FloorGovernanceContracts";

export interface FloorBlackboardJournal {
  load(): BlackboardEntry[];
  append(entry: BlackboardEntry): void;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  ) ?? "null";
}

function entryHash(entry: BlackboardEntry, previousHash: string): string {
  return createHash("sha256")
    .update(previousHash + ":" + canonicalize(entry))
    .digest("hex");
}

interface JournalRecord {
  readonly entry: BlackboardEntry;
  readonly previousHash: string;
  readonly hash: string;
}

export class DiskFloorBlackboardJournal implements FloorBlackboardJournal {
  private readonly file: string;

  constructor(baseDir: string | undefined, floorId: string) {
    const root = baseDir || path.join(process.cwd(), "data", "factoryos_state");
    const safeFloorId = floorId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const dir = path.join(root, "governance", "blackboards");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, safeFloorId + ".jsonl");
  }

  load(): BlackboardEntry[] {
    if (!fs.existsSync(this.file)) return [];
    const lines = fs.readFileSync(this.file, "utf-8").split("\n").filter(Boolean);
    const entries: BlackboardEntry[] = [];
    let previousHash = "GENESIS";

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as JournalRecord;
        const expected = entryHash(record.entry, previousHash);
        if (record.previousHash !== previousHash || record.hash !== expected) {
          throw new Error("governance blackboard journal hash-chain mismatch");
        }
        entries.push(record.entry);
        previousHash = record.hash;
      } catch {
        break;
      }
    }
    return entries.map((entry) => structuredClone(entry));
  }

  append(entry: BlackboardEntry): void {
    let previousHash = "GENESIS";
    if (fs.existsSync(this.file)) {
      const lines = fs.readFileSync(this.file, "utf-8").split("\n").filter(Boolean);
      if (lines.length > 0) {
        try {
          previousHash = (JSON.parse(lines[lines.length - 1]) as JournalRecord).hash;
        } catch {
          throw new Error("Cannot append to corrupt governance blackboard journal");
        }
      }
    }

    const hash = entryHash(entry, previousHash);
    const record: JournalRecord = { entry, previousHash, hash };
    fs.appendFileSync(this.file, JSON.stringify(record) + "\n", "utf-8");
  }
}

export class InMemoryFloorBlackboardJournal implements FloorBlackboardJournal {
  private readonly entries: BlackboardEntry[] = [];

  load(): BlackboardEntry[] {
    return structuredClone(this.entries);
  }

  append(entry: BlackboardEntry): void {
    this.entries.push(structuredClone(entry));
  }
}
