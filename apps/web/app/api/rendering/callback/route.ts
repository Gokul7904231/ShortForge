import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "@/lib/firebase-admin";
import { finalizeGenerationSlot, releaseGenerationSlot } from "@/lib/quota/quota-service";
import { RemoteRenderStateMachine } from "@/factoryos/core/rendering/RemoteRenderStateMachine";
import { ArtifactResolver } from "@/factoryos/core/rendering/ArtifactResolver";
import { VerificationEngine } from "@/factoryos/core/verification/VerificationEngine";

import { readJobManifest, saveJobManifest } from "@/lib/jobs-history";

const RENDER_WORKER_SECRET = process.env.RENDER_WORKER_SECRET || process.env.INTERNAL_API_SECRET_KEY;

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "factoryos-rendering-callback",
    allowedMethods: ["POST"],
    message: "ShortForge Render Callback API endpoint is live.",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      jobId,
      status,
      attemptId,
      videoUrl,
      videoSizeMb,
      renderDurationSeconds,
      driveFileId,
      driveUrl,
      filename,
      fileSize,
      duration,
      artifactSha256,
      deliveryTarget,
      deliveryProvider,
      deliveryState,
      workerCredentialVersion,
      fallbackUsed,
      fallbackReason,
      error,
      telemetry,
      executionToken,
    } = body;

    if (!jobId || !status) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: jobId and status" },
        { status: 400 }
      );
    }

    // 1. Authorize Execution Callback
    const authHeader = request.headers.get("authorization") || "";
    const tokenHeader = request.headers.get("x-execution-token") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "") || tokenHeader || executionToken;

    const jobData = (await readJobManifest(jobId)) || (db ? (await db.collection("videos").doc(jobId).get().then(d => d.data())) : null);

    if (!jobData) {
      return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    const validExecutionToken = (jobData as any).executionToken as string | undefined;

    const isMasterWorker = RENDER_WORKER_SECRET ? safeEqual(bearer, RENDER_WORKER_SECRET) : false;
    const isJobTokenValid = validExecutionToken ? safeEqual(bearer, validExecutionToken) : false;

    if (!isMasterWorker && !isJobTokenValid) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid execution authorization token." },
        { status: 401 }
      );
    }

    const userId = jobData.userId || "anonymous";

    // 2. Remote Render State Machine — Attempt Monotonicity & Idempotency
    const stateMachine = RemoteRenderStateMachine.getInstance();
    if (!stateMachine.getJob(jobId)) {
      stateMachine.registerJob({
        jobId,
        attemptId: (jobData as any).attemptId || 1,
      });
    }
    const smResult = stateMachine.handleCallback(jobId, attemptId, {
      status,
      videoUrl,
      artifactSha256,
      error,
    });

    if (!smResult.accepted) {
      return NextResponse.json(
        { success: false, error: smResult.reason, currentAttempt: smResult.currentAttempt },
        { status: 409 }
      );
    }

    if (smResult.idempotent || (jobData.status === "completed" && status === "completed")) {
      return NextResponse.json({
        success: true,
        jobId,
        status: "completed",
        videoUrl: jobData.videoUrl,
        driveFileId: (jobData as any).driveFileId || null,
        driveUrl: (jobData as any).driveUrl || null,
        artifactSha256: (jobData as any).artifactSha256 || null,
        message: "Job already marked completed (idempotent callback).",
      });
    }

    // 3. Handle Status Transitions & Idempotent Quota Reconciliations
    if (status === "completed") {
      const candidateUrl = videoUrl || driveUrl;
      if (!candidateUrl) {
        return NextResponse.json(
          { success: false, error: "Completion rejected: No physical videoUrl or driveUrl provided." },
          { status: 400 }
        );
      }

      // First check if a physical local artifact exists for this job in data/renders/
      const renderDir = path.join(process.cwd(), "data", "renders");
      const localJobArtifactPath = path.join(renderDir, `${jobId}.mp4`);

      const resolver = new ArtifactResolver();
      let resolvedArtifact;
      try {
        let location;
        if (candidateUrl.startsWith("file://") || !candidateUrl.startsWith("http")) {
          location = { kind: "LOCAL" as const, path: candidateUrl.replace(/^file:\/\//, "") };
        } else if (fs.existsSync(localJobArtifactPath)) {
          // Local rendered artifact matches this job
          location = { kind: "LOCAL" as const, path: localJobArtifactPath };
        } else {
          location = { kind: "REMOTE" as const, uri: candidateUrl, provider: "REMOTE_WORKER" };
        }

        resolvedArtifact = await resolver.resolve({
          artifactId: `art_cb_${jobId}`,
          jobId,
          location,
          mimeType: "video/mp4",
          sha256: artifactSha256 || undefined,
        });
      } catch (resolveErr: any) {
        const errorMsg = `Artifact resolution failed: ${resolveErr.message}`;
        await saveJobManifest(jobId, {
          status: "failed",
          error: errorMsg,
        } as any);
        await releaseGenerationSlot(userId, jobId);
        return NextResponse.json(
          { success: false, status: "failed", error: errorMsg },
          { status: 422 }
        );
      }

      // Authoritative F7 Physical Media Verification
      let audit;
      try {
        audit = await VerificationEngine.auditMediaArtifact({
          jobId,
          videoUrl: resolvedArtifact.localPath,
          scriptText: (jobData as any).script || (jobData as any).topic || "Narrative text",
          sceneCount: (jobData as any).scenes?.length || 1,
        });
      } catch (auditErr: any) {
        const errorMsg = `F7 audit exception: ${auditErr.message}`;
        await saveJobManifest(jobId, {
          status: "failed",
          error: errorMsg,
        } as any);
        await releaseGenerationSlot(userId, jobId);
        if (resolvedArtifact.isTempDownload && fs.existsSync(resolvedArtifact.localPath)) {
          try { fs.unlinkSync(resolvedArtifact.localPath); } catch {}
        }
        return NextResponse.json(
          { success: false, status: "failed", error: errorMsg },
          { status: 422 }
        );
      }

      if (!audit.passed || audit.overallStatus !== "PASSED") {
        const failureReasons = audit.failures?.length ? audit.failures.join("; ") : "Physical media verification failed";
        await saveJobManifest(jobId, {
          status: "failed",
          error: `F7 physical media verification failed: ${failureReasons}`,
          verificationReport: audit,
        } as any);
        await releaseGenerationSlot(userId, jobId);
        if (resolvedArtifact.isTempDownload && fs.existsSync(resolvedArtifact.localPath)) {
          try { fs.unlinkSync(resolvedArtifact.localPath); } catch {}
        }
        return NextResponse.json(
          {
            success: false,
            status: "failed",
            error: `F7 physical media verification failed: ${failureReasons}`,
            hardGates: audit.hardGates,
          },
          { status: 422 }
        );
      }

      const now = new Date().toISOString();
      const finalVideoUrl = candidateUrl;
      const finalSizeMb = Number((resolvedArtifact.byteLength / (1024 * 1024)).toFixed(2));
      const finalDuration = audit.measurements.videoDuration || audit.measurements.audioDuration || 0;
      const finalSha256 = resolvedArtifact.verifiedSha256;

      await saveJobManifest(jobId, {
        status: "completed",
        deliveryState: deliveryState || "DELIVERED",
        deliveryTarget: deliveryTarget || "GOOGLE_DRIVE",
        deliveryProvider: deliveryProvider || "google_drive",
        videoUrl: finalVideoUrl,
        driveFileId: driveFileId || (jobData as any).driveFileId || null,
        driveUrl: driveUrl || (jobData as any).driveUrl || null,
        filename: filename || (jobData as any).filename || `${jobId}.mp4`,
        artifactSha256: finalSha256,
        workerCredentialVersion: workerCredentialVersion || null,
        fallbackUsed: Boolean(fallbackUsed),
        fallbackReason: fallbackReason || null,
        videoSizeMb: finalSizeMb,
        renderDurationSeconds: finalDuration,
        completedAt: now,
        telemetry: telemetry || null,
        verificationAudit: {
          passed: audit.passed,
          score: audit.overallScore,
          measurements: audit.measurements,
        },
        updatedAt: now,
      } as any);

      // Clean up temp download if applicable
      if (resolvedArtifact.isTempDownload && fs.existsSync(resolvedArtifact.localPath)) {
        try { fs.unlinkSync(resolvedArtifact.localPath); } catch {}
      }

      // 🔒 Finalize Quota Slot Consumption (Idempotent)
      await finalizeGenerationSlot(userId, jobId);

      // 🔒 FactoryOS Mission & EventBus State Convergence
      const missionId = (jobData as any).missionId;
      if (missionId) {
        try {
          const controller = (global as any).__factoryOSController;
          if (controller) {
            await controller.eventBus.publish("TASK_COMPLETED", {
              floorId: "floor06_rendering",
              jobId,
              missionId,
              status: "COMPLETED",
              videoUrl: finalVideoUrl,
            });
            if (controller.missionManager) {
              await controller.missionManager.completeMission(missionId).catch(() => {});
            }
          }
        } catch (e: any) {
          console.warn("[Rendering Callback] FactoryOS mission update notice:", e?.message);
        }
      }

      return NextResponse.json({
        success: true,
        jobId,
        missionId: missionId || null,
        status: "completed",
        deliveryState: "DELIVERED",
        videoUrl: finalVideoUrl,
        driveFileId: driveFileId || (jobData as any).driveFileId,
        driveUrl: driveUrl || (jobData as any).driveUrl,
        artifactSha256: artifactSha256 || null,
        message: "Render completed, verified delivery artifact recorded, and quota consumption finalized successfully.",
      });
    }

    if (status === "failed") {
      const now = new Date().toISOString();
      await saveJobManifest(jobId, {
        status: "failed",
        deliveryState: deliveryState || "DELIVERY_FAILED",
        error: error || "Rendering or delivery process terminated with error.",
        workerCredentialVersion: workerCredentialVersion || null,
        failedAt: now,
        updatedAt: now,
      } as any);

      // 🔒 Reconcile and Release Quota Slot
      await releaseGenerationSlot(userId, jobId);

      // 🔒 FactoryOS Mission Failure Convergence
      const missionId = (jobData as any).missionId;
      if (missionId) {
        try {
          const controller = (global as any).__factoryOSController;
          if (controller) {
            await controller.eventBus.publish("WORKER_FAILED", {
              floorId: "floor06_rendering",
              jobId,
              missionId,
              error: error || "Render failed",
            });
            if (controller.missionManager) {
              await controller.missionManager.failMission(missionId, error || "Render failed").catch(() => {});
            }
          }
        } catch (e: any) {
          console.warn("[Rendering Callback] FactoryOS mission failure notice:", e?.message);
        }
      }

      return NextResponse.json({
        success: true,
        jobId,
        missionId: missionId || null,
        status: "failed",
        deliveryState: deliveryState || "DELIVERY_FAILED",
        error: error || "Render/delivery failed",
        message: "Failure recorded and quota reservation released.",
      });
    }

    return NextResponse.json({ success: false, error: `Invalid status: ${status}` }, { status: 400 });
  } catch (err: any) {
    console.error("[Rendering Callback API Error]:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
