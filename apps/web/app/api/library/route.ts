import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { db } from "@/lib/firebase-admin";
import { readDeliveryReceipt } from "@/lib/delivery/outbox-record";
import { describeDelivery } from "@/lib/presentation/JobStatusProjection";

export const dynamic = "force-dynamic";

export interface VideoLibraryItem {
  videoId: string;
  jobId: string;
  ownerId: string;
  title: string;
  topic: string;
  engineId: string;
  engineMode?: string;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl: string;
  driveUrl?: string;
  driveFileId?: string;
  deliveryTarget?: "GOOGLE_DRIVE" | "CLOUDINARY" | "LOCAL_OUTBOX";
  deliveryStatus: "DELIVERED" | "PENDING_UPLOAD" | "LOCAL_OUTBOX" | "DELIVERY_FAILED" | "NOT_CONFIGURED";
  isScheduled: boolean;
  scheduleId?: string;
  durationSeconds: number | null;
  sizeMb: number | null;
  resolution: string | null;
  fps: number | null;
  createdAt: string;
  verificationSummary?: {
    guardianPassed: boolean;
    groundingScore: number;
    totalQuestions: number;
    verifiedQuestions: number;
  };
}

export async function GET(req: Request) {
  try {
    const { user } = await verifySession(req);
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const engineFilter = searchParams.get("engine")?.toLowerCase().trim() || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);

    const isAdmin = isAdminUser(user.role);

    let query: any = db.collection("videos");
    if (!isAdmin) {
      query = query.where("userId", "==", user.uid);
    }

    const snapshot = await query.orderBy("createdAt", "desc").limit(limit).get();

    const items: VideoLibraryItem[] = [];

    snapshot.docs.forEach((doc: any) => {
      const d = doc.data() || {};
      const videoId = doc.id;
      const title = d.topic || d.title || "Untitled Short";

      if (search && !title.toLowerCase().includes(search) && !videoId.toLowerCase().includes(search)) {
        return;
      }
      if (engineFilter && d.engineId?.toLowerCase() !== engineFilter && d.style?.toLowerCase() !== engineFilter) {
        return;
      }

      const driveFileId = d.driveFileId || d.deliveryArtifact?.driveFileId;
      const driveUrl = d.driveUrl || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : undefined);

      const receipt = readDeliveryReceipt(videoId);
      const delivery = describeDelivery({
        status: d.status,
        deliveryMethod: receipt?.deliveryMethod ?? d.deliveryArtifact?.deliveryMethod,
        verified: receipt?.verified ?? d.deliveryArtifact?.verified,
        driveFileId,
        driveUrl,
      });

      const deliveryStatus: VideoLibraryItem["deliveryStatus"] =
        delivery.state === "DRIVE_DELIVERED"
          ? "DELIVERED"
          : delivery.state === "DRIVE_PENDING"
          ? "PENDING_UPLOAD"
          : delivery.state === "OUTBOX_ONLY"
          ? "LOCAL_OUTBOX"
          : delivery.state === "DELIVERY_FAILED"
          ? "DELIVERY_FAILED"
          : "NOT_CONFIGURED";

      const isScheduled = Boolean(d.scheduleId || d.isScheduled);

      items.push({
        videoId,
        jobId: d.jobId || videoId,
        ownerId: d.userId || user.uid,
        title,
        topic: d.topic || title,
        engineId: d.engineId || d.style || "quiz",
        engineMode: d.quizContext?.quizMode || d.engineMode || "geo",
        status: d.status || "completed",
        videoUrl: d.videoUrl || `/api/media/video/${videoId}`,
        driveUrl: delivery.state === "DRIVE_DELIVERED" ? delivery.linkUrl : undefined,
        driveFileId,
        deliveryTarget: d.deliveryTarget || receipt?.deliveryMethod || (driveUrl ? "GOOGLE_DRIVE" : undefined),
        deliveryStatus,
        isScheduled,
        scheduleId: d.scheduleId,
        durationSeconds: d.durationSeconds ?? d.renderDurationSeconds ?? null,
        sizeMb: d.videoSizeMb ?? null,
        resolution: d.resolution ?? null,
        fps: d.fps ?? null,
        createdAt: d.createdAt || new Date().toISOString(),
        verificationSummary: d.verificationSummary,
      });
    });

    return NextResponse.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load library items." }, { status: 500 });
  }
}
