import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase-admin";
import { ServiceRegistry } from "../../../../lib/core/ServiceRegistry";
import { verifySession } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { resolveDeliveryFacts } from "@/lib/delivery/delivery-facts";

function deliveryFields(jobId: string, job: any) {
  const facts = resolveDeliveryFacts(jobId, job);
  const driveFileId = facts.driveFileId ?? null;

  return {
    deliveryTarget: job?.deliveryTarget ?? null,
    deliveryMethod: facts.deliveryMethod ?? null,
    deliveryVerified: facts.verified ?? null,
    deliveryStatus: facts.deliveryStatus ?? null,
    deliverySource: facts.source,
    driveFileId,
    driveUrl: job?.driveUrl ?? (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null),
  };
}
// ServiceRegistryInit pulls sharp transitively — load lazily inside GET so build collection doesn't DLOPEN the native binary

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // 🔒 Strict account isolation: job-status is per-user (admins excepted)
  let caller: any;
  try {
    const session = await verifySession(_req as any);
    caller = session.user;
  } catch (err: any) {
    const msg = err?.message || "Unauthorized";
    const status = err?.status || 401;
    return NextResponse.json({ error: msg }, { status });
  }

  try {
    // 1. Check authoritative Firestore manifest first
    if (db) {
      const doc = await db.collection("videos").doc(id).get();
      if (doc.exists) {
        const job = doc.data() as any;
        if (!job) {
          return NextResponse.json({ error: "Job data is empty" }, { status: 404 });
        }

        if (job.userId && job.userId !== caller.uid && !isAdminUser(caller.role)) {
          return NextResponse.json({ error: "Forbidden: You do not have permission to access this job." }, { status: 403 });
        }
        if (!job.userId && !isAdminUser(caller.role)) {
          return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        return NextResponse.json({
          id: doc.id,
          videoId: doc.id,
          status: job.status || "processing",
          // Never invent a mid-flight percentage: unknown progress stays null.
          progress: job.progress ?? (job.status === "completed" ? 100 : null),
          error: job.error,
          videoUrl: job.videoUrl || (job.status === "completed" ? `/api/media/video/${doc.id}` : null),
          output: job.videoUrl ? { videoUrl: job.videoUrl } : null,
          ...deliveryFields(doc.id, job),
        });
      }
    }

    // 2. Fallback to local SQLite queue (e.g. offline/dev) without auto-starting the processor
    if (ServiceRegistry.has("renderQueue")) {
      const renderQueue = ServiceRegistry.get("renderQueue");
      const qJob = await renderQueue.getJob(id);
      if (qJob) {
        const payloadUid = (qJob as any)?.payload?.userId ?? (qJob as any)?.payload?.user_id ?? null;
        if (!payloadUid && !isAdminUser(caller.role)) {
          return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        if (payloadUid && payloadUid !== caller.uid && !isAdminUser(caller.role)) {
          return NextResponse.json({ error: "Forbidden: You do not have permission to access this job." }, { status: 403 });
        }

        let apiStatus = qJob.status;
        if (["claimed", "running", "retrying"].includes(qJob.status)) {
          apiStatus = "processing";
        }
        const progress = (qJob as any).progress_percentage ?? 0;

        return NextResponse.json({
          id: qJob.jobId,
          videoId: qJob.jobId,
          status: apiStatus,
          detailedStatus: qJob.status,
          progress: progress,
          attempts: qJob.attempts,
          error: qJob.lastError,
          videoUrl: qJob.status === "completed" ? `/api/media/video/${qJob.jobId}` : null,
          output: qJob.status === "completed" ? { videoUrl: `/api/media/video/${qJob.jobId}` } : null,
          ...deliveryFields(qJob.jobId, (qJob as any).payload ?? {}),
        });
      }
    }

    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  } catch (err: any) {
    console.error("[job-status] Error fetching status:", err);
    return NextResponse.json(
      { error: "Internal server error fetching job status" },
      { status: 500 }
    );
  }
}
