/**
 * TikTok / Instagram / X / Facebook Publishing Provider Stubs
 *
 * Each platform follows the same PublishingProvider interface.
 * Real implementations are wired in when API credentials are available.
 *
 * Env vars needed per platform (add to .env):
 *   TIKTOK_ACCESS_TOKEN, TIKTOK_OPEN_ID
 *   INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
 *   FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_PAGE_ID
 */

import type { PublishingProvider, PublishPayload, PublishResult, PlatformHealth } from "../publishing-provider";

import { PublicationAuthorizationService } from "../authorization/PublicationAuthorizationService";

// ─────────────────────────────────────────────────────────────────────────────
// Shared platform provider factory (Fail-Closed, Zero Fake Success)
// ─────────────────────────────────────────────────────────────────────────────

function createStubProvider(
  id: string,
  name: string,
  envKey: string,
  supportsUpload = true
): PublishingProvider {
  return {
    id,
    name,
    async publish(payload: PublishPayload): Promise<PublishResult> {
      // 1. Mandatory Invariant: Authorization capability required
      const auth = payload.authorization;
      if (!auth) {
        throw new Error(
          `[${name}] Invariant Violation: NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION. ` +
          `PublishPayload is missing an authorized ReleaseAuthorization capability.`
        );
      }

      // 2. Strict Credential Check: Never return fake success
      const isAuthConfigured = !!process.env[envKey];
      if (!isAuthConfigured) {
        return {
          platform: id,
          success: false,
          publishedAt: new Date().toISOString(),
          error: `AUTH_NOT_CONFIGURED: ${envKey} missing from environment. Production publishing requires authentic credentials.`,
        };
      }

      // 3. JIT Revalidation
      const authService = PublicationAuthorizationService.getInstance();
      const canonicalParams = {
        jobId: payload.jobId,
        title: payload.title,
        description: payload.description,
        tags: payload.tags,
        privacyStatus: payload.privacyStatus || (auth.scope.allowedPrivacy as any) || "unlisted",
        publishAt: payload.publishAt || auth.scope.publishAt,
        containsSyntheticMedia: payload.containsSyntheticMedia ?? auth.scope.containsSyntheticMedia,
        selfDeclaredMadeForKids: payload.selfDeclaredMadeForKids ?? auth.scope.selfDeclaredMadeForKids,
        channelId: payload.channelId || auth.targetChannelId,
        platform: id,
      };

      const jitCheck = authService.revalidateImmediatelyBeforePublish(auth, canonicalParams, {
        uploadSessionUri: payload.uploadSessionUri,
      });

      if (!jitCheck.valid) {
        throw new Error(`[${name}] JIT Authorization Revalidation Failed (${jitCheck.code}): ${jitCheck.error}`);
      }

      // In production with credentials: real integration call
      return {
        platform: id,
        success: false,
        publishedAt: new Date().toISOString(),
        error: `PLATFORM_ADAPTER_PENDING: Real ${name} production API integration pending qualification.`,
      };
    },
    async health(): Promise<boolean> {
      return !!process.env[envKey];
    },
    async healthCheck(): Promise<PlatformHealth> {
      const authOk = !!process.env[envKey];
      return {
        platform: id,
        state: authOk ? "ONLINE" : "AUTH_FAILED",
        reachable: true,
        authOk,
        checkedAt: new Date().toISOString(),
        error: authOk ? undefined : `${envKey} not set`,
      };
    },
    supportsDirectUpload: () => supportsUpload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Providers
// ─────────────────────────────────────────────────────────────────────────────

export const TikTokProvider = createStubProvider(
  "tiktok",
  "TikTok",
  "TIKTOK_ACCESS_TOKEN",
  true
);

export const InstagramProvider = createStubProvider(
  "instagram",
  "Instagram",
  "INSTAGRAM_ACCESS_TOKEN",
  true
);

export const XProvider = createStubProvider(
  "x",
  "X (Twitter)",
  "X_API_KEY",
  false  // X API v2 does not support direct video upload without media endpoint
);

export const FacebookProvider = createStubProvider(
  "facebook",
  "Facebook",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  true
);
