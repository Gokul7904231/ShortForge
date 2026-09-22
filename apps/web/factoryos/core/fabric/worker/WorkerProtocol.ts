/**
 * FactoryOS Distributed Compute Fabric — Provider-Independent Worker Protocol
 *
 * Defines the canonical protocol for all rendering workers (Kaggle, RunPod,
 * Vast, Modal, Azure, Local) decoupling compute execution from physical hosting.
 */

import { GpuVendor, RenderJob, WorkerCapability, WorkerState } from "../contracts/RenderFabricContracts";
import { ArtifactRef } from "../../compute/contracts/ComputeContracts";

export type WorkerProtocolAction =
  | "REGISTER"
  | "HEARTBEAT"
  | "CLAIM"
  | "LEASE_RENEW"
  | "RENDER"
  | "UPLOAD"
  | "CALLBACK"
  | "DRAIN"
  | "SHUTDOWN";

// ─────────────────────────────────────────────────────────────────────────────
// 1. REGISTER
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerRegisterRequest {
  readonly workerId: string;
  readonly providerId: string; // e.g. "provider_kaggle_batch", "provider_runpod"
  readonly hostname: string;
  readonly ipAddress?: string;
  readonly gpuVendor: GpuVendor;
  readonly gpuModel: string;
  readonly vramMb: number;
  readonly gpuCount: number;
  readonly cpuCores: number;
  readonly memoryMb: number;
  readonly ffmpegVersion?: string;
  readonly pythonVersion?: string;
  readonly supportedCodecs: readonly string[];
  readonly authSecret?: string;
}

export interface WorkerRegisterResponse {
  readonly acknowledged: boolean;
  readonly workerToken: string;
  readonly heartbeatIntervalMs: number;
  readonly leaseTimeoutMs: number;
  readonly registeredAt: string;
  readonly controlPlaneVersion: string;
  readonly error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. HEARTBEAT
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerHeartbeatRequest {
  readonly workerId: string;
  readonly workerToken: string;
  readonly state: WorkerState;
  readonly currentJobId?: string;
  readonly currentLeaseToken?: string;
  readonly uptimeSeconds: number;
  readonly gpuUtilizationPercent?: number;
  readonly memoryUsedMb?: number;
  readonly timestamp: string;
}

export interface WorkerHeartbeatResponse {
  readonly acknowledged: boolean;
  readonly command?: "CONTINUE" | "DRAIN" | "ABORT_CURRENT_JOB" | "SHUTDOWN";
  readonly leaseRenewed?: boolean;
  readonly serverTime: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLAIM
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerClaimRequest {
  readonly workerId: string;
  readonly workerToken: string;
  readonly supportedWorkloads: readonly string[];
  readonly maxDurationSeconds?: number;
}

export interface WorkerClaimResponse {
  readonly jobAvailable: boolean;
  readonly job?: RenderJob;
  readonly leaseToken?: string;
  readonly fencingToken?: number;
  readonly leaseExpiresAt?: string;
  readonly waitDurationMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LEASE_RENEW
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerLeaseRenewRequest {
  readonly workerId: string;
  readonly workerToken: string;
  readonly jobId: string;
  readonly leaseToken: string;
  readonly extendBySeconds: number;
  readonly progressPercent?: number;
}

export interface WorkerLeaseRenewResponse {
  readonly granted: boolean;
  readonly newExpiresAt?: string;
  readonly reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CALLBACK (Job Completion / Failure)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerCallbackRequest {
  readonly workerId: string;
  readonly workerToken: string;
  readonly jobId: string;
  readonly leaseToken: string;
  readonly fencingToken: number;
  readonly status: "COMPLETED" | "FAILED" | "TIMED_OUT";
  readonly exitCode: number;
  readonly outputArtifacts: readonly ArtifactRef[];
  readonly executionMetrics: {
    readonly startupTimeMs: number;
    readonly renderTimeMs: number;
    readonly uploadTimeMs: number;
    readonly totalTimeMs: number;
  };
  readonly stdoutSnippet?: string;
  readonly stderrSnippet?: string;
  readonly error?: string;
  readonly signature?: string; // Optional HMAC signature over callback payload
}

export interface WorkerCallbackResponse {
  readonly accepted: boolean;
  readonly state: "CONFIRMED" | "REJECTED_FENCING_STALE" | "REJECTED_LEASE_EXPIRED" | "REJECTED_CAS_CORRUPT";
  readonly error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Invariant Validator
// ─────────────────────────────────────────────────────────────────────────────

export class WorkerProtocolValidator {
  /**
   * Validates that output artifacts contain strictly valid 64-char SHA-256 digests and positive bytes.
   */
  public static validateArtifacts(artifacts: readonly ArtifactRef[]): { valid: boolean; error?: string } {
    if (!artifacts || artifacts.length === 0) {
      return { valid: false, error: "Empty outputArtifacts array in callback receipt." };
    }

    const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    for (const art of artifacts) {
      if (!art.sha256 || art.sha256.length !== 64 || art.sha256 === EMPTY_SHA) {
        return {
          valid: false,
          error: `Invalid or placeholder artifact SHA-256 in artifact '${art.artifactId}': '${art.sha256}'`,
        };
      }
      if (art.byteLength <= 0) {
        return {
          valid: false,
          error: `Non-positive byteLength in artifact '${art.artifactId}': ${art.byteLength}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validates fencing token ordering to reject zombie / partitioned worker callbacks.
   */
  public static isFencingTokenValid(incomingToken: number, expectedToken: number): boolean {
    return incomingToken >= expectedToken;
  }
}
