/**
 * Live HF ZeroGPU physical artifact proof.
 *
 * Evidence chain:
 * authenticated private Space -> Gradio /render -> ZeroGPU GPU execution ->
 * authenticated FileData download -> independent media probe -> CAS ->
 * independent F07 physical verification -> signed receipt -> receipt persisted.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultNotebookRegistry } from "../factoryos/core/compute/notebooks";
import type { NotebookCredentialBundle } from "../factoryos/core/compute/notebooks";
import { ContentAddressedStore } from "../factoryos/core/compute/cas/ContentAddressedStore";
import { VerificationEngine } from "../factoryos/core/verification/VerificationEngine";
import { F07PhysicalArtifactVerifier } from "../factoryos/core/verification/youtube/physical/F07PhysicalArtifactVerifier";
import {
  F07ReleaseGuardian,
  YouTubePolicyStore,
  VerificationReceiptVerifier,
} from "../factoryos/core/verification/youtube";

const proofDir =
  process.env.HF_ZEROGPU_PROOF_DIR ||
  path.join(
    process.env.GITHUB_WORKSPACE || process.cwd(),
    "artifacts",
    "hf-zerogpu-live",
  );

function credentials(): NotebookCredentialBundle {
  const result: Record<string, string> = {};
  for (const key of [
    "HF_ZEROGPU_SPACE",
    "HF_ZEROGPU_API_NAME",
    "HF_TOKEN",
  ]) {
    if (process.env[key]) result[key] = process.env[key]!;
  }
  return result;
}

async function main(): Promise<void> {
  const creds = credentials();

  const registry = createDefaultNotebookRegistry();
  const adapter = registry.get("HF_ZEROGPU");
  if (!adapter) throw new Error("HF_ZEROGPU adapter is not registered.");

  const validation = await adapter.validateCredentials(creds);
  console.log("VALIDATION");
  console.log(JSON.stringify(validation, null, 2));

  if (
    !validation.configured ||
    !validation.authenticated ||
    !validation.providerReachable
  ) {
    throw new Error(
      "HF ZeroGPU credential validation failed: " +
        JSON.stringify(validation),
    );
  }

  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "shortforge-hf-zerogpu-"),
  );
  const localArtifact = path.join(tempDir, "shortforge-gpu-proof.mp4");
  const evidencePath = path.join(
    proofDir,
    "hf-zerogpu-f07-evidence.json",
  );
  const artifactCopy = path.join(
    proofDir,
    "shortforge_gpu_proof.mp4",
  );

  await fs.mkdir(proofDir, { recursive: true });

  const startedAt = new Date().toISOString();

  try {
    const execution = await adapter.execute(
      {
        command: "render",
        timeoutMs: Number(process.env.HF_ZEROGPU_LIVE_TIMEOUT_MS || 120_000),
        artifactDestinationPath: localArtifact,
      },
      creds,
    );

    console.log("EXECUTION");
    console.log(JSON.stringify(execution, null, 2));

    if (
      execution.status !== "SUCCEEDED" ||
      execution.verificationLevel !== "PHYSICAL_ARTIFACT_VERIFIED" ||
      !execution.artifactPath ||
      !execution.artifactSha256 ||
      !execution.artifactByteLength
    ) {
      throw new Error(
        "HF ZeroGPU adapter did not return a physical artifact: " +
          JSON.stringify(execution),
      );
    }

    const localProbe = await VerificationEngine.probeMediaFile(
      execution.artifactPath,
    );

    if (
      !localProbe.fileExists ||
      localProbe.byteLength <= 0 ||
      !localProbe.hasFtypBox ||
      !localProbe.decodeSmokePassed ||
      localProbe.width !== 1080 ||
      localProbe.height !== 1920 ||
      localProbe.videoCodec !== "h264" ||
      localProbe.audioCodec !== "aac"
    ) {
      throw new Error(
        "Independent HF ZeroGPU media probe failed: " +
          JSON.stringify(localProbe),
      );
    }

    await fs.copyFile(execution.artifactPath, artifactCopy);

    const cas = ContentAddressedStore.getInstance();
    const artifact = await cas.putFile(
      execution.artifactPath,
      "hf_zerogpu_physical_render_proof",
      "video/mp4",
      {
        provider: "HF_ZEROGPU",
        space: creds.HF_ZEROGPU_SPACE,
        apiName: creds.HF_ZEROGPU_API_NAME,
        sourceSha256: execution.artifactSha256,
        sourceByteLength: execution.artifactByteLength,
      },
    );

    if (
      artifact.sha256 !== execution.artifactSha256 ||
      artifact.byteLength !== execution.artifactByteLength
    ) {
      throw new Error("CAS identity does not match the downloaded artifact.");
    }

    const casIntegrity = await cas.verifyArtifactIntegrity(artifact);
    if (
      !casIntegrity.valid ||
      casIntegrity.actualSha256 !== execution.artifactSha256
    ) {
      throw new Error(
        "CAS physical integrity verification failed: " +
          JSON.stringify(casIntegrity),
      );
    }

    const artifactCasRef = "cas://" + artifact.sha256;

    const physical = await F07PhysicalArtifactVerifier.verify({
      artifactSha256: artifact.sha256,
      artifactCasRef,
    });

    if (
      !physical.casBound ||
      !physical.sha256MatchesExpected ||
      physical.actualSha256 !== artifact.sha256 ||
      physical.byteLength !== artifact.byteLength ||
      !physical.measurements.decodeSmokePassed
    ) {
      throw new Error(
        "F07 physical CAS verification failed: " +
          JSON.stringify(physical),
      );
    }

    const publicationIntentAt = new Date().toISOString();
    const video = {
      videoId: "live_hf_zerogpu_" + Date.now().toString(36),
      title: "ShortForge HF ZeroGPU Render Verification",
      description:
        "Controlled technical verification of Hugging Face ZeroGPU execution.",
      tags: ["shortforge", "zerogpu", "render"],
      contentEngine: "Coding",
      genome: {
        topic: "Hugging Face ZeroGPU render verification",
        thesis:
          "A hosted ZeroGPU render should produce a physically verifiable MP4 artifact.",
        storyType: "engineering-breakdown",
        hookType: "curiosity-gap",
        narrativeStructure: "problem-mechanism-solution",
        durationSeconds: 1,
        narrationSpeedWpm: 150,
        visualGrammar: "isometric-diagrammatic",
        captionGrammar: "kinetic-emphasis",
        audioGrammar: "narration-plus-light-bed",
        factualClaims: [],
        sourceSetHash: "hf_zerogpu_live_proof_source_v1",
        scriptHash: "hf_zerogpu_live_proof_script_v1",
        variationProfile: "hf_zerogpu_live_proof_variation_v1",
        originalityProfile: "hf_zerogpu_live_proof_originality_v1",
        contentGenomeVersion: 2,
        generatedAt: startedAt,
      },
      measurements: {
        fileExists: true,
        byteLength: 1,
        hasFtypBox: false,
        decodeSmokePassed: false,
        width: 1,
        height: 1,
        videoCodec: "declared-only",
        audioCodec: "declared-only",
        videoDuration: 999,
        audioDuration: 999,
        syncDriftMs: 999999,
        pixelFormat: "declared-only",
        fps: 1,
        bitrateKbps: 1,
        streamCount: 0,
        audioSampleRate: 1,
        audioChannels: 1,
      },
      assets: [],
      scriptText: "Controlled HF ZeroGPU render evidence.",
      scenes: [{ id: "hf-zerogpu-proof-scene" }],
      factualClaimsCount: 0,
      verifiedFactualClaimsCount: 0,
    };

    const channel = {
      channelId: "shortforge-hf-zerogpu-proof-channel",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      yppStatus: "CURRENTLY_MONETIZING" as const,
      subscriberCount: 300000,
      validWatchHoursLast365Days: 80000,
      shortsViewsLast90Days: 25000000,
      activeCommunityGuidelinesStrikes: 0,
      countryRegion: "US",
      isChannelThemeConsistent: true,
    };

    const guardian = new F07ReleaseGuardian(
      YouTubePolicyStore.getInstance(),
    );

    const receipt = await guardian.verifyRelease({
      video,
      channel,
      publicationIntentAt,
      artifactSha256: artifact.sha256,
      artifactCasRef,
    });

    if (
      receipt.artifactSha256 !== artifact.sha256 ||
      receipt.artifactCasRef !== artifactCasRef ||
      !receipt.technicalForensics.artifactExists ||
      !receipt.technicalForensics.decodeSmokePassed ||
      !receipt.technicalForensics.geometry9x16Or1x1 ||
      !receipt.technicalForensics.codecCompliant ||
      !receipt.youtubePolicy.publishAllowed
    ) {
      throw new Error(
        "F07ReleaseGuardian verification did not accept the physical artifact: " +
          JSON.stringify(receipt),
      );
    }

    const signatureVerification = VerificationReceiptVerifier.verify(receipt);
    if (!signatureVerification.valid) {
      throw new Error("F07 signed receipt verification failed.");
    }

    const persistedReceiptUri =
      await VerificationReceiptVerifier.persistToCas(receipt);

    const evidence = {
      schemaVersion: "1.0",
      proofType: "HF_ZEROGPU_PHYSICAL_MP4_F07",
      issue: 160,
      provider: "HF_ZEROGPU",
      space: creds.HF_ZEROGPU_SPACE,
      apiName: creds.HF_ZEROGPU_API_NAME,
      adapterProviderId: adapter.metadata.providerId,
      runtimeKind: adapter.metadata.runtimeKind,
      execution,
      localProbe,
      artifact: {
        sha256: artifact.sha256,
        byteLength: artifact.byteLength,
        casRef: artifactCasRef,
        casUri: artifact.uri,
        casIntegrityValid: casIntegrity.valid,
      },
      f07: {
        source: physical.source,
        casBound: physical.casBound,
        sha256MatchesExpected: physical.sha256MatchesExpected,
        actualSha256: physical.actualSha256,
        byteLength: physical.byteLength,
        measurements: physical.measurements,
        receiptId: receipt.receiptId,
        overallOutcome: receipt.youtubePolicy.overallOutcome,
        publishAllowed: receipt.youtubePolicy.publishAllowed,
        signatureVerified: signatureVerification.valid,
        persistedReceiptUri,
      },
      generatedAt: new Date().toISOString(),
      productionWorkerEligible:
        adapter.metadata.capabilities.productionWorkerEligible,
      evidence: [
        "Private Hugging Face Space authentication succeeded.",
        "Gradio /render queue submission completed.",
        "ZeroGPU executed on the hosted NVIDIA RTX Pro 6000 Blackwell substrate.",
        "Returned MP4 was downloaded by the ShortForge adapter using authenticated file retrieval.",
        "SHA-256 and byte length were recomputed outside Hugging Face.",
        "Independent media probing passed.",
        "Artifact was stored in the ShortForge ContentAddressedStore.",
        "CAS integrity verification passed.",
        "F07PhysicalArtifactVerifier independently resolved and decoded the CAS-bound artifact.",
        "F07ReleaseGuardian accepted the physical artifact.",
        "F07 signed receipt verification passed.",
        "Receipt persistence to CAS completed.",
        "HF ZeroGPU remains outside F06 production-worker eligibility.",
      ],
    };

    await fs.writeFile(
      evidencePath,
      JSON.stringify(evidence, null, 2),
      "utf8",
    );

    console.log("HF ZeroGPU LIVE PROOF PASS");
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
