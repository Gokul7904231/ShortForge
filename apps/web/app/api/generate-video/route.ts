import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { saveJobManifest } from "@/lib/jobs-history";
import { validateContent } from "@/lib/content-pipeline";
import { EngineRegistry } from "@/lib/core/EngineRegistry";
import { compileProductionSpec } from "@/factoryos/core/engines/ProductionSpecCompiler";
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
  // Schema-driven Content Engine configuration. Legacy top-level fields remain
  // accepted during migration.
  userConfig: z.record(z.string(), z.any()).optional(),
  options: z.record(z.string(), z.any()).optional(),
  platforms: z.array(z.string()).optional(),
  audience: z.string().optional(),
  thumbnailStyle: z.string().optional(),
  retention: z.number().optional(),
  providerOverride: z.string().optional(),
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

    // Resolve and compile the Content Engine configuration before content
    // generation. The compiled ProductionSpec becomes the mission snapshot.
    const engineId =
      parsed.data.engineId ||
      (parsed.data.contentType === "QUIZ_SHORTS" ? "quiz" : "facts");
    const engineDef = await EngineRegistry.getEngine(engineId);

    if (!engineDef) {
      await releaseGenerationSlot(userId, userRole, jobId).catch(() => {});
      return NextResponse.json(
        { error: `Unknown Content Engine "${engineId}".`, code: "ENGINE_NOT_FOUND" },
        { status: 422 }
      );
    }

    const submittedConfig: Record<string, any> = {
      ...(parsed.data.options ?? {}),
      ...(parsed.data.userConfig ?? {}),
      topic: parsed.data.topic,
      ...(parsed.data.difficulty !== undefined
        ? { difficulty: parsed.data.difficulty }
        : {}),
      ...(parsed.data.audience !== undefined
        ? { audience: parsed.data.audience }
        : {}),
      ...(parsed.data.tone !== undefined
        ? { tone: parsed.data.tone }
        : {}),
      ...(parsed.data.voice !== undefined
        ? { voice: parsed.data.voice }
        : {}),
      ...(parsed.data.ratio !== undefined
        ? { ratio: parsed.data.ratio }
        : {}),
      ...(parsed.data.thumbnailStyle !== undefined
        ? { thumbnailStyle: parsed.data.thumbnailStyle }
        : {}),
      ...(parsed.data.durationSeconds !== undefined
        ? { durationSeconds: parsed.data.durationSeconds }
        : {}),
      ...(parsed.data.platforms !== undefined
        ? { platforms: parsed.data.platforms }
        : {}),
      ...(parsed.data.providerOverride !== undefined
        ? { providerOverride: parsed.data.providerOverride }
        : {}),
      ...(parsed.data.retention !== undefined
        ? { retentionHours: parsed.data.retention }
        : {}),
    };

    if (
      parsed.data.provider !== undefined &&
      submittedConfig.providerOverride === undefined
    ) {
      submittedConfig.providerOverride = parsed.data.provider;
    }

    let productionSpec;
    try {
      productionSpec = compileProductionSpec({
        jobId,
        engine: engineDef,
        userConfig: submittedConfig,
      }).spec;
    } catch (specError: any) {
      await releaseGenerationSlot(userId, userRole, jobId).catch(() => {});
      return NextResponse.json(
        {
          error: specError?.message ?? "Invalid engine configuration",
          code: "ENGINE_CONFIG_INVALID",
        },
        { status: 422 }
      );
    }

    const configuredDuration = Number(
      productionSpec.configuration.media.durationSeconds ?? 45
    );

    let finalPayload: any = null;

    // Clamp duration to YouTube Shorts range (30–60 s)
    const rawDuration = configuredDuration;
    const durationSeconds = Math.min(
      60,
      Math.max(30, Number.isFinite(rawDuration) ? rawDuration : 45)
    );

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
        renderProfile:
          parsed.data.renderProfile ||
          engineDef.generationConfig.renderProfile ||
          "FAST_QUIZ",
        durationSeconds,
        platforms: Array.isArray(productionSpec.configuration.delivery.platforms)
          ? productionSpec.configuration.delivery.platforms
          : [],
        productionSpec,
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
        renderProfile:
          parsed.data.renderProfile ||
          engineDef.generationConfig.renderProfile ||
          "STANDARD_SHORTS",
        durationSeconds,
        platforms: Array.isArray(productionSpec.configuration.delivery.platforms)
          ? productionSpec.configuration.delivery.platforms
          : [],
        productionSpec,
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

    // Compatibility snapshot derived from the immutable ProductionSpec.
    const engineSnapshot: EngineJobSnapshot = {
      jobId,
      engineId,
      manifestVersion: engineDef.manifestVersion || "1.0",
      engineConfigVersion: engineDef.configVersion || 1,
      engineStatusAtCreation: engineDef.status || "ACTIVE",
      productionSpecId: productionSpec.specId,
      productionSpecHash: productionSpec.compilation.hash,
      effectiveConfig: {
        difficulty: productionSpec.configuration.content.difficulty,
        audience: productionSpec.configuration.content.audience,
        tone: productionSpec.configuration.creative.tone,
        voice: productionSpec.configuration.media.voice,
        ratio: productionSpec.configuration.media.ratio,
        thumbnailStyle: productionSpec.configuration.media.thumbnailStyle,
        renderProfile:
          parsed.data.renderProfile ||
          engineDef.generationConfig.renderProfile ||
          "FAST_QUIZ",
        provider: productionSpec.configuration.runtime.providerOverride,
        durationSeconds,
        retentionHours: productionSpec.configuration.lifecycle.retentionHours,
        platforms: Array.isArray(productionSpec.configuration.delivery.platforms)
          ? productionSpec.configuration.delivery.platforms
          : [],
      },
      quizContext: parsed.data.quizContext,
    };

    finalPayload.engineId = engineId;
    finalPayload.engineSnapshot = engineSnapshot;
    finalPayload.productionSpec = productionSpec;

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
          productionSpec,
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

    // FactoryOS is the sole production execution authority.
    // Legacy external render-plane dispatch is intentionally removed.
    const authorityError =
      `Unsupported execution authority "${executionAuthority}". Production generation must use FactoryOS.`;
    await releaseGenerationSlot(userId, userRole, jobId).catch(() => {});
    await saveJobManifest(jobId, {
      ...finalPayload,
      status: "failed",
      error: authorityError,
    });
    return NextResponse.json({ error: authorityError, jobId }, { status: 409 });;
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
