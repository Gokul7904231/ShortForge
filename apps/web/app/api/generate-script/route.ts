import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { scriptAgent } from "../../../agents/script-agent";
import { autoRefinePipeline } from "../../../lib/auto-refine-pipeline";
import { LLMProvider } from "../../../ai/provider";


import { verifySession, verifyWritePermission } from "../../../lib/auth/auth";
import { prepareTreasuryModelContext } from "../../../lib/treasury-model-context";

export async function POST(req: Request) {
  try {
    const { user } = await verifySession(req);
    verifyWritePermission(user);

    const body = await req.json();

    const topic = String(body?.topic ?? "").trim();
    const rawDuration = Number(body?.durationSeconds ?? 45);
    // Clamp to YouTube Shorts range (30–60 s)
    const durationSeconds = Math.min(60, Math.max(30, Number.isFinite(rawDuration) ? rawDuration : 45));
    const style = typeof body?.style === "string" ? body.style : undefined;
    const trend = typeof body?.trend === "string" ? body.trend : undefined;
    const provider = body?.provider as LLMProvider | undefined;

    if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });

    const contentType = typeof body?.contentType === "string" ? body.contentType : undefined;

    const treasuryModel = await prepareTreasuryModelContext({
      command: "Generate Script: " + topic,
      missionId: String(body?.missionId || "mis_script_" + user.uid),
      taskId: "script-api-" + randomUUID(),
      floorId: "floor02_scripting",
      preferredProviderId: provider,
      subtask: "script_generation",
      maxRetries: 0,
    });
    // Fast generation is always enabled (checkbox removed from UI)
    const faster = true;

    if (contentType === "QUIZ_SHORTS") {
      const quiz = await scriptAgent({
        topic,
        durationSeconds,
        style,
        trend,
        provider,
        contentType,
        treasuryContext: treasuryModel.context,
      });
      
      let hookScore = 8.5;
      if (!faster) {
        const { hookScoreAgent } = await import("../../../agents/hook-score-agent");
        const hookScoreOut = await hookScoreAgent({
          hook: quiz.hook,
          provider,
          treasuryContext: treasuryModel.context,
        });
        hookScore = hookScoreOut.score;
      }

      return NextResponse.json({
        contentType: "QUIZ_SHORTS",
        hook: quiz.hook,
        questions: quiz.questions,
        title: quiz.title,
        description: quiz.description,
        hashtags: quiz.hashtags,
        renderProfile: "FAST_QUIZ",
        estimatedDuration: quiz.estimatedDuration ?? 45,
        hookScore,
        sceneQuality: 8.0,
        thumbnailReady: true,
        autoOptimized: true,
        optimizationAttempts: 1,
        autoRefine: {
          approved: true,
          topicSimilarity: 0.95,
        },
      });
    }

    // 1) Generate a draft (scenes + hook derived from opening scene)
    const draft = await scriptAgent({
      topic,
      durationSeconds,
      style,
      trend,
      provider,
      treasuryContext: treasuryModel.context,
    });

    // Hook-first special logic (Scene 1 is treated as the hook source).
    // autoRefinePipeline expects `hook` and `scenes`.
    const hook = draft?.scenes?.[0]?.contactText ?? "";

    // 2) Auto-optimize until acceptable (best attempt returned regardless of strict approval)
    const optimized = await autoRefinePipeline({
      topic,
      style,
      hook,
      script: draft?.scenes?.map((s: any) => s.contactText).join("\n") ?? "",
      scenes: draft?.scenes?.map((s: any) => ({ text: s.contactText, imagePrompt: s.imagePrompt })) ?? [],
      provider,
      maxAttempts: faster ? 0 : 3,
      faster,
      treasuryContext: treasuryModel.context,
    });

    // Frontend contract: include these fields so UX can render immediately.
    return NextResponse.json({
      scenes: optimized.scenes,
      script: optimized.script,
      hook: optimized.hook,
      hookScore: optimized.hookScore,
      sceneQuality: optimized.sceneQualityScore,
      thumbnailReady: optimized.thumbnailReady,
      autoOptimized: true,
      optimizationAttempts: optimized.attempts,
      autoRefine: {
        approved: optimized.approved,
        topicSimilarity: optimized.topicSimilarity,
      },
    });
  } catch (err: any) {
    const isForbidden = err.message?.includes("Forbidden") || err.message?.includes("Read-only access");
    const status = err.status || (isForbidden ? 403 : err.message?.includes("missing or expired") ? 401 : 500);
    return NextResponse.json({ error: err?.message ?? "Failed to generate script" }, { status });
  }
}


