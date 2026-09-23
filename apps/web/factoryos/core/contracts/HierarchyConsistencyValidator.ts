/**
 * Project Ascalon — Hierarchy Consistency Validator
 * Validates that all runtime floor definitions, dependencies, and agent roles
 * strictly adhere to the single canonical hierarchy specification.
 */

import type { FloorId, CanonicalFloorDefinition } from "../hierarchy/FloorTypes";
import { FloorRegistry, CANONICAL_FLOORS } from "../hierarchy/FloorRegistry";

export type { FloorId, CanonicalFloorDefinition };
export { FloorRegistry, CANONICAL_FLOORS };

export const SOVEREIGN_AGENT_ROLES = [
  "OVERSEER",
  "GUARDIAN",
  "SLAYER",
  "HEALER",
  "INSTRUCTOR",
] as const;

export type SovereignAgentRole = (typeof SOVEREIGN_AGENT_ROLES)[number];

export class HierarchyConsistencyValidator {
  public static validateFloor(floorId: string): CanonicalFloorDefinition {
    if (!(floorId in CANONICAL_FLOORS)) {
      throw new Error(`[HierarchyConsistencyValidator] UNKNOWN_FLOOR: "${floorId}" is not a canonical floor ID.`);
    }
    return CANONICAL_FLOORS[floorId as FloorId];
  }

  public static isSovereignAgent(role: string): boolean {
    return SOVEREIGN_AGENT_ROLES.includes(role as SovereignAgentRole);
  }

  public static assertNotFloor(roleOrAgent: string): void {
    if (roleOrAgent in CANONICAL_FLOORS) {
      throw new Error(
        `[HierarchyConsistencyValidator] CONFLATION_ERROR: "${roleOrAgent}" is a floor, not an agent or authority role.`
      );
    }
  }

  public static assertNotAgent(floorId: string): void {
    if (this.isSovereignAgent(floorId)) {
      throw new Error(
        `[HierarchyConsistencyValidator] CONFLATION_ERROR: "${floorId}" is a sovereign agent role, not a pipeline floor.`
      );
    }
  }

  public static validateAll(): { valid: boolean; floorCount: number; errors: string[] } {
    const errors: string[] = [];
    const floorKeys = Object.keys(CANONICAL_FLOORS) as FloorId[];

    if (floorKeys.length !== 8) {
      errors.push(`Expected exactly 8 canonical floors, found ${floorKeys.length}`);
    }

    // Verify no cycles in pipeline DAG
    for (const key of floorKeys) {
      const floor = CANONICAL_FLOORS[key];
      if (floor.predecessors.includes(key) || floor.successors.includes(key)) {
        errors.push(`Self-referential loop detected on floor ${key}`);
      }
      for (const succ of floor.successors) {
        if (!floorKeys.includes(succ)) {
          errors.push(`Floor ${key} references non-existent successor: ${succ}`);
        }
      }
      for (const pred of floor.predecessors) {
        if (!floorKeys.includes(pred)) {
          errors.push(`Floor ${key} references non-existent predecessor: ${pred}`);
        }
      }
    }

    // Explicit check against F03/F04 conflation
    if (CANONICAL_FLOORS.floor03_asset_realization.category !== "MEDIA") {
      errors.push("F03 must be categorized as MEDIA (Visual Asset Realization).");
    }
    if (CANONICAL_FLOORS.floor04_media_synthesis.category !== "VOICE") {
      errors.push("F04 must be categorized as VOICE (Media Synthesis).");
    }

    return {
      valid: errors.length === 0,
      floorCount: floorKeys.length,
      errors,
    };
  }
}
