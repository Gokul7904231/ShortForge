/**
 * Queue Database — SQLite persistence for upload and publish queues.
 *
 * Uses better-sqlite3 (synchronous, no separate process needed).
 * Database file: data/queues.db  (created automatically)
 *
 * Schema:
 *   upload_jobs   — StorageQueue persistence
 *   publish_jobs  — PublisherQueue persistence
 *   metrics       — time-series metrics for the dashboard
 *
 * Rules:
 *   - Every status change is written to SQLite immediately
 *   - On startup, all non-completed jobs are restored into RAM
 *   - "processing" jobs from last run are reset to "retrying" (were mid-flight)
 *   - Idempotency check: jobId + sha256 + providerId deduplicates uploads
 */

import path from "path";
import fs from "fs";

// ─────────────────────────────────────────────────────────────────────────────
// Lazy-load better-sqlite3 (it's a native module — don't import at module-level)
// ─────────────────────────────────────────────────────────────────────────────

import getSafeDatabase, { SafeDatabase } from "./safe-sqlite";

let _db: SafeDatabase | null = null;

function getDB(): SafeDatabase {
  if (_db) return _db;

  // Ensure data directory exists
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, "queues.db");
  _db = getSafeDatabase(dbPath);
  _db.pragma("journal_mode = WAL");   // WAL mode = faster writes
  _db.pragma("synchronous = NORMAL"); // Safe + fast

  initSchema(_db);
  console.log(`[QueueDB] SQLite opened at ${dbPath}`);
  return _db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

function initSchema(db: SafeDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_jobs (
      id              TEXT PRIMARY KEY,
      job_id          TEXT NOT NULL,
      video_path      TEXT NOT NULL,
      engine          TEXT,
      delete_after_h  INTEGER NOT NULL DEFAULT 72,
      assets_json     TEXT,
      versions_json   TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      attempts        INTEGER NOT NULL DEFAULT 0,
      max_attempts    INTEGER NOT NULL DEFAULT 4,
      created_at      INTEGER NOT NULL,
      next_retry_at   INTEGER,
      last_error      TEXT,
      result_json     TEXT,
      sha256          TEXT,
      md5             TEXT,
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_upload_status ON upload_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_upload_job_id ON upload_jobs(job_id);

    CREATE TABLE IF NOT EXISTS publish_jobs (
      id              TEXT PRIMARY KEY,
      job_id          TEXT NOT NULL,
      platform        TEXT NOT NULL,
      payload_json    TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      attempts        INTEGER NOT NULL DEFAULT 0,
      max_attempts    INTEGER NOT NULL DEFAULT 4,
      created_at      INTEGER NOT NULL,
      next_retry_at   INTEGER,
      last_error      TEXT,
      result_json     TEXT,
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_publish_status ON publish_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_publish_job_id ON publish_jobs(job_id);

    CREATE TABLE IF NOT EXISTS queue_metrics (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_type   TEXT NOT NULL,
      queue_name    TEXT NOT NULL,
      value         REAL NOT NULL,
      tags_json     TEXT,
      recorded_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_type ON queue_metrics(metric_type, queue_name, recorded_at);
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Jobs
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadJobRow {
  id: string;
  job_id: string;
  video_path: string;
  engine: string | null;
  delete_after_h: number;
  assets_json: string | null;
  versions_json: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: number;
  next_retry_at: number | null;
  last_error: string | null;
  result_json: string | null;
  sha256: string | null;
  md5: string | null;
}

export const UploadJobDB = {
  upsert(row: UploadJobRow): void {
    getDB().prepare(`
      INSERT INTO upload_jobs
        (id, job_id, video_path, engine, delete_after_h, assets_json, versions_json,
         status, attempts, max_attempts, created_at, next_retry_at, last_error, result_json,
         sha256, md5, updated_at)
      VALUES
        (@id, @job_id, @video_path, @engine, @delete_after_h, @assets_json, @versions_json,
         @status, @attempts, @max_attempts, @created_at, @next_retry_at, @last_error, @result_json,
         @sha256, @md5, unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        status        = excluded.status,
        attempts      = excluded.attempts,
        next_retry_at = excluded.next_retry_at,
        last_error    = excluded.last_error,
        result_json   = excluded.result_json,
        sha256        = excluded.sha256,
        md5           = excluded.md5,
        updated_at    = unixepoch()
    `).run(row);
  },

  updateStatus(id: string, status: string, patch: Partial<UploadJobRow> = {}): void {
    const row: any = { id, status, updated_at: Math.floor(Date.now() / 1000), ...patch };
    // Build dynamic SET clause
    const fields = ["status = @status", "updated_at = @updated_at"];
    if ("attempts"      in patch) fields.push("attempts = @attempts");
    if ("next_retry_at" in patch) fields.push("next_retry_at = @next_retry_at");
    if ("last_error"    in patch) fields.push("last_error = @last_error");
    if ("result_json"   in patch) fields.push("result_json = @result_json");
    if ("sha256"        in patch) fields.push("sha256 = @sha256");
    if ("md5"           in patch) fields.push("md5 = @md5");
    getDB().prepare(`UPDATE upload_jobs SET ${fields.join(", ")} WHERE id = @id`).run(row);
  },

  /** Find by jobId + provider + sha256 for idempotency check. */
  findCompleted(jobId: string, sha256?: string): UploadJobRow | null {
    if (sha256) {
      return getDB()
        .prepare("SELECT * FROM upload_jobs WHERE job_id = ? AND sha256 = ? AND status = 'completed' LIMIT 1")
        .get(jobId, sha256) as UploadJobRow | null;
    }
    return getDB()
      .prepare("SELECT * FROM upload_jobs WHERE job_id = ? AND status = 'completed' LIMIT 1")
      .get(jobId) as UploadJobRow | null;
  },

  /** Restore all non-completed jobs on startup. */
  loadActive(): UploadJobRow[] {
    return getDB()
      .prepare("SELECT * FROM upload_jobs WHERE status IN ('pending', 'retrying', 'processing') ORDER BY created_at ASC")
      .all() as UploadJobRow[];
  },

  loadDead(): UploadJobRow[] {
    return getDB()
      .prepare("SELECT * FROM upload_jobs WHERE status = 'dead' ORDER BY created_at DESC LIMIT 200")
      .all() as UploadJobRow[];
  },

  delete(id: string): void {
    getDB().prepare("DELETE FROM upload_jobs WHERE id = ?").run(id);
  },

  count(status?: string): number {
    if (status) {
      return (getDB().prepare("SELECT COUNT(*) as c FROM upload_jobs WHERE status = ?").get(status) as any).c;
    }
    return (getDB().prepare("SELECT COUNT(*) as c FROM upload_jobs").get() as any).c;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Publish Jobs
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishJobRow {
  id: string;
  job_id: string;
  platform: string;
  payload_json: string;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: number;
  next_retry_at: number | null;
  last_error: string | null;
  result_json: string | null;
}

export const PublishJobDB = {
  upsert(row: PublishJobRow): void {
    getDB().prepare(`
      INSERT INTO publish_jobs
        (id, job_id, platform, payload_json, status, attempts, max_attempts, created_at, next_retry_at, last_error, result_json)
      VALUES
        (@id, @job_id, @platform, @payload_json, @status, @attempts, @max_attempts, @created_at, @next_retry_at, @last_error, @result_json)
      ON CONFLICT(id) DO UPDATE SET
        status        = excluded.status,
        attempts      = excluded.attempts,
        next_retry_at = excluded.next_retry_at,
        last_error    = excluded.last_error,
        result_json   = excluded.result_json,
        updated_at    = unixepoch()
    `).run(row);
  },

  updateStatus(id: string, status: string, patch: Partial<PublishJobRow> = {}): void {
    const row: any = { id, status, ...patch };
    const fields = ["status = @status", "updated_at = unixepoch()"];
    if ("attempts"      in patch) fields.push("attempts = @attempts");
    if ("next_retry_at" in patch) fields.push("next_retry_at = @next_retry_at");
    if ("last_error"    in patch) fields.push("last_error = @last_error");
    if ("result_json"   in patch) fields.push("result_json = @result_json");
    getDB().prepare(`UPDATE publish_jobs SET ${fields.join(", ")} WHERE id = @id`).run(row);
  },

  loadActive(): PublishJobRow[] {
    return getDB()
      .prepare("SELECT * FROM publish_jobs WHERE status IN ('pending', 'retrying', 'processing') ORDER BY created_at ASC")
      .all() as PublishJobRow[];
  },

  loadDead(): PublishJobRow[] {
    return getDB()
      .prepare("SELECT * FROM publish_jobs WHERE status = 'dead' ORDER BY created_at DESC LIMIT 200")
      .all() as PublishJobRow[];
  },

  count(status?: string): number {
    if (status) {
      return (getDB().prepare("SELECT COUNT(*) as c FROM publish_jobs WHERE status = ?").get(status) as any).c;
    }
    return (getDB().prepare("SELECT COUNT(*) as c FROM publish_jobs").get() as any).c;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────

export type MetricType =
  | "upload_duration_ms"
  | "render_duration_ms"
  | "publish_duration_ms"
  | "upload_size_bytes"
  | "retry_count"
  | "failure"
  | "success"
  | "queue_depth";

export const MetricsDB = {
  record(
    metricType: MetricType,
    queueName: "storage" | "publisher" | "engine",
    value: number,
    tags?: Record<string, string>
  ): void {
    try {
      getDB().prepare(`
        INSERT INTO queue_metrics (metric_type, queue_name, value, tags_json, recorded_at)
        VALUES (?, ?, ?, ?, unixepoch())
      `).run(metricType, queueName, value, tags ? JSON.stringify(tags) : null);
    } catch {
      // Non-fatal — metrics are observability only
    }
  },

  /** Average of a metric over the last N hours. */
  average(metricType: MetricType, queueName: string, lastHours = 24): number {
    const since = Math.floor(Date.now() / 1000) - lastHours * 3600;
    const row = getDB().prepare(
      "SELECT AVG(value) as avg FROM queue_metrics WHERE metric_type = ? AND queue_name = ? AND recorded_at >= ?"
    ).get(metricType, queueName, since) as { avg: number | null };
    return row?.avg ?? 0;
  },

  /** Count of a metric over the last N hours. */
  count(metricType: MetricType, queueName: string, lastHours = 24): number {
    const since = Math.floor(Date.now() / 1000) - lastHours * 3600;
    const row = getDB().prepare(
      "SELECT COUNT(*) as c FROM queue_metrics WHERE metric_type = ? AND queue_name = ? AND recorded_at >= ?"
    ).get(metricType, queueName, since) as { c: number };
    return row?.c ?? 0;
  },

  /** Time-series data for charting (last N hours, bucketed by hour). */
  timeSeries(
    metricType: MetricType,
    queueName: string,
    lastHours = 24
  ): Array<{ hour: string; avg: number; count: number }> {
    const since = Math.floor(Date.now() / 1000) - lastHours * 3600;
    return getDB().prepare(`
      SELECT
        datetime((recorded_at / 3600) * 3600, 'unixepoch') as hour,
        AVG(value) as avg,
        COUNT(*) as count
      FROM queue_metrics
      WHERE metric_type = ? AND queue_name = ? AND recorded_at >= ?
      GROUP BY (recorded_at / 3600)
      ORDER BY recorded_at ASC
    `).all(metricType, queueName, since) as Array<{ hour: string; avg: number; count: number }>;
  },

  /** Selects the prompt version with the highest average score. */
  getBestPromptVersion(promptType: string): string {
    try {
      const row = getDB()
        .prepare(`
          SELECT 
            json_extract(tags_json, '$.version') as ver,
            AVG(value) as score
          FROM queue_metrics
          WHERE metric_type = ? AND json_extract(tags_json, '$.version') IS NOT NULL
          GROUP BY ver
          ORDER BY score DESC
          LIMIT 1
        `)
        .get(promptType) as { ver: string | null } | undefined;
      return row?.ver ?? "v1"; // default to v1 if no data
    } catch {
      return "v1";
    }
  },

  /** Dashboard summary — all key metrics at once. */
  getDashboardSummary() {
    const h24 = Math.floor(Date.now() / 1000) - 86400;

    const get = (q: string, ...p: any[]) =>
      (getDB().prepare(q).get(...p) as any) ?? {};

    return {
      upload: {
        avgDurationMs: get(
          "SELECT AVG(value) as v FROM queue_metrics WHERE metric_type = 'upload_duration_ms' AND recorded_at >= ?", h24
        ).v ?? 0,
        successCount: get(
          "SELECT COUNT(*) as v FROM queue_metrics WHERE metric_type = 'success' AND queue_name = 'storage' AND recorded_at >= ?", h24
        ).v ?? 0,
        failureCount: get(
          "SELECT COUNT(*) as v FROM queue_metrics WHERE metric_type = 'failure' AND queue_name = 'storage' AND recorded_at >= ?", h24
        ).v ?? 0,
        retryCount: get(
          "SELECT SUM(value) as v FROM queue_metrics WHERE metric_type = 'retry_count' AND queue_name = 'storage' AND recorded_at >= ?", h24
        ).v ?? 0,
        avgFileSizeBytes: get(
          "SELECT AVG(value) as v FROM queue_metrics WHERE metric_type = 'upload_size_bytes' AND recorded_at >= ?", h24
        ).v ?? 0,
      },
      publish: {
        avgDurationMs: get(
          "SELECT AVG(value) as v FROM queue_metrics WHERE metric_type = 'publish_duration_ms' AND recorded_at >= ?", h24
        ).v ?? 0,
        successCount: get(
          "SELECT COUNT(*) as v FROM queue_metrics WHERE metric_type = 'success' AND queue_name = 'publisher' AND recorded_at >= ?", h24
        ).v ?? 0,
        failureCount: get(
          "SELECT COUNT(*) as v FROM queue_metrics WHERE metric_type = 'failure' AND queue_name = 'publisher' AND recorded_at >= ?", h24
        ).v ?? 0,
      },
      engine: {
        avgDurationMs: get(
          "SELECT AVG(value) as v FROM queue_metrics WHERE metric_type = 'render_duration_ms' AND recorded_at >= ?", h24
        ).v ?? 0,
      },
      queueDepths: {
        storageActive: UploadJobDB.count("pending") + UploadJobDB.count("retrying"),
        storageDead: UploadJobDB.count("dead"),
        publisherActive: PublishJobDB.count("pending") + PublishJobDB.count("retrying"),
        publisherDead: PublishJobDB.count("dead"),
      },
    };
  },
};
