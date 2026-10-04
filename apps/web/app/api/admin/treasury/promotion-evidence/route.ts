import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { isEffectiveAdmin } from "@/lib/auth/roles";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { createTreasuryEconomicReadSource } from "@/factoryos/core/treasury/TreasuryEconomicIntelligence";
import { TreasuryShadowOutcomeAttribution } from "@/factoryos/core/treasury/TreasuryShadowOutcomeAttribution";
import { TreasuryEconomicPromotionGate } from "@/factoryos/core/treasury/TreasuryEconomicPromotionGate";

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
      url.searchParams.get("baselineProviderId") || "";
    const baselineModelId =
      url.searchParams.get("baselineModelId") || undefined;
    const candidateProviderId =
      url.searchParams.get("candidateProviderId") || "";
    const candidateModelId =
      url.searchParams.get("candidateModelId") || undefined;

    if (!baselineProviderId || !candidateProviderId) {
      return NextResponse.json(
        {
          error:
            "baselineProviderId and candidateProviderId are required for promotion evidence.",
        },
        { status: 400 },
      );
    }

    const treasury = await getTreasuryRuntime();
    const source = createTreasuryEconomicReadSource(treasury);
    const attribution = await new TreasuryShadowOutcomeAttribution(
      source,
    ).evaluate({
      accountId,
      workloadType,
      capability,
      baselineProviderId,
      baselineModelId,
      candidateProviderId,
      candidateModelId,
    });

    const minSamples = Math.max(
      5,
      Number(url.searchParams.get("minSamples") || 30),
    );
    const minCostSavingsPct = Math.max(
      0,
      Number(url.searchParams.get("minCostSavingsPct") || 10),
    );
    const minVerificationSuccessRate = Math.min(
      1,
      Math.max(
        0,
        Number(
          url.searchParams.get("minVerificationSuccessRate") || 0.9,
        ),
      ),
    );
    const maxVerificationRegression = Math.max(
      0,
      Number(
        url.searchParams.get("maxVerificationRegression") || 0.02,
      ),
    );
    const maxLatencyRegressionPct = Math.max(
      0,
      Number(
        url.searchParams.get("maxLatencyRegressionPct") || 10,
      ),
    );

    const promotion = new TreasuryEconomicPromotionGate().evaluate(
      attribution,
      {
        minSamples,
        minCostSavingsPct,
        minVerificationSuccessRate,
        maxVerificationRegression,
        maxLatencyRegressionPct,
        minEvidenceQuality: "USABLE",
      },
    );

    return NextResponse.json({
      success: true,
      attribution,
      promotion,
      authority: {
        attribution: "READ_ONLY",
        promotion: "EVIDENCE_ONLY",
        mutation: "NONE",
        admission: "TREASURY_KERNEL",
      },
    });
  } catch (error: any) {
    console.error(
      "[API /api/admin/treasury/promotion-evidence] Error:",
      error,
    );
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to build Treasury promotion evidence.",
      },
      { status: 500 },
    );
  }
}
