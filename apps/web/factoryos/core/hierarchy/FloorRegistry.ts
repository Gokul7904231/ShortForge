/**
 * FactoryOS v3 — Canonical Floor Registry
 * Single Authoritative Source of Truth for all production floor topology,
 * floor order, and parallel branch relationships.
 */

import type { FloorId, CanonicalFloorDefinition } from "./FloorTypes";

export class FloorRegistry {
  private static readonly CANONICAL_FLOORS: Record<FloorId, CanonicalFloorDefinition> = {
    floor00_analyst: {
      floorId: "floor00_analyst",
      number: 0,
      canonicalName: "Analyst & Research Ingestion",
      category: "RESEARCH",
      requiredAgentType: "FLOOR_ANALYST",
      predecessors: [],
      successors: ["floor01_strategy"],
      isFloor: true,
    },
    floor01_strategy: {
      floorId: "floor01_strategy",
      number: 1,
      canonicalName: "Strategic Direction & Research",
      category: "PLANNING",
      requiredAgentType: "FLOOR_STRATEGY",
      predecessors: ["floor00_analyst"],
      successors: ["floor02_scripting"],
      isFloor: true,
    },
    floor02_scripting: {
      floorId: "floor02_scripting",
      number: 2,
      canonicalName: "Cognitive Scripting & Structure",
      category: "CREATIVE",
      requiredAgentType: "FLOOR_SCRIPTING",
      predecessors: ["floor01_strategy"],
      successors: ["floor03_asset_realization", "floor04_media_synthesis"],
      isFloor: true,
    },
    floor03_asset_realization: {
      floorId: "floor03_asset_realization",
      number: 3,
      canonicalName: "Visual Asset Realization & Blueprints",
      category: "MEDIA",
      requiredAgentType: "FLOOR_ASSET_REALIZATION",
      predecessors: ["floor02_scripting"],
      successors: ["floor05_timeline_composition"],
      isParallelBranch: true,
      convergesInto: "floor05_timeline_composition",
      isFloor: true,
    },
    floor04_media_synthesis: {
      floorId: "floor04_media_synthesis",
      number: 4,
      canonicalName: "Voice & Audio Synthesis",
      category: "VOICE",
      requiredAgentType: "FLOOR_MEDIA_SYNTHESIS",
      predecessors: ["floor02_scripting"],
      successors: ["floor05_timeline_composition"],
      isParallelBranch: true,
      convergesInto: "floor05_timeline_composition",
      isFloor: true,
    },
    floor05_timeline_composition: {
      floorId: "floor05_timeline_composition",
      number: 5,
      canonicalName: "Timeline Composition & Motion",
      category: "COMPOSITION",
      requiredAgentType: "FLOOR_TIMELINE_COMPOSITION",
      predecessors: ["floor03_asset_realization", "floor04_media_synthesis"],
      successors: ["floor06_rendering"],
      isFloor: true,
    },
    floor06_rendering: {
      floorId: "floor06_rendering",
      number: 6,
      canonicalName: "Video GPU Rendering Engine",
      category: "RENDER",
      requiredAgentType: "FLOOR_RENDERING",
      predecessors: ["floor05_timeline_composition"],
      successors: ["floor07_compliance"],
      isFloor: true,
    },
    floor07_compliance: {
      floorId: "floor07_compliance",
      number: 7,
      canonicalName: "QA Gate & Social Compliance",
      category: "VERIFICATION",
      requiredAgentType: "FLOOR_COMPLIANCE",
      predecessors: ["floor06_rendering"],
      successors: [],
      isFloor: true,
    },
  };

  /**
   * Returns all canonical floors in sequential pipeline order.
   */
  public static getAllFloors(): CanonicalFloorDefinition[] {
    return Object.values(this.CANONICAL_FLOORS).sort((a, b) => a.number - b.number);
  }

  /**
   * Returns the canonical floor definition for a given floor ID.
   */
  public static getFloor(floorId: FloorId): CanonicalFloorDefinition {
    const floor = this.CANONICAL_FLOORS[floorId];
    if (!floor) {
      throw new Error(`Unknown floor ID: ${floorId}`);
    }
    return floor;
  }

  /**
   * Verifies if a given ID is a recognized canonical floor.
   */
  public static isCanonicalFloor(id: string): id is FloorId {
    return id in this.CANONICAL_FLOORS;
  }

  /**
   * Returns the count of canonical production floors (strictly 8).
   */
  public static getFloorCount(): number {
    return Object.keys(this.CANONICAL_FLOORS).length;
  }

  /**
   * Returns parallel branch pairs that can execute concurrently.
   */
  public static getParallelBranches(): Array<{
    source: FloorId;
    parallelBranches: [FloorId, FloorId];
    convergesInto: FloorId;
  }> {
    return [
      {
        source: "floor02_scripting",
        parallelBranches: ["floor03_asset_realization", "floor04_media_synthesis"],
        convergesInto: "floor05_timeline_composition",
      },
    ];
  }
}

export const CANONICAL_FLOORS = FloorRegistry.getAllFloors().reduce(
  (acc, f) => {
    acc[f.floorId] = f;
    return acc;
  },
  {} as Record<FloorId, CanonicalFloorDefinition>
);
