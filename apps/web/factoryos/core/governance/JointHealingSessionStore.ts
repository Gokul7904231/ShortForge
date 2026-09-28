import * as fs from "node:fs";
import * as path from "node:path";
import type { JointHealingSessionRecord } from "./FloorGovernanceContracts";

export interface JointHealingSessionStore {
  loadAll(): JointHealingSessionRecord[];
  save(record: JointHealingSessionRecord): void;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export class DiskJointHealingSessionStore implements JointHealingSessionStore {
  private readonly file: string;

  constructor(baseDir: string | undefined) {
    const root = baseDir || path.join(process.cwd(), "data", "factoryos_state");
    const dir = path.join(root, "governance", "joint-healing");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "sessions.json");
  }

  loadAll(): JointHealingSessionRecord[] {
    if (!fs.existsSync(this.file)) return [];
    const raw = fs.readFileSync(this.file, "utf-8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Corrupt joint healing session store: expected array");
    }
    return parsed.map((record) => structuredClone(record as JointHealingSessionRecord));
  }

  save(record: JointHealingSessionRecord): void {
    const current = new Map(this.loadAll().map((item) => [item.sessionId, item]));
    current.set(record.sessionId, structuredClone(record));

    const tmp = `${this.file}.${safeSegment(record.sessionId)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Array.from(current.values()), null, 2) + "\n", "utf-8");
    fs.renameSync(tmp, this.file);
  }
}

export class InMemoryJointHealingSessionStore implements JointHealingSessionStore {
  private readonly records = new Map<string, JointHealingSessionRecord>();

  loadAll(): JointHealingSessionRecord[] {
    return Array.from(this.records.values()).map((record) => structuredClone(record));
  }

  save(record: JointHealingSessionRecord): void {
    this.records.set(record.sessionId, structuredClone(record));
  }
}
