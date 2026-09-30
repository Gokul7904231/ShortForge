import { createHash } from "node:crypto";
import type { EpistemicContext } from "./EpistemicContracts";

export interface EpistemicLedgerRecord {
  readonly sequence: number;
  readonly recordedAt: string;
  readonly contextFingerprint: string;
  readonly eventType:
    | "ASSESSMENT"
    | "PROBE_RESULT"
    | "ASCALON_HANDOFF"
    | "OUTCOME";
  readonly payload: Record<string, unknown>;
  readonly previousHash: string | null;
  readonly recordHash: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const object = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(object)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalize(object[key]))
      .join(",") +
    "}"
  );
}

export class EpistemicLedger {
  private readonly records: EpistemicLedgerRecord[] = [];

  public append(input: {
    readonly context: EpistemicContext;
    readonly eventType: EpistemicLedgerRecord["eventType"];
    readonly payload: Record<string, unknown>;
    readonly recordedAt?: string;
  }): EpistemicLedgerRecord {
    const previous = this.records.at(-1)?.recordHash ?? null;
    const sequence = this.records.length + 1;
    const recordedAt = input.recordedAt ?? new Date().toISOString();
    const unsigned = {
      sequence,
      recordedAt,
      contextFingerprint: input.context.contextFingerprint,
      eventType: input.eventType,
      payload: input.payload,
      previousHash: previous,
    };
    const recordHash = createHash("sha256")
      .update(canonicalize(unsigned), "utf8")
      .digest("hex");

    const record: EpistemicLedgerRecord = {
      ...unsigned,
      recordHash,
    };
    this.records.push(record);
    return record;
  }

  public list(): readonly EpistemicLedgerRecord[] {
    return [...this.records];
  }

  public verifyChain(): boolean {
    let previous: string | null = null;

    for (let index = 0; index < this.records.length; index += 1) {
      const record = this.records[index];
      if (record.sequence !== index + 1 || record.previousHash !== previous) {
        return false;
      }

      const unsigned = {
        sequence: record.sequence,
        recordedAt: record.recordedAt,
        contextFingerprint: record.contextFingerprint,
        eventType: record.eventType,
        payload: record.payload,
        previousHash: record.previousHash,
      };
      const expected = createHash("sha256")
        .update(canonicalize(unsigned), "utf8")
        .digest("hex");

      if (expected !== record.recordHash) return false;
      previous = record.recordHash;
    }

    return true;
  }
}
