import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase-admin";
import { getInMemoryJobs } from "@/lib/jobs-history";

const RENDER_WORKER_SECRET = process.env.RENDER_WORKER_SECRET || process.env.INTERNAL_API_SECRET_KEY;
const STALE_JOB_LEASE_MS = 15 * 60 * 1000; // 15 minutes stale lease recovery

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "factoryos-rendering-claim",
    allowedMethods: ["POST"],
    message: "ShortForge Render Claim API endpoint is live.",
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!RENDER_WORKER_SECRET) {
      console.error("[Rendering Claim API] Missing RENDER_WORKER_SECRET in server environment.");
      return NextResponse.json(
        { success: false, error: "Server Misconfiguration: RENDER_WORKER_SECRET is not configured." },
        { status: 500 }
      );
    }

    // 1. Authenticate Render Worker
    const authHeader = request.headers.get("authorization") || "";
    const workerSecretHeader = request.headers.get("x-worker-secret") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || workerSecretHeader;

    if (!token || token !== RENDER_WORKER_SECRET) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid render worker credentials." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const workerPool = (body.workerPool || request.headers.get("x-worker-pool") || "").toLowerCase();

    // Enforce allowed worker pools
    if (workerPool !== "github-actions" && workerPool !== "basic-fastapi" && workerPool !== "basic") {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid or missing workerPool. Allowed values: 'github-actions', 'basic-fastapi', 'basic'. Received: '${workerPool}'`,
        },
        { status: 400 }
      );
    }

    const workerId = body.workerId || `worker-${workerPool}-${crypto.randomBytes(4).toString("hex")}`;

    // 2. Concurrency-Safe Atomic Job Claim via Firestore Transaction
    const claimResult = await db.runTransaction(async (transaction: any) => {
      // Find candidate queued video jobs
      const snapshot = await db
        .collection("videos")
        .where("status", "in", ["queued", "processing"])
        .orderBy("createdAt", "asc")
        .limit(25)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const nowMs = Date.now();
      let targetDoc: any = null;
      let targetJobData: any = null;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const jobStatus = data.status;
        const jobTier = data.tier || "BASIC";

        // Stale job detection
        const isStaleProcessing =
          jobStatus === "processing" &&
          data.startedAt &&
          nowMs - new Date(data.startedAt).getTime() > STALE_JOB_LEASE_MS;

        // Candidate must be newly queued or recovered from stale crash
        if (jobStatus !== "queued" && !isStaleProcessing) {
          continue;
        }

        // Legacy worker claim API is BASIC-only. FactoryOS/Render Fabric remains
        // the authoritative production dispatch path.
        if (workerPool === "github-actions" || workerPool === "basic-fastapi" || workerPool === "basic") {
          if (jobTier === "BASIC" || !data.tier) {
            targetDoc = doc;
            targetJobData = data;
            break;
          }
        }
      }

      if (!targetDoc || !targetJobData) {
        return null;
      }

      const jobRef = db.collection("videos").doc(targetDoc.id);

      // Generate cryptographically secure short-lived execution token
      const executionToken = `exec_${crypto.randomBytes(24).toString("hex")}`;
      const startedAt = new Date().toISOString();
      const currentAttempts = typeof targetJobData.attempts === "number" ? targetJobData.attempts : 0;

      transaction.update(jobRef, {
        status: "processing",
        workerId,
        workerPool,
        startedAt,
        claimedAt: startedAt,
        executionToken,
        attempts: currentAttempts + 1,
        updatedAt: startedAt,
      });

      return {
        id: targetDoc.id,
        jobId: targetDoc.id,
        userId: targetJobData.userId || "anonymous",
        tier: targetJobData.tier || "BASIC",
        targetWorkerPool: targetJobData.targetWorkerPool || workerPool,
        workerPool,
        topic: targetJobData.topic || "Untitled Short",
        style: targetJobData.style || "",
        script: targetJobData.script || "",
        scenes: targetJobData.scenes || [],
        quizData: targetJobData.quizData || null,
        renderProfile: targetJobData.renderProfile || "FAST_QUIZ",
        contentType: targetJobData.contentType || "QUIZ_SHORTS",
        durationSeconds: targetJobData.durationSeconds || 45,
        executionToken,
        workerId,
        startedAt,
      };
    });

    let finalClaim = claimResult;

    if (!finalClaim) {
      const inMemoryJobs = getInMemoryJobs();
      const nowMs = Date.now();
      for (const [id, data] of inMemoryJobs.entries()) {
        const jobTier = (data as any).tier || "BASIC";
        const jobStatus = data.status;
        const isStale = jobStatus === "processing" && (data as any).startedAt && nowMs - new Date((data as any).startedAt).getTime() > STALE_JOB_LEASE_MS;

        if (jobStatus === "queued" || isStale) {
          if ((workerPool === "github-actions" || workerPool === "basic-fastapi" || workerPool === "basic") && (jobTier === "BASIC" || !(data as any).tier)) {
            const executionToken = `exec_${crypto.randomBytes(24).toString("hex")}`;
            const startedAt = new Date().toISOString();
            const updatedJob = {
              ...data,
              status: "processing" as const,
              workerId,
              workerPool,
              startedAt,
              claimedAt: startedAt,
              executionToken,
              attempts: ((data as any).attempts || 0) + 1,
              updatedAt: startedAt,
            };
            inMemoryJobs.set(id, updatedJob as any);
            finalClaim = {
              id,
              jobId: id,
              userId: updatedJob.userId || "anonymous",
              tier: "BASIC",
              targetWorkerPool: "github-actions",
              workerPool,
              topic: (updatedJob as any).topic || "Untitled Short",
              style: (updatedJob as any).style || "",
              script: updatedJob.script || "",
              scenes: (updatedJob as any).scenes || [],
              quizData: (updatedJob as any).quizData || null,
              renderProfile: (updatedJob as any).renderProfile || "FAST_QUIZ",
              contentType: updatedJob.contentType || "QUIZ_SHORTS",
              durationSeconds: (updatedJob as any).durationSeconds || 45,
              executionToken,
              workerId,
              startedAt,
            };
            break;
          }
        }
      }
    }

    if (!finalClaim) {
      return NextResponse.json({
        success: true,
        claimed: false,
        workerPool,
        message: `No queued video jobs available for worker pool '${workerPool}'.`,
      });
    }

    return NextResponse.json({
      success: true,
      claimed: true,
      job: finalClaim,
    });
  } catch (err: any) {
    console.error("[Rendering Claim API Error]:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
