/**
 * FactoryOS YouTube Monetization Guardian — Test Suite 5: Policy Refresh & Date Transition
 * Tests stale-policy detection, source failures, current Shorts Content ID blocking, and claim resolution.
 */

import { describe, it, expect } from "vitest";
import {
  YouTubePolicyStore,
  YouTubePolicyGuardian,
  YouTubePolicySnapshotManager,
  PolicySourceRegistry,
  PolicySnapshot,
} from "../core/verification/youtube";
import { ContentGenome } from "../core/creative/ContentGenome";
import { MediaProbeMeasurements } from "../core/verification/VerificationEngine";

describe("YouTube Policy Refresh & Effective-Date Transitions — Stale Gates & Date Proof", () => {
  const policyStore = YouTubePolicyStore.getInstance();
  const guardian = new YouTubePolicyGuardian(policyStore);

  const longShortMeasurements: MediaProbeMeasurements = {
    fileExists: true,
    byteLength: 4500000,
    hasFtypBox: true,
    decodeSmokePassed: true,
    width: 1080,
    height: 1920,
    videoCodec: "h264",
    audioCodec: "aac",
    videoDuration: 110.0, // 110 seconds (> 60s and <= 180s)
    audioDuration: 110.0,
    syncDriftMs: 5,
    pixelFormat: "yuv420p",
    fps: 30,
    bitrateKbps: 4000,
    streamCount: 2,
    audioSampleRate: 48000,
    audioChannels: 2,
  };

  const sampleGenome: ContentGenome = {
    topic: "History of the Silk Road Trade Routes",
    thesis: "The Silk Road was not a single highway but a dynamic decentralized network of desert caravans that shaped Eurasian genetics.",
    storyType: "historical-context",
    hookType: "curiosity-gap",
    narrativeStructure: "chronological-discovery",
    durationSeconds: 110,
    narrationSpeedWpm: 150,
    visualGrammar: "documentary-fast-cut",
    captionGrammar: "phrase-chunked",
    audioGrammar: "ambient-documentary",
    factualClaims: [],
    sourceSetHash: "src_silk_01",
    scriptHash: "script_silk_01",
    variationProfile: "p_silk",
    originalityProfile: "o_silk",
    contentGenomeVersion: 2,
  };

  const sampleChannel = {
    channelId: "chan_history_01",
    isTwoStepVerificationEnabled: true,
    hasAdvancedFeaturesAccess: true,
    hasLinkedAdSense: true,
    yppStatus: "CURRENTLY_MONETIZING" as const,
    subscriberCount: 150000,
    validWatchHoursLast365Days: 45000,
    shortsViewsLast90Days: 12000000,
    activeCommunityGuidelinesStrikes: 0,
    countryRegion: "US",
    isChannelThemeConsistent: true,
  };

  const claimedLongShort = {
    videoId: "vid_silk_long_01",
    title: "The Silk Road: How Ancient Trade Shaped Modern Civilizations",
    description: "Deep dive documentary into ancient Eurasian trade caravans.",
    tags: ["silk road", "history", "ancient trade", "documentary"],
    contentEngine: "History",
    genome: sampleGenome,
    measurements: longShortMeasurements,
    assets: [
      {
        assetId: "claimed_audio_bed_01",
        role: "AUDIO_BED",
        source: "YouTube Audio Library (Licensed with Content ID tracking)",
        license: "YOUTUBE_AUDIO_LIBRARY_WITH_CONTENT_ID",
        isCommercialSafe: true,
        isOriginalSynthesis: false,
      },
    ],
    scriptText: "Across 4,000 miles of unforgiving desert and mountain passes, ancient merchants carried silk...",
    scenes: [{}],
    hasActiveContentIdClaim: true, // Content ID claim active on background music track!
    contentIdClaimDurationSeconds: 110,
  };

  it("1. Stale Policy Snapshot Gate (G00) — strictly blocks release if snapshot is marked STALE", () => {
    const canonical = policyStore.getSnapshot("2026.10.17")!;

    // Create a stale snapshot
    const staleSnapshot: PolicySnapshot = YouTubePolicySnapshotManager.createSnapshot({
      policyVersion: "2024.01.01",
      retrievedAt: "2024-01-01T00:00:00Z",
      effectiveAt: "2024-01-01T00:00:00Z",
      policyState: "STALE", // Mark stale!
      sourceDocuments: canonical.sourceDocuments,
      rules: canonical.rules,
    });

    const result = guardian.evaluate({
      video: claimedLongShort,
      channel: sampleChannel,
      snapshot: staleSnapshot,
      publicationIntentAt: "2026-10-17T00:00:00Z",
    });

    expect(result.overallOutcome).toBe("POLICY_STALE");
    expect(result.publishAllowed).toBe(false);
    expect(result.publishBlockReason).toContain("policy snapshot is STALE");

    const g00 = result.gateFindings.find((f) => f.gateId === "G00_POLICY_FRESHNESS");
    expect(g00?.status).toBe("POLICY_STALE");
    expect(g00?.severity).toBe("BLOCKING");
  });

  it("2. Current Content ID Rule — post-2026-09-24 claims do not imply automatic blocking or revenue transfer", () => {
    const result = guardian.evaluate({
      video: claimedLongShort,
      channel: sampleChannel,
      publicationIntentAt: "2026-10-17T12:00:00Z",
      uploadIntentAt: "2026-10-17T12:00:00Z",
    });

    expect(result.publishAllowed).toBe(true);
    expect(result.activePolicyEffects).toContain("EXTERNAL_REVIEW");
    expect(result.activePolicyEffects).not.toContain("BLOCK_PUBLICATION");
    const g12 = result.gateFindings.find((f) => f.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE");
    expect(g12?.status).toBe("PASS");
    expect(g12?.severity).toBe("WARNING");
    expect(g12?.explanation).toContain("may remain playable");
    expect(g12?.observedSignal).not.toHaveProperty("revenueEffect");
  });

  it("3. Effective-date boundary — Guardian selects legacy block before cutoff and review-only transition on/after cutoff", () => {
    const beforeTransition = guardian.evaluate({
      video: claimedLongShort,
      channel: sampleChannel,
      publicationIntentAt: "2026-09-23T23:59:59Z",
      uploadIntentAt: "2026-09-23T23:59:59Z",
    });
    expect(beforeTransition.publishAllowed).toBe(false);
    expect(beforeTransition.activePolicyEffects).toContain("BLOCK_PUBLICATION");
    const legacyFinding = beforeTransition.gateFindings.find(
      (finding) => finding.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE_LEGACY"
    );
    expect(legacyFinding?.status).toBe("BLOCKED");
    expect(legacyFinding?.severity).toBe("BLOCKING");
    expect(legacyFinding?.observedSignal?.playbackEffect).toBe("BLOCKED");

    const afterTransition = guardian.evaluate({
      video: claimedLongShort,
      channel: sampleChannel,
      publicationIntentAt: "2026-09-24T00:00:00Z",
      uploadIntentAt: "2026-09-24T00:00:00Z",
    });
    expect(afterTransition.publishAllowed).toBe(true);
    expect(afterTransition.activePolicyEffects).toContain("EXTERNAL_REVIEW");
    expect(afterTransition.activePolicyEffects).not.toContain("BLOCK_PUBLICATION");
    expect(afterTransition.gateFindings.some(
      (finding) => finding.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE_LEGACY"
    )).toBe(false);
    const currentFinding = afterTransition.gateFindings.find(
      (finding) => finding.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE"
    );
    expect(currentFinding?.status).toBe("PASS");
    expect(currentFinding?.severity).toBe("WARNING");
    expect(currentFinding?.explanation).toContain("may remain playable");
    expect(currentFinding?.observedSignal).not.toHaveProperty("revenueEffect");
  });

  it("4. Content ID Claim Replacement — replacing claimed audio with original narration bed passes when claim is resolved", () => {
    // Creator replaces claimed music bed with royalty-free original audio bed
    const cleanLongShort = {
      ...claimedLongShort,
      hasActiveContentIdClaim: false, // Claim resolved!
      contentIdClaimDurationSeconds: 0,
      assets: [
        {
          assetId: "royalty_free_silk_audio",
          role: "AUDIO_BED",
          source: "YouTube Audio Library (Royalty-Free)",
          license: "CC0_PUBLIC_DOMAIN",
          isCommercialSafe: true,
          isOriginalSynthesis: true,
        },
      ],
    };

    const resultPostSept24Clean = guardian.evaluate({
      video: cleanLongShort,
      channel: sampleChannel,
      publicationIntentAt: "2026-10-17T08:00:00Z",
    });

    expect(resultPostSept24Clean.overallOutcome).toBe("READY");
    expect(resultPostSept24Clean.publishAllowed).toBe(true);
    expect(resultPostSept24Clean.blockingFindings.length).toBe(0);
  });
});
