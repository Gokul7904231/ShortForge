// GET /api/cron/cleanup
//
// Scheduled cleanup endpoint - runs every 6 hours via Vercel Cron
// or any external cron scheduler (e.g. GitHub Actions, Cloud Scheduler).
//
// Protected by INTERNAL_API_SECRET_KEY.
// Algorithm:
//   1. Query Firestore for jobs with deleteAt <= now and cleanupStatus = "pending"
//   2. Trash each Drive file (never permanent delete)
//   3. Mark as cleaned in Firestore
//   4. Publish storage.cleanup.completed event
//   5. Return report JSON
//
// Vercel cron schedule: "0 0-23/6 * * *" (every 6 hours)

import { NextResponse } from "next/server";
import "../../../../storage/index";
import { StorageRegistry } from "../../../../storage/storage-registry";
import { getPendingCleanup, markCleaned } from "../../../../lib/drive-store";
import { EventBus } from "../../../../ai/event-bus";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Security gate: require CRON_SECRET or INTERNAL_API_SECRET_KEY
  const authHeader = req.headers.get("authorization");
  const expectedKey = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET_KEY;

  if (!expectedKey) {
    console.error("[CronCleanup] Security gate rejected: neither CRON_SECRET nor INTERNAL_API_SECRET_KEY is configured.");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (
    authHeader !== `Bearer ${expectedKey}` &&
    new URL(req.url).searchParams.get("key") !== expectedKey
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const traceId = `cron_cleanup_${Date.now()}`;
  const startTime = Date.now();

  console.log(`[CronCleanup] Starting cleanup pass at ${new Date().toISOString()}`);

  const report = {
    ranAt: new Date().toISOString(),
    deleted: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    jobs: [] as Array<{ jobId: string; fileId: string; status: string; error?: string }>,
  };

  try {
    const provider = StorageRegistry.getProvider("google-drive");
    const pending = await getPendingCleanup();

    console.log(`[CronCleanup] Found ${pending.length} jobs pending cleanup.`);

    for (const job of pending) {
      if (!job.driveFileId) {
        report.skipped++;
        continue;
      }

      try {
        await provider.delete(job.driveFileId);
        await markCleaned(job.jobId);
        report.deleted++;
        report.jobs.push({
          jobId: job.jobId,
          fileId: job.driveFileId,
          status: "trashed",
        });
        console.log(
          `[CronCleanup] Trashed job ${job.jobId} | fileId: ${job.driveFileId}`
        );
      } catch (err: any) {
        report.failed++;
        report.jobs.push({
          jobId: job.jobId,
          fileId: job.driveFileId,
          status: "failed",
          error: err.message,
        });
        console.error(
          `[CronCleanup] Failed to trash ${job.driveFileId}: ${err.message}`
        );
      }
    }
  } catch (err: any) {
    console.error("[CronCleanup] Fatal error:", err.message);
    return NextResponse.json(
      { error: err.message, partial: report },
      { status: 500 }
    );
  }

  report.durationMs = Date.now() - startTime;

  EventBus.publish("storage.cleanup.completed", report, traceId);

  console.log(
    `[CronCleanup] Done. Deleted: ${report.deleted}, Failed: ${report.failed}, Skipped: ${report.skipped} | ${report.durationMs}ms`
  );

  return NextResponse.json({ success: true, ...report });
}

export async function POST(req: Request) {
  return GET(req);
}
