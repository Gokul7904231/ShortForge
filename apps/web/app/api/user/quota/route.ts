import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { TreasuryQuotaAdmission } from "@/factoryos/core/treasury/TreasuryQuotaAdmission";

export async function GET(request: NextRequest) {
  try {
    const { user } = await verifySession(request);
    const quota = await new TreasuryQuotaAdmission(
      await getTreasuryRuntime(),
    ).getGenerationQuota(user.uid, user.role);

    return NextResponse.json({
      success: true,
      quota,
    });
  } catch (err: any) {
    const status = err.status || (err.message?.includes("Unauthorized") ? 401 : 500);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to retrieve quota",
      },
      { status }
    );
  }
}
