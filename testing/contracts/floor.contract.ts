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
    expectedInputs: ["floor02Handoff"],
    expectedOutputs: ["assetPlan", "assetPlanIR", "assetManifest"],
    requiredMetadataKeys: [
      "assetPlanId",
      "assetPlanVersion",
      "platform",
      "aspectRatio",
      "resolution",
      "provenance",
      "schemaVersion",
      "planFingerprint",
      "sourceFingerprint",
      "lineage",
    ],
  },
  floor04_media_synthesis: {
    floorId: "floor04_media_synthesis",
    name: "Floor 04 Media Synthesis",
    expectedInputs: ["floor03Handoff"],
    expectedOutputs: ["mediaPackage"],
    requiredMetadataKeys: ["sourceAssetPlanFingerprint", "visualCount", "audioCount", "provenanceHash"],
  },
  floor05_timeline_composition: {
    floorId: "floor05_timeline_composition",
    name: "Floor 05 Timeline Composition",
    expectedInputs: ["floor03Handoff", "floor04Handoff"],
    expectedOutputs: ["timelineSpec", "committedRenderArtifact", "floor05Handoff"],
    requiredMetadataKeys: [
      "timeline_id",
      "timeline_fingerprint",
      "render_input_hash",
      "sha256",
      "byteLength",
      "handoff_version",
    ],
  },
  floor06_rendering: {
    floorId: "floor06_rendering",
    name: "Floor 06 Rendering",
    expectedInputs: ["floor05Handoff"],
    expectedOutputs: ["artifact", "renderMetadata"],
    requiredMetadataKeys: [
      "sha256",
      "byteLength",
      "width",
      "height",
      "timelineFingerprint",
      "renderInputHash",
    ],
  },
  floor07_compliance: {
    floorId: "floor07_compliance",
    name: "Floor 07 Verification",
    expectedInputs: ["artifact", "script"],
    expectedOutputs: ["verificationReport"],
    requiredMetadataKeys: ["overallScore", "hardGates"],
  },
};
