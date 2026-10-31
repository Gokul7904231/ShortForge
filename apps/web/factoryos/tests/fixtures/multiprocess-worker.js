const fs = require('fs');
const path = require('path');

const storageDir = process.env.TEST_STORAGE_DIR;
const mode = process.env.WORKER_MODE; // 'PROCESS_1_CRASH' or 'PROCESS_2_RECOVER'
const runId = process.env.TEST_RUN_ID || 'run_crash_test_01';

if (!storageDir) {
  console.error('TEST_STORAGE_DIR is required');
  process.exit(1);
}

fs.mkdirSync(storageDir, { recursive: true });
const checkpointDir = path.join(storageDir, 'checkpoints', runId);
fs.mkdirSync(checkpointDir, { recursive: true });
const leaseFile = path.join(storageDir, 'leases.json');

if (mode === 'PROCESS_1_CRASH') {
  // 1. Acquire lease
  const lease = {
    taskId: 'task_render_60s',
    ownerProcessId: process.pid,
    fencingToken: 1,
    status: 'ACTIVE',
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  fs.writeFileSync(leaseFile, JSON.stringify(lease, null, 2), 'utf-8');

  // 2. Persist step checkpoint to disk
  const checkpoint = {
    checkpointId: 'chk_001',
    workflowId: 'video_production',
    workflowVersion: '2026.1',
    runId,
    stepId: 'FLOOR05_TIMELINE',
    stepStatus: 'COMPLETED',
    output: {
      targetDuration: 60,
      scenesCount: 8,
      localRenderIntentPath: '/data/renders/intent.json',
      voiceSynthesized: true,
    },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(checkpointDir, 'FLOOR05_TIMELINE_chk_001.json'),
    JSON.stringify(checkpoint, null, 2),
    'utf-8'
  );

  // Notify parent that checkpoint is written to disk and process is ready to be SIGKILL'd
  if (process.send) {
    process.send({
      type: 'CHECKPOINT_PERSISTED',
      pid: process.pid,
      runId,
      fencingToken: 1,
    });
  }

  // Keep process alive waiting for parent's SIGKILL
  setInterval(() => {}, 1000);
} else if (mode === 'PROCESS_2_RECOVER') {
  // Step 2: Second process reads state from disk after crash
  if (!fs.existsSync(leaseFile)) {
    console.error('Lease file not found during recovery');
    process.exit(2);
  }

  const deadLease = JSON.parse(fs.readFileSync(leaseFile, 'utf-8'));

  // Fencing: invalidate dead process's lease and take ownership with new fencing token
  const recoveredLease = {
    taskId: deadLease.taskId,
    ownerProcessId: process.pid,
    fencingToken: deadLease.fencingToken + 1, // Fencing token increments
    previousOwnerPid: deadLease.ownerProcessId,
    status: 'ACTIVE',
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  fs.writeFileSync(leaseFile, JSON.stringify(recoveredLease, null, 2), 'utf-8');

  // Read checkpoint from disk
  const checkpointFiles = fs.readdirSync(checkpointDir).filter((f) => f.endsWith('.json'));
  if (checkpointFiles.length === 0) {
    console.error('No checkpoints found on disk during recovery');
    process.exit(3);
  }

  const rawChk = fs.readFileSync(path.join(checkpointDir, checkpointFiles[0]), 'utf-8');
  const recoveredCheckpoint = JSON.parse(rawChk);

  // Resume and finish task
  const finalCheckpoint = {
    checkpointId: 'chk_002',
    workflowId: 'video_production',
    workflowVersion: '2026.1',
    runId,
    stepId: 'FLOOR07_COMPLETED',
    stepStatus: 'COMPLETED',
    output: {
      recoveredFromStep: recoveredCheckpoint.stepId,
      fencingToken: recoveredLease.fencingToken,
      mp4Verified: true,
    },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(checkpointDir, 'FLOOR07_COMPLETED_chk_002.json'),
    JSON.stringify(finalCheckpoint, null, 2),
    'utf-8'
  );

  if (process.send) {
    process.send({
      type: 'RECOVERY_COMPLETE',
      pid: process.pid,
      runId,
      fencingToken: recoveredLease.fencingToken,
      recoveredStep: recoveredCheckpoint.stepId,
    });
  }

  process.exit(0);
}

