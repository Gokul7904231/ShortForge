/**
 * Publishing Provider Interface
 *
 * Every publishing destination (YouTube, Instagram, TikTok, X, Facebook)
 * must implement this interface. Mirrors the StorageProvider pattern.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Publish Payload
// ─────────────────────────────────────────────────────────────────────────────

import type { ReleaseAuthorization } from "../factoryos/core/verification/youtube/contracts/F07ReleaseContracts";

export interface PublishPayload {
  /** Drive, CAS or Cloudinary video URL. */
  videoUrl: string;
  /** Download link (used when platform needs direct file access). */
  downloadLink?: string;
  /** Video title. */
  title: string;
  /** Description / caption. */
  description?: string;
  /** Hashtags / tags. */
  tags?: string[];
  /** Thumbnail URL. */
  thumbnailUrl?: string;
  /** Engine that produced this video. */
  engine?: string;
  /** ShortFactory job ID. */
  jobId: string;
  /** Arbitrary platform-specific overrides. */
  platformOverrides?: Record<string, any>;
  /** F07 Release Authorization capability (MANDATORY for YouTube) */
  authorization?: ReleaseAuthorization;
  /** CAS Artifact SHA-256 for verified content streaming */
  videoArtifactHash?: string;
  /** Resumable upload session URI for network recovery */
  uploadSessionUri?: string;
  /** Target channel ID */
  channelId?: string;
  /** Privacy status */
  privacyStatus?: "private" | "unlisted" | "public";
  /** Scheduled publish timestamp */
  publishAt?: string;
  /** Synthetic AI media disclosure */
  containsSyntheticMedia?: boolean;
  /** Made for kids declaration */
  selfDeclaredMadeForKids?: boolean;
  /** Direct CAS stream provider */
  casStreamProvider?: () => NodeJS.ReadableStream;
}

export interface PublishResult {
  platform: string;
  success: boolean;
  postId?: string;
  postUrl?: string;
  publishedAt: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Health
// ─────────────────────────────────────────────────────────────────────────────

export type PlatformState = "ONLINE" | "OFFLINE" | "AUTH_FAILED" | "RATE_LIMITED";

export interface PlatformHealth {
  platform: string;
  state: PlatformState;
  reachable: boolean;
  authOk: boolean;
  rateLimitRemainingSeconds?: number;
  checkedAt: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishingProvider {
  /** Unique platform ID. e.g. "youtube" | "tiktok" | "instagram" */
  readonly id: string;

  /** Human-readable platform name. */
  readonly name: string;

  /**
   * Publish a video to this platform.
   */
  publish(payload: PublishPayload): Promise<PublishResult>;

  /**
   * Check platform auth, rate limits, and reachability.
   */
  healthCheck(): Promise<PlatformHealth>;

  /**
   * Quick liveness check.
   */
  health(): Promise<boolean>;

  /**
   * Whether this platform supports direct video uploads (vs link-only posts).
   */
  supportsDirectUpload(): boolean;
}
