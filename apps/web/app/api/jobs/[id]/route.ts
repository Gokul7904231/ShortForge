import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { readJobManifest, saveJobManifest } from "@/lib/jobs-history";
import { TreasuryQuotaAdmission } from "@/factoryos/core/treasury/TreasuryQuotaAdmission";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { releaseLegacyGenerationSlot } from "@/factoryos/core/treasury/TreasuryQuotaCompatibility";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await verifySession(request);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing job ID" }, { status: 400 });
    }

    const job = await readJobManifest(id);
    if (!job) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    // 🔒 Enforce User Data Isolation & Ownership Barrier
    const isOwner = job.userId === user.uid;
    const isAdmin = isAdminUser(user.role);

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to access this job." },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    const status = err.status || (err.message?.includes("Unauthorized") ? 401 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await verifySession(request);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing job ID" }, { status: 400 });
    }

    let ownerUid: string | null = null;
    let jobStatus: string | null = null;

    // 1. Discover ownership across all stores WITHOUT mutating anything.
    let qJob: any = null;
    try {
      const { ServiceRegistry } = await import("@/lib/core/ServiceRegistry");
      if (!ServiceRegistry.has("renderQueue")) {
        const { SQLiteRenderQueue } = await import("@/lib/core/SQLiteRenderQueue");
        ServiceRegistry.register("renderQueue", new SQLiteRenderQueue());
      }
      const renderQueue = ServiceRegistry.get("renderQueue") as any;
      qJob = await renderQueue.getJob(id);
      if (qJob) {
        ownerUid = qJob.payload?.userId ?? qJob.payload?.user_id ?? null;
        jobStatus = qJob.status;
      }
    } catch {}

    // 2. Check Job Manifest
    const job = await readJobManifest(id);
    if (job) {
      ownerUid = ownerUid || job.userId;
      jobStatus = jobStatus || job.status;
    }

    // 3. Check Firestore
    let firestoreDoc: { exists: boolean; data?: any } = { exists: false };
    try {
      const { db } = await import("@/lib/firebase-admin");
      if (db) {
        const doc = await db.collection("videos").doc(id).get();
        if (doc.exists) {
          const d: any = doc.data();
          firestoreDoc = { exists: true, data: d };
          ownerUid = ownerUid || d?.userId;
          jobStatus = jobStatus || d?.status;
        }
      }
    } catch {}

    // 🔒 Enforce Ownership BEFORE any mutation. Unknown ownership fails closed —
    // a job with no resolvable owner is never adopted as the requester's own.
    if (!ownerUid) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const isOwner = ownerUid === user.uid;
    const isAdmin = isAdminUser(user.role);

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to cancel this job." },
        { status: 403 }
      );
    }

    if (jobStatus === "completed") {
      return NextResponse.json(
        { success: false, error: "Cannot cancel an already completed video render job." },
        { status: 400 }
      );
    }

    // 4. Mutations — only after authorization passed.
    if (qJob) {
      try {
        const { ServiceRegistry } = await import("@/lib/core/ServiceRegistry");
        const renderQueue = ServiceRegistry.get("renderQueue") as any;
        await renderQueue.cancel(id);
      } catch {}
    }

    if (job) {
      await saveJobManifest(id, {
        status: "failed",
        error: "Cancelled by user",
        cancelledAt: new Date().toISOString(),
      } as any);
    }

    if (firestoreDoc.exists) {
      try {
        const { db } = await import("@/lib/firebase-admin");
        if (db) {
          await db.collection("videos").doc(id).set({
            status: "cancelled",
            error: "Cancelled by user",
            cancelledAt: new Date().toISOString(),
          }, { merge: true });
        }
      } catch {}
    }

    // Treasury-backed jobs release the authoritative entitlement hold.
    const treasuryReservationId = (job as any)?.treasuryQuotaReservationId as string | undefined;
    if (treasuryReservationId) {
      const treasuryQuotaAdmission = new TreasuryQuotaAdmission(
        await getTreasuryRuntime(),
      );
      await treasuryQuotaAdmission.releaseGenerationSlot(
        treasuryReservationId,
        ownerUid,
        String((job as any)?.tier || "BASIC"),
        id,
      );
    } else {
      // Historical jobs may still require a projection-only compatibility release.
      await releaseLegacyGenerationSlot(ownerUid, id);
    }

    return NextResponse.json({
      success: true,
      message: "Job cancelled and quota reservation released.",
    });
  } catch (err: any) {
    const status = err.status || (err.message?.includes("Unauthorized") ? 401 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
