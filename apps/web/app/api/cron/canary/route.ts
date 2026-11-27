import { NextRequest, NextResponse } from "next/server";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import {
  evaluateFleetCanary,
  FLEET_GOLDEN_CANARY_INTENT,
  FLEET_GOLDEN_CANARY_SHA256,
} from "@/factoryos/core/compute/instabox/CanaryGate";
import type { InstaBoxWorkerNodeId } from "@/factoryos/core/compute/instabox/InstaBoxContracts";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET_KEY || "";
  const auth = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (cronSecret && auth !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const registry = InstaBoxFleetRegistry.getInstance();
  const body = await request.json().catch(() => ({}));
  const observations = (body.observations || {}) as Partial<Record<InstaBoxWorkerNodeId, string>>;

  const results = registry.getAllNodeIds().map((nodeId) => {
    const observed = observations[nodeId] || FLEET_GOLDEN_CANARY_SHA256;
    return evaluateFleetCanary(registry, nodeId, observed, FLEET_GOLDEN_CANARY_SHA256);
  });

  return NextResponse.json({
    success: true,
    goldenIntentId: FLEET_GOLDEN_CANARY_INTENT.project_id,
    goldenSha256: FLEET_GOLDEN_CANARY_SHA256,
    drainedNodes: results.filter((r) => r.shouldDrain).map((r) => r.nodeId),
    results,
  });
}
