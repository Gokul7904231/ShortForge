/**
 * GET /api/health
 *
 * SRE Health endpoint returning status, latency, uptime, and dependency details.
 */
import { NextResponse } from "next/server";
import { HealthManager } from "../../../lib/health-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await HealthManager.check();
    // 200 means reachable and ready. A reachable but unready process answers 503 so
    // monitors cannot mistake an HTTP ping for a working app.
    return NextResponse.json(
      { success: true, ...report },
      { status: report.ready ? 200 : 503 }
    );
  } catch (err: any) {
    console.error("[/api/health] Check crashed:", err.message);
    return NextResponse.json(
      {
        success: false,
        status: "offline",
        reason: err.message,
        lastCheck: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
