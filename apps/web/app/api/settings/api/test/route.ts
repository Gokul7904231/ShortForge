import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/auth";
import { ApiConfigManager } from "@/lib/api-config/api-config-manager";
import { OverseerCognitivePipeline } from "@/factoryos/core/cognition/OverseerCognitivePipeline";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 🔐 Must be logged in as ADMIN or OWNER
    const user = await verifyAuthAndRole(request, "ADMIN");

    const body = await request.json();
    const { providerId, apiKey: rawKey, baseUrl: overrideUrl, mode, localType, isCognitiveTest } = body;

    if (!providerId) {
      return NextResponse.json({ success: false, error: "Missing required parameter: providerId" }, { status: 400 });
    }

    // 1. Dedicated Overseer Cognitive Engine Test
    if (providerId === "overseer_cognitive" || isCognitiveTest) {
      const pipeline = new OverseerCognitivePipeline();
      const testResult = await pipeline.processUserQuery("How many floors do we have?", {
        userId: user.uid,
        userRole: user.role,
      });

      const latencyMs = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        latencyMs,
        message: `Connected. Replied in ${latencyMs} ms — 'ok'`,
        cognitiveTest: {
          intent: testResult.intent,
          sourceUsed: testResult.sourceUsed,
          answer: testResult.answer,
        },
      });
    }

    // Resolve credentials if raw key not provided
    const resolved = await ApiConfigManager.resolveProvider(providerId);
    const keyToUse = rawKey && rawKey.trim() !== "" ? rawKey.trim() : resolved.apiKey;
    const urlToUse = overrideUrl && overrideUrl.trim() !== "" ? overrideUrl.trim() : resolved.endpoint;
    const isLocal = mode === "local" || resolved.isLocal;

    // 2. Local AI Connection Test (Ollama / LM Studio / vLLM)
    if (isLocal) {
      const pingUrl = (localType === "ollama" || providerId.includes("ollama"))
        ? `${urlToUse.replace(/\/$/, "")}/api/tags` 
        : `${urlToUse.replace(/\/$/, "")}/models`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(pingUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;

        if (res.ok || res.status === 401 || res.status === 404) {
          return NextResponse.json({
            success: true,
            latencyMs,
            message: `Connected. Replied in ${latencyMs} ms — 'ok'`,
          });
        }

        return NextResponse.json({
          success: false,
          error: `Local service returned HTTP ${res.status}`,
        });
      } catch {
        return NextResponse.json({
          success: false,
          error: `Could not reach ${urlToUse}. Ensure the local runtime is running.`,
        });
      }
    }

    // 3. Cloud API Connection Test (Google Gemini, Gemini TTS, Groq, OpenRouter, OpenAI, etc.)
    if (!keyToUse) {
      return NextResponse.json({
        success: false,
        error: "API key is required for cloud provider test.",
      });
    }

    let testUrl = `${urlToUse.replace(/\/$/, "")}/models`;
    let headers: Record<string, string> = {
      "Authorization": `Bearer ${keyToUse}`,
    };

    if (providerId === "gemini" || providerId === "gemini_tts") {
      testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToUse}`;
      headers = {};
    } else if (providerId === "anthropic") {
      testUrl = "https://api.anthropic.com/v1/models";
      headers = { "x-api-key": keyToUse, "anthropic-version": "2023-06-01" };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(testUrl, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        return NextResponse.json({
          success: true,
          latencyMs,
          message: `Connected. Replied in ${latencyMs} ms — 'ok'`,
        });
      }

      const statusText = res.status === 401 ? "Unauthorized (Invalid API Key)" : res.status === 429 ? "Rate Limit Exceeded" : `HTTP ${res.status}`;

      return NextResponse.json({
        success: false,
        latencyMs,
        error: statusText,
      });
    } catch {
      const latencyMs = Date.now() - startTime;
      return NextResponse.json({
        success: false,
        latencyMs,
        error: "Connection timed out or network error.",
      });
    }
  } catch (err: any) {
    console.error("[API /settings/api/test POST] Error:", err.message);
    const status = err.status || err.name === "UnauthorizedError" ? 401 : err.name === "ForbiddenError" ? 403 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
