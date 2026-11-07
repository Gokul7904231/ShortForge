import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { TreasuryQuotaAdmission } from "@/factoryos/core/treasury/TreasuryQuotaAdmission";

export async function GET(request: NextRequest) {
  try {
    const { user } = await verifySession(request);
    
    try {
      const quota = await new TreasuryQuotaAdmission(
        await getTreasuryRuntime(),
      ).getGenerationQuota(user.uid, user.role);

      return NextResponse.json({
        success: true,
        quota,
      });
    } catch (quotaErr: any) {
      console.warn("[Quota API] Treasury quota admission error, using resilient basic tier fallback:", quotaErr.message);
      const isUnlimited = (user.role || "").toUpperCase() === "ADMIN" || (user.role || "").toUpperCase() === "OWNER";
      return NextResponse.json({
        success: true,
        quota: {
          userId: user.uid,
          tier: isUnlimited ? user.role.toUpperCase() : "BASIC",
          periodType: "LIFETIME",
          limit: isUnlimited ? Infinity : 5,
          completed: 0,
          reserved: 0,
          totalUsed: 0,
          remaining: isUnlimited ? Infinity : 5,
          isUnlimited,
          isExceeded: false,
        },
        resilientFallback: true,
      });
    }
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
