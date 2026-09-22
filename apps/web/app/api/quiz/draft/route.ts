import { NextResponse } from "next/server";
import { scriptAgent } from "@/agents/script-agent";
import { verifySession } from "@/lib/auth/auth";
import { getUserQuota, resolveTier } from "@/lib/quota/quota-service";
import { QuizOrchestrator } from "@/lib/quiz/QuizOrchestrator";
import { peekNextSet, toDraftResponse, hasHardcodedCountry } from "@/lib/quiz/GeoRotationService";

export async function POST(req: Request) {
  let draftUser: any = null;
  try {
    // 🔒 Quota Gate Check for Basic Users — also captures user for hardcoded routing
    try {
      const { user } = await verifySession(req);
      if (user) {
        draftUser = user;
        const quota = await getUserQuota(user.uid, user.role);
        if (quota.isExceeded) {
          return NextResponse.json(
            {
              error: `Generation quota exhausted. Basic plan is limited to ${quota.limit} videos (You have used ${quota.totalUsed}/${quota.limit}).`,
              code: "QUOTA_EXCEEDED",
              quota,
            },
            { status: 429 }
          );
        }
      }
    } catch (quotaErr: any) {
      if (quotaErr.name === "QuotaExceededError" || quotaErr.status === 429) {
        return NextResponse.json(
          { error: quotaErr.message, code: "QUOTA_EXCEEDED" },
          { status: 429 }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const engineId = String(body.engineId || body.engine || "quiz").trim();
    const quizMode = String(body.quizMode || body.engineMode || (body.countryCode ? "geo" : "custom")).trim();
    const style = String(body.style || body.difficulty || "medium").trim();
    const durationSeconds = Number(body.durationSeconds || 45);

    // ─── 1. GEO QUIZ GENERATION PATH (hardcoded 5-set rotation for BASIC) ───
    if (quizMode === "geo") {
      const countryCode = String(body.countryCode || "IN").toUpperCase().trim();
      const countryName = body.countryName || countryCode;
      const topic = `${countryName} Geography & Culture Quiz`;
      const byokKey = String(body.byokKey || body.byokApiKey || body.apiKey || "").trim();
      const useByok = Boolean(body.useByok || body.byokMode === "byok" || byokKey.length > 10);
      const tier = draftUser ? resolveTier(draftUser.role || "USER") : "BASIC";

      let resolvedApiKey = byokKey.length > 10 ? byokKey : undefined;
      let resolvedProvider: any = undefined;

      if (useByok && !resolvedApiKey) {
        try {
          const { ApiConfigManager } = await import("@/lib/api-config/api-config-manager");
          const providers = await ApiConfigManager.getProviders();
          const active = providers.find((p) => p.primary.status === "connected" && p.primary.hasKey);
          if (active) {
            const resolved = await ApiConfigManager.resolveProvider(active.id);
            if (resolved?.apiKey) {
              resolvedApiKey = resolved.apiKey;
              resolvedProvider = active.id;
              console.log(`[Quiz Draft API] Resolved configured BYOK key from ApiConfigManager provider=${active.id}`);
            }
          }
        } catch (e: any) {
          console.warn("[Quiz Draft API] Failed to resolve key from ApiConfigManager:", e?.message);
        }
      }

      if (useByok && !resolvedApiKey) {
        return NextResponse.json(
          {
            error: "No active API key configured in API Configuration settings (/settings/api). Please configure your provider key or paste a transient key.",
            code: "API_KEY_REQUIRED",
          },
          { status: 400 }
        );
      }

      const isHardcodedEligible = tier === "BASIC" && !useByok && hasHardcodedCountry(countryCode) && !!draftUser;

      if (isHardcodedEligible) {
        try {
          const { set, index } = await peekNextSet(draftUser.uid, countryCode);
          const resp = toDraftResponse(set, countryCode, countryName, durationSeconds, index);
          console.log(`[Quiz Draft API] hardcoded:peek ${resp.meta.setLabel} for ${countryCode} user=${draftUser.uid}`);
          return NextResponse.json(resp);
        } catch (e: any) {
          console.warn("[Quiz Draft API] hardcoded peek failed, falling back to LLM:", e?.message);
        }
      }

      if (resolvedApiKey) console.log(`[Quiz Draft API] BYOK geo draft for ${countryCode} (provider: ${resolvedProvider || "default"})`);
      else if (tier !== "BASIC") console.log(`[Quiz Draft API] PRO/ADMIN geo LLM for ${countryCode} tier=${tier}`);
      else console.log(`[Quiz Draft API] Generating Geo Quiz draft (LLM) for Country: "${countryCode}"...`);

      let draft: any;
      try {
        draft = await scriptAgent({
          topic,
          durationSeconds,
          style,
          contentType: "QUIZ_SHORTS",
          renderProfile: "FAST_QUIZ",
          apiKey: resolvedApiKey,
          provider: resolvedProvider,
        });

        if (!draft || !Array.isArray(draft.questions) || draft.questions.length === 0) {
          throw new Error(`Failed to generate Geo Quiz for country code: ${countryCode}.`);
        }
      } catch (llmErr: any) {
        console.warn(`[Quiz Draft API] LLM draft generation failed (${llmErr?.message}), checking hardcoded fallback for ${countryCode}...`);
        if (hasHardcodedCountry(countryCode)) {
          const fallbackUid = draftUser?.uid || "fallback-user";
          const { set, index } = await peekNextSet(fallbackUid, countryCode);
          const resp = toDraftResponse(set, countryCode, countryName, durationSeconds, index);
          console.log(`[Quiz Draft API] Successfully fell back to hardcoded ${resp.meta.setLabel} for ${countryCode}`);
          return NextResponse.json(resp);
        }
        throw llmErr;
      }

      const questions = draft.questions.map((q: any, idx: number) => {
        const options = Array.isArray(q.options) ? q.options.map(String) : ["Option A", "Option B", "Option C", "Option D"];
        const answer = typeof q.answer === "string" ? q.answer : options[0];
        let answerIndex = options.indexOf(answer);
        if (answerIndex < 0) answerIndex = typeof q.answerIndex === "number" ? q.answerIndex : 0;

        return {
          questionId: `q${idx + 1}`,
          revision: 1,
          question: q.question || `Question ${idx + 1}`,
          options,
          answer: options[answerIndex] || answer,
          answerIndex,
          difficulty: q.difficulty || "medium",
          explanation: q.explanation || "",
          topicId: countryCode.toLowerCase(),
          topicName: countryName,
          verificationStatus: "UNVERIFIED",
        };
      });

      return NextResponse.json({
        engineId: "quiz",
        quizMode: "geo",
        countryCode,
        title: draft.title || topic,
        topic,
        hook: draft.hook || `Only true citizens of ${countryName} get Question 6 right!`,
        description: draft.description || `Test your knowledge on ${countryName}!`,
        hashtags: draft.hashtags || ["#shorts", "#quiz", "#geoquiz", `#${countryCode.toLowerCase()}`],
        questions,
        renderProfile: "FAST_QUIZ",
        durationSeconds,
        meta: { source: resolvedApiKey ? "byok" : "llm" as const },
      });
    }

    // ─── 2. CUSTOM QUIZ GENERATION PATH (SINGLE OR MULTI TOPIC) ─────────────
    const customQuiz = body.customQuiz || {};
    const mode = customQuiz.mode || (Array.isArray(customQuiz.topics) && customQuiz.topics.length > 1 ? "multiple" : "single");
    const totalQuestions = Number(customQuiz.totalQuestions || body.totalQuestions || 6);

    let topicList: string[] = [];
    if (mode === "multiple" && Array.isArray(customQuiz.topics)) {
      topicList = customQuiz.topics.map((t: any) => (typeof t === "string" ? t : t.name || t.topicId || ""));
    } else {
      const singleTopic = String(
        (Array.isArray(customQuiz.topics) && customQuiz.topics[0]) ||
        body.topic ||
        body.topicBrief ||
        "Artificial Intelligence & Computing Milestones"
      ).trim();
      topicList = [singleTopic];
    }

    // Run deterministic equal allocation
    const allocations = QuizOrchestrator.calculateEqualAllocation(topicList, totalQuestions);
    const combinedTopicTitle = topicList.length > 1 ? topicList.join(" & ") : topicList[0];

    console.log(`[Quiz Draft API] Generating Custom Quiz draft for topics: [${topicList.join(", ")}] (Allocations: ${allocations.map(a => `${a.name}:${a.questionBudget}`).join(", ")})`);

    const draft = await scriptAgent({
      topic: combinedTopicTitle,
      durationSeconds,
      style,
      contentType: "QUIZ_SHORTS",
      renderProfile: "FAST_QUIZ",
      topics: allocations,
    });

    if (!draft || !Array.isArray(draft.questions) || draft.questions.length === 0) {
      throw new Error("Failed to generate questions for the requested topics. Please try different topics.");
    }

    const rawQuestions = draft.questions.map((q: any, idx: number) => {
      const options = Array.isArray(q.options) ? q.options.map(String) : ["Option A", "Option B", "Option C", "Option D"];
      const answer = typeof q.answer === "string" ? q.answer : options[0];
      let answerIndex = options.indexOf(answer);
      if (answerIndex < 0) answerIndex = typeof q.answerIndex === "number" ? q.answerIndex : 0;

      return {
        question: q.question || `Question ${idx + 1}`,
        options,
        answer: options[answerIndex] || answer,
        answerIndex,
        difficulty: q.difficulty || "medium",
        explanation: q.explanation || "",
        topicId: q.topicId,
        topicName: q.topicName,
      };
    });

    const normalizedQuestions = QuizOrchestrator.attachQuestionMetadata(
      rawQuestions,
      allocations[0]?.topicId,
      allocations[0]?.name
    );

    return NextResponse.json({
      engineId,
      quizMode: mode === "multiple" ? "custom_multiple" : "custom_single",
      topics: allocations,
      title: draft.title || combinedTopicTitle,
      topic: combinedTopicTitle,
      hook: draft.hook || `Can you score ${totalQuestions}/${totalQuestions} on this quiz?`,
      description: draft.description || `Test your knowledge on ${combinedTopicTitle}!`,
      hashtags: draft.hashtags || ["#shorts", "#quiz", "#trivia"],
      questions: normalizedQuestions,
      renderProfile: "FAST_QUIZ",
      durationSeconds,
    });
  } catch (err: any) {
    console.error("[Quiz Draft API Error]:", err.message);
    return NextResponse.json(
      { error: err.message || "Failed to generate quiz draft." },
      { status: 500 }
    );
  }
}
