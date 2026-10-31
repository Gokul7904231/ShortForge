import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fork, ChildProcess } from 'node:child_process';
import { DiskCheckpointStore } from '../core/checkpoint/CheckpointStore';

describe('Wave 5 — Multi-Process OS Crash Recovery & Lease Fencing Harness', () => {
  const testStorageDir = path.join(process.cwd(), 'data', 'test_multiprocess_crash_state');
  const workerScript = path.join(__dirname, 'fixtures', 'multiprocess-worker.js');
  const runId = `run_crash_${Date.now()}`;

  beforeEach(() => {
    fs.mkdirSync(testStorageDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    } catch {}
  });

  it('survives hard SIGKILL of worker process, fences abandoned lease, and completes idempotently in separate process', async () => {
    // ─── STEP 1: Launch Child Process 1 ───
    let child1: ChildProcess | null = fork(workerScript, [], {
      env: {
        ...process.env,
        TEST_STORAGE_DIR: testStorageDir,
        WORKER_MODE: 'PROCESS_1_CRASH',
        TEST_RUN_ID: runId,
      },
    });

    const process1Ready = new Promise<{ pid: number; fencingToken: number }>((resolve, reject) => {
      child1!.on('message', (msg: any) => {
        if (msg.type === 'CHECKPOINT_PERSISTED') {
          resolve({ pid: msg.pid, fencingToken: msg.fencingToken });
        }
      });
      child1!.on('error', reject);
    });

    const p1Info = await process1Ready;
    expect(p1Info.fencingToken).toBe(1);
    expect(p1Info.pid).toBeDefined();

    // Verify checkpoint exists physically on disk before killing Process 1
    const checkpointStore = new DiskCheckpointStore(path.join(testStorageDir, 'checkpoints'));
    const initialCheckpoints = await checkpointStore.getRun(runId);
    expect(initialCheckpoints.length).toBe(1);
    expect(initialCheckpoints[0].stepId).toBe('FLOOR05_TIMELINE');

    // ─── STEP 2: Forcibly Kill Child Process 1 (Simulating SIGKILL / Hard Kernel Exit) ───
    const child1Exit = new Promise<void>((resolve) => {
      child1!.on('exit', () => resolve());
    });

    // Send hard SIGKILL
    process.kill(child1.pid!, 'SIGKILL');
    await child1Exit;
    child1 = null;

    // ─── STEP 3: Launch Child Process 2 (Brand New Process) ───
    let child2: ChildProcess | null = fork(workerScript, [], {
      env: {
        ...process.env,
        TEST_STORAGE_DIR: testStorageDir,
        WORKER_MODE: 'PROCESS_2_RECOVER',
        TEST_RUN_ID: runId,
      },
    });

    const process2Complete = new Promise<{ pid: number; fencingToken: number; recoveredStep: string }>((resolve, reject) => {
      child2!.on('message', (msg: any) => {
        if (msg.type === 'RECOVERY_COMPLETE') {
          resolve(msg);
        }
      });
      child2!.on('error', reject);
    });

    const p2Info = await process2Complete;
    expect(p2Info.fencingToken).toBe(2); // Fencing token must increment to fence Process 1
    expect(p2Info.recoveredStep).toBe('FLOOR05_TIMELINE');
    expect(p2Info.pid).not.toBe(p1Info.pid); // Distinct OS process

    // ─── STEP 4: Inspect Final Persisted State on Disk ───
    const finalCheckpoints = await checkpointStore.getRun(runId);
    expect(finalCheckpoints.length).toBe(2);
    expect(finalCheckpoints[0].stepId).toBe('FLOOR05_TIMELINE');
    expect(finalCheckpoints[1].stepId).toBe('FLOOR07_COMPLETED');

    const latest = await checkpointStore.getLatest(runId, 'FLOOR07_COMPLETED');
    expect(latest).toBeDefined();
    expect((latest?.output as any).recoveredFromStep).toBe('FLOOR05_TIMELINE');
    expect((latest?.output as any).fencingToken).toBe(2);
  });
});

