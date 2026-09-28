import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { ExecutionState } from "./AgentExecutionContracts";

export interface AgentExecutionStateStore {
  get(executionId: string): ExecutionState | null;
  save(state: ExecutionState): void;
  listOpen(): ExecutionState[];
}

function canonicalize(value: unknown): string {
  return (
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item
    ) ?? "null"
  );
}

function recordHash(state: ExecutionState, previousHash: string): string {
  return createHash("sha256")
    .update(previousHash + ":" + canonicalize(state), "utf8")
    .digest("hex");
}

interface JournalRecord {
  readonly state: ExecutionState;
  readonly previousHash: string;
  readonly hash: string;
}

export class InMemoryAgentExecutionStateStore
  implements AgentExecutionStateStore
{
  private readonly states = new Map<string, ExecutionState>();

  get(executionId: string): ExecutionState | null {
    const state = this.states.get(executionId);
    return state ? structuredClone(state) : null;
  }

  save(state: ExecutionState): void {
    this.states.set(state.executionId, structuredClone(state));
  }

  listOpen(): ExecutionState[] {
    return [...this.states.values()]
      .filter(
        (state) =>
          state.status !== "SUCCEEDED" &&
          state.status !== "FAILED" &&
          state.status !== "CANCELLED"
      )
      .map((state) => structuredClone(state));
  }
}

export class DiskAgentExecutionStateStore
  implements AgentExecutionStateStore
{
  private readonly file: string;

  constructor(baseDir?: string) {
    const root =
      baseDir || path.join(process.cwd(), "data", "factoryos_state");
    const dir = path.join(root, "agent-execution");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "executions.jsonl");
  }

  get(executionId: string): ExecutionState | null {
    return this.loadAll().find(
      (state) => state.executionId === executionId
    ) || null;
  }

  save(state: ExecutionState): void {
    let previousHash = "GENESIS";

    if (fs.existsSync(this.file)) {
      const lines = fs
        .readFileSync(this.file, "utf8")
        .split("\n")
        .filter(Boolean);

      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]) as JournalRecord;
        previousHash = last.hash;
      }
    }

    const hash = recordHash(state, previousHash);
    const record: JournalRecord = { state, previousHash, hash };
    fs.appendFileSync(this.file, JSON.stringify(record) + "\n", "utf8");
  }

  listOpen(): ExecutionState[] {
    return this.loadAll().filter(
      (state) =>
        state.status !== "SUCCEEDED" &&
        state.status !== "FAILED" &&
        state.status !== "CANCELLED"
    );
  }

  private loadAll(): ExecutionState[] {
    if (!fs.existsSync(this.file)) return [];

    const lines = fs
      .readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean);

    const records: ExecutionState[] = [];
    let previousHash = "GENESIS";

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as JournalRecord;
        const expected = recordHash(record.state, previousHash);

        if (
          record.previousHash !== previousHash ||
          record.hash !== expected
        ) {
          break;
        }

        records.push(record.state);
        previousHash = record.hash;
      } catch {
        break;
      }
    }

    const latest = new Map<string, ExecutionState>();

    for (const state of records) {
      latest.set(state.executionId, state);
    }

    return [...latest.values()].map((state) => structuredClone(state));
  }
}
