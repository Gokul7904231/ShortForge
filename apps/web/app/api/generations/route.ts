import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/lib/firebase-admin";
import { verifySession, verifyWritePermission } from "@/lib/auth/auth";
import {
  reserveGenerationSlot,
  releaseGenerationSlot,
  getUserQuota,
  QuotaExceededError,
  getBasicGenerationLimit,
} from "@/lib/quota/quota-service";
import { generateBasicVideoContent } from "@/lib/ai-provider";
import { extractDeviceContext } from "@/lib/fingerprint/server";

export const runtime = "nodejs";

const CreateGenerationSchema = z.object({
  topic: z.string().min(1, "Topic is required").max(300),
  contentType: z.enum(["FACTS", "QUIZ_SHORTS", "MOTIVATIONAL", "STORY"]).optional().default("FACTS"),
  durationSeconds: z.number().int().min(15).max(60).optional().default(45),
  style: z.string().optional(),
  tone: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(req: Request) {
  let userId = "";
  let userRole = "USER";
  let jobId = "";
  let generationId = "";
  let slotReserved = false;

  try {
    // 1. Authenticate user
    let authenticatedUser: any = null;
    try {
      const { user } = await verifySession(req);
      authenticatedUser = user;
      verifyWritePermission(user);
    } catch (err: any) {
      if (err.message?.includes("Read-only access") || err.status === 403) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
    }

    if (!authenticatedUser) {
      // Fallback for development/testing if no session present
      authenticatedUser = { uid: "anonymous", role: "USER" };
    }

    userId = authenticatedUser.uid;
    userRole = (authenticatedUser.role || "USER").toUpperCase();
    const tier = userRole === "ADMIN" || userRole === "OWNER" ? "ADMIN" : "BASIC";

    // 2. Parse request payload & idempotency key
    const body = await req.json().catch(() => ({}));
    const idempotencyKey =
      req.headers.get("Idempotency-Key") ||
      req.headers.get("idempotency-key") ||
      body.idempotencyKey ||
      null;

    const parsed = CreateGenerationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { topic, contentType, durationSeconds, style, tone } = parsed.data;

    // 3. Idempotency check: if already processed with this key, return original record
    if (idempotencyKey) {
      try {
        const existingGenSnap = await db
          .collection("generations")
          .where("userId", "==", userId)
          .where("idempotencyKey", "==", idempotencyKey)
          .limit(1)
          .get();

        if (!existingGenSnap.empty) {
          const existing = existingGenSnap.docs[0].data();
          const quota = await getUserQuota(userId, userRole);
          console.log(`[Idempotency] Returning existing generation record for key="${idempotencyKey}" generationId="${existing.generationId}"`);
          return NextResponse.json(
            {
              success: true,
              idempotent: true,
              generationId: existing.generationId,
              jobId: existing.jobId,
              status: existing.status,
              provider: existing.provider,
              quota: {
                limit: quota.limit,
                used: quota.totalUsed,
                remaining: quota.remaining,
              },
            },
            { status: 200 }
          );
        }
      } catch (err: any) {
        console.warn("[Idempotency] Check skipped due to lookup error:", err.message);
      }
    }

    // 4. Rate Limiting: Max 1 active in-flight generation for BASIC tier
    if (tier === "BASIC") {
      try {
        const activeJobsSnap = await db
          .collection("videos")
          .where("userId", "==", userId)
          .where("status", "in", ["queued", "rendering", "processing"])
          .limit(1)
          .get();

        if (!activeJobsSnap.empty) {
          return NextResponse.json(
            {
              error: "RATE_LIMIT_EXCEEDED",
              message: "You have an active video generation in progress. Please wait for it to complete.",
            },
            { status: 429 }
          );
        }
      } catch (err: any) {
        console.warn("[RateLimit] Active job check skipped:", err.message);
      }
    }

    // 5. Generate identifiers
    jobId = `job_${crypto.randomBytes(8).toString("hex")}`;
    generationId = `gen_${crypto.randomBytes(8).toString("hex")}`;

    // 6. Concurrency-safe atomic quota reservation
    let quotaReservation: any;
    try {
      quotaReservation = await reserveGenerationSlot(userId, userRole, jobId);
      slotReserved = true;
    } catch (quotaErr: any) {
      if (quotaErr instanceof QuotaExceededError || quotaErr.name === "QuotaExceededError") {
        const limit = getBasicGenerationLimit();
        return NextResponse.json(
          {
            error: "GENERATION_LIMIT_REACHED",
            message: `You have used all ${limit} Basic generations.`,
            limit,
            used: quotaErr.quotaInfo?.totalUsed ?? limit,
            remaining: 0,
          },
          { status: 429 }
        );
      }
      throw quotaErr;
    }

    const currentQuota = quotaReservation.quota;

    // 7. Multi-Provider AI Content Generation with Automatic Failover
    let aiResult: any;
    try {
      aiResult = await generateBasicVideoContent({
        topic,
        contentType,
        durationSeconds,
        style,
        tone,
      });
    } catch (aiErr: any) {
      // 🔒 Refund policy: if AI generation fails on all providers before video job creation,
      // atomically release the reserved slot so the user is not charged a credit.
      if (slotReserved) {
        console.log(`[AI Failover Refund] Releasing quota slot for user=${userId} jobId=${jobId}`);
        await releaseGenerationSlot(userId, jobId).catch((relErr) => {
          console.error("[AI Failover Refund] Error releasing slot:", relErr);
        });
        slotReserved = false;
      }

      return NextResponse.json(
        {
          error: "AI_GENERATION_UNAVAILABLE",
          message: "AI generation is temporarily unavailable. Please try again later.",
        },
        { status: 503 }
      );
    }

    // 8. Build Video Job Payload (NO provider credentials inside payload)
    const content = aiResult.content;
    const executionToken = `exec_${crypto.randomBytes(24).toString("hex")}`;
    const deviceContext = extractDeviceContext(req);

    const videoJobPayload: any = {
      id: jobId,
      jobId,
      userId,
      tier,
      workerPool: targetWorkerPool,
      topic,
      style: style || "",
      script: content.script || content.hook || "",
      scenes: content.scenes || [],
      contentType: contentType === "QUIZ_SHORTS" ? "QUIZ_SHORTS" : "FACT",
      renderProfile: contentType === "QUIZ_SHORTS" ? "FAST_QUIZ" : "AUTO",
      durationSeconds,
      status: "queued",
      executionToken,
      createdAt: new Date().toISOString(),
      deviceFingerprint: deviceContext.fingerprint,
      clientIp: deviceContext.ipAddress,
      renderDurationSeconds: 0,
      videoSizeMb: 0.0,
    };

    if (contentType === "QUIZ_SHORTS") {
      videoJobPayload.quizData = {
        hook: content.hook || content.script,
        questions: content.questions || [],
        title: content.title || `${topic} Quiz`,
        description: content.description || `Trivia quiz about ${topic}`,
        hashtags: content.hashtags || ["quiz", "shorts"],
      };
    }

    // 9. Persist video job in Firestore
    await db.collection("videos").doc(jobId).set(videoJobPayload);

    // 10. Persist generation record under generations/{generationId}
    const generationRecord = {
      generationId,
      jobId,
      userId,
      plan: tier,
      generationNumber: currentQuota.totalUsed,
      status: "queued",
      provider: aiResult.provider,
      model: aiResult.model,
      providerAttempts: aiResult.providerAttempts || [],
      idempotencyKey: idempotencyKey || null,
      createdAt: new Date().toISOString(),
    };

    await db.collection("generations").doc(generationId).set(generationRecord);

    console.log(`[Generation] Created generationId=${generationId} jobId=${jobId} provider=${aiResult.provider} user=${userId} quota=${currentQuota.totalUsed}/${currentQuota.limit}`);

    // 11. Return safe response to client
    return NextResponse.json(
      {
        success: true,
        generationId,
        jobId,
        status: "queued",
        provider: aiResult.provider,
        quota: {
          limit: currentQuota.limit,
          used: currentQuota.totalUsed,
          remaining: currentQuota.remaining,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    // If unexpected failure occurred after quota reservation, refund
    if (slotReserved && userId && jobId) {
      await releaseGenerationSlot(userId, jobId).catch(() => {});
    }

    console.error("[POST /api/generations] Unexpected error:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to initiate video generation." },
      { status: 500 }
    );
  }
}
