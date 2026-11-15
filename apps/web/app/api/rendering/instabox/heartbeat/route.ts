import { NextRequest, NextResponse } from "next/server";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import {
  isAllowedInstaBoxWorkerNode,
  parseInstaBoxNodeId,
  type InstaBoxWorkerNodeId,
} from "@/factoryos/core/compute/instabox/InstaBoxContracts";

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "factoryos-instabox-heartbeat",
    allowedMethods: ["POST"],
    message: "InstaBox Fleet Heartbeat API is live.",
  });
}

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
    const parsedNodeId = parseInstaBoxNodeId(workerId || "") || body.nodeId;

    if (!parsedNodeId || !isAllowedInstaBoxWorkerNode(parsedNodeId)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid or excluded InstaBox node: '${parsedNodeId || workerId}'.`,
        },
        { status: 400 },
      );
    }

    // 2. Record heartbeat and live metrics
    const metrics = body.metrics || {
      cpuCores: 4,
      cpuUsagePercent: 0,
      memoryTotalMb: 7980,
      memoryAvailableMb: 7000,
      diskTotalMb: 20480,
      diskAvailableMb: 15000,
      operatingSystem: "Linux",
      activeJobs: 0,
    };

    const res = registry.recordHeartbeat({
      workerId: `instabox-${parsedNodeId}`,
      nodeId: parsedNodeId as InstaBoxWorkerNodeId,
      version: body.version || "1.0.0",
      status: body.status || "HEALTHY",
      metrics,
    });

    return NextResponse.json({
      acknowledged: res.acknowledged,
      serverTime: new Date().toISOString(),
      action: res.action,
      heartbeatIntervalSeconds: 15,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
