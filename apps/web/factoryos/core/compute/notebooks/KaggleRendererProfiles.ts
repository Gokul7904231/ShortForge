export type KaggleWanRendererProfile =
  | "PROOF"
  | "WAN_T2V_1_3B"
  | "WAN_DUAL_T4_14B";

export interface KaggleWanRendererConfig {
  profile: KaggleWanRendererProfile;
  renderer: "shortforge-deterministic" | "wan2.1";
  modelId?: string;
  requireDualT4: boolean;
  nativeWidth: number;
  nativeHeight: number;
  fps: number;
  numFrames: number;
  numInferenceSteps: number;
  guidanceScale: number;
}

/**
 * Wan-oriented Kaggle profiles. The 14B path is explicitly dual-T4 gated;
 * the 1.3B path is the lower-risk model-backed smoke.
 *
 * The public Wan references use model-profile switching plus FFmpeg packaging.
 * The actual live feasibility of 14B on Kaggle T4x2 remains a provider-run gate.
 */
export const KAGGLE_WAN_RENDER_PROFILES: Record<
  KaggleWanRendererProfile,
  KaggleWanRendererConfig
> = {
  PROOF: {
    profile: "PROOF",
    renderer: "shortforge-deterministic",
    requireDualT4: true,
    nativeWidth: 480,
    nativeHeight: 832,
    fps: 16,
    numFrames: 21,
    numInferenceSteps: 1,
    guidanceScale: 1,
  },
  WAN_T2V_1_3B: {
    profile: "WAN_T2V_1_3B",
    renderer: "wan2.1",
    modelId: "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
    requireDualT4: false,
    nativeWidth: 480,
    nativeHeight: 832,
    fps: 16,
    numFrames: 21,
    numInferenceSteps: 12,
    guidanceScale: 5,
  },
  WAN_DUAL_T4_14B: {
    profile: "WAN_DUAL_T4_14B",
    renderer: "wan2.1",
    modelId: "Wan-AI/Wan2.1-T2V-14B-Diffusers",
    requireDualT4: true,
    nativeWidth: 480,
    nativeHeight: 832,
    fps: 16,
    numFrames: 21,
    numInferenceSteps: 12,
    guidanceScale: 5,
  },
};

export function getKaggleWanRendererProfile(
  profile: string | undefined,
): KaggleWanRendererConfig {
  const key =
    profile && profile in KAGGLE_WAN_RENDER_PROFILES
      ? (profile as KaggleWanRendererProfile)
      : "PROOF";

  return KAGGLE_WAN_RENDER_PROFILES[key];
}
