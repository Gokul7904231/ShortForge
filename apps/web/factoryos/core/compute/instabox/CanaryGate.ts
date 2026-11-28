import crypto from "node:crypto";
import type { InstaBoxWorkerNodeId } from "./InstaBoxContracts";
import type { InstaBoxFleetRegistry } from "./InstaBoxFleetRegistry";

export const FLEET_GOLDEN_CANARY_INTENT = {
  schemaVersion: "1.0",
  project_id: "canary_golden_1080x1920_30fps",
  output: {
    width: 1080,
    height: 1920,
    fps: 30,
    duration_seconds: 2,
    video_codec: "libx264",
    audio_codec: "aac",
  },
  scenes: [
    {
      scene_id: "canary_scene_01",
      template_id: "facts.rapid-facts.v1",
      narration_text: "ShortForge Golden Canary",
      duration_seconds: 2,
    },
  ],
} as const;

export const FLEET_GOLDEN_CANARY_SHA256: string =
  process.env.INSTABOX_CANARY_GOLDEN_SHA256 ||
  crypto
    .createHash("sha256")
    .update(JSON.stringify(FLEET_GOLDEN_CANARY_INTENT))
    .digest("hex");

export type FleetCanaryStatus = "HEALTHY" | "DRAINED" | "UNVERIFIED";

export interface FleetCanaryResult {
  nodeId: InstaBoxWorkerNodeId;
  healthy: boolean;
  shouldDrain: boolean;
  status: FleetCanaryStatus;
  isDraining: boolean;
  observedSha256: string | null;
  expectedSha256: string;
}

export function reportUnverifiedCanary(
  registry: InstaBoxFleetRegistry,
  nodeId: InstaBoxWorkerNodeId,
  expectedSha256: string = FLEET_GOLDEN_CANARY_SHA256,
): FleetCanaryResult {
  const record = registry.getNodeRecord(nodeId);
  return {
    nodeId,
    healthy: false,
    shouldDrain: false,
    status: "UNVERIFIED",
    isDraining: Boolean(record?.isDraining),
    observedSha256: null,
    expectedSha256,
  };
}

export function evaluateFleetCanary(
  registry: InstaBoxFleetRegistry,
  nodeId: InstaBoxWorkerNodeId,
  observedSha256: string | undefined | null,
  expectedSha256: string = FLEET_GOLDEN_CANARY_SHA256,
): FleetCanaryResult {
  if (!observedSha256 || !observedSha256.trim()) {
    return reportUnverifiedCanary(registry, nodeId, expectedSha256);
  }
  const match = observedSha256.trim().toLowerCase() === expectedSha256.trim().toLowerCase();
  if (!match) {
    registry.setNodeDraining(nodeId, true);
  }
  const record = registry.getNodeRecord(nodeId);
  return {
    nodeId,
    healthy: match,
    shouldDrain: !match,
    status: match ? "HEALTHY" : "DRAINED",
    isDraining: Boolean(record?.isDraining),
    observedSha256,
    expectedSha256,
  };
}
