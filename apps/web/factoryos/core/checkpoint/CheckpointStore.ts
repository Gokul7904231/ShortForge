/**
 * FactoryOS v0.1 — CheckpointStore
 *
 * Abstract interface for checkpoint persistence.
 * Provides both InMemoryCheckpointStore and durable DiskCheckpointStore.
 *
 * Checkpoint Safety Rule (spec §13):
 *   Checkpoints are written ONLY after a worker successfully completes.
 *   The runtime enforces this sequence:
 *     worker.execute() → result.success → mark COMPLETED → persist checkpoint
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StepStatus } from "../state/StepState";

/**
 * A single persisted step checkpoint.
 */
export interface StepCheckpoint {
  checkpointId: string;
  workflowId: string;
  workflowVersion: string;
  runId: string;
  stepId: string;
  stepStatus: StepStatus;
  /** Accumulated outputs as of this step completing */
  output: unknown;
  createdAt: string;
}

/**
 * CheckpointStore — the storage abstraction for FactoryOS.
 */
export interface CheckpointStore {
  /** Persist a checkpoint for a completed step */
  save(checkpoint: StepCheckpoint): Promise<void>;

  /**
   * Retrieve all checkpoints for a given run, ordered by creation time.
   * Returns an empty array if no checkpoints exist.
   */
  getRun(runId: string): Promise<StepCheckpoint[]>;

  /**
   * Retrieve the most recent checkpoint for a specific step in a run.
   * Returns null if no checkpoint exists for that step.
   */
  getLatest(runId: string, stepId: string): Promise<StepCheckpoint | null>;

  /**
   * Delete all checkpoints for a run.
   * Used for cleanup after COMPLETED or CANCELLED.
   */
  deleteRun?(runId: string): Promise<void>;
}

// ─── In-Memory Implementation ─────────────────────────────────────────────────

export class InMemoryCheckpointStore implements CheckpointStore {
  /** runId → stepId → list of checkpoints (multiple attempts) */
  private store = new Map<string, Map<string, StepCheckpoint[]>>();

  async save(checkpoint: StepCheckpoint): Promise<void> {
    if (!this.store.has(checkpoint.runId)) {
      this.store.set(checkpoint.runId, new Map());
    }
    const runStore = this.store.get(checkpoint.runId)!;
    if (!runStore.has(checkpoint.stepId)) {
      runStore.set(checkpoint.stepId, []);
    }
    runStore.get(checkpoint.stepId)!.push(structuredClone(checkpoint));
  }

  async getRun(runId: string): Promise<StepCheckpoint[]> {
    const runStore = this.store.get(runId);
    if (!runStore) return [];
    const all: StepCheckpoint[] = [];
    for (const checkpoints of runStore.values()) {
      all.push(...checkpoints);
    }
    return all
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((c) => structuredClone(c));
  }

  async getLatest(runId: string, stepId: string): Promise<StepCheckpoint | null> {
    const runStore = this.store.get(runId);
    if (!runStore) return null;
    const checkpoints = runStore.get(stepId);
    if (!checkpoints || checkpoints.length === 0) return null;
    return structuredClone(checkpoints[checkpoints.length - 1]);
  }

  async deleteRun(runId: string): Promise<void> {
    this.store.delete(runId);
  }

  totalCount(): number {
    let count = 0;
    for (const runStore of this.store.values()) {
      for (const checkpoints of runStore.values()) {
        count += checkpoints.length;
      }
    }
    return count;
  }

  snapshotRun(runId: string): StepCheckpoint[] {
    const runStore = this.store.get(runId);
    if (!runStore) return [];
    const all: StepCheckpoint[] = [];
    for (const checkpoints of runStore.values()) {
      all.push(...checkpoints);
    }
    return all.map((c) => structuredClone(c));
  }
}

// ─── Durable Disk Implementation ───────────────────────────────────────────────

/**
 * DiskCheckpointStore
 *
 * Durable, disk-backed checkpoint store designed to survive hard process exits (SIGKILL / power loss).
 * Uses atomic rename writes (.tmp -> .json) to prevent partial write corruption.
 */
export class DiskCheckpointStore implements CheckpointStore {
  private readonly baseDir: string;

  constructor(baseDir: string = path.join(process.cwd(), 'data', 'checkpoints')) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  async save(checkpoint: StepCheckpoint): Promise<void> {
    const runDir = path.join(this.baseDir, checkpoint.runId);
    fs.mkdirSync(runDir, { recursive: true });
    const filePath = path.join(runDir, `${checkpoint.stepId}_${checkpoint.checkpointId}.json`);
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  }

  async getRun(runId: string): Promise<StepCheckpoint[]> {
    const runDir = path.join(this.baseDir, runId);
    if (!fs.existsSync(runDir)) return [];
    const files = fs.readdirSync(runDir).filter((f) => f.endsWith('.json'));
    const checkpoints: StepCheckpoint[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(runDir, file), 'utf-8');
        checkpoints.push(JSON.parse(raw));
      } catch {}
    }
    return checkpoints.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async getLatest(runId: string, stepId: string): Promise<StepCheckpoint | null> {
    const all = await this.getRun(runId);
    const matching = all.filter((c) => c.stepId === stepId);
    if (matching.length === 0) return null;
    return matching[matching.length - 1];
  }

  async deleteRun(runId: string): Promise<void> {
    const runDir = path.join(this.baseDir, runId);
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }
}
