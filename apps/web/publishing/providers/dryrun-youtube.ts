/**
 * FactoryOS YouTube Monetization Guardian — DryRun YouTube Publishing Provider
 * Explicit test/dry-run provider that tests full authorization contracts and JIT checks
 * without requiring live Google YouTube Data API OAuth2 production credentials.
 *
 * MANDATORY ARCHITECTURAL INVARIANT:
 * Strictly verifies ReleaseAuthorization capability. Never bypasses authorization.
 */

import type { PublishingProvider, PublishPayload, PublishResult, PlatformHealth } from "../publishing-provider";
import { PublicationAuthorizationService } from "../authorization/PublicationAuthorizationService";

export class DryRunYouTubePublishingProvider implements PublishingProvider {
  readonly id = "youtube-dryrun";
  readonly name = "YouTube (Dry-Run / Test Mode)";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    // Strict Quarantine: Prevent simulated publishing from ever running in production by accident
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIMULATED_PUBLISHING !== "true") {
      throw new Error(
        "[YouTube-DryRun] FATAL: Simulated publishing provider is strictly quarantined in production. " +
        "Set ALLOW_SIMULATED_PUBLISHING=true if performing an explicit staging validation."
      );
    }

    const auth = payload.authorization;
    if (!auth) {
      throw new Error(
        "[YouTube-DryRun] Invariant Violation: NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION. " +
        "Even dry-run uploads must present an authentic ReleaseAuthorization capability."
      );
    }

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
      platform: "youtube",
    };

    // Strict JIT authorization revalidation
    const authService = PublicationAuthorizationService.getInstance();
    const check = authService.revalidateImmediatelyBeforePublish(auth, canonicalParams, {
      uploadSessionUri: payload.uploadSessionUri,
    });

    if (!check.valid) {
      throw new Error(`[YouTube-DryRun] JIT Authorization Revalidation Failed (${check.code}): ${check.error}`);
    }

    // Atomic consumption of authorization
    authService.consumeAuthorization(auth.authorizationId, payload.uploadSessionUri);

    const dryRunVideoId = `dryrun_yt_${payload.jobId}_${Date.now()}`;

    return {
      platform: this.id,
      success: true,
      postId: dryRunVideoId,
      postUrl: `https://youtube.com/watch?v=${dryRunVideoId}`,
      publishedAt: new Date().toISOString(),
      isSimulated: true,
    };
  }

  async health(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<PlatformHealth> {
    return {
      platform: this.id,
      state: "ONLINE",
      reachable: true,
      authOk: true,
      checkedAt: new Date().toISOString(),
    };
  }

  supportsDirectUpload(): boolean {
    return true;
  }
}

export const DryRunYouTubeProvider = new DryRunYouTubePublishingProvider();
