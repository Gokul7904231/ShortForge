import fs from "node:fs";
import path from "node:path";
import type { MemoryGateRecord } from "./MemorySemanticsContracts";

export interface MemoryCompletionLedgerStore {
  load(): readonly MemoryGateRecord[];
  save(gates: readonly MemoryGateRecord[]): void;
}

export class InMemoryMemoryCompletionLedgerStore implements MemoryCompletionLedgerStore {
  private gates: MemoryGateRecord[] = [];

  public load(): readonly MemoryGateRecord[] {
    return this.gates;
  }

  public save(gates: readonly MemoryGateRecord[]): void {
    this.gates = [...gates];
  }
}

/**
 * Atomic single-writer proof persistence. Coordination must still be provided
 * by the caller (for example the existing Memory Fabric writer lease).
 */
export class JsonMemoryCompletionLedgerStore implements MemoryCompletionLedgerStore {
  constructor(private readonly filePath: string) {}

  public load(): readonly MemoryGateRecord[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return Array.isArray(parsed) ? parsed.filter(this.isGateRecord) : [];
    } catch {
      return [];
    }
  }

  public save(gates: readonly MemoryGateRecord[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = this.filePath + ".tmp-" + process.pid + "-" + Date.now();
    fs.writeFileSync(temp, JSON.stringify(gates, null, 2) + "\n", "utf8");
    fs.renameSync(temp, this.filePath);
  }

  private isGateRecord(value: unknown): value is MemoryGateRecord {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record.gateId === "string" &&
      (record.layer === "LEAF" || record.layer === "BRANCH" || record.layer === "ROOT") &&
      typeof record.outcome === "string" &&
      typeof record.definitionDigest === "string" &&
      (record.status === "PENDING" ||
        record.status === "MET" ||
        record.status === "REVERIFY_REQUIRED" ||
        record.status === "HANDOFF")
    );
  }
}
