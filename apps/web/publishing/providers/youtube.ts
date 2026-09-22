/**
 * YouTube Publishing Provider
 *
 * Implements real YouTube video uploads using googleapis client.
 * Authentication: OAuth2 User client credentials via refresh token.
 *
 * MANDATORY ARCHITECTURAL INVARIANTS:
 * 1. NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION
 * 2. Immediately before first remote side effect, perform authorization JIT revalidation.
 * 3. Never fake/simulate production success when credentials are missing.
 * 4. Resumable upload reconciliation before retrying.
 * 5. Stream from ContentAddressedStore (CAS) instead of mutable local disk paths.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { google } from "googleapis";
import type { PublishingProvider, PublishPayload, PublishResult, PlatformHealth } from "../publishing-provider";
import { PublicationAuthorizationService } from "../authorization/PublicationAuthorizationService";
import { ContentAddressedStore } from "../../factoryos/core/compute/cas/ContentAddressedStore";

export class YouTubePublishingProvider implements PublishingProvider {
  readonly id = "youtube";
  readonly name = "YouTube";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    // ── Phase 1: Fail-Closed Authorization Verification ─────────────────────────
    const auth = payload.authorization;
    if (!auth) {
      throw new Error(
        "[YouTube] Invariant Violation: NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION. " +
        "PublishPayload is missing an authorized ReleaseAuthorization capability."
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
      platform: this.id,
    };

    // Scheduling invariant check
    if (canonicalParams.publishAt) {
      const publishTimestamp = new Date(canonicalParams.publishAt).getTime();
      if (isNaN(publishTimestamp)) {
        throw new Error(`[YouTube] Invalid publishAt ISO format: ${canonicalParams.publishAt}`);
      }
      if (publishTimestamp <= Date.now()) {
        throw new Error(`[YouTube] Scheduled publishAt must be in the future: ${canonicalParams.publishAt}`);
      }
      if (canonicalParams.privacyStatus !== "private") {
        throw new Error(
          `[YouTube] Platform Invariant Violation: Scheduled videos (publishAt) must have privacyStatus set to 'private', received '${canonicalParams.privacyStatus}'`
        );
      }
    }

    // Title length constraint: reject instead of silent truncation to maintain payload fidelity
    if (canonicalParams.title.length > 100) {
      throw new Error(
        `[YouTube] Title length (${canonicalParams.title.length}) exceeds YouTube maximum of 100 characters. Silent truncation is forbidden under payload fidelity.`
      );
    }

    // JIT revalidation immediately before first remote publication side effect
    const authService = PublicationAuthorizationService.getInstance();
    const jitCheck = authService.revalidateImmediatelyBeforePublish(auth, canonicalParams, {
      uploadSessionUri: payload.uploadSessionUri,
    });

    if (!jitCheck.valid) {
      throw new Error(
        `[YouTube] JIT ReleaseAuthorization Revalidation Failed (${jitCheck.code}): ${jitCheck.error}`
      );
    }

    // ── Phase 2: Credentials and Authentication Check ──────────────────────────
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    const channelId = payload.channelId || auth.targetChannelId || process.env.YOUTUBE_CHANNEL_ID;

    const hasCredentials = !!clientId && !!clientSecret && !!refreshToken;

    if (!hasCredentials) {
      console.warn("[YouTube] Production credentials not configured. Failing closed (zero simulated success).");
      return {
        platform: this.id,
        success: false,
        publishedAt: new Date().toISOString(),
        error: "AUTH_NOT_CONFIGURED: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN missing from environment.",
      };
    }

    // ── Phase 3: Stream Media Strictly from Immutable CAS ─────────────────────
    let mediaStream: NodeJS.ReadableStream | null = null;

    if (payload.casStreamProvider) {
      mediaStream = payload.casStreamProvider();
    } else {
      const hash = payload.videoArtifactHash || auth.artifactSha256;
      if (!hash) {
        throw new Error("[YouTube] Missing artifact SHA-256 in publication payload and release authorization.");
      }
      const cas = ContentAddressedStore.getInstance();
      const ref = cas.getByHash(hash);
      if (!ref || !ref.uri || !fs.existsSync(ref.uri)) {
        throw new Error(
          `[YouTube] CAS Invariant Violation: Authoritative artifact not found in CAS for SHA-256: ${hash}. ` +
          "Publication directly from unverified mutable URLs or arbitrary disk paths is forbidden."
        );
      }
      mediaStream = fs.createReadStream(ref.uri);
    }

    try {
      // ── Phase 4: Resumable Upload Reconciliation ────────────────────────────
      if (payload.uploadSessionUri) {
        console.log(`[YouTube] Checking existing resumable upload session: ${payload.uploadSessionUri}`);
        try {
          const statusRes = await fetch(payload.uploadSessionUri, {
            method: "PUT",
            headers: {
              "Content-Range": "bytes */*",
            },
          });
          if (statusRes.status === 200 || statusRes.status === 201) {
            // Already uploaded! Parse response to prevent duplicate upload
            const data = await statusRes.json();
            const videoId = data.id;
            if (videoId) {
              authService.consumeAuthorization(auth.authorizationId, payload.uploadSessionUri);
              return {
                platform: this.id,
                success: true,
                postId: videoId,
                postUrl: `https://youtube.com/watch?v=${videoId}`,
                publishedAt: new Date().toISOString(),
              };
            }
          } else if (statusRes.status === 308) {
            const range = statusRes.headers.get("Range");
            console.log(`[YouTube] Resumable upload session active with range: ${range}`);
          }
        } catch (resumableErr: any) {
          console.warn("[YouTube] Resumable session query error:", resumableErr.message);
        }
      }

      // ── Phase 5: Execute Google YouTube Data API v3 Upload ───────────────────
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });

      console.log(`[YouTube] Commencing authorized upload insertion for job ${payload.jobId}...`);

      const insertRes = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: canonicalParams.title,
            description: canonicalParams.description || "",
            tags: canonicalParams.tags ? [...canonicalParams.tags] : [],
            categoryId: "22", // People & Blogs
          },
          status: {
            privacyStatus: canonicalParams.privacyStatus,
            selfDeclaredMadeForKids: canonicalParams.selfDeclaredMadeForKids !== undefined ? Boolean(canonicalParams.selfDeclaredMadeForKids) : undefined,
            publishAt: canonicalParams.publishAt || undefined,
            ...(canonicalParams.containsSyntheticMedia !== undefined ? { containsSyntheticMedia: Boolean(canonicalParams.containsSyntheticMedia) } : {}),
          },
        },
        media: {
          body: mediaStream,
        },
      });

      const videoId = insertRes.data.id;
      if (!videoId) {
        throw new Error("YouTube API upload succeeded but returned no video ID.");
      }

      console.log(`[YouTube] Successfully uploaded video: ${videoId}`);

      // ── Phase 6: Durable Atomic Consumption of Authorization ───────────────
      authService.consumeAuthorization(auth.authorizationId, payload.uploadSessionUri);

      return {
        platform: this.id,
        success: true,
        postId: videoId,
        postUrl: `https://youtube.com/watch?v=${videoId}`,
        publishedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error("[YouTube] API publish failed:", err.message);
      throw err;
    }
  }

  async health(): Promise<boolean> {
    return !!process.env.YOUTUBE_REFRESH_TOKEN;
  }

  async healthCheck(): Promise<PlatformHealth> {
    const authOk = !!process.env.YOUTUBE_REFRESH_TOKEN;
    return {
      platform: this.id,
      state: authOk ? "ONLINE" : "AUTH_FAILED",
      reachable: true,
      authOk,
      checkedAt: new Date().toISOString(),
      error: authOk ? undefined : "YOUTUBE_REFRESH_TOKEN not set",
    };
  }

  supportsDirectUpload(): boolean {
    return true;
  }
}

export const YouTubeProvider = new YouTubePublishingProvider();
