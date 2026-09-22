/**
 * FactoryOS YouTube Monetization Guardian — Platform Observation Contracts
 * First-class runtime contract for observed external platform states.
 */

export interface CopyrightClaimObservation {
  readonly claimPresent: boolean;
  readonly claimedAsset?: string;
  readonly claimant?: string;
  readonly claimPolicy: "BLOCK" | "TRACK" | "MONETIZE" | "UNKNOWN";
  readonly playbackEffect: "BLOCKED" | "PLAYABLE";
  readonly revenueEffect: "CREATOR_ELIGIBLE" | "CLAIMANT_MONETIZED" | "NO_MONETIZATION" | "UNKNOWN";
  readonly platformObservationAt: string;
}

export interface PlatformObservationSnapshot {
  readonly platform: "youtube";
  readonly channelId: string;
  readonly videoId?: string;
  readonly observedAt: string;
  readonly authContext: {
    readonly valid: boolean;
    readonly scopes: readonly string[];
  };
  readonly channelState: {
    readonly strikes: number;
    readonly advancedFeatures: boolean;
    readonly twoStepVerification: boolean;
    readonly hasLinkedAdSense: boolean;
    readonly subscriberCount?: number;
    readonly publicWatchHours?: number;
    readonly shortsViewsLast90Days?: number;
  };
  readonly videoState?: {
    readonly uploadStatus: "uploaded" | "processed" | "rejected" | "deleted" | "unknown";
    readonly privacyStatus: "private" | "unlisted" | "public";
    readonly processingProgress?: number;
  };
  readonly restrictions: readonly string[];
  readonly copyrightClaims: readonly CopyrightClaimObservation[];
  readonly syntheticMediaState?: boolean;
  readonly madeForKidsState?: boolean;
}
