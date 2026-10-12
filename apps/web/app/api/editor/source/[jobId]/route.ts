import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

import { verifyAuthAndRole, verifyWritePermission } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { db } from "@/lib/firebase-admin";
import { getInMemoryJobs, readJobManifest } from "@/lib/jobs-history";
import { ArtifactResolver } from "@/factoryos/core/rendering/ArtifactResolver";
import { ContentAddressedStore } from "@/factoryos/core/compute/cas/ContentAddressedStore";
import {
  millisecondsToMediaTime,
  validateCompositionIR,
  type CompositionIR,
} from "@/factoryos/core/timeline/CompositionIR";
import { VerificationEngine } from "@/factoryos/core/verification/VerificationEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function failedSourceResponse(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message, code: "EDITOR_SOURCE_UNAVAILABLE" },
    { status },
  );
}

/**
 * Imports a completed Short into the native editor.
 *
 * Existing generation manifests do not yet persist the complete CompositionIR plus
 * all resolved scene/audio assets. Until that source package is present, this route
 * deliberately creates a one-video/one-audio flattened composition. It never
 * fabricates scene boundaries from an MP4.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  let temporarySourcePath: string | undefined;
  try {
    const user = await verifyAuthAndRole(request, "USER");
    verifyWritePermission(user);
    const { jobId } = await params;
    if (!jobId || !/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
      return failedSourceResponse("Invalid video job identifier.", 400);
    }

    const job = await readJobManifest(jobId);
    if (!job || !job.userId) {
      // Use 404 for missing/orphaned/foreign jobs to avoid confirming other users' IDs.
      return failedSourceResponse("Completed video was not found.", 404);
    }
    if (job.userId !== user.uid && !isAdminUser(user.role)) {
      return failedSourceResponse("Completed video was not found.", 404);
    }
    if (job.status !== "completed") {
      return failedSourceResponse("Only completed renders can be opened in the editor.", 409);
    }

    const resolver = new ArtifactResolver();
    const sourceCandidates = [
      typeof job.localVideoPath === "string" ? job.localVideoPath : undefined,
      path.join(process.cwd(), "data", "renders", jobId + ".mp4"),
    ].filter((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));

    let sourcePath = "";
    let sourceIsTemporary = false;
    const sourceErrors: string[] = [];

    for (const candidate of sourceCandidates) {
      try {
        const resolved = await resolver.resolve({
          artifactId: "editor-source-" + jobId,
          jobId,
          location: { kind: "LOCAL", path: candidate },
          mimeType: "video/mp4",
          sha256: typeof job.artifactSha256 === "string" ? job.artifactSha256 : undefined,
        });
        sourcePath = resolved.localPath;
        sourceIsTemporary = resolved.isTempDownload;
        if (sourceIsTemporary) temporarySourcePath = resolved.localPath;
        break;
      } catch (error) {
        sourceErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (!sourcePath) {
      const remoteUrl = typeof job.videoUrl === "string" ? job.videoUrl : "";
      // Do not fetch relative app routes or Drive's HTML viewer as though they were MP4 bytes.
      if (/^https:\/\/\S+$/i.test(remoteUrl)) {
        try {
          const resolved = await resolver.resolve({
            artifactId: "editor-source-" + jobId,
            jobId,
            location: { kind: "REMOTE", uri: remoteUrl, provider: "REMOTE_WORKER" },
            mimeType: "video/mp4",
            sha256: typeof job.artifactSha256 === "string" ? job.artifactSha256 : undefined,
          });
          sourcePath = resolved.localPath;
          sourceIsTemporary = resolved.isTempDownload;
          if (sourceIsTemporary) temporarySourcePath = resolved.localPath;
        } catch (error) {
          sourceErrors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (!sourcePath) {
      return failedSourceResponse(
        ("The source MP4 could not be resolved safely. " + sourceErrors.slice(0, 2).join(" ")).trim(),
        422,
      );
    }

    const sourceStat = fs.statSync(sourcePath);
    if (sourceStat.size > ArtifactResolver.MAX_DOWNLOAD_BYTES) {
      return failedSourceResponse("Source MP4 exceeds the editor import size limit of 250 MB.", 413);
    }

    const measurements = await VerificationEngine.probeMediaFile(sourcePath);
    const sourceIsValid =
      measurements.fileExists &&
      measurements.byteLength > 0 &&
      measurements.hasFtypBox &&
      measurements.decodeSmokePassed &&
      measurements.width === 1080 &&
      measurements.height === 1920 &&
      (measurements.videoCodec === "h264" || measurements.videoCodec === "hevc") &&
      (measurements.audioCodec === "aac" || measurements.audioCodec === "mp3") &&
      measurements.syncDriftMs <= 1000 &&
      measurements.videoDuration >= 1 &&
      measurements.videoDuration <= 180;

    if (!sourceIsValid) {
      return failedSourceResponse(
        "The source failed physical MP4 validation. Expected a decodable 1080x1920 video with audio and a duration between 1 and 180 seconds.",
        422,
      );
    }

    const cas = ContentAddressedStore.getInstance();
    const sourceArtifact = await cas.putFile(sourcePath, "editor_source_mp4", "video/mp4", {
      jobId,
      sourceKind: "FLATTENED_MP4_IMPORT",
      originalArtifactSha256: typeof job.artifactSha256 === "string" ? job.artifactSha256 : undefined,
      importedBy: user.uid,
    });

    const editorSource = {
      sha256: sourceArtifact.sha256,
      artifactId: sourceArtifact.artifactId,
      byteLength: sourceArtifact.byteLength,
      sourceKind: "FLATTENED_MP4" as const,
      ownerId: job.userId,
      importedAt: new Date().toISOString(),
    };
    // Persist ownership with the job record; the CAS directory index is reconstructable
    // and must not be treated as the durable authorization database.
    if (db) {
      await db.collection("videos").doc(jobId).set({ editorSource }, { merge: true });
    }
    const inMemoryJobs = getInMemoryJobs();
    const inMemoryJob = inMemoryJobs.get(jobId);
    if (inMemoryJob) inMemoryJobs.set(jobId, { ...inMemoryJob, editorSource });

    if (sourceIsTemporary && temporarySourcePath && fs.existsSync(temporarySourcePath)) {
      try {
        fs.unlinkSync(temporarySourcePath);
      } catch {
        // Best-effort cleanup; CAS already owns a verified copy.
      }
      temporarySourcePath = undefined;
    }

    const durationMs = Math.round(measurements.videoDuration * 1000);
    const duration = millisecondsToMediaTime(durationMs);
    const fps = Math.max(1, Math.min(120, Math.round(measurements.fps || 30)));
    const compositionId = "sf-" + jobId.slice(0, 48) + "-" + sourceArtifact.sha256.slice(0, 12);

    const composition: CompositionIR = {
      compositionId,
      schemaVersion: "2.0.0",
      canvas: {
        width: measurements.width,
        height: measurements.height,
        frameRate: { numerator: fps, denominator: 1 },
        duration,
        background: { kind: "SOLID", value: "#000000" },
      },
      tracks: [
        {
          id: "track-original-video",
          kind: "VIDEO",
          zIndex: 0,
          clips: [
            {
              id: "clip-original-short",
              kind: "VIDEO",
              assetId: sourceArtifact.artifactId,
              src: "cas://" + sourceArtifact.sha256,
              start: 0,
              duration,
              sourceIn: 0,
              sourceDuration: duration,
              zIndex: 0,
              metadata: {
                label: "Original Short (flattened source)",
                sourceJobId: jobId,
                editingGranularity: "CLIP_LEVEL_ONLY",
              },
            },
          ],
        },
      ],
      audio: [
        {
          id: "audio-original-short",
          kind: "VOICE",
          src: "cas://" + sourceArtifact.sha256,
          start: 0,
          duration,
          volume: 1,
          sourceIn: 0,
          sourceDuration: duration,
          playbackRate: 1,
          metadata: { label: "Original embedded audio", sourceJobId: jobId },
        },
      ],
      captions: [],
      metadata: {
        missionId: typeof job.missionId === "string" ? job.missionId : "job-" + jobId,
        sourceTimelineId: "flattened-import-" + jobId,
        provenanceDigest: sourceArtifact.sha256,
        extensions: {
          ownerId: user.uid,
          sourceJobId: jobId,
          sourceKind: "FLATTENED_MP4",
          sourceAssetSha256: sourceArtifact.sha256,
          editingGranularity: "CLIP_LEVEL_ONLY",
        },
      },
    };

    const validation = validateCompositionIR(composition);
    if (!validation.valid) {
      return failedSourceResponse(
        "Imported composition failed validation: " + validation.errors.join("; "),
        422,
      );
    }

    return NextResponse.json({
      success: true,
      sourceKind: "FLATTENED_MP4",
      sourceNotice:
        "This existing render was imported as one flattened video clip. Clip-level trim, transform, effects, masks, keyframes and transitions are editable. Its original questions, separate scene visuals, captions and narration text were not persisted as independent layers by the current generation flow, so they cannot be reconstructed safely from this MP4.",
      job: {
        jobId,
        title: job.topic || "ShortForge Short",
        contentType: job.contentType,
        durationSeconds: measurements.videoDuration,
        createdAt: job.createdAt,
      },
      videoUrl: "/api/media/video/" + encodeURIComponent(jobId),
      media: {
        width: measurements.width,
        height: measurements.height,
        fps: measurements.fps,
        durationSeconds: measurements.videoDuration,
        byteLength: measurements.byteLength,
        sha256: sourceArtifact.sha256,
      },
      composition,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("FORBIDDEN") ? 403 : message.includes("Unauthorized") || message.includes("Session") ? 401 : 500;
    return failedSourceResponse(message, status);
  } finally {
    if (temporarySourcePath && fs.existsSync(temporarySourcePath)) {
      try {
        fs.unlinkSync(temporarySourcePath);
      } catch {
        // Best-effort cleanup after the source has been imported.
      }
    }
  }
}
