/**
 * Publisher Queue (v2 — Persistent)
 *
 * Same SQLite persistence + idempotency pattern as StorageQueue.
 * Survives server restarts, crashes, and Vercel cold starts.
 *
 * V2 Improvements:
 *   ✅ SQLite persistence — every job survives restart
 *   ✅ Idempotency — jobId + platform deduplicates publish jobs
 *   ✅ Startup restore — pending/retrying jobs resume automatically
 *   ✅ Metrics — duration, success, failure, retry recorded to SQLite
 */

import crypto from "crypto";
import { EventBus } from "../ai/event-bus";
import { PublishingRegistry } from "./publishing-registry";
import type { PublishPayload, PublishResult } from "./publishing-provider";
import { db } from "../lib/firebase-admin";
import { PublishJobDB, MetricsDB, type PublishJobRow } from "../lib/queue-db";
import { PublicationAuthorizationService } from "./authorization/PublicationAuthorizationService";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PublishJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "retrying"
  | "dead"
  | "skipped";

export interface PublishQueueJob {
  id: string;
  jobId: string;
  platform: string;
  payload: PublishPayload;
  status: PublishJobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  nextRetryAt?: number;
  lastError?: string;
  result?: PublishResult;
}

// Retry delays: 2m → 10m → 1h → dead
const PUBLISH_RETRY_DELAYS_MS = [120_000, 600_000, 3_600_000];

// ─────────────────────────────────────────────────────────────────────────────
// Row ↔ Job helpers
// ─────────────────────────────────────────────────────────────────────────────

function rowToJob(row: PublishJobRow): PublishQueueJob {
  return {
    id: row.id,
    jobId: row.job_id,
    platform: row.platform,
    payload: JSON.parse(row.payload_json),
    status: row.status as PublishJobStatus,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    nextRetryAt: row.next_retry_at ?? undefined,
    lastError: row.last_error ?? undefined,
    result: row.result_json ? JSON.parse(row.result_json) : undefined,
  };
}

function jobToRow(job: PublishQueueJob): PublishJobRow {
  return {
    id: job.id,
    job_id: job.jobId,
    platform: job.platform,
    payload_json: JSON.stringify(job.payload),
    status: job.status,
    attempts: job.attempts,
    max_attempts: job.maxAttempts,
    created_at: job.createdAt,
    next_retry_at: job.nextRetryAt ?? null,
    last_error: job.lastError ?? null,
    result_json: job.result ? JSON.stringify(job.result) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher Queue
// ─────────────────────────────────────────────────────────────────────────────

class PublisherQueueClass {
  private queue: PublishQueueJob[] = [];
  private deadLetterQueue: PublishQueueJob[] = [];
  private processing = new Set<string>();
  private concurrency = Number(process.env.PUBLISHER_QUEUE_CONCURRENCY ?? 1);
  private tickInterval: NodeJS.Timeout | null = null;
  private running = false;

  constructor() {
    this.restoreFromDB();
    this.start();
    this.subscribeToStorageEvents();
  }

  // ─── Startup Restore ───────────────────────────────────────────────────────

  private restoreFromDB(): void {
    try {
      const activeRows = PublishJobDB.loadActive();
      for (const row of activeRows) {
        const job = rowToJob(row);
        // Was mid-flight when process died → retry after 2 min
        if (job.status === "processing") {
          job.status = "retrying";
          job.nextRetryAt = Date.now() + PUBLISH_RETRY_DELAYS_MS[0];
          PublishJobDB.updateStatus(job.id, "retrying", { next_retry_at: job.nextRetryAt });
        }
        this.queue.push(job);
      }

      const deadRows = PublishJobDB.loadDead();
      for (const row of deadRows) {
        this.deadLetterQueue.push(rowToJob(row));
      }

      console.log(
        `[PublisherQueue] Restored ${this.queue.length} active + ${this.deadLetterQueue.length} dead jobs from SQLite`
      );
    } catch (err: any) {
      console.warn(`[PublisherQueue] Could not restore from SQLite (non-fatal): ${err.message}`);
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tickInterval = setInterval(() => this.tick(), 10_000);
    console.log("[PublisherQueue] Started — concurrency:", this.concurrency);
    setImmediate(() => this.tick());
  }

  stop(): void {
    this.running = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  // ─── EventBus Subscription ─────────────────────────────────────────────────

  private subscribeToStorageEvents(): void {
    EventBus.subscribe<{
      jobId: string;
      platforms?: string[];
      videoUrl?: string;
      title?: string;
      description?: string;
      tags?: string[];
      thumbnailUrl?: string;
      engine?: string;
    }>("storage.upload.completed", async (event) => {
      const { jobId, platforms, videoUrl, title, description, tags, thumbnailUrl, engine } = event.payload;
      if (!platforms || platforms.length === 0) return;
      if (!videoUrl || !title) return;

      const payload: PublishPayload = {
        jobId,
        videoUrl,
        title,
        description,
        tags,
        thumbnailUrl,
        engine,
      };

      for (const platform of platforms) {
        this.enqueue({ jobId, platform, payload });
      }
    });
  }

  // ─── Enqueue (with idempotency guard) ────────────────────────────────────

  enqueue(input: {
    jobId: string;
    platform: string;
    payload: PublishPayload;
  }): PublishQueueJob {
    // Invariant: NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION
    if (input.platform === "youtube" || input.platform === "youtube-dryrun") {
      const auth = input.payload.authorization;
      if (!auth) {
        throw new Error(
          `[PublisherQueue] Cannot enqueue publish job: Invariant 'NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION' violated. Missing ReleaseAuthorization for platform '${input.platform}'.`
        );
      }
      const canonicalParams = {
        jobId: input.jobId,
        title: input.payload.title,
        description: input.payload.description,
        tags: input.payload.tags,
        privacyStatus: input.payload.privacyStatus || (auth.scope.allowedPrivacy as any) || "unlisted",
        publishAt: input.payload.publishAt || auth.scope.publishAt,
        containsSyntheticMedia: input.payload.containsSyntheticMedia ?? auth.scope.containsSyntheticMedia,
        selfDeclaredMadeForKids: input.payload.selfDeclaredMadeForKids ?? auth.scope.selfDeclaredMadeForKids,
        channelId: input.payload.channelId || auth.targetChannelId,
        platform: "youtube",
      };
      const check = PublicationAuthorizationService.getInstance().verifyAuthorization(auth, canonicalParams);
      if (!check.valid) {
        throw new Error(`[PublisherQueue] Invalid ReleaseAuthorization (${check.code}): ${check.error}`);
      }
    }

    // Idempotency: don't re-enqueue the same jobId+platform combination
    const existing = this.queue.find(
      (j) => j.jobId === input.jobId && j.platform === input.platform
    );
    if (existing) {
      console.log(
        `[PublisherQueue] jobId=${input.jobId} platform=${input.platform} already queued — skipping`
      );
      return existing;
    }

    const job: PublishQueueJob = {
      id: `pq_${crypto.randomBytes(6).toString("hex")}`,
      jobId: input.jobId,
      platform: input.platform,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      maxAttempts: PUBLISH_RETRY_DELAYS_MS.length + 1,
      createdAt: Date.now(),
    };

    try {
      PublishJobDB.upsert(jobToRow(job));
    } catch (err: any) {
      console.warn(`[PublisherQueue] SQLite persist failed (non-fatal): ${err.message}`);
    }

    this.queue.push(job);
    console.log(
      `[PublisherQueue] Enqueued ${job.id} → platform: ${input.platform} | job: ${input.jobId}`
    );

    EventBus.publish(
      "publish.queued",
      { publishJobId: job.id, jobId: input.jobId, platform: input.platform },
      job.id
    );

    setImmediate(() => this.tick());
    return job;
  }

  // ─── Worker Tick ───────────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    if (!this.running) return;
    const now = Date.now();
    const available = this.concurrency - this.processing.size;
    if (available <= 0) return;

    const ready = this.queue
      .filter(
        (j) =>
          (j.status === "pending" ||
            (j.status === "retrying" && (j.nextRetryAt ?? 0) <= now)) &&
          !this.processing.has(j.id)
      )
      .slice(0, available);

    for (const job of ready) {
      this.processJob(job).catch((err) =>
        console.error(`[PublisherQueue] Unhandled error:`, err)
      );
    }
  }

  // ─── Process a Single Job ──────────────────────────────────────────────────

  private async processJob(job: PublishQueueJob): Promise<void> {
    this.processing.add(job.id);
    job.status = "processing";
    job.attempts++;
    const startMs = Date.now();

    PublishJobDB.updateStatus(job.id, "processing", { attempts: job.attempts });

    console.log(
      `[PublisherQueue] Publishing to "${job.platform}" | attempt ${job.attempts}/${job.maxAttempts} | job: ${job.jobId}`
    );

    EventBus.publish(
      "publish.started",
      { publishJobId: job.id, platform: job.platform, jobId: job.jobId },
      job.id
    );

    // JIT authorization revalidation immediately before calling provider
    if (job.platform === "youtube" || job.platform === "youtube-dryrun") {
      const auth = job.payload.authorization;
      const canonicalParams = {
        jobId: job.jobId,
        title: job.payload.title,
        description: job.payload.description,
        tags: job.payload.tags,
        privacyStatus: job.payload.privacyStatus || (auth?.scope.allowedPrivacy as any) || "unlisted",
        publishAt: job.payload.publishAt || auth?.scope.publishAt,
        containsSyntheticMedia: job.payload.containsSyntheticMedia ?? auth?.scope.containsSyntheticMedia,
        selfDeclaredMadeForKids: job.payload.selfDeclaredMadeForKids ?? auth?.scope.selfDeclaredMadeForKids,
        channelId: job.payload.channelId || auth?.targetChannelId || "",
        platform: "youtube",
      };
      const jitCheck = PublicationAuthorizationService.getInstance().revalidateImmediatelyBeforePublish(
        auth,
        canonicalParams,
        { uploadSessionUri: job.payload.uploadSessionUri }
      );
      if (!jitCheck.valid) {
        const errMsg = `JIT ReleaseAuthorization Revalidation Failed (${jitCheck.code}): ${jitCheck.error}`;
        console.error(`[PublisherQueue] ${errMsg}`);
        job.status = "dead";
        job.lastError = errMsg;
        this.queue = this.queue.filter((j) => j.id !== job.id);
        this.deadLetterQueue.push(job);
        PublishJobDB.updateStatus(job.id, "dead", { last_error: errMsg });
        EventBus.publish("publish.failed", { publishJobId: job.id, error: errMsg }, job.id);
        this.processing.delete(job.id);
        return;
      }
    }

    try {
      const provider = PublishingRegistry.getProvider(job.platform);
      const result = await provider.publish(job.payload);
      const durationMs = Date.now() - startMs;

      job.result = result;
      job.status = "completed";
      this.queue = this.queue.filter((j) => j.id !== job.id);

      PublishJobDB.updateStatus(job.id, "completed", {
        result_json: JSON.stringify(result),
      });

      MetricsDB.record("publish_duration_ms", "publisher", durationMs, { platform: job.platform });
      MetricsDB.record("success", "publisher", 1, { platform: job.platform });

      // Persist publish result to Firestore
      try {
        const key = `publish_${job.platform}`;
        await db.collection("videos").doc(job.jobId).set(
          {
            [`${key}PostId`]:      result.postId ?? null,
            [`${key}PostUrl`]:     result.postUrl ?? null,
            [`${key}PublishedAt`]: result.publishedAt,
            [`${key}Success`]:     result.success,
          },
          { merge: true }
        );
      } catch {}

      EventBus.publish(
        "publish.completed",
        {
          publishJobId: job.id,
          platform: job.platform,
          jobId: job.jobId,
          postId: result.postId,
          postUrl: result.postUrl,
          durationMs,
        },
        job.id
      );

      console.log(
        `[PublisherQueue] Published to "${job.platform}" | postId: ${result.postId ?? "(none)"} (${durationMs}ms)`
      );
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      job.lastError = err.message;
      console.error(
        `[PublisherQueue] Publish to "${job.platform}" failed (attempt ${job.attempts}): ${err.message}`
      );

      if (job.attempts >= job.maxAttempts) {
        job.status = "dead";
        this.queue = this.queue.filter((j) => j.id !== job.id);
        this.deadLetterQueue.push(job);

        PublishJobDB.updateStatus(job.id, "dead", {
          last_error: err.message,
          attempts: job.attempts,
        });

        MetricsDB.record("failure", "publisher", 1, { reason: "dead_letter", platform: job.platform });

        EventBus.publish(
          "publish.dead",
          { publishJobId: job.id, platform: job.platform, jobId: job.jobId, error: err.message },
          job.id
        );
      } else {
        const delayMs = PUBLISH_RETRY_DELAYS_MS[job.attempts - 1] ?? 3_600_000;
        job.status = "retrying";
        job.nextRetryAt = Date.now() + delayMs;

        PublishJobDB.updateStatus(job.id, "retrying", {
          attempts: job.attempts,
          next_retry_at: job.nextRetryAt,
          last_error: err.message,
        });

        MetricsDB.record("retry_count", "publisher", 1, { platform: job.platform });
        MetricsDB.record("failure", "publisher", 1, { reason: "retrying", platform: job.platform });

        EventBus.publish(
          "publish.failed",
          {
            publishJobId: job.id,
            platform: job.platform,
            jobId: job.jobId,
            error: err.message,
            nextRetryAt: job.nextRetryAt,
          },
          job.id
        );
      }
    } finally {
      this.processing.delete(job.id);
    }
  }

  // ─── Inspection ────────────────────────────────────────────────────────────

  getQueue(): PublishQueueJob[] { return [...this.queue]; }
  getDeadLetterQueue(): PublishQueueJob[] { return [...this.deadLetterQueue]; }

  getStats() {
    return {
      pending:     this.queue.filter((j) => j.status === "pending").length,
      processing:  this.processing.size,
      retrying:    this.queue.filter((j) => j.status === "retrying").length,
      dead:        this.deadLetterQueue.length,
      total:       this.queue.length + this.deadLetterQueue.length,
    };
  }

  retryDead(publishJobId: string): boolean {
    const idx = this.deadLetterQueue.findIndex((j) => j.id === publishJobId);
    if (idx === -1) return false;
    const job = this.deadLetterQueue.splice(idx, 1)[0];
    job.status = "pending";
    job.attempts = 0;
    this.queue.push(job);
    PublishJobDB.updateStatus(job.id, "pending", { attempts: 0, next_retry_at: null, last_error: null });
    setImmediate(() => this.tick());
    return true;
  }
}

export const PublisherQueue = new PublisherQueueClass();
