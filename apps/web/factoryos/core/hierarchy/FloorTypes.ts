/**
 * FactoryOS v3 — Canonical Floor Hierarchy Types
 * Base definitions, categories, and identifier enumerations for all factory floors.
 */

export type FloorId =
  | "floor00_analyst"
  | "floor01_strategy"
  | "floor02_scripting"
  | "floor03_asset_realization"
  | "floor04_media_synthesis"
  | "floor05_timeline_composition"
  | "floor06_rendering"
  | "floor07_compliance";

export type FloorCategory =
  | "RESEARCH"
  | "PLANNING"
  | "CREATIVE"
  | "MEDIA"
  | "VOICE"
  | "COMPOSITION"
  | "RENDER"
  | "VERIFICATION";

export interface CanonicalFloorDefinition {
  readonly floorId: FloorId;
  readonly number: number;
  readonly canonicalName: string;
  readonly category: FloorCategory;
  readonly requiredAgentType: string;
  readonly predecessors: readonly FloorId[];
  readonly successors: readonly FloorId[];
  readonly isParallelBranch?: boolean;
  readonly convergesInto?: FloorId;
  readonly isFloor: true;
}
