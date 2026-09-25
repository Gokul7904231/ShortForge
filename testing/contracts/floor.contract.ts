export type FloorId =
  | "floor00_analyst"
  | "floor01_strategy"
  | "floor02_scripting"
  | "floor03_asset_realization"
  | "floor04_media_synthesis"
  | "floor05_timeline_composition"
  | "floor06_rendering"
  | "floor07_compliance";

export interface FloorContractExpectation {
  readonly floorId: FloorId;
  readonly name: string;
  readonly expectedInputs: string[];
  readonly expectedOutputs: string[];
  readonly requiredMetadataKeys: string[];
}

export const CANONICAL_FLOOR_CONTRACTS: Record<FloorId, FloorContractExpectation> = {
  floor00_analyst: {
    floorId: "floor00_analyst",
    name: "Floor 00 Analyst (Research)",
    expectedInputs: ["topic"],
    expectedOutputs: ["analystReport", "passport"],
    requiredMetadataKeys: ["reportId", "topic"],
  },
  floor01_strategy: {
    floorId: "floor01_strategy",
    name: "Floor 01 Strategy",
    expectedInputs: ["topic", "analystReport"],
    expectedOutputs: ["strategyPayload"],
    requiredMetadataKeys: ["hookArchetype"],
  },
  floor02_scripting: {
    floorId: "floor02_scripting",
    name: "Floor 02 Cognitive Scripting",
    expectedInputs: ["strategyPayload"],
    expectedOutputs: ["script", "scenes", "scriptIR"],
    requiredMetadataKeys: ["script", "wordCount", "estimatedDurationSeconds", "schemaVersion", "qualityGates"],
  },
  floor03_asset_realization: {
    floorId: "floor03_asset_realization",
    name: "Floor 03 Asset Realization",
    expectedInputs: ["scenes"],
    expectedOutputs: ["assetPayload"],
    requiredMetadataKeys: ["aspectRatio"],
  },
  floor04_media_synthesis: {
    floorId: "floor04_media_synthesis",
    name: "Floor 04 Media Synthesis (Voice)",
    expectedInputs: ["script"],
    expectedOutputs: ["voiceArtifact", "voiceUrl"],
    requiredMetadataKeys: ["sha256", "byteLength", "qualityClass"],
  },
  floor05_timeline_composition: {
    floorId: "floor05_timeline_composition",
    name: "Floor 05 Timeline Composition",
    expectedInputs: ["scenes", "voiceArtifact"],
    expectedOutputs: ["renderIntent"],
    requiredMetadataKeys: ["intentId", "resolution", "durationSeconds"],
  },
  floor06_rendering: {
    floorId: "floor06_rendering",
    name: "Floor 06 Rendering (FFmpeg)",
    expectedInputs: ["renderIntent"],
    expectedOutputs: ["artifact", "videoUrl"],
    requiredMetadataKeys: ["sha256", "byteLength", "width", "height"],
  },
  floor07_compliance: {
    floorId: "floor07_compliance",
    name: "Floor 07 Verification",
    expectedInputs: ["artifact", "script"],
    expectedOutputs: ["verificationReport"],
    requiredMetadataKeys: ["overallScore", "hardGates"],
  },
};
