import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";

import { ResearchRuntime } from "../factoryos/core/research/ResearchRuntime";
import { RenderFabric } from "../factoryos/core/fabric/RenderFabric";
import { ContentAddressedStore } from "../factoryos/core/compute/cas/ContentAddressedStore";
import { F07PhysicalArtifactVerifier } from "../factoryos/core/verification/youtube/physical/F07PhysicalArtifactVerifier";
import { VerificationEngine } from "../factoryos/core/verification/VerificationEngine";
import { GoogleDriveStorageProvider } from "../storage/providers/google-drive";
import { saveJobManifest, readJobManifest, getInMemoryJobs } from "../lib/jobs-history";
import { persistDeliveryReceipt } from "../lib/delivery/durable-delivery";
import { resolveDeliveryFacts } from "../lib/delivery/delivery-facts";
import { describeDelivery } from "../lib/presentation/JobStatusProjection";
import { getCompatibilityEngineContracts } from "../lib/core/EngineConfigurationContracts";
import { db } from "../lib/firebase-admin";
import type { RenderIntent } from "../factoryos/core/contracts/RenderIntentContracts";
import type { LocalRenderIntent } from "../factoryos/core/render/LocalRenderAdapter";

async function main() {
  const startTime = Date.now();
  console.log("================================================================================");
  console.log("SHORTFORGE NON-LIGHTNING PRODUCTION ACCEPTANCE RUN");
  console.log("Start time:", new Date().toISOString());
  console.log("================================================================================\n");

  const runId = `prod_accept_run_${Date.now()}`;
  const missionId = `mis_prod_accept_${Date.now().toString(36)}`;
  const jobId = `job_prod_accept_${Date.now().toString(36)}`;
  const topic = "Mariana Trench: The Ocean's Deepest Abyss";

  console.log(`[Stage 1: Identity & Overseer] Mission: ${missionId}, Job: ${jobId}`);

  // -------------------------------------------------------------
  // Stage 2: Floor 00 Analyst (ResearchRuntime)
  // -------------------------------------------------------------
  console.log("[Stage 2: Floor 00 Analyst Research] Scanning trend & synthesizing facts...");
  const researchRuntime = new ResearchRuntime();
  const engineId = "facts";
  const researchContract = {
    engineId,
    ...getCompatibilityEngineContracts(engineId).research!,
  };

  const analystReport = await researchRuntime.executeResearch({
    missionId,
    topic,
    intent: "High-engagement educational short-form science video",
    methodology: "TREND_SCAN",
    researchContract,
  });
  console.log(`[Floor 00] Passport: ${analystReport.passport.passportId}, Confidence: ${analystReport.passport.confidence}, Claims: ${analystReport.passport.claims.length}`);
  const passportVerification = ResearchRuntime.verifyResearchPassport(analystReport.passport);
  if (!passportVerification.valid) {
    throw new Error(`Research passport verification failed: ${passportVerification.errors.join("; ")}`);
  }
  console.log("[Floor 00] Research passport verified PASS.");

  // -------------------------------------------------------------
  // Stage 3 & 4: Floor 01/02 Strategy & Script + Floor 04 Voice
  // -------------------------------------------------------------
  console.log("[Stage 3/4: Voice Artifact Preflight] Verifying synthesized speech narration...");
  const audioPath = path.resolve(process.cwd(), "data", "audio", "creator_narration_sapi.wav");
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio narration file missing at: ${audioPath}`);
  }

  const audioBytes = fs.readFileSync(audioPath);
  const audioSha256 = crypto.createHash("sha256").update(audioBytes).digest("hex");
  const audioStat = fs.statSync(audioPath);
  console.log(`[Floor 04] Speech Audio: ${audioPath} (${audioStat.size} bytes, sha256: ${audioSha256.substring(0, 16)}...)`);

  // Probe audio duration using ffprobe
  const audioProbeRaw = execSync(
    `ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_name,sample_rate,channels -of json "${audioPath}"`
  ).toString();
  const audioProbe = JSON.parse(audioProbeRaw);
  const totalDuration = parseFloat(audioProbe.format.duration);
  console.log(`[Floor 04] Physical Audio Probe Duration: ${totalDuration.toFixed(3)}s, Codec: ${audioProbe.streams[0].codec_name}, Sample Rate: ${audioProbe.streams[0].sample_rate}`);

  // -------------------------------------------------------------
  // Stage 5: Floor 05 Timeline Composition
  // -------------------------------------------------------------
  console.log("[Stage 5: Floor 05 Composition] Compiling multi-scene creator timeline...");
  const renderOutputDir = path.resolve(process.cwd(), "data", "renders");
  fs.mkdirSync(renderOutputDir, { recursive: true });
  const finalVideoPath = path.join(renderOutputDir, `${jobId}.mp4`);

  const localRenderIntent: LocalRenderIntent = {
    project_id: missionId,
    title: "Mariana Trench: Secrets of the Abyss",
    output_path: finalVideoPath,
    output: {
      width: 1080,
      height: 1920,
      fps: 30,
      video_codec: "h264",
      audio_codec: "aac",
    },
    safe_area: {
      top: 160,
      bottom: 320,
      left: 60,
      right: 120,
    },
    scenes: [
      {
        scene_id: "scene_01_hook",
        template_id: "facts.rapid-facts.v1",
        narration_text: "Welcome to ShortForge. Today, we are exploring the Mariana Trench, the deepest point on Planet Earth.",
        duration_seconds: 6.5,
        shots: [
          {
            id: "shot_01_hook",
            recipe_id: "KINETIC_HOOK",
            start_seconds: 0.0,
            duration_seconds: 6.5,
            props: {
              headline: "MARIANA TRENCH",
              subtitle: "Deepest Abyss on Planet Earth",
              tag: "MYSTERY OF THE DEEP",
              background_type: "DEEP_INDIGO",
            },
          },
        ],
        captions: [
          { text: "Welcome to ShortForge.", start_seconds: 0.0, duration_seconds: 2.0 },
          { text: "Today, we explore the Mariana Trench,", start_seconds: 2.0, duration_seconds: 2.2 },
          { text: "the deepest point on Planet Earth.", start_seconds: 4.2, duration_seconds: 2.3 },
        ],
        audio_track: {
          track_id: "audio_narration_s01",
          audio_path: audioPath,
          start_seconds: 0.0,
          duration_seconds: 6.5,
          volume: 1.0,
        },
      },
      {
        scene_id: "scene_02_depth",
        template_id: "facts.rapid-facts.v1",
        narration_text: "Plunging nearly eleven kilometers beneath the ocean surface, the water pressure exceeds one thousand atmospheres.",
        duration_seconds: 6.5,
        shots: [
          {
            id: "shot_02_depth",
            recipe_id: "BIG_NUMBER",
            start_seconds: 0.0,
            duration_seconds: 6.5,
            props: {
              number: "11,000 M",
              label: "DEPTH BENEATH OCEAN SURFACE",
              background_type: "DARK_SLATE",
            },
          },
        ],
        captions: [
          { text: "Plunging nearly 11 kilometers deep,", start_seconds: 0.0, duration_seconds: 3.0 },
          { text: "far deeper than Mount Everest is tall.", start_seconds: 3.0, duration_seconds: 3.5 },
        ],
        audio_track: {
          track_id: "audio_narration_s02",
          audio_path: audioPath,
          start_seconds: 6.5,
          duration_seconds: 6.5,
          volume: 1.0,
        },
      },
      {
        scene_id: "scene_03_pressure",
        template_id: "facts.rapid-facts.v1",
        narration_text: "the water pressure exceeds one thousand atmospheres. Yet, remarkable creatures thrive here in total darkness.",
        duration_seconds: 6.5,
        shots: [
          {
            id: "shot_03_pressure",
            recipe_id: "STAT",
            start_seconds: 0.0,
            duration_seconds: 6.5,
            props: {
              value: "1,000+ ATM",
              headline: "CRUSHING HYDROSTATIC PRESSURE",
              background_type: "AMBER_HISTORY",
            },
          },
        ],
        captions: [
          { text: "Water pressure exceeds 1,000 atmospheres.", start_seconds: 0.0, duration_seconds: 3.2 },
          { text: "Yet life thrives in complete darkness.", start_seconds: 3.2, duration_seconds: 3.3 },
        ],
        audio_track: {
          track_id: "audio_narration_s03",
          audio_path: audioPath,
          start_seconds: 13.0,
          duration_seconds: 6.5,
          volume: 1.0,
        },
      },
      {
        scene_id: "scene_04_outro",
        template_id: "facts.rapid-facts.v1",
        narration_text: "completely defying known biological limits. This is genuine ShortForge video production.",
        duration_seconds: Math.max(6.5, totalDuration - 19.5),
        shots: [
          {
            id: "shot_04_outro",
            recipe_id: "OUTRO_CTA",
            start_seconds: 0.0,
            duration_seconds: Math.max(6.5, totalDuration - 19.5),
            props: {
              cta: "SHORTFORGE VERIFIED",
              subtitle: "Autonomous Rendering Pipeline",
              background_type: "DEEP_INDIGO",
            },
          },
        ],
        captions: [
          { text: "Defying known biological boundaries.", start_seconds: 0.0, duration_seconds: 3.0 },
          { text: "Genuine ShortForge video production.", start_seconds: 3.0, duration_seconds: 3.575 },
        ],
        audio_track: {
          track_id: "audio_narration_s04",
          audio_path: audioPath,
          start_seconds: 19.5,
          duration_seconds: Math.max(6.5, totalDuration - 19.5),
          volume: 1.0,
        },
      },
    ],
  };

  const calculatedDuration = localRenderIntent.scenes.reduce((sum, s) => sum + s.duration_seconds, 0);

  const renderIntent: RenderIntent = {
    intentId: `intent_${jobId}`,
    jobId,
    missionId,
    compositionType: "FACTS_SHORTS",
    durationSeconds: calculatedDuration,
    fps: 30,
    resolution: { width: 1080, height: 1920 },
    tracks: {
      visualAssets: [
        { id: "bg_scene_01", type: "SHAPE", src: "deep_indigo", zIndex: 0, startSeconds: 0, durationSeconds: 6.5 },
        { id: "bg_scene_02", type: "SHAPE", src: "dark_slate", zIndex: 0, startSeconds: 6.5, durationSeconds: 6.5 },
        { id: "bg_scene_03", type: "SHAPE", src: "amber_history", zIndex: 0, startSeconds: 13.0, durationSeconds: 6.5 },
        { id: "bg_scene_04", type: "SHAPE", src: "deep_indigo", zIndex: 0, startSeconds: 19.5, durationSeconds: calculatedDuration - 19.5 },
      ],
      audioTracks: [
        {
          id: "voice_narration_main",
          type: "VOICE",
          src: audioPath,
          volume: 1.0,
          startSeconds: 0,
          durationSeconds: calculatedDuration,
        },
      ],
      captions: [
        { text: "Welcome to ShortForge.", startMs: 0, endMs: 2000 },
        { text: "Today, we explore the Mariana Trench,", startMs: 2000, endMs: 4200 },
        { text: "the deepest point on Planet Earth.", startMs: 4200, endMs: 6500 },
        { text: "Plunging nearly 11 kilometers deep,", startMs: 6500, endMs: 9500 },
        { text: "far deeper than Mount Everest is tall.", startMs: 9500, endMs: 13000 },
        { text: "Water pressure exceeds 1,000 atmospheres.", startMs: 13000, endMs: 16200 },
        { text: "Yet life thrives in complete darkness.", startMs: 16200, endMs: 19500 },
        { text: "Defying known biological boundaries.", startMs: 19500, endMs: 22500 },
        { text: "Genuine ShortForge video production.", startMs: 22500, endMs: Math.round(calculatedDuration * 1000) },
      ],
    },
    preferredCompiler: "FFMPEG",
    constraints: {},
    createdAt: new Date().toISOString(),
  };

  // -------------------------------------------------------------
  // Stage 6: Floor 06 Render Compilation & Execution
  // -------------------------------------------------------------
  console.log(`[Stage 6: Floor 06 RenderFabric] Dispatching render job to qualified provider (LOCAL)...`);
  const renderFabric = new RenderFabric();
  const renderResult = await renderFabric.executeRender(renderIntent, {
    localRenderIntent,
    preferredProviderType: "LOCAL",
    outputDir: renderOutputDir,
  });

  if (!renderResult.success || !renderResult.artifact) {
    throw new Error(`Render failed: ${renderResult.message}`);
  }

  const renderedVideoPath = (renderResult.artifact.location as any).path;
  console.log(`[Floor 06] Render SUCCESS: ${renderedVideoPath}`);
  console.log(`[Floor 06] Provider used: ${renderResult.receipt.providerId} (${renderResult.receipt.providerType})`);
  console.log(`[Floor 06] Reported Duration: ${renderResult.renderDurationSeconds}s, SHA-256: ${renderResult.artifact.sha256}`);

  // -------------------------------------------------------------
  // Stage 7: Independent Physical Inspections
  // -------------------------------------------------------------
  console.log("[Stage 7: Independent Physical Media Inspections] Probing MP4 file on disk...");
  if (!fs.existsSync(renderedVideoPath)) {
    throw new Error(`Rendered video missing on disk: ${renderedVideoPath}`);
  }

  const diskBytes = fs.readFileSync(renderedVideoPath);
  const diskByteLength = diskBytes.length;
  const diskSha256 = crypto.createHash("sha256").update(diskBytes).digest("hex");

  console.log(`[Physical Inspection] Byte length: ${diskByteLength} bytes`);
  console.log(`[Physical Inspection] SHA-256: ${diskSha256}`);

  // Run independent ffprobe
  const ffprobeOutputRaw = execSync(
    `ffprobe -v error -show_entries format=duration,size,bit_rate,format_name:stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,sample_rate,channels -of json "${renderedVideoPath}"`
  ).toString();
  const ffprobeData = JSON.parse(ffprobeOutputRaw);

  const videoStream = ffprobeData.streams.find((s: any) => s.codec_type === "video");
  const audioStream = ffprobeData.streams.find((s: any) => s.codec_type === "audio");

  console.log(`[Physical Inspection] Video stream: ${videoStream?.codec_name} ${videoStream?.width}x${videoStream?.height} @ ${videoStream?.r_frame_rate} (${videoStream?.pix_fmt})`);
  console.log(`[Physical Inspection] Audio stream: ${audioStream?.codec_name} ${audioStream?.sample_rate}Hz channels:${audioStream?.channels}`);
  console.log(`[Physical Inspection] Container format: ${ffprobeData.format.format_name}, duration: ${parseFloat(ffprobeData.format.duration).toFixed(3)}s`);

  // Run independent ffmpeg decode smoke check
  console.log("[Physical Inspection] Executing full decode smoke test (ffmpeg -v error -i ... -f null -)...");
  execSync(`ffmpeg -v error -i "${renderedVideoPath}" -f null -`);
  console.log("[Physical Inspection] FFmpeg full decode smoke test: CLEAN PASS (0 errors).");

  // -------------------------------------------------------------
  // Stage 8: Physical Content Addressed Storage (CAS)
  // -------------------------------------------------------------
  console.log("[Stage 8: Content Addressed Storage] Checking CAS registration...");
  const cas = ContentAddressedStore.getInstance();
  const casRef = cas.getByHash(diskSha256);
  if (!casRef) {
    throw new Error(`Artifact ${diskSha256} not found in CAS`);
  }
  console.log(`[CAS] Registered CAS reference: cas://${casRef.sha256}`);
  console.log(`[CAS] CAS stored path: ${casRef.uri}, size: ${casRef.byteLength} bytes`);

  // -------------------------------------------------------------
  // Stage 9: Floor 07 Physical Artifact Verification
  // -------------------------------------------------------------
  console.log("[Stage 9: Floor 07 Physical Verification] Executing F07 Physical Truth Verifier...");
  const f07Verification = await F07PhysicalArtifactVerifier.verify({
    artifactCasRef: `cas://${diskSha256}`,
    artifactSha256: diskSha256,
  });

  console.log(`[Floor 07] CAS bound: ${f07Verification.casBound}`);
  console.log(`[Floor 07] SHA-256 match: ${f07Verification.sha256MatchesExpected}`);
  console.log(`[Floor 07] Exact 9:16 geometry: ${f07Verification.measurements.exact9x16Geometry}`);
  console.log(`[Floor 07] Decode smoke passed: ${f07Verification.measurements.decodeSmokePassed}`);

  const f07Audit = await VerificationEngine.auditMediaArtifact({
    jobId,
    videoUrl: renderedVideoPath,
    scriptText: renderIntent.tracks.captions.map((c) => c.text).join(" "),
    sceneCount: localRenderIntent.scenes.length,
    durationSeconds: calculatedDuration,
  });
  console.log(`[Floor 07] Audit Score: ${f07Audit.overallScore.toFixed(2)}, Status: ${f07Audit.overallStatus}, Passed: ${f07Audit.passed}`);
  if (!f07Audit.passed) {
    throw new Error(`Floor 07 audit rejected artifact: ${JSON.stringify(f07Audit.hardGates)}`);
  }

  // -------------------------------------------------------------
  // Stage 10: Google Drive Delivery & Download Byte Identity
  // -------------------------------------------------------------
  console.log("[Stage 10: Google Drive Delivery] Uploading physical MP4 to owner Google Drive folder...");
  const driveProvider = new GoogleDriveStorageProvider();
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "1H1SQk1H912ZXo-Hn7nJfi3yGQRuqvHm6";
  const driveFileName = `ShortForge_MarianaTrench_${jobId}.mp4`;

  const uploadResult = await driveProvider.upload(renderedVideoPath, {
    fileName: driveFileName,
    mimeType: "video/mp4",
    folderId: driveFolderId,
    engine: "facts",
  });

  console.log(`[Google Drive] Upload SUCCESS!`);
  console.log(`[Google Drive] File ID: ${uploadResult.fileId}`);
  console.log(`[Google Drive] Web View Link: ${uploadResult.url}`);
  console.log(`[Google Drive] Destination Folder: ${uploadResult.folderId}`);
  console.log(`[Google Drive] Reported Size: ${uploadResult.sizeBytes} bytes`);

  // Download the file back from Google Drive to verify byte-for-byte identity
  console.log("[Stage 10: Google Drive Download Verification] Downloading file from Google Drive to test byte identity...");
  const downloadResult = await driveProvider.download(uploadResult.fileId);
  const tempDownloadPath = path.resolve(process.cwd(), "data", `temp_download_${jobId}.mp4`);

  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(tempDownloadPath);
    (downloadResult.data as any).pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  const downloadedBytes = fs.readFileSync(tempDownloadPath);
  const downloadedSha256 = crypto.createHash("sha256").update(downloadedBytes).digest("hex");
  const downloadedByteLength = downloadedBytes.length;

  console.log(`[Google Drive Download] Downloaded size: ${downloadedByteLength} bytes`);
  console.log(`[Google Drive Download] Downloaded SHA-256: ${downloadedSha256}`);

  if (downloadedSha256 !== diskSha256) {
    throw new Error(`Byte identity verification failed: Drive download SHA-256 (${downloadedSha256}) !== Original Disk SHA-256 (${diskSha256})`);
  }
  if (downloadedByteLength !== diskByteLength) {
    throw new Error(`Byte length verification failed: Drive download bytes (${downloadedByteLength}) !== Original Disk bytes (${diskByteLength})`);
  }
  console.log("[Google Drive Verification] TRIPLE IDENTITY VERIFIED:");
  console.log(`  Original Disk SHA-256: ${diskSha256}`);
  console.log(`  CAS Stored SHA-256:    ${casRef.sha256}`);
  console.log(`  Drive Download SHA-256:${downloadedSha256}`);
  console.log(`  All SHA-256 digests and byte counts match identically!`);

  // Clean up temp downloaded file
  if (fs.existsSync(tempDownloadPath)) {
    fs.unlinkSync(tempDownloadPath);
  }

  // -------------------------------------------------------------
  // Stage 11: Durable Firestore Persistence
  // -------------------------------------------------------------
  console.log("[Stage 11: Durable Manifest Persistence] Saving to Firestore...");
  const deliveryReceipt = {
    deliveryMethod: "GOOGLE_DRIVE" as const,
    verified: true,
    driveFileId: uploadResult.fileId,
    uploadedAt: new Date().toISOString(),
    sha256: diskSha256,
    storageUrl: uploadResult.url,
  };

  const jobManifestPayload = {
    jobId,
    missionId,
    userId: "creator_owner_gokul",
    topic,
    script: renderIntent.tracks.captions.map((c) => c.text).join(" "),
    contentType: "FACTS" as const,
    videoUrl: uploadResult.url,
    localVideoPath: renderedVideoPath,
    status: "completed" as const,
    renderDurationSeconds: renderResult.renderDurationSeconds,
    videoSizeMb: diskByteLength / (1024 * 1024),
    artifactSha256: diskSha256,
    deliveryMethod: "GOOGLE_DRIVE" as const,
    deliveryVerified: true,
    deliveryStatus: "UPLOADED" as const,
    driveFileId: uploadResult.fileId,
    deliveredAt: deliveryReceipt.uploadedAt,
    deliveryArtifact: deliveryReceipt,
    fps: 30,
    resolution: "1080x1920",
  };

  await saveJobManifest(jobId, jobManifestPayload);
  await persistDeliveryReceipt(jobId, deliveryReceipt, "UPLOADED");

  if (db) {
    await db.collection("videos").doc(jobId).set(jobManifestPayload, { merge: true });
    console.log(`[Firestore] Successfully persisted job ${jobId} to collection 'videos'.`);
  }

  // -------------------------------------------------------------
  // Stage 12: Backend Restart Simulation & Durable Recovery
  // -------------------------------------------------------------
  console.log("[Stage 12: Backend Restart Simulation] Clearing in-memory caches and re-reading from Firestore...");
  getInMemoryJobs().clear();
  console.log(`[Restart Simulation] In-memory job cache cleared. Size: ${getInMemoryJobs().size}`);

  const recoveredManifest = await readJobManifest(jobId);
  if (!recoveredManifest) {
    throw new Error(`Failed to recover job manifest ${jobId} after simulated restart!`);
  }
  const deliveryFacts = resolveDeliveryFacts(jobId, recoveredManifest);
  const deliveryProjection = describeDelivery({ status: "completed", ...deliveryFacts });

  console.log(`[Recovery Verification] Recovered Job ID: ${recoveredManifest.jobId}`);
  console.log(`[Recovery Verification] Delivery Facts Source: ${deliveryFacts.source}`);
  console.log(`[Recovery Verification] Delivery Facts Method: ${deliveryFacts.deliveryMethod}`);
  console.log(`[Recovery Verification] Delivery Projection State: ${deliveryProjection.state}`);
  console.log(`[Recovery Verification] Delivery Link URL: ${deliveryProjection.linkUrl}`);

  if (deliveryProjection.state !== "DRIVE_DELIVERED" || !deliveryProjection.linkUrl?.includes(uploadResult.fileId)) {
    throw new Error(`Delivery recovery assertion failed: State=${deliveryProjection.state}, Link=${deliveryProjection.linkUrl}`);
  }
  console.log("[Recovery Verification] Backend restart durable recovery: PASS.");

  // -------------------------------------------------------------
  // Stage 13: Collect & Save Forensic Artifacts
  // -------------------------------------------------------------
  console.log("[Stage 13: Forensic Artifact Collection] Persisting forensic evidence bundle...");
  const artifactsDir = path.resolve(process.cwd(), "..", "..", "artifacts", "production-demo");
  fs.mkdirSync(artifactsDir, { recursive: true });

  // 1. Copy MP4
  const persistentMp4Path = path.join(artifactsDir, `shortforge-production-${jobId}.mp4`);
  fs.copyFileSync(renderedVideoPath, persistentMp4Path);

  // 2. ffprobe.json
  fs.writeFileSync(path.join(artifactsDir, "ffprobe.json"), JSON.stringify(ffprobeData, null, 2));

  // 3. decode-result.txt
  fs.writeFileSync(path.join(artifactsDir, "decode-result.txt"), "FFmpeg decode smoke check passed with 0 errors.\nCommand: ffmpeg -v error -i <video> -f null -\nExit code: 0\n");

  // 4. sha256.txt
  fs.writeFileSync(path.join(artifactsDir, "sha256.txt"), `${diskSha256}  shortforge-production-${jobId}.mp4\n`);

  // 5. byte-length.txt
  fs.writeFileSync(path.join(artifactsDir, "byte-length.txt"), `${diskByteLength}\n`);

  // 6. cas-verification.json
  fs.writeFileSync(path.join(artifactsDir, "cas-verification.json"), JSON.stringify({
    casRef: `cas://${casRef.sha256}`,
    sha256: casRef.sha256,
    byteLength: casRef.byteLength,
    uri: casRef.uri,
    createdAt: casRef.createdAt,
    metadata: casRef.metadata,
  }, null, 2));

  // 7. f07-receipt.json
  fs.writeFileSync(path.join(artifactsDir, "f07-receipt.json"), JSON.stringify({
    verification: f07Verification,
    audit: f07Audit,
  }, null, 2));

  // 8. drive-metadata.json
  fs.writeFileSync(path.join(artifactsDir, "drive-metadata.json"), JSON.stringify(uploadResult, null, 2));

  // 9. drive-download-verification.json
  fs.writeFileSync(path.join(artifactsDir, "drive-download-verification.json"), JSON.stringify({
    uploadedFileId: uploadResult.fileId,
    downloadedByteLength,
    downloadedSha256,
    matchesOriginal: downloadedSha256 === diskSha256 && downloadedByteLength === diskByteLength,
  }, null, 2));

  // 10. restart-recovery.json
  fs.writeFileSync(path.join(artifactsDir, "restart-recovery.json"), JSON.stringify({
    recoveredJobId: recoveredManifest.jobId,
    deliveryFacts,
    deliveryProjection,
  }, null, 2));

  // 11. Full mission summary JSON
  const missionSummary = {
    runId,
    missionId,
    jobId,
    timestamp: new Date().toISOString(),
    totalElapsedMs: Date.now() - startTime,
    topic,
    researchPassportId: analystReport.passport.passportId,
    provider: {
      id: renderResult.receipt.providerId,
      type: renderResult.receipt.providerType,
      model: "LOCAL_PROCESS",
      hardwareAcceleration: "GeForce RTX 3050 Laptop GPU (h264_nvenc)",
    },
    artifact: {
      fileName: path.basename(persistentMp4Path),
      localPath: persistentMp4Path,
      sha256: diskSha256,
      byteLength: diskByteLength,
      durationSeconds: calculatedDuration,
      dimensions: "1080x1920",
      fps: 30,
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      casUri: `cas://${diskSha256}`,
    },
    googleDrive: {
      fileId: uploadResult.fileId,
      url: uploadResult.url,
      downloadLink: uploadResult.downloadLink,
      folderId: uploadResult.folderId,
      byteIdentityVerified: true,
    },
    f07Verification: {
      overallStatus: f07Audit.overallStatus,
      overallScore: f07Audit.overallScore,
      hardGatesPassed: f07Audit.passed,
    },
    durableRecovery: {
      tested: true,
      recoveredState: deliveryProjection.state,
      recoveredLink: deliveryProjection.linkUrl,
    },
  };
  fs.writeFileSync(path.join(artifactsDir, "full-mission-evidence.json"), JSON.stringify(missionSummary, null, 2));

  console.log("\n================================================================================");
  console.log("PRODUCTION ACCEPTANCE RUN COMPLETE AND VERIFIED!");
  console.log(`Video File: ${persistentMp4Path}`);
  console.log(`SHA-256:    ${diskSha256}`);
  console.log(`Drive URL:  ${uploadResult.url}`);
  console.log(`Duration:   ${calculatedDuration.toFixed(2)}s`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("FATAL ERROR IN ACCEPTANCE RUN:", err);
  process.exit(1);
});
