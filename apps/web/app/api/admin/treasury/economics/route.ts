import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { isEffectiveAdmin } from "@/lib/auth/roles";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { TreasuryEconomicIntelligence } from "@/factoryos/core/treasury/TreasuryEconomicIntelligence";

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
    const requestedHours = Number(url.searchParams.get("hours") || "24");
    const hours = Math.min(
      168,
      Math.max(1, Number.isFinite(requestedHours) ? requestedHours : 24),
    );
    const accountId =
      url.searchParams.get("accountId") ||
      process.env.FACTORYOS_TREASURY_ACCOUNT_ID ||
      "factoryos";

    const treasury = await getTreasuryRuntime();
    const intelligence = new TreasuryEconomicIntelligence(treasury);
    const snapshot = await intelligence.analyze(accountId, {
      windowMs: hours * 60 * 60 * 1000,
    });

    return NextResponse.json({
      success: true,
      snapshot,
      authority: {
        recommendations: "ADVISORY_ONLY",
        admission: "TREASURY_KERNEL",
      },
    });
  } catch (error: any) {
    console.error("[API /api/admin/treasury/economics] Error:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to retrieve Treasury economic intelligence.",
      },
      { status: 500 },
    );
  }
}
