import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { saveJobManifest } from "@/lib/jobs-history";
import { validateContent } from "@/lib/content-pipeline";
import { EngineRegistry } from "@/lib/core/EngineRegistry";
import { EngineJobSnapshot } from "@/lib/core/EngineContracts";
import { advancePointer, hasHardcodedCountry } from "@/lib/quiz/GeoRotationService";
import { resolveTier } from "@/lib/quota/quota-service";
import type { AutonomousFactoryController } from "@/factoryos/core/controller/AutonomousFactoryController";

const SceneInputSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  text: z.string().optional(),
  contactText: z.string().optional(),
  imagePrompt: z.string().optional(),
});

const QuizQuestionInputSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  question: z.string(),
  options: z.array(z.string()),
  answer: z.string().optional(),
  answerIndex: z.number().int().min(0).max(3).optional(),
});

const GenerateVideoRequestSchema = z.object({
  topic: z.string(),
  style: z.string().optional(),
  script: z.string().optional(),
  scenes: z.array(SceneInputSchema).optional(),
  contentType: z.string().optional(),
  hook: z.string().optional(),
  questions: z.array(QuizQuestionInputSchema).optional(),
  renderProfile: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  engineId: z.string().optional(),
  engineMode: z.string().optional(),
  difficulty: z.string().optional(),
  tone: z.string().optional(),
  voice: z.string().optional(),
  ratio: z.string().optional(),
  provider: z.string().optional(),
  quizContext: z.any().optional(),
  templateId: z.string().optional(),
  templateVersion: z.string().optional(),
  contentEngine: z.string().optional(),
  formatFamily: z.string().optional(),
  userInputs: z.record(z.string(), z.any()).optional(),
  // YouTube Shorts target duration (clamped server-side to 30–60 s)
  durationSeconds: z.number().optional(),
});

function mapQuizErrorToCode(errors: string[]): string {
  const msg = errors.join(" ").toLowerCase();
  if (msg.includes("missing hook")) return "HOOK_MISSING";
  if (msg.includes("hook score")) return "HOOK_SCORE_LOW";
  if (msg.includes("scene quality")) return "SCENE_QUALITY_LOW";
  if (msg.includes("hashtags")) return "HASHTAGS_INVALID";
  if (msg.includes("title too generic") || msg.includes("generic title")) return "TITLE_GENERIC";
  if (msg.includes("duplicate") && msg.includes("topic")) return "TOPIC_DUPLICATE";
  if (msg.includes("duplicate question")) return "QUESTION_DUPLICATE";
  if (msg.includes("thumbnail")) return "THUMBNAIL_NOT_READY";
  return "QUESTION_INVALID";
}

function validateQuizContent(quiz: { hook?: string; questions?: any[] }) {
  const errors: string[] = [];
  if (!quiz.hook) errors.push("Missing hook");
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push(`Quiz must contain at least 1 question, got ${quiz.questions?.length ?? 0}`);
  } else {
    const seen = new Set<string>();
    const expectedLength = quiz.questions.length;
    for (let i = 0; i < expectedLength; i++) {
      const q = quiz.questions[i];
      const num = i + 1;
      if (!q.question || typeof q.question !== "string" || q.question.trim().length === 0) {
        errors.push(`Question ${num} text is missing or invalid`);
        continue;
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`Question ${num} must have at least 2 options`);
      } else {
        const hasAnswerIndex = typeof q.answerIndex === "number" && q.answerIndex >= 0 && q.answerIndex < q.options.length;
        const hasAnswer = typeof q.answer === "string" && q.answer.trim().length > 0;

        if (!hasAnswer && !hasAnswerIndex) {
          errors.push(`Question ${num} is missing a valid answer or answerIndex`);
        } else if (hasAnswer && !hasAnswerIndex && !q.options.includes(q.answer)) {
          errors.push(`Question ${num} answer "${q.answer}" must match one of the options`);
        }
      }

      if (expectedLength === 10) {
        const diff = String(q.difficulty ?? "").toLowerCase();
        if (i >= 0 && i <= 2 && diff !== "easy") {
          errors.push(`Question ${num} difficulty must be 'easy', got '${diff}'`);
        } else if (i >= 3 && i <= 5 && diff !== "medium") {
          errors.push(`Question ${num} difficulty must be 'medium', got '${diff}'`);
        } else if (i >= 6 && i <= 9 && diff !== "hard") {
          errors.push(`Question ${num} difficulty must be 'hard', got '${diff}'`);
        }
      }

      const qText = q.question.trim().toLowerCase();
      if (seen.has(qText)) {
        errors.push(`Duplicate question detected: "${q.question}"`);
      }
      seen.add(qText);
    }
  }
  return { approved: errors.length === 0, errors, code: errors.length ? mapQuizErrorToCode(errors) : undefined as string | undefined };
}

import { verifySession, verifyWritePermission } from "../../../lib/auth/auth";
import { reserveGenerationSlot, releaseGenerationSlot, QuotaExceededError } from "../../../lib/quota/quota-service";
import { extractDeviceContext } from "../../../lib/fingerprint/server";

export async function POST(req: Request) {
  let userId = "";
  let jobId = "";
  const deviceContext = extractDeviceContext(req);
  try {
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
      return NextResponse.json({ error: "Unauthorized. Please log in to generate videos." }, { status: 401 });
    }

    userId = authenticatedUser.uid;
    const userRole = (authenticatedUser.role || "USER").toUpperCase();
    const tier = resolveTier(userRole);
    const isAdminOrOwner = tier === "ADMIN" || tier === "OWNER";
    const targetWorkerPool = isAdminOrOwner ? "azure" : "basic-fastapi";

    const body = await req.json();
    const parsed = GenerateVideoRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    jobId = `job_${crypto.randomBytes(8).toString("hex")}`;

    // 🔒 Concurrency-Safe Server-Authoritative 5-Video Hard Limit Reservation
    try {
      await reserveGenerationSlot(userId, userRole, jobId);
    } catch (quotaErr: any) {
      if (quotaErr instanceof QuotaExceededError || quotaErr.name === "QuotaExceededError") {
        return NextResponse.json(
          {
            error: quotaErr.message,
            quota: quotaErr.quotaInfo,
            code: "QUOTA_EXCEEDED",
          },
          { status: 429 }
        );
      }
      throw quotaErr;
    }

    let finalPayload: any = null;

    // Clamp duration to YouTube Shorts range (30–60 s)
    const rawDuration = parsed.data.durationSeconds ?? 45;
    const durationSeconds = Math.min(60, Math.max(30, Number.isFinite(rawDuration) ? rawDuration : 45));

    if (parsed.data.contentType === "QUIZ_SHORTS") {
      let quizHook = parsed.data.hook ?? "";
      let quizQuestions = parsed.data.questions ?? [];
      let quizTitle = parsed.data.title ?? "";
      let quizDescription = parsed.data.description ?? "";
      let quizHashtags = parsed.data.hashtags ?? [];

      if (!quizHook || quizQuestions.length === 0) {
        const { scriptAgent } = await import("../../../agents/script-agent");
        const draft = await scriptAgent({
          topic: parsed.data.topic,
          durationSeconds,
          style: parsed.data.style,
          contentType: "QUIZ_SHORTS",
        });
        quizHook = draft?.hook ?? "";
        quizQuestions = draft?.questions ?? [];
        quizTitle = draft?.title ?? parsed.data.title ?? "";
        quizDescription = draft?.description ?? parsed.data.description ?? "";
        quizHashtags = draft?.hashtags ?? parsed.data.hashtags ?? [];
      }

      const validate = validateQuizContent({
        hook: quizHook,
        questions: quizQuestions,
      });
      if (!validate.approved) {
        await releaseGenerationSlot(userId, userRole, jobId).catch(() => {});
        return NextResponse.json(
          { error: "Content rejected", details: validate, code: (validate as any).code ?? "VALIDATION_FAILED" },
          { status: 422 }
        );
      }

      finalPayload = {
        userId,
        tier,
        targetWorkerPool,
        topic: parsed.data.topic,
        style: parsed.data.style ?? "",
        script: quizHook,
        scenes: [],
        contentType: "QUIZ_SHORTS",
        quizData: {
          hook: quizHook,
          questions: quizQuestions,
          title: quizTitle,
          description: quizDescription,
          hashtags: quizHashtags,
        },
        renderProfile: parsed.data.renderProfile || "FAST_QUIZ",
        durationSeconds,
        status: "queued",
        createdAt: new Date().toISOString(),
        deviceFingerprint: deviceContext.fingerprint,
        clientIp: deviceContext.ipAddress,
        renderDurationSeconds: 0,
        videoSizeMb: 0.0,
      };
    } else {
      let scenes = parsed.data.scenes ?? [];
      let script = parsed.data.script ?? "";

      if (scenes.length === 0) {
        const { scriptAgent } = await import("../../../agents/script-agent");
        const draft = await scriptAgent({
          topic: parsed.data.topic,
          durationSeconds,
          style: parsed.data.style,
        });
        scenes = draft?.scenes?.map((s: any) => ({
          contactText: s.contactText,
          imagePrompt: s.imagePrompt,
        })) ?? [];
        script = draft?.scenes?.map((s: any) => s.contactText).join("\n") ?? "";
      }

      const hookFromScenes = (() => {
        const lines = String(script).split("\n").map((l) => l.trim());
        return lines.find((l) => l.length > 0) ?? "";
      })();

      const validate = await validateContent({
        topic: parsed.data.topic,
        script: script,
        hook: hookFromScenes,
        scenes: scenes.map((s: any) => ({ text: s.text ?? s.contactText ?? "", imagePrompt: s.imagePrompt ?? "" })),
        hashtags: [],
      }).catch((e) => ({
        approved: false,
        score: 0,
        errors: [e?.message ?? "Validation failed"],
        warnings: [],
      }));

      let finalScript = script;
      let finalScenes = scenes;

      if (!validate.approved) {
        const { autoRefinePipeline } = await import("../../../lib/auto-refine-pipeline");
        const refined = await autoRefinePipeline({
          topic: parsed.data.topic,
          style: parsed.data.style,
          hook: hookFromScenes,
          script: script,
          scenes: scenes.map((s: any) => ({
            id: s.id,
            text: s.text ?? s.contactText ?? "",
            imagePrompt: s.imagePrompt ?? "",
          })),
          provider: undefined,
        });

        if (!refined.approved) {
          console.warn("[generate-video] Content auto-refine did not meet strict approval thresholds, proceeding with best-effort refined content:", refined.errors);
        }

        finalScript = refined.script;
        finalScenes = refined.scenes.map((s: any) => ({
          contactText: s.text,
          imagePrompt: s.imagePrompt,
        }));
      }

      finalPayload = {
        userId,
        tier,
        targetWorkerPool,
        topic: parsed.data.topic,
        style: parsed.data.style ?? "",
        script: finalScript,
        scenes: finalScenes,
        contentType: parsed.data.contentType || "MOTIVATIONAL",
        renderProfile: parsed.data.renderProfile || "STANDARD_SHORTS",
        durationSeconds,
        status: "queued",
        createdAt: new Date().toISOString(),
        deviceFingerprint: deviceContext.fingerprint,
        clientIp: deviceContext.ipAddress,
        renderDurationSeconds: 0,
        videoSizeMb: 0.0,
      };
    }

    // Advance per-country rotation for BASIC geo hardcoded sets (best-effort — never blocks render)
    // Only advances when the draft was actually served from the hardcoded set (source === "hardcoded")
    try {
      const qc: any = parsed.data.quizContext;
      const geoCode = qc?.countryCode ? String(qc.countryCode).toUpperCase().trim() : "";
      const geoSource = qc?.source ? String(qc.source) : "";
      if (tier === "BASIC" && geoCode && geoSource === "hardcoded" && hasHardcodedCountry(geoCode)) {
        advancePointer(userId, geoCode)
          .then((next) => console.log(`[generate-video] geoHardcoded:advance ${geoCode} -> ${next} user=${userId} job=${jobId}`))
          .catch((e) => console.warn(`[generate-video] geoHardcoded:advance failed for ${geoCode}:`, e?.message));
      }
    } catch {}

    // Build immutable engine configuration snapshot for runtime safety
    const engineId = parsed.data.engineId || (parsed.data.contentType === "QUIZ_SHORTS" ? "quiz" : "facts");
    const engineDef = await EngineRegistry.getEngine(engineId);
    const engineSnapshot: EngineJobSnapshot = {
      jobId,
      engineId,
      manifestVersion: engineDef?.manifestVersion || "1.0",
      engineConfigVersion: engineDef?.configVersion || 1,
      engineStatusAtCreation: engineDef?.status || "ACTIVE",
      effectiveConfig: {
        difficulty: parsed.data.difficulty || engineDef?.defaults.difficulty || "medium",
        tone: parsed.data.tone || engineDef?.defaults.tone || "Challenging",
        voice: parsed.data.voice || engineDef?.defaults.voice || "neutral",
        ratio: parsed.data.ratio || engineDef?.defaults.ratio || "9:16",
        renderProfile: parsed.data.renderProfile || engineDef?.generationConfig.renderProfile || "FAST_QUIZ",
        provider: parsed.data.provider || engineDef?.generationConfig.provider,
        durationSeconds,
      },
      quizContext: parsed.data.quizContext,
    };

    finalPayload.engineId = engineId;
    finalPayload.engineSnapshot = engineSnapshot;

    // Execution token: strong crypto — never jobId fallback (const-time compared in callback)
    const executionToken = crypto.randomBytes(32).toString("hex");
    finalPayload.executionToken = executionToken;
    finalPayload.status = "processing";
    finalPayload.dispatchedAt = new Date().toISOString();

    const executionAuthority = (process.env.EXECUTION_AUTHORITY || "factoryos").toLowerCase();
    const missionId = `mis_${jobId.replace(/^job_/, "")}`;
    finalPayload.missionId = missionId;
    finalPayload.executionAuthority = executionAuthority;

    // Initialize document in Firestore as single source of truth
    await saveJobManifest(jobId, finalPayload);

    if (executionAuthority === "factoryos") {
      // 🔒 Primary Authoritative FactoryOS Control Plane Execution Path
      const { AutonomousFactoryController } = await import("../../../factoryos/core/controller/AutonomousFactoryController");
      let controller = (global as any).__factoryOSController as AutonomousFactoryController | undefined;
      if (!controller) {
        controller = new AutonomousFactoryController({ storageType: "memory" });
        await controller.boot();
        (global as any).__factoryOSController = controller;
      }

      await controller.startMission({
        missionId,
        goal: `Generate Video: ${parsed.data.topic}`,
        objective: `Execute 6-Floor DAG for Job ${jobId}`,
        owner: userId,
        scope: {
          jobId,
          missionId,
          executionToken,
          tier,
          userId,
          topic: parsed.data.topic,
          style: parsed.data.style,
          templateId: parsed.data.templateId,
          templateVersion: parsed.data.templateVersion,
          contentEngine: parsed.data.contentEngine,
          formatFamily: parsed.data.formatFamily,
          userInputs: parsed.data.userInputs,
          renderProfile: finalPayload.renderProfile,
          contentType: finalPayload.contentType,
          quizData: finalPayload.quizData,
          script: finalPayload.script,
          scenes: finalPayload.scenes,
          engineSnapshot,
        },
      });

      return NextResponse.json({
        jobId,
        videoId: jobId,
        missionId,
        status: "queued",
        authority: "factoryos",
      });
    }

    // ── LEGACY PATH (Compatibility Mode Only) ──────────────────────────────────
    const isControlPlane = process.env.RENDER === "true" || process.env.NODE_ENV === "production" || Boolean(process.env.BASIC_RENDER_API_URL);
    const basicRenderApiUrl = process.env.BASIC_RENDER_API_URL;
    const basicRenderSecret = process.env.BASIC_RENDER_API_SECRET || process.env.RENDER_WORKER_SECRET || process.env.INTERNAL_API_SECRET_KEY;

    if (isControlPlane) {
      if (!basicRenderApiUrl) {
        const configError = "BASIC_RENDER_API_URL is required for production Render Control Plane.";
        console.error(`[generate-video Fatal] ${configError}`);
        await releaseGenerationSlot(userId, userRole, jobId).catch(() => {});
        await saveJobManifest(jobId, { ...finalPayload, status: "failed", error: configError });
        return NextResponse.json(
          { error: configError, jobId },
          { status: 500 }
        );
      }

      console.log(`[generate-video] Production Control Plane mode: Delegating job ${jobId} (tier: ${tier}) to Azure worker.`);

      // Priority 1: Persistent FastAPI Service on Azure VM (All tiers)
      fetch(`${basicRenderApiUrl.replace(/\/$/, "")}/api/render/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${basicRenderSecret}`,
        },
        body: JSON.stringify({
          jobId,
          executionToken,
          tier: "BASIC", // Target worker protocol format accepted by Azure FastAPI
          topic: parsed.data.topic,
          renderProfile: parsed.data.renderProfile || engineSnapshot.effectiveConfig.renderProfile || "FAST_QUIZ",
          contentType: finalPayload.contentType,
          quizData: finalPayload.quizData,
          script: finalPayload.script,
          scenes: finalPayload.scenes,
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const t = await r.text().catch(() => "");
            console.warn(`[generate-video] Azure FastAPI dispatch warning (${r.status}): ${t.slice(0, 300)}`);
          } else {
            console.log(`[generate-video] Dispatched to Azure FastAPI renderer for ${jobId} (tier: ${tier})`);
          }
        })
        .catch((e) => console.warn(`[generate-video] Azure FastAPI dispatch error: ${e?.message}`));
    } else {
      // Local development execution path
      if (process.env.STORAGE_DRIVER !== "cloudflare-worker") {
        const { ServiceRegistry } = await import("../../../lib/core/ServiceRegistry");
        
        if (!ServiceRegistry.has("renderQueue")) {
          const { SQLiteRenderQueue } = await import("../../../lib/core/SQLiteRenderQueue");
          ServiceRegistry.register("renderQueue", new SQLiteRenderQueue());
        }

        const { QueueProcessor } = await import("../../../lib/core/RenderQueueProcessor");
        QueueProcessor.start();

        const renderQueue = ServiceRegistry.get("renderQueue");
        await renderQueue.enqueue({
          jobId,
          payload: {
            jobId,
            userId,
            engine: engineId,
            engineId,
            engineSnapshot,
            topic: parsed.data.topic,
            profile: parsed.data.renderProfile || engineSnapshot.effectiveConfig.renderProfile || "FAST_QUIZ",
            platforms: ["youtube"],
            options: {
              humanApproval: false
            },
            contentType: finalPayload.contentType,
            quizData: finalPayload.quizData,
            script: finalPayload.script,
            scenes: finalPayload.scenes,
          },
          priority: isAdminOrOwner ? 1 : 0,
          maxAttempts: 3
        });
      }
    }

    return NextResponse.json({ jobId, videoId: jobId, status: "queued", authority: "legacy" });
  } catch (err: any) {
    if (userId && jobId) {
      try {
        await releaseGenerationSlot(userId, jobId);
      } catch {}
    }
    return NextResponse.json(
      { error: err?.message ?? "Failed to generate video" },
      { status: 500 }
    );
  }
}
