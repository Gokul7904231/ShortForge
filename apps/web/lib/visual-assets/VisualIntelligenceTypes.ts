export interface SceneIntent {
  topic: string;
  category: string;
  entities: string[];
  emotion: string;
  visualStyle: string;
  complexity: "simple" | "medium" | "complex";
  landmarks?: string[];
  people?: string[];
  countries?: string[];
  logos?: string[];
  maps?: string[];
}

export interface PlannedAssetSpec {
  role: "background" | "foreground" | "overlay" | "icon" | "texture";
  description: string;
  priority: number;
  requiredResolution: { width: number; height: number };
  portraitCompatible: boolean;
}

export interface AssetPlan {
  sceneRole: "hook" | "read" | "reveal" | "outro";
  specs: PlannedAssetSpec[];
}

export interface CandidateAsset {
  id: string; // doc ID or calculated sha256
  storageKey: string;
  path?: string; // local cache path
  sha256: string;
  dhash: string;
  license: string;
  author: string;
  sourceUrl: string;
  originalUrl?: string;
  title?: string;
  description?: string;
  credits?: string;
  attributionRequired: boolean;
  qualityScore: number;
  width: number;
  height: number;
  tags: string[];
  source: "wikimedia" | "openverse" | "ai_fallback" | "pexels" | "pixabay" | "pexafy" | "internal" | "cdn_fallback";
  usageCount: number;
  lastUsed?: string | null;
  /** Provider-specific downstream usage constraints preserved with the candidate. */
  usagePolicy?: {
    attributionRequired: boolean;
    attributionText?: string;
    providerPolicy?: string;
    materialization: "DOWNLOAD_TO_CAS" | "PREVIEW_ONLY";
  };
  dominantColors?: string[];
  // Behavioral retrieval metrics
  retentionRate?: number;
  ctr?: number;
  /** Derived visual lineage when an asset is transformed by a governed provider. */
  derivedFromAssetId?: string;
  derivedFromSha256?: string;
  transformation?: VisualTransformLineage;
}

export interface VisualTransformLineage {
  readonly transformationId: string;
  readonly parentAssetId: string;
  readonly parentSha256: string;
  readonly recipeId: string;
  readonly recipeVersion: string;
  readonly operation: "UPSCALE_2X" | "IMG2IMG_RESTYLE" | "INPAINT" | "OUTPAINT_9_16" | "DETAIL_ENHANCE";
  readonly parametersSha256: string;
  readonly createdAt: string;
}

export interface StyleProfileConfig {
  name: string;
  palette: {
    primary: string;
    secondary: string;
    background: string;
    accent: string;
    text: string;
  };
  blurAmount: number; // in pixels
  overlayOpacity: number; // 0 to 1
  transitionType: "fade" | "slide" | "zoom" | "none";
  cropStrategy: "cover" | "contain" | "entropy";
  fontFamily: string;
  fontSizeLarge: number;
  fontSizeMedium: number;
}

export interface SceneCompositionElement {
  type: "background" | "foreground" | "overlay" | "icon" | "logo" | "text" | "timer";
  layer: number; // Layer order (z-index)
  bounds: {
    x: number; // percent 0-100
    y: number; // percent 0-100
    width: number; // percent 0-100
    height: number; // percent 0-100
  };
  opacity: number;
  anchor: "top-left" | "top-center" | "top-right" | "center" | "bottom-center";
  assetPath?: string;
  content?: string;
}

export interface SceneComposition {
  elements: SceneCompositionElement[];
  safeArea: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  cameraMotion: {
    type: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "none";
    scaleFrom: number;
    scaleTo: number;
    durationSeconds: number;
  };
  transition: {
    in: string; // dynamic transition style name
    out: "fade" | "slide" | "zoom" | "none";
  } | any;
}

export interface SceneVisualGraphNode {
  id: string;
  type: string;
  props: Record<string, any>;
  children?: SceneVisualGraphNode[];
}

export interface SceneVisualGraph {
  root: SceneVisualGraphNode;
}

export interface VisualRecommendation {
  layoutType: "flat" | "composite_split" | "overlay_card" | "thematic_texture";
  textures: string[];
  suggestedIcons: string[];
  foregroundMask?: string;
  ambientEffects: string[];
}

export interface VisualCriticReport {
  backgroundScore: number;
  contrastScore: number;
  subtitleVisibilityScore: number;
  safeAreaScore: number;
  varietyScore: number;
  compositionScore: number;
  brandConsistencyScore: number;
  overallScore: number;
}

export interface SceneVisualPackage {
  jobId: string;
  sceneIndex: number;
  background: {
    path: string;
    sha256: string;
    credits: string;
  };
  composition: SceneComposition;
  style: StyleProfileConfig;
  graph: SceneVisualGraph;
  metadata: {
    intent: SceneIntent;
    plan: AssetPlan;
    recommendation?: VisualRecommendation;
    evaluation?: VisualCriticReport;
    debug: {
      metrics: Record<string, number>;
      rankLogs: Record<string, any>;
    };
  };
}

export interface PipelineHistory {
  recentAssets: string[];
  recentColors: string[];
  recentProviders: string[];
  recentLayouts: string[];
  recentTopics: string[];
  recentTags: string[];
  recentDhashes: string[];
  recentAuthors: string[];
}

export interface PipelineConfig {
  providerPriority: string[];
  styleName: "quiz" | "educational" | "news" | "story" | "travel";
  weights: {
    relevance: number;
    quality: number;
    portrait: number;
    license: number;
    diversity: number;
    usage: number;
    behavioral?: number; // Behavioral retrieval scoring weight
  };
}

export interface VisualTransformPlan {
  enabled: boolean;
  guardianCertificateId?: string;
  steps: Array<{
    recipeId: string;
    operation: "UPSCALE_2X" | "IMG2IMG_RESTYLE" | "INPAINT" | "OUTPAINT_9_16" | "DETAIL_ENHANCE";
    parameters?: Record<string, unknown>;
  }>;
}

import type { TreasuryModelExecutionContext } from "../../ai/provider";

export interface VisualContext {
  jobId: string;
  treasuryModelContext?: TreasuryModelExecutionContext;
  sceneIndex: number;
  sceneText: string;
  topic: string;
  role: "hook" | "read" | "reveal" | "outro";
  intent?: SceneIntent;
  plan?: AssetPlan;
  recommendation?: VisualRecommendation;
  candidates: CandidateAsset[];
  selectedAsset?: CandidateAsset;
  styleConfig?: StyleProfileConfig;
  composition?: SceneComposition;
  visualGraph?: SceneVisualGraph;
  visualPackage?: SceneVisualPackage;
  history: PipelineHistory;
  metrics: Record<string, number>; // Time markers in ms
  config: PipelineConfig;
  /** Optional governed ComfyUI transformation; disabled by default. */
  transformPlan?: VisualTransformPlan;
}
