/**
 * FactoryOS Render Fabric — Render Job State Machine
 * Enforces attempt monotonicity, fencing tokens, lease boundaries, and idempotency.
 */

import {
  RenderJob,
  RenderJobState,
  RenderAttempt,
  CallbackRequest,
  CallbackResponse,
  RenderJobRequirements,
} from "../contracts/RenderFabricContracts";
import { FabricEventJournal } from "../events/FabricEventJournal";

export class RenderJobStateMachine {
  private jobs: Map<string, RenderJob> = new Map();
  private attempts: Map<string, RenderAttempt[]> = new Map(); // key: jobId
  private idempotencyIndex: Map<string, string> = new Map(); // key: idempotencyKey -> jobId
  private journal: FabricEventJournal;
  private globalFencingCounter = 1000;

  constructor(journal?: FabricEventJournal) {
    this.journal = journal || FabricEventJournal.getInstance();
  }

  public submitJob(params: {
    jobId: string;
    missionId: string;
    idempotencyKey: string;
    requirements: RenderJobRequirements;
    manifest: Record<string, any>;
  }): { job: RenderJob; isDuplicate: boolean } {
    // 1. Idempotency check
    const existingJobId = this.idempotencyIndex.get(params.idempotencyKey);
    if (existingJobId) {
      const existing = this.jobs.get(existingJobId);
      if (existing) {
        return { job: existing, isDuplicate: true };
      }
    }

    const now = new Date().toISOString();
    const job: RenderJob = {
      jobId: params.jobId,
      missionId: params.missionId,
      idempotencyKey: params.idempotencyKey,
      state: "QUEUED",
      activeAttemptId: 0,
      activeFencingToken: 0,
      requirements: params.requirements,
      manifest: params.manifest,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(params.jobId, job);
    this.idempotencyIndex.set(params.idempotencyKey, params.jobId);
    this.attempts.set(params.jobId, []);

    this.journal.record({
      type: "job.created",
      subject: `job:${params.jobId}`,
      data: {
        jobId: params.jobId,
        missionId: params.missionId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return { job, isDuplicate: false };
  }

  public claimJob(params: {
    jobId: string;
    workerId: string;
    leaseDurationMs?: number;
  }): { attempt: RenderAttempt; fencingToken: number } {
    const job = this.jobs.get(params.jobId);
    if (!job) {
      throw new Error(`[RenderJobStateMachine] Job '${params.jobId}' not found.`);
    }

    if (job.state === "SUCCEEDED" || job.state === "CANCELLED") {
      throw new Error(`[RenderJobStateMachine] Cannot claim job in terminal state '${job.state}'.`);
    }

    // Distributed Mutual Exclusion: If job is already claimed or running and active lease has not expired, reject claim!
    if ((job.state === "CLAIMED" || job.state === "RUNNING") && job.leaseExpiresAt) {
      const leaseExpiry = new Date(job.leaseExpiresAt).getTime();
      if (Date.now() < leaseExpiry) {
        throw new Error(
          `[RenderJobStateMachine] Cannot claim job '${job.jobId}': active lease held by worker '${job.activeWorkerId}' until ${job.leaseExpiresAt}.`
        );
      }
    }

    const now = new Date().toISOString();
    const leaseDuration = params.leaseDurationMs || 60000;
    const leaseExpiresAt = new Date(Date.now() + leaseDuration).toISOString();

    job.activeAttemptId += 1;
    this.globalFencingCounter += 1;
    const fencingToken = this.globalFencingCounter;

    job.activeFencingToken = fencingToken;
    job.activeWorkerId = params.workerId;
    job.state = "CLAIMED";
    job.leaseExpiresAt = leaseExpiresAt;
    job.updatedAt = now;

    const attempt: RenderAttempt = {
      attemptId: job.activeAttemptId,
      jobId: job.jobId,
      workerId: params.workerId,
      fencingToken,
      state: "CLAIMED",
      leaseExpiresAt,
      startedAt: now,
    };

    const jobAttempts = this.attempts.get(params.jobId) || [];
    jobAttempts.push(attempt);
    this.attempts.set(params.jobId, jobAttempts);

    this.journal.record({
      type: "job.claimed",
      subject: `job:${job.jobId}:attempt:${attempt.attemptId}`,
      data: {
        jobId: job.jobId,
        attemptId: attempt.attemptId,
        workerId: params.workerId,
        fencingToken,
        leaseExpiresAt,
      },
    });

    return { attempt, fencingToken };
  }

  public renewLease(params: {
    jobId: string;
    attemptId: number;
    fencingToken: number;
    extensionMs?: number;
  }): boolean {
    const job = this.jobs.get(params.jobId);
    if (!job) return false;

    // Fencing check: reject stale worker attempt
    if (params.fencingToken !== job.activeFencingToken || params.attemptId !== job.activeAttemptId) {
      return false;
    }

    if (job.state === "SUCCEEDED" || job.state === "CANCELLED") {
      return false;
    }

    const extension = params.extensionMs || 60000;
    const newExpiresAt = new Date(Date.now() + extension).toISOString();
    job.leaseExpiresAt = newExpiresAt;
    job.updatedAt = new Date().toISOString();

    const jobAttempts = this.attempts.get(params.jobId) || [];
    const activeAttempt = jobAttempts.find((a) => a.attemptId === params.attemptId);
    if (activeAttempt) {
      activeAttempt.leaseExpiresAt = newExpiresAt;
    }

    this.journal.record({
      type: "lease.renewed",
      subject: `job:${job.jobId}:attempt:${params.attemptId}`,
      data: {
        jobId: job.jobId,
        attemptId: params.attemptId,
        fencingToken: params.fencingToken,
        leaseExpiresAt: newExpiresAt,
      },
    });

    return true;
  }

  public handleCallback(req: CallbackRequest): CallbackResponse {
    const job = this.jobs.get(req.jobId);
    if (!job) {
      return {
        accepted: false,
        idempotent: false,
        currentJobState: "FAILED",
        reason: `Job '${req.jobId}' does not exist.`,
      };
    }

    // 1. Idempotency Check: Terminal SUCCEEDED state
    if (job.state === "SUCCEEDED") {
      return {
        accepted: true,
        idempotent: true,
        currentJobState: "SUCCEEDED",
        reason: "Job already completed (idempotent callback). Zero duplicate rendering.",
      };
    }

    // 2. Strict Fencing Validation: reject stale worker / old attempt
    if (req.fencingToken < job.activeFencingToken || req.attemptId < job.activeAttemptId) {
      return {
        accepted: false,
        idempotent: false,
        currentJobState: job.state,
        reason: `FENCING_REJECTED: Incoming fencing token (${req.fencingToken}) or attempt (${req.attemptId}) is superseded by active (token: ${job.activeFencingToken}, attempt: ${job.activeAttemptId}).`,
      };
    }

    const now = new Date().toISOString();
    job.updatedAt = now;

    const jobAttempts = this.attempts.get(req.jobId) || [];
    const activeAttempt = jobAttempts.find((a) => a.attemptId === req.attemptId);

    if (req.status === "succeeded") {
      if (!req.artifact || !req.artifact.sha256) {
        return {
          accepted: false,
          idempotent: false,
          currentJobState: job.state,
          reason: "Callback claims success but lacks verified artifact digest.",
        };
      }

      job.state = "SUCCEEDED";
      job.artifactReference = {
        artifactId: `art_${req.artifact.sha256.substring(0, 16)}`,
        sha256: req.artifact.sha256,
        uri: req.artifact.uri,
        byteLength: req.artifact.byteLength,
        width: req.artifact.width || 1080,
        height: req.artifact.height || 1920,
        durationSeconds: req.artifact.durationSeconds || 5.0,
        codec: req.artifact.codec || "h264",
      };

      if (activeAttempt) {
        activeAttempt.state = "SUCCEEDED";
        activeAttempt.finishedAt = now;
      }

      this.journal.record({
        type: "render.succeeded",
        subject: `job:${job.jobId}`,
        data: {
          jobId: job.jobId,
          attemptId: req.attemptId,
          workerId: req.workerId,
          artifactSha256: req.artifact.sha256,
          uri: req.artifact.uri,
        },
      });

      return {
        accepted: true,
        idempotent: false,
        currentJobState: "SUCCEEDED",
      };
    }

    // Status: failed
    job.state = "FAILED";
    job.error = req.error || "Worker reported execution failure";
    if (activeAttempt) {
      activeAttempt.state = "FAILED";
      activeAttempt.finishedAt = now;
      activeAttempt.error = job.error;
    }

    this.journal.record({
      type: "render.failed",
      subject: `job:${job.jobId}`,
      data: {
        jobId: job.jobId,
        attemptId: req.attemptId,
        workerId: req.workerId,
        error: job.error,
      },
    });

    return {
      accepted: true,
      idempotent: false,
      currentJobState: "FAILED",
      reason: job.error,
    };
  }

  public getJob(jobId: string): RenderJob | undefined {
    return this.jobs.get(jobId);
  }

  public getAttempts(jobId: string): RenderAttempt[] {
    return this.attempts.get(jobId) || [];
  }

  public getAllJobs(): RenderJob[] {
    return Array.from(this.jobs.values());
  }
}
