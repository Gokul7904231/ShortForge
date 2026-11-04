/**
 * VisualBrief — Typed Shot Planning & Visual Intent Contract for ShortForge Visual Director
 * 
 * Defines the precise visual, spatial, and editorial specifications for a scene.
 * Translates narrative storybeats into actionable multi-route media search queries,
 * safe-area geometry (avoiding YouTube Shorts UI hazard zones), and continuity tokens.
 */

export type ShotType =
  | "extreme_close_up"
  | "close_up"
  | "medium_shot"
  | "wide_establishing"
  | "graphic_card"
  | "countdown_card"
  | "split_screen";

export type CameraMotion =
  | "static"
  | "slow_zoom_in"
  | "slow_zoom_out"
  | "pan_left"
  | "pan_right"
  | "punch_in";

export interface TextSafeRegion {
  /** X offset in 1080x1920 canvas pixels */
  x: number;
  /** Y offset in 1080x1920 canvas pixels */
  y: number;
  /** Available width in pixels */
  width: number;
  /** Available height in pixels */
  height: number;
  /** Explanation of platform hazard zones avoided (e.g. top header, right action pill, bottom caption) */
  hazardAvoidance: string;
}

export interface MultiRouteSearchQueries {
  primaryQuery: string;
  fallbackQuery: string;
  semanticEmbeddingPrompt: string;
  categoryRoutes: string[];
}

export interface VisualBrief {
  id: string;
  storybeatId: string;
  shotType: ShotType;
  focalSubject: string;
  actionOrMotion: CameraMotion;
  contextEraOrLocation?: string;
  requiredEvidence?: string[];
  exclusionConstraints?: string[];
  textSafeRegion: TextSafeRegion;
  searchQueries: MultiRouteSearchQueries;
  continuityGroupId: string;
  compositionTokens: {
    palettePreset: string;
    accentColorRgb?: [number, number, number];
    contrastRequirement: "WCAG_AA" | "WCAG_AAA";
  };
}

/**
 * Standard 9:16 vertical safe area for YouTube Shorts / TikTok / Reels:
 * Total canvas: 1080x1920
 * Top hazard (channel title, system header): 0 - 240px
 * Bottom hazard (captions, audio title, description): 1560 - 1920px
 * Right hazard (like, comment, share, bookmark pills): 940 - 1080px
 * Safe content bounding box: X=80, Y=260, Width=860, Height=1280
 */
export const DEFAULT_SHORTS_SAFE_REGION: TextSafeRegion = {
  x: 80,
  y: 260,
  width: 860,
  height: 1280,
  hazardAvoidance: "Evades top header (240px), right action column (140px), and bottom caption strip (360px)",
};

export function createVisualBrief(params: {
  id: string;
  storybeatId: string;
  focalSubject: string;
  shotType?: ShotType;
  actionOrMotion?: CameraMotion;
  primaryQuery: string;
  fallbackQuery?: string;
  categoryRoutes?: string[];
  safeRegion?: TextSafeRegion;
  continuityGroupId?: string;
  accentColorRgb?: [number, number, number];
}): VisualBrief {
  return {
    id: params.id,
    storybeatId: params.storybeatId,
    shotType: params.shotType || "medium_shot",
    focalSubject: params.focalSubject,
    actionOrMotion: params.actionOrMotion || "static",
    searchQueries: {
      primaryQuery: params.primaryQuery,
      fallbackQuery: params.fallbackQuery || params.primaryQuery,
      semanticEmbeddingPrompt: `High quality cinematic vertical photography of ${params.focalSubject}`,
      categoryRoutes: params.categoryRoutes || ["general"],
    },
    textSafeRegion: params.safeRegion || DEFAULT_SHORTS_SAFE_REGION,
    continuityGroupId: params.continuityGroupId || "default",
    compositionTokens: {
      palettePreset: "cinematic_dark_glass",
      accentColorRgb: params.accentColorRgb || [6, 182, 212],
      contrastRequirement: "WCAG_AAA",
    },
  };
}

