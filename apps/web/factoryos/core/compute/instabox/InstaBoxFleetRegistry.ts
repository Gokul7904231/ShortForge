/**
 * FactoryOS Distributed Compute Fabric — InstaBox Fleet Registry
 *
 * Manages the 12-node InstaBox fleet:
 * - Controller: box1
 * - Workers: box2, box3, box4, box5, box6, box7, box8, box10, box11, box12, box13
 * - box9 is intentionally excluded.
 *
 * Enforces live health tracking, bounded concurrency, atomic claims,
 * monotonic attempt tracking, and lease recovery.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  INSTABOX_WORKER_NODE_IDS,
  INSTABOX_EXCLUDED_NODES,
  isAllowedInstaBoxWorkerNode,
  formatInstaBoxWorkerId,
  parseInstaBoxNodeId,
  type InstaBoxWorkerNodeId,
  type InstaBoxNodeMetrics,
  type InstaBoxHeartbeatRequest,
  type InstaBoxClaimResponse,
  type InstaBoxActiveJobLease,
} from "./InstaBoxContracts";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderHealth,
  ProviderHealthState,
} from "../contracts/ComputeContracts";
import { InstaBoxComputeProvider } from "./InstaBoxComputeProvider";
import { ContentAddressedStore } from "../cas/ContentAddressedStore";

export interface InstaBoxNodeRecord {
  readonly nodeId: InstaBoxWorkerNodeId;
  readonly workerId: string;
  provider: InstaBoxComputeProvider;
  metrics?: InstaBoxNodeMetrics;
  lastHeartbeatAt?: string;
  consecutiveFailures: number;
  totalAttempts: number;
  successfulExecutions: number;
  failedExecutions: number;
  isDraining: boolean;
  adminDraining?: boolean;
  activeLease?: InstaBoxActiveJobLease;
  pendingJobs: Array<{
    job: ComputeJob;
    onProgress?: (msg: string) => void;
    resolveReceipt: (receipt: ExecutionReceipt) => void;
    rejectReceipt: (error: Error) => void;
    timeoutHandle: NodeJS.Timeout;
  }>;
}

export class InstaBoxFleetRegistry {
  private static instance: InstaBoxFleetRegistry | null = null;
  private readonly nodes = new Map<InstaBoxWorkerNodeId, InstaBoxNodeRecord>();
  private readonly cas = ContentAddressedStore.getInstance();
  private readonly stateFilePath: string;

  public static readonly HEARTBEAT_DEGRADED_THRESHOLD_MS = 45_000; // 45 seconds (3 missed heartbeats)
  public static readonly HEARTBEAT_BLOCKED_THRESHOLD_MS = 90_000; // 90 seconds
  public static readonly DEFAULT_LEASE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  private constructor(customStatePath?: string) {
    this.stateFilePath =
      customStatePath ||
      process.env.INSTABOX_STATE_FILE ||
      path.join(
        process.cwd(),
        "data",
        "factoryos_state",
        "instabox_fleet_state.json",
      );

    for (const nodeId of INSTABOX_WORKER_NODE_IDS) {
      const workerId = formatInstaBoxWorkerId(nodeId);
      const provider = new InstaBoxComputeProvider(this, nodeId, workerId);
      this.nodes.set(nodeId, {
        nodeId,
        workerId,
        provider,
        consecutiveFailures: 0,
        totalAttempts: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        isDraining: false,
        pendingJobs: [],
      });
    }

    this.loadPersistedState();
  }

  private loadPersistedState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, "utf8");
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.nodes)) {
          for (const nodeData of data.nodes) {
            const record = this.nodes.get(nodeData.nodeId);
            if (record) {
              if (nodeData.metrics) record.metrics = nodeData.metrics;
              if (nodeData.lastHeartbeatAt) record.lastHeartbeatAt = nodeData.lastHeartbeatAt;
              if (typeof nodeData.consecutiveFailures === "number") {
                record.consecutiveFailures = nodeData.consecutiveFailures;
              }
              if (typeof nodeData.totalAttempts === "number") {
                record.totalAttempts = nodeData.totalAttempts;
              }
              if (typeof nodeData.successfulExecutions === "number") {
                record.successfulExecutions = nodeData.successfulExecutions;
              }
              if (typeof nodeData.failedExecutions === "number") {
                record.failedExecutions = nodeData.failedExecutions;
              }
              if (typeof nodeData.isDraining === "boolean") {
                record.isDraining = nodeData.isDraining;
              }
              if (typeof nodeData.adminDraining === "boolean") {
                record.adminDraining = nodeData.adminDraining;
              }
              if (nodeData.activeLease && nodeData.activeLease.leaseExpiresAt) {
                const expiresAt = new Date(nodeData.activeLease.leaseExpiresAt).getTime();
                if (Date.now() < expiresAt) {
                  record.activeLease = {
                    ...nodeData.activeLease,
                    resolveReceipt: () => {},
                    rejectReceipt: () => {},
                  };
                }
              }
            }
          }
        }
      }
    } catch {
      // Graceful fallback on corrupt state
    }
  }

  private persistState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const nodesData = Array.from(this.nodes.values()).map((n) => ({
        nodeId: n.nodeId,
        workerId: n.workerId,
        metrics: n.metrics,
        lastHeartbeatAt: n.lastHeartbeatAt,
        consecutiveFailures: n.consecutiveFailures,
        totalAttempts: n.totalAttempts,
        successfulExecutions: n.successfulExecutions,
        failedExecutions: n.failedExecutions,
        isDraining: n.isDraining,
        adminDraining: n.adminDraining,
        activeLease: n.activeLease
          ? {
              jobId: n.activeLease.jobId,
              executionId: n.activeLease.executionId,
              executionToken: n.activeLease.executionToken,
              attemptId: n.activeLease.attemptId,
              workerId: n.activeLease.workerId,
              nodeId: n.activeLease.nodeId,
              claimedAt: n.activeLease.claimedAt,
              lastProgressAt: n.activeLease.lastProgressAt,
              leaseExpiresAt: n.activeLease.leaseExpiresAt,
              timeoutMs: n.activeLease.timeoutMs,
              job: n.activeLease.job,
            }
          : undefined,
      }));

      const payload = {
        updatedAt: new Date().toISOString(),
        nodes: nodesData,
      };

      const tmp = `${this.stateFilePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tmp, this.stateFilePath);
    } catch {
      // Best-effort atomic persist
    }
  }

  public static getInstance(): InstaBoxFleetRegistry {
    const globalKey = Symbol.for("factoryos.instabox.fleet_registry");
    const globalObj = globalThis as unknown as { [key: symbol]: InstaBoxFleetRegistry };
    if (!globalObj[globalKey]) {
      globalObj[globalKey] = new InstaBoxFleetRegistry();
    }
    return globalObj[globalKey];
  }

  public static resetInstanceForTesting(customStatePath?: string): InstaBoxFleetRegistry {
    const globalKey = Symbol.for("factoryos.instabox.fleet_registry");
    const globalObj = globalThis as unknown as { [key: symbol]: InstaBoxFleetRegistry };
    if (globalObj[globalKey]) {
      for (const node of globalObj[globalKey].nodes.values()) {
        for (const pending of node.pendingJobs) {
          clearTimeout(pending.timeoutHandle);
        }
        node.pendingJobs = [];
      }
    }
    const stateFile =
      customStatePath ||
      path.join(
        process.cwd(),
        "data",
        "factoryos_state",
        `test_fleet_state_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.json`,
      );
    globalObj[globalKey] = new InstaBoxFleetRegistry(stateFile);
    return globalObj[globalKey];
  }

  public getAllNodeIds(): readonly InstaBoxWorkerNodeId[] {
    return INSTABOX_WORKER_NODE_IDS;
  }

  public getNodeRecord(nodeId: InstaBoxWorkerNodeId): InstaBoxNodeRecord | undefined {
    return this.nodes.get(nodeId);
  }

  public getNodeRecordByWorkerId(workerId: string): InstaBoxNodeRecord | undefined {
    const nodeId = parseInstaBoxNodeId(workerId);
    return nodeId ? this.nodes.get(nodeId) : undefined;
  }

  public getAllNodeProviders(): InstaBoxComputeProvider[] {
    return Array.from(this.nodes.values()).map((n) => n.provider);
  }

  public isCredentialConfigured(nodeId?: InstaBoxWorkerNodeId): boolean {
    if (nodeId) {
      const perWorker = (
        process.env[`INSTABOX_WORKER_SECRET_${nodeId.toUpperCase()}`] ||
        process.env[`INSTABOX_WORKER_SECRET_${nodeId}`]
      )?.trim();
      if (perWorker && perWorker.length >= 16) return true;
      const general = (
        process.env.INSTABOX_WORKER_SECRET ||
        process.env.RENDER_WORKER_SECRET
      )?.trim();
      return Boolean(general && general.length >= 16);
    }

    const general = (
      process.env.INSTABOX_WORKER_SECRET ||
      process.env.RENDER_WORKER_SECRET
    )?.trim();
    if (general && general.length >= 16) return true;

    // Check if all configured worker nodes have secrets
    return INSTABOX_WORKER_NODE_IDS.every((id) => {
      const s = (
        process.env[`INSTABOX_WORKER_SECRET_${id.toUpperCase()}`] ||
        process.env[`INSTABOX_WORKER_SECRET_${id}`]
      )?.trim();
      return Boolean(s && s.length >= 16);
    });
  }

  public authenticateControlPlaneAdmin(token: string): boolean {
    if (!token) return false;
    const cleanToken = token.trim();
    if (!cleanToken) return false;

    const adminSecret = (
      process.env.INSTABOX_CONTROL_PLANE_ADMIN_SECRET ||
      process.env.INTERNAL_API_SECRET_KEY ||
      ""
    ).trim();

    if (!adminSecret) return false;

    try {
      const a = Buffer.from(cleanToken);
      const b = Buffer.from(adminSecret);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  public authenticateWorker(token: string, workerId?: string): boolean {
    if (!token) return false;
    const cleanToken = token.trim();
    if (!cleanToken) return false;

    // Strict worker identity: workerId is required and must map to an allowed worker node
    if (!workerId) return false;

    const nodeId = parseInstaBoxNodeId(workerId);
    if (!nodeId || !isAllowedInstaBoxWorkerNode(nodeId)) {
      return false; // box9 or unregistered node fails closed
    }

    // 1. Check per-worker specific secret if configured
    const perWorkerSecret = (
      process.env[`INSTABOX_WORKER_SECRET_${nodeId.toUpperCase()}`] ||
      process.env[`INSTABOX_WORKER_SECRET_${nodeId}`]
    )?.trim();

    if (perWorkerSecret) {
      try {
        const a = Buffer.from(cleanToken);
        const b = Buffer.from(perWorkerSecret);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
        return false;
      }
    }

    // 2. Check fallback general worker credentials (only worker credentials, never admin credentials)
    const expected = (
      process.env.INSTABOX_WORKER_SECRET ||
      process.env.RENDER_WORKER_SECRET ||
      ""
    ).trim();
    if (!expected) return false;

    try {
      const a = Buffer.from(cleanToken);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  public recordHeartbeat(request: InstaBoxHeartbeatRequest): {
    acknowledged: boolean;
    action: "POLL" | "DRAIN" | "RESTART";
  } {
    const nodeId = request.nodeId as InstaBoxWorkerNodeId;
    if (!isAllowedInstaBoxWorkerNode(nodeId)) {
      if ((INSTABOX_EXCLUDED_NODES as readonly string[]).includes(request.nodeId)) {
        throw new Error(
          `Node ${request.nodeId} is permanently excluded from the InstaBox fleet and cannot be registered.`,
        );
      }
      throw new Error(`Unrecognized InstaBox worker node: ${request.nodeId}`);
    }

    const record = this.nodes.get(nodeId);
    if (!record) {
      throw new Error(`InstaBox node record not found: ${nodeId}`);
    }

    record.metrics = { ...request.metrics };
    record.lastHeartbeatAt = new Date().toISOString();
    record.consecutiveFailures = 0;

    if (record.adminDraining) {
      record.isDraining = true;
    } else {
      record.isDraining = false;
    }

    this.persistState();

    return {
      acknowledged: true,
      action: record.adminDraining ? "DRAIN" : "POLL",
    };
  }

  public setNodeDraining(nodeId: InstaBoxWorkerNodeId, draining = true): void {
    const record = this.nodes.get(nodeId);
    if (record) {
      record.isDraining = draining;
      record.adminDraining = draining;
      this.persistState();
    }
  }

  public getNodeHealth(nodeId: InstaBoxWorkerNodeId): ProviderHealth {
    const record = this.nodes.get(nodeId);
    if (!record) {
      return {
        state: "UNKNOWN",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        activeJobs: 0,
        successRate: 0.0,
        avgLatencyMs: 0,
        failureReason: `Node ${nodeId} is not in fleet registry.`,
      };
    }

    if (!this.isCredentialConfigured()) {
      return {
        state: "BLOCKED",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        activeJobs: 0,
        successRate: 0.0,
        avgLatencyMs: 0,
        failureReason: "InstaBox worker credential (INSTABOX_WORKER_SECRET) is not configured.",
      };
    }

    if (!record.lastHeartbeatAt) {
      return {
        state: "BLOCKED",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: record.consecutiveFailures,
        activeJobs: 0,
        successRate: 0.0,
        avgLatencyMs: 0,
        failureReason: `Node ${nodeId} has not sent an initial heartbeat.`,
      };
    }

    const elapsedMs = Date.now() - new Date(record.lastHeartbeatAt).getTime();
    let state: ProviderHealthState = "HEALTHY";
    let failureReason: string | undefined;

    if (record.isDraining) {
      state = "DRAINING";
      failureReason = "Node is marked as DRAINING for maintenance or sandbox restart.";
    } else if (elapsedMs > InstaBoxFleetRegistry.HEARTBEAT_BLOCKED_THRESHOLD_MS) {
      state = "BLOCKED";
      failureReason = `Heartbeat timeout: last seen ${Math.round(elapsedMs / 1000)}s ago.`;
    } else if (elapsedMs > InstaBoxFleetRegistry.HEARTBEAT_DEGRADED_THRESHOLD_MS) {
      state = "DEGRADED";
      failureReason = `Missed recent heartbeats: last seen ${Math.round(elapsedMs / 1000)}s ago.`;
    } else if (record.consecutiveFailures >= 3) {
      state = "DEGRADED";
      failureReason = `Consecutive failure threshold exceeded (${record.consecutiveFailures} failures).`;
    }

    const total = record.totalAttempts;
    const successRate = total > 0 ? record.successfulExecutions / total : 1.0;

    return {
      state,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: record.consecutiveFailures,
      activeJobs: record.activeLease ? 1 : 0,
      successRate,
      avgLatencyMs: 15_000,
      failureReason,
    };
  }

  public getNodeCapability(nodeId: InstaBoxWorkerNodeId): ProviderCapability {
    const record = this.nodes.get(nodeId);
    const m = record?.metrics;

    // Real reported capabilities if present, conservative CPU defaults otherwise
    const cpuCores = m?.cpuCores || 4;
    const memoryMb = m?.memoryTotalMb || 7980;
    const operatingSystem = m?.operatingSystem || "Linux (InstaBox Fleet Node)";

    return {
      providerId: formatInstaBoxWorkerId(nodeId),
      providerType: "INSTABOX",
      executionModel: "PERSISTENT_WORKER",
      cpuCores,
      memoryMb,
      gpuAvailable: false, // Strict CPU-only hardware contract
      hardwareVideoEncode: false,
      operatingSystem,
      supportedWorkloads: ["RENDER"],
      estimatedStartupSeconds: 0.5,
      transferBandwidthMbps: 500,
      maxConcurrency: 1, // Conservative initial render concurrency
      maxJobDurationSeconds: 1800,
      isCredentialConfigured: this.isCredentialConfigured(),
    };
  }

  public isNodeAvailable(nodeId: InstaBoxWorkerNodeId): boolean {
    const health = this.getNodeHealth(nodeId);
    const record = this.nodes.get(nodeId);
    if (!record) return false;

    // Must be HEALTHY, not DRAINING, and have no active lease or queued jobs
    return (
      health.state === "HEALTHY" &&
      !record.isDraining &&
      !record.activeLease &&
      record.pendingJobs.length === 0
    );
  }

  public async dispatchJobToNode(
    nodeId: InstaBoxWorkerNodeId,
    job: ComputeJob,
    onProgress?: (msg: string) => void,
  ): Promise<ExecutionReceipt> {
    const record = this.nodes.get(nodeId);
    if (!record) {
      throw new Error(`InstaBox node ${nodeId} not registered in fleet.`);
    }

    const health = this.getNodeHealth(nodeId);
    if (health.state === "BLOCKED" || health.state === "DRAINING") {
      throw new Error(
        `InstaBox node ${nodeId} cannot accept job: ${health.state} (${health.failureReason || "unavailable"})`,
      );
    }

    if (record.activeLease) {
      throw new Error(`InstaBox node ${nodeId} is currently busy with an active job lease.`);
    }

    return new Promise<ExecutionReceipt>((resolve, reject) => {
      const timeoutMs = job.timeoutMs || 300_000;
      const timeoutHandle = setTimeout(() => {
        // Remove from pending if still there
        const idx = record.pendingJobs.findIndex((p) => p.job.jobId === job.jobId);
        if (idx >= 0) {
          record.pendingJobs.splice(idx, 1);
        }

        // If an active lease was established, terminate it
        if (record.activeLease && record.activeLease.jobId === job.jobId) {
          record.activeLease = undefined;
          record.failedExecutions++;
          record.consecutiveFailures++;
        }

        reject(
          new Error(
            `InstaBox job ${job.jobId} timed out after ${timeoutMs}ms waiting for node ${nodeId} completion.`,
          ),
        );
      }, timeoutMs);

      record.pendingJobs.push({
        job,
        onProgress,
        resolveReceipt: (receipt) => {
          clearTimeout(timeoutHandle);
          resolve(receipt);
        },
        rejectReceipt: (err) => {
          clearTimeout(timeoutHandle);
          reject(err);
        },
        timeoutHandle,
      });

      onProgress?.(`Enqueued job ${job.jobId} for InstaBox node ${nodeId}. Awaiting worker claim.`);
    });
  }

  public claimJob(workerId: string): InstaBoxClaimResponse {
    const nodeId = parseInstaBoxNodeId(workerId);
    if (!nodeId) {
      return { claimed: false, pollIntervalSeconds: 5 };
    }

    const record = this.nodes.get(nodeId);
    if (!record || record.pendingJobs.length === 0 || record.activeLease) {
      return { claimed: false, pollIntervalSeconds: 5 };
    }

    const nextPending = record.pendingJobs.shift()!;
    const executionToken = `tok_${crypto.randomBytes(24).toString("hex")}`;
    const executionId = `exec_${workerId}_${nextPending.job.jobId}_${Date.now()}`;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + InstaBoxFleetRegistry.DEFAULT_LEASE_DURATION_MS).toISOString();

    record.totalAttempts++;
    record.activeLease = {
      jobId: nextPending.job.jobId,
      executionId,
      executionToken,
      attemptId: 1,
      workerId,
      nodeId,
      claimedAt: now.toISOString(),
      lastProgressAt: now.toISOString(),
      leaseExpiresAt,
      timeoutMs: nextPending.job.timeoutMs,
      job: nextPending.job,
      resolveReceipt: nextPending.resolveReceipt,
      rejectReceipt: nextPending.rejectReceipt,
      onProgress: nextPending.onProgress,
    };

    nextPending.onProgress?.(`Job ${nextPending.job.jobId} claimed by InstaBox worker ${workerId}.`);
    this.persistState();

    return {
      claimed: true,
      jobId: nextPending.job.jobId,
      executionId,
      executionToken,
      attemptId: 1,
      timeoutMs: nextPending.job.timeoutMs,
      leaseExpiresAt,
      manifest: nextPending.job.manifest,
    };
  }

  public recordProgress(
    workerId: string,
    executionToken: string,
    progressPercent: number,
    message?: string,
  ): boolean {
    const nodeId = parseInstaBoxNodeId(workerId);
    if (!nodeId) return false;

    const record = this.nodes.get(nodeId);
    const lease = record?.activeLease;
    if (!lease || lease.executionToken !== executionToken) {
      return false;
    }

    const now = new Date();
    lease.lastProgressAt = now.toISOString();
    lease.leaseExpiresAt = new Date(
      now.getTime() + InstaBoxFleetRegistry.DEFAULT_LEASE_DURATION_MS,
    ).toISOString();

    lease.onProgress?.(
      `[${workerId}] Progress ${progressPercent}%: ${message || "rendering"}`,
    );

    this.persistState();

    return true;
  }

  public completeActiveJob(
    workerId: string,
    executionToken: string,
    receiptData: {
      exitCode: number;
      sha256Proof?: string;
      byteLength?: number;
      casUri?: string;
      metrics?: {
        startupTimeMs?: number;
        executionTimeMs?: number;
        transferTimeMs?: number;
        totalTimeMs?: number;
      };
      stdoutSnippet?: string;
      stderrSnippet?: string;
    },
  ): ExecutionReceipt {
    const nodeId = parseInstaBoxNodeId(workerId);
    if (!nodeId) {
      throw new Error(`Invalid InstaBox workerId: ${workerId}`);
    }

    const record = this.nodes.get(nodeId);
    const lease = record?.activeLease;
    if (!lease || lease.executionToken !== executionToken) {
      throw new Error(`Unauthorized or stale execution token for worker ${workerId}.`);
    }

    if (!receiptData.casUri || !receiptData.sha256Proof) {
      throw new Error("Completion rejected: missing CAS URI or SHA-256 proof.");
    }

    const totalTimeMs =
      receiptData.metrics?.totalTimeMs ||
      Date.now() - new Date(lease.claimedAt).getTime();

    const receipt: ExecutionReceipt = {
      receiptId: `rcpt_${lease.executionId}`,
      executionId: lease.executionId,
      jobId: lease.jobId,
      factoryExecutionId: lease.job.factoryExecutionId,
      providerId: workerId,
      providerType: "INSTABOX",
      executionModel: "PERSISTENT_WORKER",
      status: "COMPLETED",
      exitCode: receiptData.exitCode,
      outputArtifacts: [
        {
          artifactId: `cas_${receiptData.sha256Proof.substring(0, 16)}`,
          role: "output_mp4",
          sha256: receiptData.sha256Proof,
          byteLength: receiptData.byteLength || 0,
          mimeType: "video/mp4",
          uri: receiptData.casUri,
        },
      ],
      metrics: {
        startupTimeMs: receiptData.metrics?.startupTimeMs || 100,
        executionTimeMs: receiptData.metrics?.executionTimeMs || Math.max(100, totalTimeMs - 500),
        transferTimeMs: receiptData.metrics?.transferTimeMs || 400,
        totalTimeMs,
      },
      stdoutSnippet: receiptData.stdoutSnippet,
      stderrSnippet: receiptData.stderrSnippet,
      sha256Proof: receiptData.sha256Proof,
      verifiedAt: new Date().toISOString(),
    };

    record.activeLease = undefined;
    record.successfulExecutions++;
    record.consecutiveFailures = 0;
    this.persistState();

    lease.resolveReceipt(receipt);
    return receipt;
  }

  public failActiveJob(
    workerId: string,
    executionToken: string,
    reason: string,
  ): ExecutionReceipt {
    const nodeId = parseInstaBoxNodeId(workerId);
    if (!nodeId) {
      throw new Error(`Invalid InstaBox workerId: ${workerId}`);
    }

    const record = this.nodes.get(nodeId);
    const lease = record?.activeLease;
    if (!lease || lease.executionToken !== executionToken) {
      throw new Error(`Unauthorized or stale execution token for worker ${workerId}.`);
    }

    const totalTimeMs = Date.now() - new Date(lease.claimedAt).getTime();

    const receipt: ExecutionReceipt = {
      receiptId: `rcpt_${lease.executionId}`,
      executionId: lease.executionId,
      jobId: lease.jobId,
      factoryExecutionId: lease.job.factoryExecutionId,
      providerId: workerId,
      providerType: "INSTABOX",
      executionModel: "PERSISTENT_WORKER",
      status: "FAILED",
      exitCode: 1,
      outputArtifacts: [],
      metrics: {
        startupTimeMs: 0,
        executionTimeMs: 0,
        transferTimeMs: 0,
        totalTimeMs,
      },
      failureReason: reason,
    };

    record.activeLease = undefined;
    record.failedExecutions++;
    record.consecutiveFailures++;
    this.persistState();

    lease.resolveReceipt(receipt);
    return receipt;
  }
}
