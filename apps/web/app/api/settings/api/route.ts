import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/auth";
import { ApiConfigManager } from "@/lib/api-config/api-config-manager";
import { OverseerCognitivePipeline } from "@/factoryos/core/cognition/OverseerCognitivePipeline";

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuthAndRole(request, "ADMIN");
    const isAdmin = user.role === "OWNER" || user.role === "ADMIN";

    const providers = await ApiConfigManager.getProviders();
    const summary = await ApiConfigManager.getSummary();

    return NextResponse.json({
      success: true,
      isAdmin,
      userRole: user.role,
      summary,
      providers,
    });
  } catch (err: any) {
    console.error("[API /settings/api GET] Error:", err.message);
    const status = err.status || (err.name === "UnauthorizedError" ? 401 : err.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuthAndRole(request, "ADMIN");
    const isAdmin = user.role === "OWNER" || user.role === "ADMIN";

    const body = await request.json();
    const { action, providerId, payload } = body;

    switch (action) {
      case "discover_models": {
        const { endpoint, apiKey, mode, localProviderType } = payload || {};
        const targetEndpoint = endpoint || "https://generativelanguage.googleapis.com";
        const models = await ApiConfigManager.discoverProviderModels(
          providerId || "gemini",
          targetEndpoint,
          apiKey,
          mode,
          localProviderType
        );
        return NextResponse.json({ success: true, models });
      }

      case "save_config":
      case "update_primary": {
        if (!providerId) return NextResponse.json({ success: false, error: "Missing providerId" }, { status: 400 });
        const { apiKey, endpoint, model, maxTokens, localProviderType, enabled, allowCloudFallback } = payload || {};
        await ApiConfigManager.updatePrimaryConfig(providerId, {
          apiKey,
          endpoint,
          model,
          maxTokens: maxTokens ? Number(maxTokens) : undefined,
          localProviderType,
          enabled,
          allowCloudFallback,
        });
        return NextResponse.json({ success: true, message: `Configuration for "${providerId}" saved successfully.` });
      }

      case "test_with_overseer": {
        const pipeline = new OverseerCognitivePipeline();
        const testPrompt = payload?.testPrompt || "How many floors do we have?";
        const result = await pipeline.processUserQuery(testPrompt, {
          userId: user.uid,
          userRole: user.role,
        });
        return NextResponse.json({
          success: true,
          testPrompt,
          intent: result.intent,
          sourceUsed: result.sourceUsed,
          answer: result.answer,
          traces: result.traces,
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Unsupported action: "${action}"` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[API /settings/api POST] Error:", err.message);
    const status = err.status || (err.name === "UnauthorizedError" ? 401 : err.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
