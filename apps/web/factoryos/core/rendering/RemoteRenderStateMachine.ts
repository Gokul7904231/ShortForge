/**
 * FactoryOS Frontier v3 — Remote Render State Machine & Lease Recovery
 * Manages remote render lifecycle with attempt monotonicity, lease expiry,
 * and lost-callback artifact reconciliation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export type RemoteRenderState =
  | "QUEUED"
  | "DISPATCHED"
  | "LEASED"
  | "RUNNING"
  | "ARTIFACT_READY"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYABLE"
  | "STALE"
  | "CANCELLED";

export interface RemoteRenderJob {
  jobId: string;
  state: RemoteRenderState;
  attemptId: number;
  leaseExpiresAt?: string;
  maxRetries: number;
  retryCount: number;
  expectedSha256?: string;
  artifactLocation?: string;
  videoUrl?: string;
  createdAt: string;
  updatedAt: string;
  history: Array<{
    state: RemoteRenderState;
    timestamp: string;
    attemptId: number;
    reason?: string;
  }>;
}

export interface CallbackPayload {
  status: "completed" | "failed";
  videoUrl?: string;
  artifactSha256?: string;
  error?: string;
  [key: string]: unknown;
}

export interface CallbackResult {
  accepted: boolean;
  idempotent?: boolean;
  state?: RemoteRenderState;
  reason?: string;
  currentAttempt?: number;
  incomingAttemptId?: number;
}

export class RemoteRenderStateMachine {
  private static instance?: RemoteRenderStateMachine;
  private jobs: Map<string, RemoteRenderJob> = new Map();

  public static getInstance(): RemoteRenderStateMachine {
    if (!RemoteRenderStateMachine.instance) {
      RemoteRenderStateMachine.instance = new RemoteRenderStateMachine();
    }
    return RemoteRenderStateMachine.instance;
  }

  public registerJob(params: {
    jobId: string;
    attemptId?: number;
    leaseDurationMs?: number;
    maxRetries?: number;
    expectedSha256?: string;
  }): RemoteRenderJob {
    const now = new Date().toISOString();
    const leaseDuration = params.leaseDurationMs || 60000; // 1 minute default lease
    const leaseExpiresAt = new Date(Date.now() + leaseDuration).toISOString();
    const attemptId = params.attemptId ?? 1;

    const job: RemoteRenderJob = {
      jobId: params.jobId,
      state: "DISPATCHED",
      attemptId,
      leaseExpiresAt,
      maxRetries: params.maxRetries ?? 3,
      retryCount: 0,
      expectedSha256: params.expectedSha256,
      createdAt: now,
      updatedAt: now,
      history: [
        {
          state: "DISPATCHED",
          timestamp: now,
          attemptId,
          reason: "Job dispatched to render cluster with lease",
        },
      ],
    };

    this.jobs.set(params.jobId, job);
    return job;
  }

  public getJob(jobId: string): RemoteRenderJob | undefined {
    return this.jobs.get(jobId);
  }

  public renewLease(jobId: string, extensionMs: number = 60000): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.leaseExpiresAt = new Date(Date.now() + extensionMs).toISOString();
    job.updatedAt = new Date().toISOString();
    return true;
  }

  public dispatchNextAttempt(jobId: string, leaseDurationMs: number = 60000): RemoteRenderJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`[RemoteRenderStateMachine] Cannot dispatch attempt for non-existent job: ${jobId}`);
    }

    job.attemptId += 1;
    job.retryCount += 1;
    job.state = "DISPATCHED";
    job.leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();
    const now = new Date().toISOString();
    job.updatedAt = now;
    job.history.push({
      state: "DISPATCHED",
      timestamp: now,
      attemptId: job.attemptId,
      reason: `Re-dispatched attempt #${job.attemptId} after previous failure or stale lease`,
    });

    return job;
  }

  /**
   * Handles incoming render worker callback with strict attempt monotonicity and idempotency.
   */
  public handleCallback(
    jobId: string,
    incomingAttemptId: number | undefined,
    payload: CallbackPayload
  ): CallbackResult {
    let job = this.jobs.get(jobId);

    // If job was never registered, reject callback as untrusted / unknown
    if (!job) {
      return {
        accepted: false,
        reason: `[RemoteRenderStateMachine] Rejected callback: Job '${jobId}' not found in state machine`,
      };
    }

    const effectiveIncomingAttempt = incomingAttemptId ?? job.attemptId;

    // 1. Strict Monotonicity: Reject stale attempts
    if (effectiveIncomingAttempt < job.attemptId) {
      return {
        accepted: false,
        reason: `STALE_ATTEMPT: Callback attempt (${effectiveIncomingAttempt}) is older than active attempt (${job.attemptId})`,
        currentAttempt: job.attemptId,
        incomingAttemptId: effectiveIncomingAttempt,
      };
    }

    // 2. Idempotency Check: Terminal completed state
    if (job.state === "COMPLETED") {
      return {
        accepted: true,
        idempotent: true,
        state: "COMPLETED",
        reason: "Job already completed (idempotent callback)",
      };
    }

    const now = new Date().toISOString();
    job.updatedAt = now;

    // 3. Process Status Transitions
    if (payload.status === "completed") {
      job.state = "COMPLETED";
      job.videoUrl = payload.videoUrl;
      job.artifactLocation = payload.videoUrl;
      job.history.push({
        state: "COMPLETED",
        timestamp: now,
        attemptId: effectiveIncomingAttempt,
        reason: "Render worker callback confirmed physical video delivery",
      });

      return {
        accepted: true,
        idempotent: false,
        state: "COMPLETED",
      };
    }

    if (payload.status === "failed") {
      const canRetry = job.retryCount < job.maxRetries;
      job.state = canRetry ? "RETRYABLE" : "FAILED";
      job.history.push({
        state: job.state,
        timestamp: now,
        attemptId: effectiveIncomingAttempt,
        reason: payload.error || "Remote render worker reported failure",
      });

      return {
        accepted: true,
        idempotent: false,
        state: job.state,
        reason: payload.error,
      };
    }

    return {
      accepted: false,
      reason: `Unknown payload status: ${(payload as any).status}`,
    };
  }

  /**
   * Reconciles stale jobs whose leases have expired.
   * Probes disk storage: if valid artifact is physically present, completes without rerendering.
   */
  public async reconcileStaleJobs(options?: {
    probeStorage?: (job: RemoteRenderJob) => Promise<{ exists: boolean; sha256?: string; path?: string }>;
  }): Promise<{ reconciledCount: number; recoveredCount: number; staleCount: number }> {
    const now = Date.now();
    let reconciledCount = 0;
    let recoveredCount = 0;
    let staleCount = 0;

    for (const job of this.jobs.values()) {
      if (
        (job.state === "DISPATCHED" || job.state === "LEASED" || job.state === "RUNNING") &&
        job.leaseExpiresAt &&
        new Date(job.leaseExpiresAt).getTime() < now
      ) {
        reconciledCount++;
        let artifactFound = false;
        let artifactPath = "";

        // 1. Check custom probeStorage callback
        if (options?.probeStorage) {
          try {
            const probe = await options.probeStorage(job);
            if (probe.exists) {
              artifactFound = true;
              artifactPath = probe.path || "";
            }
          } catch {}
        }

        // 2. Check local disk render locations with authoritative F7 physical media verification
        if (!artifactFound) {
          const candidatePaths = [
            path.join(process.cwd(), "data", "renders", `${job.jobId}.mp4`),
            path.join(process.cwd(), "data", "factoryos_resolved_artifacts", `resolved_${job.jobId}.mp4`),
          ];

          for (const cand of candidatePaths) {
            if (fs.existsSync(cand) && fs.statSync(cand).size > 0) {
              try {
                const { VerificationEngine } = await import("../verification/VerificationEngine");
                const audit = await VerificationEngine.auditMediaArtifact({
                  videoUrl: cand,
                  jobId: job.jobId,
                });
                if (
                  audit.verified &&
                  audit.hardGates.artifactExists &&
                  audit.hardGates.validContainer &&
                  audit.hardGates.decodeSmokePassed
                ) {
                  if (job.expectedSha256) {
                    const cryptoMod = await import("node:crypto");
                    const candHash = cryptoMod.createHash("sha256").update(fs.readFileSync(cand)).digest("hex");
                    if (candHash !== job.expectedSha256) {
                      continue;
                    }
                  }
                  artifactFound = true;
                  artifactPath = cand;
                  break;
                }
              } catch {}
            }
          }
        }

        const timestamp = new Date().toISOString();
        if (artifactFound) {
          // Recover without re-rendering!
          job.state = "COMPLETED";
          job.videoUrl = artifactPath;
          job.updatedAt = timestamp;
          job.history.push({
            state: "COMPLETED",
            timestamp,
            attemptId: job.attemptId,
            reason: "RECOVERED_FROM_LOST_CALLBACK: Discovered verified physical artifact despite missed webhook callback",
          });
          recoveredCount++;
        } else {
          // No artifact found: mark RETRYABLE or STALE
          if (job.retryCount < job.maxRetries) {
            job.state = "RETRYABLE";
            job.updatedAt = timestamp;
            job.history.push({
              state: "RETRYABLE",
              timestamp,
              attemptId: job.attemptId,
              reason: "Lease expired and no artifact found on disk; marked ready for retry attempt",
            });
          } else {
            job.state = "STALE";
            job.updatedAt = timestamp;
            job.history.push({
              state: "STALE",
              timestamp,
              attemptId: job.attemptId,
              reason: "Lease expired with max retries exceeded; marked STALE",
            });
          }
          staleCount++;
        }
      }
    }

    return { reconciledCount, recoveredCount, staleCount };
  }
}
