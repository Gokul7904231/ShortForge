/**
 * FactoryOS YouTube Monetization Guardian — Test Suite 6: Evidence Receipt & Final Truth Boundary
 * Tests immutable VerificationReceipt generation, cryptographic signatures, tamper detection,
 * evidence partitioning, and truthful release decisions.
 */

import { describe, it, expect } from "vitest";
import * as crypto from "node:crypto";
import {
  F07ReleaseGuardian,
  YouTubePolicyStore,
  VerificationReceipt,
} from "../core/verification/youtube";
import { ContentGenome } from "../core/creative/ContentGenome";
import { MediaProbeMeasurements } from "../core/verification/VerificationEngine";

describe("YouTube Evidence Receipt & Release Decision — Truth Boundary Proof", () => {
  const policyStore = YouTubePolicyStore.getInstance();
  const guardian = new F07ReleaseGuardian(policyStore);

  const perfectMeasurements: MediaProbeMeasurements = {
    fileExists: true,
    byteLength: 3200000,
    hasFtypBox: true,
    decodeSmokePassed: true,
    width: 1080,
    height: 1920,
    videoCodec: "h264",
    audioCodec: "aac",
    videoDuration: 52.0,
    audioDuration: 52.0,
    syncDriftMs: 4,
    pixelFormat: "yuv420p",
    fps: 30,
    bitrateKbps: 4500,
    streamCount: 2,
    audioSampleRate: 48000,
    audioChannels: 2,
  };

  const sampleGenome: ContentGenome = {
    topic: "Psychology of the Pratfall Effect",
    thesis: "Competent individuals who commit minor blunders are perceived as more likable, humanizing interpersonal dynamics.",
    storyType: "deep-analogy",
    hookType: "curiosity-gap",
    narrativeStructure: "problem-mechanism-solution",
    durationSeconds: 52,
    narrationSpeedWpm: 155,
    visualGrammar: "cinematic-macro",
    captionGrammar: "kinetic-emphasis",
    audioGrammar: "narration-plus-light-bed",
    factualClaims: [
      {
        claimId: "fact_pratfall_01",
        claimText: "Aronson's 1966 experiment demonstrated blunder effects on perceived competence.",
        claimType: "VERIFIED_FACT",
        source: "Journal of Personality and Social Psychology",
        retrievedAt: "2026-09-01T00:00:00Z",
        sourceReputationScore: 0.99,
        confidence: 0.99,
      },
    ],
    sourceSetHash: "src_pratfall_01",
    scriptHash: "script_pratfall_01",
    variationProfile: "profile_pratfall",
    originalityProfile: "orig_v2",
    contentGenomeVersion: 2,
  };

  const cleanChannel = {
    channelId: "chan_psych_01",
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

  const candidateVideo = {
    videoId: "vid_psych_pratfall_01",
    title: "Psychology: Why Making Mistakes Actually Makes People Like You More",
    description: "The science of the Pratfall Effect explained in 50 seconds.",
    tags: ["psychology", "pratfall effect", "social science", "human behavior"],
    contentEngine: "Psychology",
    genome: sampleGenome,
    measurements: perfectMeasurements,
    assets: [
      {
        assetId: "asset_psych_broll_01",
        role: "VIDEO_BROLL",
        source: "Commercial Studio Production",
        license: "COMMERCIAL_PERPETUAL",
        isCommercialSafe: true,
        isOriginalSynthesis: true,
      },
    ],
    scriptText: "In 1966, social psychologist Elliot Aronson discovered something counter-intuitive...",
    scenes: [{}],
    factualClaimsCount: 1,
    verifiedFactualClaimsCount: 1,
  };

  it("1. Immutable Verification Receipt — ties physical media, policy version, and hashes into signed record", async () => {
    const artifactSha = "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678";
    const receipt = await guardian.verifyRelease({
      video: candidateVideo,
      channel: cleanChannel,
      publicationIntentAt: "2026-09-21T12:00:00Z",
      artifactSha256: artifactSha,
    });

    expect(receipt.receiptId).toMatch(/^rcpt_vid_psych_pratfall_01_/);
    expect(receipt.artifactId).toBe("vid_psych_pratfall_01");
    expect(receipt.artifactSha256).toBe(artifactSha);
    expect(receipt.contentGenomeHash).toHaveLength(64);
    expect(receipt.policyVersion).toBe("2026.09.15");
    expect(receipt.policySnapshotHash).toHaveLength(64);
    expect(receipt.receiptSignatureSha256).toHaveLength(64);

    // Verify technical forensics
    expect(receipt.technicalForensics.artifactExists).toBe(true);
    expect(receipt.technicalForensics.decodeSmokePassed).toBe(true);
    expect(receipt.technicalForensics.geometry9x16Or1x1).toBe(true);
    expect(receipt.technicalForensics.codecCompliant).toBe(true);

    // Verify decision
    expect(receipt.youtubePolicy.overallOutcome).toBe("READY");
    expect(receipt.youtubePolicy.publishAllowed).toBe(true);
  });

  it("2. Tamper Evident Signature — altering receipt payload breaks signature verification", async () => {
    const artifactSha = "b".repeat(64);
    const receipt = await guardian.verifyRelease({
      video: candidateVideo,
      channel: cleanChannel,
      publicationIntentAt: "2026-09-21T12:00:00Z",
      artifactSha256: artifactSha,
    });

    // Reconstruct canonical payload for signature check
    const validPayload = {
      artifactId: receipt.artifactId,
      artifactSha256: receipt.artifactSha256,
      contentGenomeHash: receipt.contentGenomeHash,
      policySnapshotHash: receipt.policySnapshotHash,
      publicationIntentAt: receipt.publicationIntentAt,
      overallOutcome: receipt.youtubePolicy.overallOutcome,
      publishAllowed: receipt.youtubePolicy.publishAllowed,
      gateCount: receipt.youtubePolicy.gateFindings.length,
      generatedAt: receipt.generatedAt,
    };

    const calculatedSig = crypto
      .createHash("sha256")
      .update(JSON.stringify(validPayload))
      .digest("hex");
    expect(calculatedSig).toBe(receipt.receiptSignatureSha256);

    // If an attacker attempts to tamper with publishAllowed: false -> true
    const tamperedPayload = {
      ...validPayload,
      publishAllowed: !validPayload.publishAllowed,
    };
    const tamperedSig = crypto
      .createHash("sha256")
      .update(JSON.stringify(tamperedPayload))
      .digest("hex");
    expect(tamperedSig).not.toBe(receipt.receiptSignatureSha256);
  });

  it("3. Evidence Partitioning — cleanly separates deterministic facts, AI inferences, and platform observations", async () => {
    const receipt = await guardian.verifyRelease({
      video: candidateVideo,
      channel: cleanChannel,
      publicationIntentAt: "2026-09-21T12:00:00Z",
      artifactSha256: "c".repeat(64),
    });

    const part = receipt.evidencePartition;
    expect(part.deterministicFacts.length).toBeGreaterThan(0);
    expect(part.deterministicFacts.some((f) => f.includes("Artifact exists"))).toBe(true);
    expect(part.deterministicFacts.some((f) => f.includes("Resolution"))).toBe(true);
    expect(part.deterministicFacts.some((f) => f.includes("G00_POLICY_FRESHNESS"))).toBe(true);
  });

  it("4. Never Claims Guaranteed YouTube Monetization — truthful readiness state", async () => {
    const receipt = await guardian.verifyRelease({
      video: candidateVideo,
      channel: cleanChannel,
      publicationIntentAt: "2026-09-21T12:00:00Z",
      artifactSha256: "d".repeat(64),
    });

    // Valid values for overallOutcome are strictly bounded
    const validStates = [
      "READY",
      "READY_WITH_EXTERNAL_REVIEW",
      "REPAIR_REQUIRED",
      "BLOCKED",
      "NOT_YET_ELIGIBLE",
      "POLICY_STALE",
      "UNKNOWN",
    ];
    expect(validStates).toContain(receipt.youtubePolicy.overallOutcome);

    // Never produces "MONETIZABLE = TRUE" or guaranteed future platform payouts
    expect((receipt as any).isMonetizationGuaranteed).toBeUndefined();
    expect((receipt as any).monetizable).toBeUndefined();
  });

  it("5. Zero Synthetic Fallback — missing or empty artifactSha256 fails closed without physical bytes", async () => {
    const receipt = await guardian.verifyRelease({
      video: candidateVideo,
      channel: cleanChannel,
      publicationIntentAt: "2026-09-21T12:00:00Z",
      // artifactSha256 deliberately omitted and no localMediaPath provided
    });

    expect(receipt.youtubePolicy.publishAllowed).toBe(false);
    expect(receipt.youtubePolicy.overallOutcome).toBe("BLOCKED");
    expect(receipt.youtubePolicy.publishBlockReason).toContain("Missing or empty placeholder artifact SHA-256 identity");
  });

  it("6. DryRun YouTube Provider Quarantine — strictly blocked in production and tagged isSimulated: true", async () => {
    const { DryRunYouTubeProvider } = await import("../../publishing/providers/dryrun-youtube");
    const { PublicationAuthorizationService } = await import("../../publishing/authorization/PublicationAuthorizationService");

    const authService = PublicationAuthorizationService.getInstance();
    const canonicalParams = {
      jobId: "job_quarantine_test",
      title: "Test Video",
      description: "Test Description",
      tags: ["test"],
      privacyStatus: "unlisted" as const,
      channelId: cleanChannel.channelId,
      platform: "youtube",
    };
    const validReceipt = await guardian.verifyRelease({
      video: candidateVideo,
      channel: cleanChannel,
      publicationIntentAt: "2026-09-21T12:00:00Z",
      artifactSha256: "d".repeat(64),
    });
    const auth = authService.issueAuthorization({
      receipt: validReceipt,
      canonicalPayload: canonicalParams,
      targetPlatform: "youtube",
    });

    const validPayload = {
      ...canonicalParams,
      videoUrl: "cas://vid1",
      authorization: auth,
    };

    // 1. In production, must throw fatal quarantine error
    const oldEnv = process.env.NODE_ENV;
    const oldAllow = process.env.ALLOW_SIMULATED_PUBLISHING;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_SIMULATED_PUBLISHING;

      await expect(DryRunYouTubeProvider.publish(validPayload)).rejects.toThrow(
        /Simulated publishing provider is strictly quarantined in production/
      );
    } finally {
      process.env.NODE_ENV = oldEnv;
      process.env.ALLOW_SIMULATED_PUBLISHING = oldAllow;
    }

    // 2. In non-production, returns isSimulated: true
    const result = await DryRunYouTubeProvider.publish(validPayload);
    expect(result.success).toBe(true);
    expect(result.isSimulated).toBe(true);
    expect(result.postId).toContain("dryrun_yt_");
  });
});
