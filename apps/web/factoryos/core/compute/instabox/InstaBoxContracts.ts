/**
 * FactoryOS Distributed Compute Fabric — InstaBox Fleet Contracts
 *
 * Configured nodes:
 * - Controller: box1
 * - Workers: box2, box3, box4, box5, box6, box7, box8, box10, box11, box12, box13
 * - box9 is intentionally excluded.
 */

export const INSTABOX_CONTROLLER_NODE = "box1" as const;

export const INSTABOX_WORKER_NODE_IDS = [
  "box2",
  "box3",
  "box4",
  "box5",
  "box6",
  "box7",
  "box8",
  "box10",
  "box11",
  "box12",
  "box13",
] as const;

export type InstaBoxWorkerNodeId = (typeof INSTABOX_WORKER_NODE_IDS)[number];

export const INSTABOX_EXCLUDED_NODES = ["box9"] as const;

export function isAllowedInstaBoxWorkerNode(nodeId: string): nodeId is InstaBoxWorkerNodeId {
  return (INSTABOX_WORKER_NODE_IDS as readonly string[]).includes(nodeId);
}

export function formatInstaBoxWorkerId(nodeId: InstaBoxWorkerNodeId): string {
  return `instabox-${nodeId}`;
}

export function parseInstaBoxNodeId(workerId: string): InstaBoxWorkerNodeId | undefined {
  const normalized = workerId.startsWith("instabox-") ? workerId : `instabox-${workerId}`;
  const match = normalized.match(/^instabox-(box(?:2|3|4|5|6|7|8|10|11|12|13))$/);
  return match ? (match[1] as InstaBoxWorkerNodeId) : undefined;
}

export interface InstaBoxNodeMetrics {
  cpuCores: number;
  cpuUsagePercent: number;
  memoryTotalMb: number;
  memoryAvailableMb: number;
  diskTotalMb: number;
  diskAvailableMb: number;
  loadAverage1m?: number;
  operatingSystem: string;
  activeJobs: number;
}

export interface InstaBoxHeartbeatRequest {
  workerId: string;
  nodeId: string;
  version?: string;
  status?: "HEALTHY" | "DRAINING";
  metrics: InstaBoxNodeMetrics;
}

export interface InstaBoxHeartbeatResponse {
  acknowledged: boolean;
  serverTime: string;
  action: "POLL" | "DRAIN" | "RESTART";
  heartbeatIntervalSeconds: number;
}

export interface InstaBoxClaimRequest {
  workerId: string;
  maxConcurrency?: number;
}

export interface InstaBoxClaimResponse {
  claimed: boolean;
  pollIntervalSeconds?: number;
  jobId?: string;
  executionId?: string;
  executionToken?: string;
  attemptId?: number;
  timeoutMs?: number;
  leaseExpiresAt?: string;
  manifest?: Record<string, any>;
}

export interface InstaBoxProgressRequest {
  jobId: string;
  executionToken: string;
  progressPercent: number;
  stage?: string;
  message?: string;
}

export interface InstaBoxProgressResponse {
  acknowledged: boolean;
  leaseExtendedUntil: string;
}

export interface InstaBoxUploadResponse {
  success: boolean;
  artifactId: string;
  sha256: string;
  byteLength: number;
  casUri: string;
  durableUri?: string;
}

export interface InstaBoxCallbackRequest {
  jobId: string;
  executionToken: string;
  attemptId: number;
  status: "COMPLETED" | "FAILED";
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
  failureReason?: string;
}

export interface InstaBoxCallbackResponse {
  success: boolean;
  jobId: string;
  status: "COMPLETED" | "FAILED";
  message?: string;
  error?: string;
}

export interface InstaBoxActiveJobLease {
  jobId: string;
  executionId: string;
  executionToken: string;
  attemptId: number;
  workerId: string;
  nodeId: InstaBoxWorkerNodeId;
  claimedAt: string;
  lastProgressAt: string;
  leaseExpiresAt: string;
  timeoutMs: number;
  job: import("../contracts/ComputeContracts").ComputeJob;
  resolveReceipt: (receipt: import("../contracts/ComputeContracts").ExecutionReceipt) => void;
  rejectReceipt: (error: Error) => void;
  onProgress?: (msg: string) => void;
}
