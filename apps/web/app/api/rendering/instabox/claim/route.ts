import { NextRequest, NextResponse } from "next/server";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import {
  isAllowedInstaBoxWorkerNode,
  parseInstaBoxNodeId,
} from "@/factoryos/core/compute/instabox/InstaBoxContracts";

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "factoryos-instabox-claim",
    allowedMethods: ["POST"],
    message: "InstaBox Job Claim API is live.",
  });
}

export async function POST(request: NextRequest) {
  try {
    const registry = InstaBoxFleetRegistry.getInstance();

    const authHeader = request.headers.get("authorization") || "";
    const customHeader = request.headers.get("x-instabox-secret") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || customHeader;

    const body = await request.json().catch(() => ({}));
    const workerId = body.workerId || request.headers.get("x-instabox-worker-id");

    // 1. Authenticate worker
    if (!token || !registry.authenticateWorker(token, workerId)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid InstaBox worker credentials." },
        { status: 401 },
      );
    }
    const parsedNodeId = parseInstaBoxNodeId(workerId || "");

    if (!parsedNodeId || !isAllowedInstaBoxWorkerNode(parsedNodeId)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid or excluded InstaBox workerId: '${workerId}'.`,
        },
        { status: 400 },
      );
    }

    // 2. Perform atomic claim
    const claimResult = registry.claimJob(workerId);
    return NextResponse.json(claimResult);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
