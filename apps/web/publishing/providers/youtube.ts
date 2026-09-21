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

    // ── Phase 3: Stream Media from CAS or Local Storage ───────────────────────
    let mediaStream: NodeJS.ReadableStream | null = null;
    let tempLocalPath: string | null = null;

    try {
      if (payload.casStreamProvider) {
        mediaStream = payload.casStreamProvider();
      } else if (payload.videoArtifactHash || auth.artifactSha256) {
        const hash = payload.videoArtifactHash || auth.artifactSha256;
        const cas = ContentAddressedStore.getInstance();
        const ref = cas.getByHash(hash);
        if (ref && fs.existsSync(ref.uri)) {
          mediaStream = fs.createReadStream(ref.uri);
        }
      }

      if (!mediaStream) {
        // Fallback to videoUrl if not in CAS
        if (payload.videoUrl.startsWith("http://") || payload.videoUrl.startsWith("https://")) {
          console.log(`[YouTube] Downloading remote video: ${payload.videoUrl}`);
          const response = await fetch(payload.videoUrl);
          if (!response.ok) throw new Error(`Failed to fetch remote video: ${response.statusText}`);
          const buffer = await response.arrayBuffer();
          const tempDir = os.tmpdir();
          tempLocalPath = path.join(tempDir, `yt_upload_${payload.jobId}_${Date.now()}.mp4`);
          fs.writeFileSync(tempLocalPath, Buffer.from(buffer));
          mediaStream = fs.createReadStream(tempLocalPath);
        } else if (fs.existsSync(payload.videoUrl)) {
          mediaStream = fs.createReadStream(payload.videoUrl);
        } else {
          throw new Error(`Cannot locate physical media stream for videoUrl: ${payload.videoUrl}`);
        }
      }

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
            // Already uploaded! Parse response
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
            title: canonicalParams.title.slice(0, 100),
            description: canonicalParams.description || "Generated by ShortForge / FactoryOS",
            tags: canonicalParams.tags ? [...canonicalParams.tags] : ["shorts", "shortforge"],
            categoryId: "22", // People & Blogs
          },
          status: {
            privacyStatus: canonicalParams.privacyStatus,
            selfDeclaredMadeForKids: canonicalParams.selfDeclaredMadeForKids,
            publishAt: canonicalParams.publishAt || undefined,
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
    } finally {
      if (tempLocalPath && fs.existsSync(tempLocalPath)) {
        try {
          fs.unlinkSync(tempLocalPath);
        } catch {}
      }
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
