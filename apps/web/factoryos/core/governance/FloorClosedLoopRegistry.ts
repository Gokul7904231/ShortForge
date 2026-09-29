/**
 * Canonical closure map for the eight-floor production pipeline.
 *
 * This is a capability/verification registry, not a second topology authority.
 * FloorRegistry remains the source of truth for topology and ordering.
 */

import { FloorRegistry } from "../hierarchy/FloorRegistry";
import type { FloorLoopType } from "./FloorClosedLoop";

export interface FloorLoopDefinition {
  readonly floorId: string;
  readonly loopType: FloorLoopType;
  readonly runtimeBoundary: string;
  readonly feedbackSignal: string;
  readonly termination: string;
  readonly authorityBoundary: string;
}

export const CANONICAL_FLOOR_LOOPS: readonly FloorLoopDefinition[] = [
  {
    floorId: "floor00_analyst",
    loopType: "BOUNDED_FEEDBACK",
    runtimeBoundary: "ResearchRuntime.executeResearchLoop",
    feedbackSignal: "verified claims + passport confidence",
    termination: "verified threshold / exhausted / no-progress / escalated",
    authorityBoundary: "research evidence only; no execution authority",
  },
  {
    floorId: "floor01_strategy",
    loopType: "COGNITIVE_EXECUTION",
    runtimeBoundary: "Floor01Guardian -> GuardianEngine.run_autonomous_loop",
    feedbackSignal: "domain validation + worker result",
    termination: "completed / failed / escalated / bounded recovery",
    authorityBoundary: "Floor Guardian + ActionGate",
  },
  {
    floorId: "floor02_scripting",
    loopType: "COGNITIVE_EXECUTION",
    runtimeBoundary: "Floor02Guardian -> GuardianEngine.run_autonomous_loop",
    feedbackSignal: "domain validation + worker result",
    termination: "completed / failed / escalated / bounded recovery",
    authorityBoundary: "Floor Guardian + ActionGate",
  },
  {
    floorId: "floor03_asset_realization",
    loopType: "COGNITIVE_EXECUTION",
    runtimeBoundary: "Floor03Guardian -> GuardianEngine.run_autonomous_loop",
    feedbackSignal: "domain validation + worker result",
    termination: "completed / failed / escalated / bounded recovery",
    authorityBoundary: "Floor Guardian + ActionGate",
  },
  {
    floorId: "floor04_media_synthesis",
    loopType: "COGNITIVE_EXECUTION",
    runtimeBoundary: "Floor04Guardian -> GuardianEngine.run_autonomous_loop",
    feedbackSignal: "physical media validation + worker result",
    termination: "completed / failed / escalated / bounded recovery",
    authorityBoundary: "Floor Guardian + bounded provider policy",
  },
  {
    floorId: "floor05_timeline_composition",
    loopType: "COGNITIVE_EXECUTION",
    runtimeBoundary: "Floor05Guardian -> GuardianEngine.run_autonomous_loop",
    feedbackSignal: "TimelineIR + render/reference verification",
    termination: "completed / failed / escalated / bounded recovery",
    authorityBoundary: "Floor Guardian + CAP_TIMELINE_COMPILE",
  },
  {
    floorId: "floor06_rendering",
    loopType: "DETERMINISTIC_OPERATIONAL",
    runtimeBoundary: "RenderFabric -> ComputeRouter -> physical verifier -> reconciliation",
    feedbackSignal: "artifact bytes + media probe + provider execution receipt",
    termination: "verified success / bounded failover / reconciliation / terminal failure",
    authorityBoundary: "Guardian authorization; provider cannot self-certify",
  },
  {
    floorId: "floor07_compliance",
    loopType: "VERIFICATION_REMEDIATION",
    runtimeBoundary: "F07ReleaseGuardian.verifyReleaseLoop",
    feedbackSignal: "independent physical verification + deterministic policy gates",
    termination: "release-ready / bounded remediation exhausted / escalated / no-progress",
    authorityBoundary: "F07 remains independent release truth authority",
  },
] as const;

export function getFloorLoopDefinition(floorId: string): FloorLoopDefinition {
  const canonical = CANONICAL_FLOOR_LOOPS.find((item) => item.floorId === floorId);
  if (!canonical) {
    throw new Error("No closed-loop definition registered for floor " + floorId);
  }
  return canonical;
}

export function validateFloorLoopCoverage(): {
  readonly valid: boolean;
  readonly missingFloorIds: readonly string[];
  readonly duplicateFloorIds: readonly string[];
} {
  const canonicalIds = FloorRegistry.getAllFloors().map((floor) => floor.floorId);
  const registeredIds = CANONICAL_FLOOR_LOOPS.map((item) => item.floorId);
  const counts = new Map<string, number>();

  for (const id of registeredIds) counts.set(id, (counts.get(id) || 0) + 1);

  const duplicateFloorIds = registeredIds.filter((id, index) =>
    (counts.get(id) || 0) > 1 && registeredIds.indexOf(id) === index
  );
  const missingFloorIds = canonicalIds.filter((id) => !registeredIds.includes(id));

  return {
    valid: missingFloorIds.length === 0 && duplicateFloorIds.length === 0 && registeredIds.length === canonicalIds.length,
    missingFloorIds: Object.freeze(missingFloorIds),
    duplicateFloorIds: Object.freeze(duplicateFloorIds),
  };
}
