/**
 * FactoryOS Distributed Compute Fabric — Canonical Contracts
 *
 * Core concepts for heterogeneous distributed compute scheduling across
 * Local, Kaggle, Lightning AI, GitHub Actions, and self-hosted worker daemons.
 */

export type ComputeWorkloadType = "RENDER" | "AUDIO" | "INFERENCE" | "VERIFICATION";

export type ProviderType =
  | "LOCAL"
  | "KAGGLE"
  | "LIGHTNING"
  | "GITHUB_ACTIONS"
  | "PERSISTENT_WORKER"
  | "RUNPOD"
  | "VAST";

export type ProviderExecutionModel =
  | "LOCAL_PROCESS"
  | "EPHEMERAL_BATCH"
  | "CLOUD_JOB"
  | "EPHEMERAL_WORKFLOW"
  | "PERSISTENT_WORKER";

export type ProviderHealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "FLAKY"
  | "DRAINING"
  | "BLOCKED"
  | "UNKNOWN";

export interface ProviderHealth {
  state: ProviderHealthState;
  lastCheckedAt: string;
  consecutiveFailures: number;
  failureReason?: string;
  activeJobs: number;
  successRate: number; // 0.0 to 1.0
  avgLatencyMs: number;
}

export interface ProviderCapability {
  providerId: string;
  providerType: ProviderType;
  executionModel: ProviderExecutionModel;
  cpuCores: number;
  memoryMb: number;
  gpuAvailable: boolean;
  gpuType?: string;
  operatingSystem: string;
  supportedWorkloads: ComputeWorkloadType[];
  estimatedStartupSeconds: number;
  transferBandwidthMbps: number;
  maxConcurrency: number;
  maxJobDurationSeconds: number;
  isCredentialConfigured: boolean;
}

export interface ProviderConfigValidationResult {
  isConfigured: boolean;
  requiredKeys: string[];
  missingKeys: string[];
  errors: string[];
}

export interface ComputeRequirements {
  minCpuCores?: number;
  minMemoryMb?: number;
  gpuRequired?: boolean;
  preferredGpuType?: string;
  estimatedDurationSeconds?: number;
  networkAccessRequired?: boolean;
  diskSpaceMb?: number;
  workloadType: ComputeWorkloadType;
}

export interface ArtifactRef {
  artifactId: string;
  role: string; // e.g. "audio", "image", "scene_manifest", "output_mp4", "receipt"
  sha256: string;
  byteLength: number;
  mimeType: string;
  uri?: string; // local absolute path, cas://<hash>, or http url
  content?: string; // inline data if small
  metadata?: Record<string, any>;
}

export interface ArtifactBundle {
  bundleId: string;
  artifacts: ArtifactRef[];
  createdTimestamp: number;
}

export interface ComputeJob {
  jobId: string;
  factoryExecutionId: string;
  missionId?: string;
  workloadType: ComputeWorkloadType;
  manifest: Record<string, any>;
  inputArtifacts: ArtifactBundle;
  requirements: ComputeRequirements;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  timeoutMs: number;
  createdAt: string;
}

export type ExecutionStatus =
  | "PENDING"
  | "STARTING"
  | "TRANSFERRING_INPUTS"
  | "RUNNING"
  | "TRANSFERRING_OUTPUTS"
  | "COMPLETED"
  | "FAILED"
  | "TIMED_OUT"
  | "CANCELLED";

export interface ExecutionReceipt {
  receiptId: string;
  executionId: string;
  jobId: string;
  factoryExecutionId: string;
  providerId: string;
  providerType: ProviderType;
  executionModel: ProviderExecutionModel;
  status: ExecutionStatus;
  exitCode: number;
  outputArtifacts: ArtifactRef[];
  metrics: {
    startupTimeMs: number;
    executionTimeMs: number;
    transferTimeMs: number;
    totalTimeMs: number;
  };
  stdoutSnippet?: string;
  stderrSnippet?: string;
  sha256Proof?: string;
  verifiedAt?: string;
  failureReason?: string;
  rawReceipt?: Record<string, any>;
}

export interface ComputePolicy {
  allowedProviders: ProviderType[];
  preferredOrder: ProviderType[];
  maxRetries: number;
  failoverAllowed: boolean;
  preferLocalForShortVideos: boolean;
  shortVideoThresholdSeconds: number;
  allowSimulatedInTest: boolean;
}

export const DEFAULT_COMPUTE_POLICY: ComputePolicy = {
  allowedProviders: ["LOCAL", "KAGGLE", "LIGHTNING", "GITHUB_ACTIONS", "PERSISTENT_WORKER"],
  preferredOrder: ["LOCAL", "PERSISTENT_WORKER", "LIGHTNING", "KAGGLE", "GITHUB_ACTIONS"],
  maxRetries: 2,
  failoverAllowed: true,
  preferLocalForShortVideos: true,
  shortVideoThresholdSeconds: 60,
  allowSimulatedInTest: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Provider Adapter Contract v2 (Heterogeneous Cloud Lifecycle)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeInstanceSpec {
  instanceId?: string;
  providerType: ProviderType;
  gpuRequired?: boolean;
  minVramMb?: number;
  cpuCores?: number;
  memoryMb?: number;
  maxDurationSeconds?: number;
  environmentVariables?: Record<string, string>;
  workerPayload?: Record<string, any>;
}

export type ComputeInstanceState =
  | "PROVISIONING"
  | "BOOTING"
  | "READY"
  | "BUSY"
  | "TERMINATING"
  | "TERMINATED"
  | "ERROR";

export interface ComputeInstanceStatus {
  instanceId: string;
  state: ComputeInstanceState;
  endpointUri?: string;
  workerId?: string;
  startedAt?: string;
  uptimeSeconds?: number;
  error?: string;
}

export interface IComputeProviderV2 {
  readonly id: string;
  readonly type: ProviderType;
  readonly executionModel: ProviderExecutionModel;

  getCapability(): Promise<ProviderCapability>;
  getHealth(): Promise<ProviderHealth>;
  isAvailable(): Promise<boolean>;

  // Lifecycle v2
  provision(spec: ComputeInstanceSpec): Promise<ComputeInstanceStatus>;
  waitReady(instanceId: string, timeoutMs?: number): Promise<boolean>;
  registerWorker?(workerInfo: Record<string, any>): Promise<{ token: string; acknowledged: boolean }>;
  dispatch(job: ComputeJob, instanceId?: string, onProgress?: (msg: string) => void): Promise<ExecutionReceipt>;
  getStatus(instanceId: string): Promise<ComputeInstanceStatus>;
  terminate(instanceId: string): Promise<void>;

  // Backward compatibility
  executeJob(job: ComputeJob, onProgress?: (msg: string) => void): Promise<ExecutionReceipt>;
  cancelJob?(executionId: string): Promise<void>;
  validateConfiguration?(): ProviderConfigValidationResult;
}
