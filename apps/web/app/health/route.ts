import { NextResponse } from "next/server";
import { HealthManager } from "../../lib/health-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await HealthManager.check();
    return NextResponse.json(
      { success: true, ...report },
      { status: report.ready ? 200 : 503 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        status: "offline",
        reason: err?.message || "Health check failed",
        lastCheck: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
