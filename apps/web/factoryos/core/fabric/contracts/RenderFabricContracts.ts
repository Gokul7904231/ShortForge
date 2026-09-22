/**
 * FactoryOS Render Fabric — Canonical Domain Contracts
 * Provider-neutral distributed render execution plane.
 */

export type RenderJobState =
  | "QUEUED"
  | "CLAIMED"
  | "RUNNING"
  | "UPLOADING"
  | "CALLBACK_PENDING"
  | "SUCCEEDED"
  | "CANCELLED"
  | "FAILED"
  | "LEASE_EXPIRED"
  | "WORKER_LOST"
  | "CALLBACK_RETRY";

export type WorkerState =
  | "BOOTING"
  | "REGISTERING"
  | "READY"
  | "CLAIMING"
  | "RUNNING"
  | "UPLOADING"
  | "CALLBACK_PENDING"
  | "DRAINING"
  | "DEGRADED"
  | "EXPIRED"
  | "OFFLINE";

export type GpuVendor = "NVIDIA" | "AMD" | "INTEL" | "APPLE" | "NONE";

export type FabricProviderType = "LOCAL" | "AMD" | "KAGGLE" | "LIGHTNING" | "GITHUB_ACTIONS" | "RUNPOD" | "VAST";

export interface WorkerCapability {
  readonly workerId: string;
  readonly providerType: FabricProviderType;
  readonly gpuVendor: GpuVendor;
  readonly gpuModel: string;
  readonly vramMb: number;
  readonly gpuCount: number;
  readonly cpuCores?: number;
  readonly memoryMb?: number;
  readonly rocmVersion?: string;
  readonly cudaVersion?: string;
  readonly ffmpegAvailable: boolean;
  readonly supportedCodecs?: string[];
  readonly supportedWorkloads?: string[];
  readonly maxConcurrency?: number;
  readonly estimatedRemainingLifetimeSeconds: number;
  readonly isEphemeral: boolean;
}

export interface RenderJobRequirements {
  readonly minVramMb?: number;
  readonly gpuRequired: boolean;
  readonly preferredGpuVendor?: GpuVendor;
  readonly estimatedDurationSeconds?: number;
  readonly timeoutMs?: number;
  readonly safetyMarginSeconds?: number;
  readonly priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  readonly requiresFfmpeg?: boolean;
  readonly supportedWorkloads?: string[];
}

export interface ArtifactManifest {
  readonly artifactId: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly uri: string;
  readonly mediaMetadata: {
    readonly width: number;
    readonly height: number;
    readonly durationSeconds: number;
    readonly videoCodec: string;
    readonly audioCodec?: string;
    readonly fps?: number;
  };
  readonly renderManifestHash: string;
  readonly sourceLineage?: {
    readonly missionId: string;
    readonly jobId: string;
    readonly attemptId: number;
    readonly workerId: string;
    readonly providerType: FabricProviderType;
  };
  readonly verificationReceipt?: {
    readonly ffprobe: "PASS" | "FAIL";
    readonly containerValid: boolean;
    readonly verifiedAt: string;
  };
  readonly createdAt: string;
}

export interface RenderJob {
  readonly jobId: string;
  readonly missionId: string;
  readonly idempotencyKey: string;
  state: RenderJobState;
  activeAttemptId: number;
  activeFencingToken: number;
  activeWorkerId?: string;
  readonly requirements: RenderJobRequirements;
  readonly manifest: Record<string, any>;
  readonly createdAt: string;
  updatedAt: string;
  leaseExpiresAt?: string;
  artifactReference?: {
    artifactId: string;
    sha256: string;
    uri: string;
    byteLength: number;
    width: number;
    height: number;
    durationSeconds: number;
    codec: string;
  };
  finalArtifactManifest?: ArtifactManifest;
  error?: string;
}

export interface RenderAttempt {
  readonly attemptId: number;
  readonly jobId: string;
  readonly workerId: string;
  readonly fencingToken: number;
  state: RenderJobState;
  leaseExpiresAt?: string;
  readonly startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface FabricEvent {
  readonly specversion: "1.0";
  readonly id: string;
  readonly source: string;
  readonly type: string;
  readonly time: string;
  readonly subject: string;
  readonly data: Record<string, any>;
}

export interface PlacementDecision {
  readonly jobId: string;
  readonly selectedWorkerId: string;
  readonly selectedProvider: FabricProviderType;
  readonly whySelected: string;
  readonly rankingScore: number;
  readonly rankingSignals: {
    readonly queueDepth: number;
    readonly remainingLifetimeSeconds: number;
    readonly vramMb: number;
    readonly reliabilityScore: number;
    readonly costScore: number;
  };
  readonly rejectedWorkers: Record<string, string>;
  readonly placedAt: string;
}

export interface CallbackRequest {
  readonly jobId: string;
  readonly attemptId: number;
  readonly fencingToken: number;
  readonly workerId: string;
  readonly status: "succeeded" | "failed";
  readonly artifact?: {
    readonly uri: string;
    readonly sha256: string;
    readonly byteLength: number;
    readonly width?: number;
    readonly height?: number;
    readonly durationSeconds?: number;
    readonly codec?: string;
  };
  readonly error?: string;
}

export interface CallbackResponse {
  readonly accepted: boolean;
  readonly idempotent: boolean;
  readonly currentJobState: RenderJobState;
  readonly reason?: string;
}
