import { NextRequest, NextResponse } from "next/server";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";

export async function POST(request: NextRequest) {
  try {
    const registry = InstaBoxFleetRegistry.getInstance();

    // 1. Authenticate worker
    const authHeader = request.headers.get("authorization") || "";
    const customHeader = request.headers.get("x-instabox-secret") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || customHeader;

    if (!token || !registry.authenticateWorker(token)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid InstaBox worker credentials." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const workerId = body.workerId || request.headers.get("x-instabox-worker-id");
    const executionToken = body.executionToken || request.headers.get("x-execution-token");
    const progressPercent = typeof body.progressPercent === "number" ? body.progressPercent : 0;
    const message = body.message || body.stage;

    if (!workerId || !executionToken) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: workerId and executionToken." },
        { status: 400 },
      );
    }

    const accepted = registry.recordProgress(workerId, executionToken, progressPercent, message);
    if (!accepted) {
      return NextResponse.json(
        { success: false, error: "Progress rejected: invalid or expired execution lease." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      acknowledged: true,
      leaseExtendedUntil: new Date(
        Date.now() + InstaBoxFleetRegistry.DEFAULT_LEASE_DURATION_MS,
      ).toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
