import type { MissionSpecification } from "../../contracts/mission.contract";
import { CANONICAL_THRESHOLDS } from "../../config/thresholds";

export const GOLDEN_SHORT_001: MissionSpecification = {
  id: "golden-short-001",
  name: "Golden Fact Short: Mariana Trench Mysteries",
  goal: {
    description: "Create a verified 9:16 factual short video from the supplied topic",
    topic: "Top 3 Secrets of Deep Ocean Trenches",
    targetAudience: "Science & Nature Enthusiasts",
    style: "cinematic-documentary",
    durationSeconds: 3,
  },
  requiredStages: [
    "floor00_analyst",
    "floor01_strategy",
    "floor02_scripting",
    "floor03_asset_realization",
    "floor04_media_synthesis",
    "floor05_timeline_composition",
    "floor06_rendering",
    "floor07_compliance",
  ],
  optionalStages: [],
  dependencyConstraints: [
    { predecessor: "floor00_analyst", successor: "floor01_strategy" },
    { predecessor: "floor01_strategy", successor: "floor02_scripting" },
    { predecessor: "floor02_scripting", successor: "floor03_asset_realization" },
    { predecessor: "floor03_asset_realization", successor: "floor04_media_synthesis" },
    { predecessor: "floor04_media_synthesis", successor: "floor05_timeline_composition" },
    { predecessor: "floor05_timeline_composition", successor: "floor06_rendering" },
    { predecessor: "floor06_rendering", successor: "floor07_compliance" },
  ],
  forbiddenBehaviors: [
    "mock_artifact_substitution",
    "skip_render_compilation",
    "skip_media_verification",
  ],
  terminalConditions: {
    requiredStatus: "COMPLETED",
    requirePhysicalArtifact: true,
    requireVerificationPass: true,
    requireDeliveryOutbox: true,
  },
  qualityThresholds: CANONICAL_THRESHOLDS,
};
