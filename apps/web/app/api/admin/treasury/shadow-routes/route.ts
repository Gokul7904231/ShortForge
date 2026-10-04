import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { isEffectiveAdmin } from "@/lib/auth/roles";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import {
  createTreasuryEconomicReadSource,
} from "@/factoryos/core/treasury/TreasuryEconomicIntelligence";
import { createTreasuryShadowRouteEvaluator } from "@/factoryos/core/treasury/TreasuryShadowRouteEvaluator";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { user } = await verifySession(req);
    if (!isEffectiveAdmin(user)) {
      return NextResponse.json(
        { error: "Admin or owner credentials required." },
        { status: 403 },
      );
    }

    const url = new URL(req.url);
    const accountId =
      url.searchParams.get("accountId") ||
      process.env.FACTORYOS_TREASURY_ACCOUNT_ID ||
      "factoryos";
    const workloadType =
      url.searchParams.get("workloadType") || "SCRIPT";
    const capability =
      url.searchParams.get("capability") || undefined;
    const baselineProviderId =
      url.searchParams.get("baselineProviderId") || undefined;
    const baselineModelId =
      url.searchParams.get("baselineModelId") || undefined;
    const maxLatencyRaw =
      url.searchParams.get("maxLatencyMs");
    const minSamplesRaw =
      url.searchParams.get("minSamples");
    const requiredQualityRaw =
      url.searchParams.get("requiredVerificationSuccessRate");

    const maxLatencyMs =
      maxLatencyRaw && Number.isFinite(Number(maxLatencyRaw))
        ? Math.max(0, Number(maxLatencyRaw))
        : undefined;
    const minSamples =
      minSamplesRaw && Number.isFinite(Number(minSamplesRaw))
        ? Math.max(1, Math.floor(Number(minSamplesRaw)))
        : 5;
    const requiredVerificationSuccessRate =
      requiredQualityRaw && Number.isFinite(Number(requiredQualityRaw))
        ? Math.min(1, Math.max(0, Number(requiredQualityRaw)))
        : 0.9;

    const treasury = await getTreasuryRuntime();
    const evaluator = createTreasuryShadowRouteEvaluator(
      createTreasuryEconomicReadSource(treasury),
    );

    const evaluation = await evaluator.evaluate({
      accountId,
      workloadType,
      capability,
      baselineProviderId,
      baselineModelId,
      maxLatencyMs,
      minSamples,
      requiredVerificationSuccessRate,
    });

    return NextResponse.json({
      success: true,
      evaluation,
      authority: {
        evaluation: "SHADOW_ONLY",
        admission: "TREASURY_KERNEL",
        execution: "NONE",
      },
    });
  } catch (error: any) {
    console.error(
      "[API /api/admin/treasury/shadow-routes] Error:",
      error,
    );
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to evaluate Treasury shadow routes.",
      },
      { status: 500 },
    );
  }
}
