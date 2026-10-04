/**
 * Live hosted sandbox physical proof with F07 independent release verification.
 *
 * Evidence chain:
 * provider auth -> sandbox provision -> real FFmpeg MP4 -> download ->
 * independent CAS integrity -> F07 physical verification -> signed receipt ->
 * receipt persisted to CAS -> sandbox termination.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  F07ReleaseGuardian,
  YouTubePolicyStore,
  VerificationReceiptVerifier,
} from "../core/verification/youtube";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { DaytonaSandboxAdapter, ModalSandboxAdapter } from "../core/compute/sandboxes";

describe("live hosted sandbox compute proof", () => {
  it("provisions, executes a physical render, verifies CAS independently, and closes the F07 evidence boundary", async () => {
    const provider = String(process.env.SHORTFORGE_LIVE_SANDBOX_PROVIDER || "").toUpperCase();
    const command = process.env.SHORTFORGE_LIVE_SANDBOX_RENDER_COMMAND;
    const outputPath = process.env.SHORTFORGE_LIVE_SANDBOX_OUTPUT_PATH || "/tmp/shortforge/live-smoke.mp4";
    const evidencePath =
      process.env.SHORTFORGE_LIVE_SANDBOX_EVIDENCE_PATH ||
      path.join(os.tmpdir(), "shortforge", "live-sandbox-f07-evidence.json");

    expect(["DAYTONA", "MODAL"]).toContain(provider);
    expect(command).toBeTruthy();

    const adapter = provider === "DAYTONA" ? new DaytonaSandboxAdapter() : new ModalSandboxAdapter();
    const validation = await adapter.validateCredentials();
    expect(validation.configured).toBe(true);
    expect(validation.authenticated).toBe(true);
    expect(validation.providerReachable).toBe(true);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shortforge-live-sandbox-"));
    const localOutput = path.join(tempDir, "live-smoke.mp4");
    let runtime: any;

    try {
      const provision = await adapter.provision({
        idempotencyKey: "live-sandbox-smoke-" + Date.now().toString(36),
        template:
          process.env.SHORTFORGE_LIVE_SANDBOX_IMAGE ||
          (provider === "DAYTONA" ? process.env.DAYTONA_SANDBOX_IMAGE : process.env.MODAL_SANDBOX_IMAGE),
        ttlSeconds: 900,
        metadata: { shortforge_name: "shortforge-live-sandbox-smoke" },
      });

      runtime = provision.runtime;
      if (runtime.state !== "RUNNING" && runtime.state !== "READY") {
        runtime = await adapter.waitReady(runtime.resourceId, 120_000);
      }

      const result = await adapter.execute({
        runtime,
        command: command.replaceAll("{{OUTPUT_PATH}}", outputPath),
        timeoutMs: 120_000,
        env: { SHORTFORGE_OUTPUT_PATH: outputPath },
      });

      expect(result.status).toBe("SUCCEEDED");
      expect(result.exitCode).toBe(0);

      await fs.mkdir(path.dirname(localOutput), { recursive: true });
      if (!adapter.downloadFile) throw new Error("LIVE_SANDBOX_DOWNLOAD_UNSUPPORTED");
      await adapter.downloadFile({
        runtime,
        remotePath: outputPath,
        localPath: localOutput,
        timeoutMs: 120_000,
      });

      const stat = await fs.stat(localOutput);
      expect(stat.size).toBeGreaterThan(1024);

      const cas = ContentAddressedStore.getInstance();
      const artifact = await cas.putFile(localOutput, "output_mp4", "video/mp4", {
        provider,
        proof: "live-hosted-sandbox",
        runtimeId: runtime.resourceId,
      });

      expect(artifact.sha256).toHaveLength(64);
      expect(artifact.byteLength).toBe(stat.size);
      expect(await cas.verify(artifact)).toBe(true);

      /*
       * F07 receives the immutable CAS identity, not provider-declared
       * measurements. The deliberately incorrect declared dimensions/duration
       * below prove that F07 must resolve and probe the physical CAS bytes.
       */
      const publicationIntentAt = new Date().toISOString();
      const videoId = "live_" + provider.toLowerCase() + "_" + Date.now().toString(36);
      const video = {
        videoId,
        title: "ShortForge Hosted Compute Render Verification",
        description: "Controlled technical verification of a hosted sandbox render.",
        tags: ["shortforge", "compute", "render"],
        contentEngine: "Coding",
        genome: {
          topic: "Hosted sandbox render verification",
          thesis: "A controlled hosted render should produce a physically verifiable MP4 artifact.",
          storyType: "engineering-breakdown",
          hookType: "curiosity-gap",
          narrativeStructure: "problem-mechanism-solution",
          durationSeconds: 1,
          narrationSpeedWpm: 150,
          visualGrammar: "isometric-diagrammatic",
          captionGrammar: "kinetic-emphasis",
          audioGrammar: "narration-plus-light-bed",
          factualClaims: [],
          sourceSetHash: "live_compute_proof_source_v1",
          scriptHash: "live_compute_proof_script_v1",
          variationProfile: "live_compute_proof_variation_v1",
          originalityProfile: "live_compute_proof_originality_v1",
          contentGenomeVersion: 2,
          generatedAt: publicationIntentAt,
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
        scriptText: "Controlled hosted render evidence.",
        scenes: [{ id: "live-proof-scene" }],
        factualClaimsCount: 0,
        verifiedFactualClaimsCount: 0,
      };

      const channel = {
        channelId: "shortforge-live-proof-channel",
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

      const guardian = new F07ReleaseGuardian(YouTubePolicyStore.getInstance());
      const artifactCasRef = `cas://${artifact.sha256}`;
      const receipt = await guardian.verifyRelease({
        video,
        channel,
        publicationIntentAt,
        artifactSha256: artifact.sha256,
        artifactCasRef,
      });

      expect(receipt.artifactSha256).toBe(artifact.sha256);
      expect(receipt.artifactCasRef).toBe(artifactCasRef);
      expect(receipt.technicalForensics.artifactExists).toBe(true);
      expect(receipt.technicalForensics.decodeSmokePassed).toBe(true);
      expect(receipt.technicalForensics.geometry9x16Or1x1).toBe(true);
      expect(receipt.technicalForensics.codecCompliant).toBe(true);
      expect(receipt.technicalForensics.measurements.width).toBe(1080);
      expect(receipt.technicalForensics.measurements.height).toBe(1920);
      expect(receipt.technicalForensics.measurements.videoDuration).toBeGreaterThanOrEqual(1);
      expect(receipt.technicalForensics.measurements.videoDuration).toBeLessThanOrEqual(180);
      expect(receipt.youtubePolicy.publishAllowed).toBe(true);
      expect(["READY", "READY_WITH_EXTERNAL_REVIEW"]).toContain(receipt.youtubePolicy.overallOutcome);
      expect(receipt.evidenceRefs?.some((ref) => ref.evidenceType === "PHYSICAL_MEASUREMENT")).toBe(true);
      expect(receipt.evidenceRefs?.some((ref) => ref.evidenceType === "CAS_ARTIFACT")).toBe(true);

      const signatureVerification = VerificationReceiptVerifier.verify(receipt);
      expect(signatureVerification.valid).toBe(true);

      const persistedReceiptUri = await VerificationReceiptVerifier.persistToCas(receipt);
      expect(persistedReceiptUri).toBeTruthy();

      await fs.mkdir(path.dirname(evidencePath), { recursive: true });
      await fs.writeFile(
        evidencePath,
        JSON.stringify(
          {
            evidenceVersion: "1.0",
            proof: "live-hosted-sandbox-f07",
            provider,
            runtimeId: runtime.resourceId,
            artifact: {
              sha256: artifact.sha256,
              casRef: artifactCasRef,
              byteLength: artifact.byteLength,
            },
            f07: {
              receiptId: receipt.receiptId,
              overallOutcome: receipt.youtubePolicy.overallOutcome,
              publishAllowed: receipt.youtubePolicy.publishAllowed,
              artifactCasRef: receipt.artifactCasRef,
              artifactSha256: receipt.artifactSha256,
              receiptSignatureVerified: signatureVerification.valid,
              persistedReceiptUri,
              measurements: receipt.technicalForensics.measurements,
            },
            generatedAt: receipt.generatedAt,
          },
          null,
          2
        ),
        "utf8"
      );
    } finally {
      if (runtime) await adapter.terminate(runtime).catch(() => undefined);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 180_000);
});
