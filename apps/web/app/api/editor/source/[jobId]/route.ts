import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { verifyAuthAndRole, verifyWritePermission } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { db } from "@/lib/firebase-admin";
import { getInMemoryJobs, readJobManifestAuthoritative, saveJobManifest } from "@/lib/jobs-history";
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
    const user = await verifyAuthAndRole(request, "VIEWER");
    verifyWritePermission(user);
    const { jobId } = await params;
    if (!jobId || !/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
      return failedSourceResponse("Invalid video job identifier.", 400);
    }

    const job = await readJobManifestAuthoritative(jobId);
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
    const casSource = typeof job.artifactSha256 === "string" && /^[a-f0-9]{64}$/i.test(job.artifactSha256)
      ? ContentAddressedStore.getInstance().getByHash(job.artifactSha256.toLowerCase())
      : undefined;
    const sourceCandidates = [
      typeof job.localVideoPath === "string" ? job.localVideoPath : undefined,
      casSource?.uri,
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

    const media = {
      width: measurements.width,
      height: measurements.height,
      fps: measurements.fps,
      durationSeconds: measurements.videoDuration,
      byteLength: measurements.byteLength,
      sha256: sourceArtifact.sha256,
    };
    let packagedComposition: CompositionIR | null = null;
    let packageFallbackReason = "";
    const sourcePackage = job.editorSourcePackage;

    if (sourcePackage) {
      try {
        if (
          sourcePackage.schemaVersion !== "shortforge.editor-source.v1" ||
          sourcePackage.sourceKind !== "COMPOSITION_PACKAGE" ||
          sourcePackage.sourceJobId !== jobId ||
          sourcePackage.ownerId !== job.userId ||
          !/^[a-f0-9]{64}$/i.test(sourcePackage.compositionSha256) ||
          sourcePackage.compositionSha256.toLowerCase() !== sourcePackage.compositionHashSha256.toLowerCase() ||
          !Array.isArray(sourcePackage.sourceAssets) ||
          !Array.isArray(sourcePackage.sourceAssetSha256s)
        ) {
          throw new Error("EDITOR_SOURCE_PACKAGE_BINDING_INVALID");
        }

        const allowedHashes = new Set(sourcePackage.sourceAssetSha256s.map((sha) => sha.toLowerCase()));
        if (allowedHashes.size === 0 || sourcePackage.sourceAssets.some((asset) => !allowedHashes.has(asset.sha256.toLowerCase()))) {
          throw new Error("EDITOR_SOURCE_PACKAGE_ASSET_SET_INVALID");
        }

        // Verify each packaged input against its actual CAS bytes before using the composition.
        for (const asset of sourcePackage.sourceAssets) {
          if (!/^[a-f0-9]{64}$/i.test(asset.sha256)) throw new Error("EDITOR_SOURCE_PACKAGE_ASSET_HASH_INVALID");
          const ref = cas.getByHash(asset.sha256.toLowerCase());
          if (!ref?.uri || !fs.existsSync(ref.uri) || ref.sha256 !== asset.sha256.toLowerCase()) {
            throw new Error("EDITOR_SOURCE_PACKAGE_ASSET_MISSING");
          }
          const stat = fs.statSync(ref.uri);
          if (!stat.isFile() || stat.size !== asset.byteLength || stat.size <= 0) {
            throw new Error("EDITOR_SOURCE_PACKAGE_ASSET_SIZE_MISMATCH");
          }
          if (await ContentAddressedStore.computeFileSha256(ref.uri) !== asset.sha256.toLowerCase()) {
            throw new Error("EDITOR_SOURCE_PACKAGE_ASSET_DIGEST_MISMATCH");
          }
        }

        const compositionRef = cas.getByHash(sourcePackage.compositionSha256.toLowerCase());
        if (
          !compositionRef?.uri ||
          !fs.existsSync(compositionRef.uri) ||
          compositionRef.sha256 !== sourcePackage.compositionSha256.toLowerCase()
        ) {
          throw new Error("EDITOR_SOURCE_PACKAGE_COMPOSITION_MISSING");
        }
        const compositionStat = fs.statSync(compositionRef.uri);
        if (
          !compositionStat.isFile() ||
          compositionStat.size !== sourcePackage.compositionByteLength ||
          await ContentAddressedStore.computeFileSha256(compositionRef.uri) !== sourcePackage.compositionSha256.toLowerCase()
        ) {
          throw new Error("EDITOR_SOURCE_PACKAGE_COMPOSITION_DIGEST_MISMATCH");
        }

        const decoded = JSON.parse(fs.readFileSync(compositionRef.uri, "utf8")) as CompositionIR;
        if (
          decoded.compositionId !== sourcePackage.compositionId ||
          decoded.metadata?.extensions?.ownerId !== job.userId ||
          decoded.metadata?.extensions?.sourceJobId !== jobId ||
          decoded.metadata?.extensions?.sourceKind !== "COMPOSITION_PACKAGE"
        ) {
          throw new Error("EDITOR_SOURCE_PACKAGE_COMPOSITION_BINDING_INVALID");
        }

        const referencedHashes = new Set<string>();
        const validatePackageSource = (src: string | undefined, required: boolean) => {
          if (!src) {
            if (required) throw new Error("EDITOR_SOURCE_PACKAGE_SOURCE_URI_REQUIRED");
            return;
          }
          const match = /^cas:\/\/([a-f0-9]{64})$/i.exec(src);
          if (!match) throw new Error("EDITOR_SOURCE_PACKAGE_SOURCE_URI_INVALID");
          const sha = match[1]!.toLowerCase();
          if (!allowedHashes.has(sha)) throw new Error("EDITOR_SOURCE_PACKAGE_UNDECLARED_ASSET");
          referencedHashes.add(sha);
        };
        for (const track of decoded.tracks || []) {
          for (const clip of track.clips || []) {
            validatePackageSource(clip.src, clip.kind === "VIDEO" || clip.kind === "IMAGE" || clip.kind === "MOTION_CANVAS");
          }
        }
        for (const audio of decoded.audio || []) validatePackageSource(audio.src, true);
        if (referencedHashes.size === 0) throw new Error("EDITOR_SOURCE_PACKAGE_EMPTY_MEDIA_SET");

        const packageValidation = validateCompositionIR(decoded);
        if (!packageValidation.valid) throw new Error("EDITOR_SOURCE_PACKAGE_COMPOSITION_INVALID");
        packagedComposition = decoded;
      } catch (error) {
        packageFallbackReason = "The saved editable source package could not be verified; this Short was opened as a flattened clip.";
        console.warn("[Editor Source] Rejected editable package; preserving safe fallback:", error instanceof Error ? error.message : String(error));
      }
    }

    if (packagedComposition) {
      return NextResponse.json({
        success: true,
        sourceKind: "COMPOSITION_PACKAGE",
        sourceNotice: "Loaded the persisted source composition and its owner-bound media assets. Quiz and scene metadata are preserved where the generating pipeline supplied them; available direct edits depend on the supported editor operations.",
        job: {
          jobId,
          title: job.topic || "ShortForge Short",
          contentType: job.contentType,
          durationSeconds: measurements.videoDuration,
          createdAt: job.createdAt,
        },
        videoUrl: "/api/editor/source/" + encodeURIComponent(jobId) + "/video",
        media,
        composition: packagedComposition,
      });
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
          ownerId: job.userId,
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

    // Persist the exact canonical starting composition. The runtime's open operation
    // must compare the browser-supplied document against this immutable source before
    // creating revision 0; subsequent edits then use revision-checked commands.
    const compositionTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-editor-composition-"));
    let compositionArtifact: Awaited<ReturnType<ContentAddressedStore["putFile"]>>;
    try {
      const compositionTempPath = path.join(compositionTempDir, compositionId + ".json");
      fs.writeFileSync(compositionTempPath, JSON.stringify(composition), { encoding: "utf8", flag: "wx" });
      compositionArtifact = await cas.putFile(
        compositionTempPath,
        "editor_source_composition",
        "application/json",
        {
          sourceJobId: jobId,
          importedBy: user.uid,
          sourceKind: "FLATTENED_MP4",
          compositionId,
          sourceAssetSha256: sourceArtifact.sha256,
        },
      );
    } finally {
      try { fs.rmSync(compositionTempDir, { recursive: true, force: true }); } catch {}
    }

    const editorSourceComposition = {
      schemaVersion: "shortforge.editor-composition-binding.v1" as const,
      compositionId,
      sha256: compositionArtifact.sha256,
      artifactId: compositionArtifact.artifactId,
      byteLength: compositionArtifact.byteLength,
      sourceKind: "FLATTENED_MP4" as const,
      ownerId: job.userId,
      createdAt: new Date().toISOString(),
    };
    await saveJobManifest(jobId, { editorSourceComposition });

    return NextResponse.json({
      success: true,
      sourceKind: "FLATTENED_MP4",
      sourceNotice:
        "This existing render was imported as one flattened video clip. Clip-level trim, transform, effects, masks, keyframes and transitions are editable. Its original questions, separate scene visuals, captions and narration text were not persisted as independent layers by the current generation flow, so they cannot be reconstructed safely from this MP4." + (packageFallbackReason ? " " + packageFallbackReason : ""),
      job: {
        jobId,
        title: job.topic || "ShortForge Short",
        contentType: job.contentType,
        durationSeconds: measurements.videoDuration,
        createdAt: job.createdAt,
      },
      videoUrl: "/api/editor/source/" + encodeURIComponent(jobId) + "/video",
      media,
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
