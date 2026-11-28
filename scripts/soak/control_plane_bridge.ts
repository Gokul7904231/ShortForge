import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import * as crypto from "node:crypto";
import { InstaBoxFleetRegistry } from "../../apps/web/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import { ControlPlaneCircuitBreaker } from "../../apps/web/factoryos/core/compute/instabox/ControlPlaneCircuitBreaker";
import { ContentAddressedStore } from "../../apps/web/factoryos/core/compute/cas/ContentAddressedStore";
import { RenderArtifactVerifier } from "../../apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier";
import {
  INSTABOX_WORKER_NODE_IDS,
  formatInstaBoxWorkerId,
  type InstaBoxWorkerNodeId,
} from "../../apps/web/factoryos/core/compute/instabox/InstaBoxContracts";
import type { ComputeJob, ExecutionReceipt } from "../../apps/web/factoryos/core/compute/contracts/ComputeContracts";

const SOAK_ROOT = path.resolve(process.cwd(), ".tmp", "soak-1000");
fs.mkdirSync(SOAK_ROOT, { recursive: true });

const STATE_FILE = path.join(SOAK_ROOT, "fleet_state.json");
const BREAKER_DB = path.join(SOAK_ROOT, "breaker.sqlite3");
const CAS_DIR = path.join(SOAK_ROOT, "cas");

for (const nodeId of INSTABOX_WORKER_NODE_IDS) {
  process.env[`INSTABOX_WORKER_SECRET_${nodeId.toUpperCase()}`] = `soak-secret-${nodeId}-1234567890`;
}
process.env.INSTABOX_CONTROL_PLANE_ADMIN_SECRET = "soak-admin-secret-1234567890";

let registry = InstaBoxFleetRegistry.resetInstanceForTesting(STATE_FILE);
let breaker = ControlPlaneCircuitBreaker.resetInstanceForTesting(BREAKER_DB);
const cas = ContentAddressedStore.resetInstanceForTesting(CAS_DIR);
const verifier = new RenderArtifactVerifier();

function seedHeartbeats() {
  for (const nodeId of INSTABOX_WORKER_NODE_IDS) {
    registry.recordHeartbeat({
      workerId: formatInstaBoxWorkerId(nodeId),
      nodeId,
      status: "HEALTHY",
      metrics: {
        cpuCores: 8,
        cpuUsagePercent: 15,
        memoryTotalMb: 16000,
        memoryAvailableMb: 12000,
        diskTotalMb: 100000,
        diskAvailableMb: 80000,
        operatingSystem: process.platform,
        activeJobs: 0,
      },
    });
  }
}
seedHeartbeats();

const pendingResolvers = new Map<string, { job: ComputeJob; targetNodeId: InstaBoxWorkerNodeId }>();

async function handleRpc(req: any): Promise<any> {
  const { id, action, params } = req;
  try {
    if (action === "dispatch") {
      const intake = breaker.allowIntake();
      if (!intake.allowed) {
        return { id, ok: false, status: 503, code: "INTAKE_PAUSED", error: "Circuit breaker OPEN" };
      }
      const nodeId = (params.nodeId || "box2") as InstaBoxWorkerNodeId;
      const workerId = formatInstaBoxWorkerId(nodeId);
      const jobId = String(params.jobId);
      const job: ComputeJob = {
        jobId,
        factoryExecutionId: `fx_${jobId}`,
        missionId: `mission_${jobId}`,
        workloadType: "RENDER",
        manifest: { topic: params.topic, duration: params.duration, fps: 30 },
        inputArtifacts: { bundleId: `b_${jobId}`, artifacts: [], createdTimestamp: Date.now() },
        requirements: { workloadType: "RENDER", gpuRequired: false, minCpuCores: 2, minMemoryMb: 4000 },
        priority: "HIGH",
        timeoutMs: 300_000,
        createdAt: new Date().toISOString(),
      };
      const record = registry.getNodeRecord(nodeId)!;
      const attemptId = (record.totalAttempts || 0) + 1;
      const executionId = `exec_${jobId}_${attemptId}`;
      const executionToken = crypto.randomBytes(12).toString("hex");
      record.totalAttempts = attemptId;
      record.activeLease = {
        jobId,
        executionId,
        executionToken,
        attemptId,
        workerId,
        claimedAt: new Date().toISOString(),
        leaseExpiresAt: new Date(Date.now() + 300_000).toISOString(),
        job,
        resolveReceipt: (_r: ExecutionReceipt) => {},
        rejectReceipt: (_e: Error) => {},
        timeoutHandle: setTimeout(() => {}, 300_000),
      };
      clearTimeout(record.activeLease.timeoutHandle);
      pendingResolvers.set(jobId, { job, targetNodeId: nodeId });
      return { id, ok: true, workerId, nodeId, jobId, executionId, executionToken, attemptId };
    }

    if (action === "commit") {
      const { workerId, executionToken, jobId, mp4Path, sha256Proof } = params;
      const record = registry.getNodeRecordByWorkerId(workerId);
      const lease = record?.activeLease;
      if (!lease || lease.executionToken !== executionToken || lease.jobId !== jobId) {
        return { id, ok: false, status: 409, fenced: true, error: "Stale or fenced execution token" };
      }
      if (Date.now() > new Date(lease.leaseExpiresAt).getTime()) {
        return { id, ok: false, status: 409, fenced: true, error: "Lease expired" };
      }

      const stat = fs.statSync(mp4Path);
      const verifyRes = await verifier.verify({
        artifact: {
          artifactId: `art_${jobId}`,
          role: "output_mp4",
          sha256: sha256Proof,
          byteLength: stat.size,
          mimeType: "video/mp4",
          uri: mp4Path,
        },
        approvedRoots: [SOAK_ROOT, cas.getStorageDir(), process.cwd()],
        expected: {
          width: 1080,
          height: 1920,
          fps: 30,
          videoCodec: "h264",
          audioCodec: "aac",
          requireAudio: true,
        },
      });
      if (verifyRes.status !== "PASS") {
        registry.failActiveJob(workerId, executionToken, verifyRes.failureReason || "F06 rejected");
        breaker.recordFailure();
        return { id, ok: false, status: 422, error: verifyRes.failureReason, verifyRes };
      }

      const casRef = await cas.putFile(mp4Path, "output_mp4", "video/mp4", { jobId });
      const receipt = registry.completeActiveJob(workerId, executionToken, {
        exitCode: 0,
        sha256Proof: casRef.sha256,
        byteLength: casRef.byteLength,
        casUri: casRef.uri,
      });
      breaker.recordSuccess();
      return { id, ok: true, status: 200, receiptId: receipt.receiptId, casSha256: casRef.sha256, casUri: casRef.uri };
    }

    if (action === "dlq") {
      const { workerId, executionToken, jobId, reason, dlqBundle } = params;
      registry.dlqActiveJob(workerId, executionToken, reason, dlqBundle || {});
      breaker.recordFailure();
      return { id, ok: true, status: "DLQ", jobId };
    }

    if (action === "chaos_expire_lease") {
      const record = registry.getNodeRecordByWorkerId(params.workerId);
      if (record?.activeLease) {
        record.activeLease.leaseExpiresAt = new Date(Date.now() - 10_000).toISOString();
      }
      return { id, ok: true };
    }

    if (action === "chaos_restart_control_plane") {
      registry = InstaBoxFleetRegistry.resetInstanceForTesting(STATE_FILE);
      breaker = ControlPlaneCircuitBreaker.resetInstanceForTesting(BREAKER_DB);
      seedHeartbeats();
      return { id, ok: true, restarted: true, breakerState: breaker.getSnapshot().state };
    }

    if (action === "chaos_auth_check") {
      const { workerId, secret } = params;
      const authed = registry.authenticateWorker(secret, workerId);
      return { id, ok: true, authenticated: authed, status: authed ? 200 : 401 };
    }

    if (action === "stats") {
      return { id, ok: true, breaker: breaker.getSnapshot() };
    }

    return { id, ok: false, error: `Unknown action: ${action}` };
  } catch (err: any) {
    return { id, ok: false, error: err?.message || String(err) };
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  const req = JSON.parse(line);
  const res = await handleRpc(req);
  process.stdout.write(JSON.stringify(res) + "\n");
});
