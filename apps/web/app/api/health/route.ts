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
    return NextResponse.json({ success: true, buildTag: "cloud-resilient-v3", ...report });
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
