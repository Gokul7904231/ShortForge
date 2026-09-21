/**
 * FactoryOS YouTube Monetization Guardian — Test Suite 5: Policy Refresh & Date Transition
 * Tests stale policy detection, source failures, effective-date transitions (TODAY vs 2026-09-24),
 * and scheduled publication crossing policy boundary.
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
    const canonical = policyStore.getSnapshot("2026.09.15")!;

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
      publicationIntentAt: "2026-09-21T00:00:00Z",
    });

    expect(result.overallOutcome).toBe("POLICY_STALE");
    expect(result.publishAllowed).toBe(false);
    expect(result.publishBlockReason).toContain("policy snapshot is STALE");

    const g00 = result.gateFindings.find((f) => f.gateId === "G00_POLICY_FRESHNESS");
    expect(g00?.status).toBe("POLICY_STALE");
    expect(g00?.severity).toBe("BLOCKING");
  });

  it("2. Date-Aware Evaluation — TODAY (Sept 21, 2026) allows 110s Short with Content ID under legacy rules", () => {
    // Current date is 2026-09-21. Content ID rule on > 60s Shorts is effective on 2026-09-24.
    const resultToday = guardian.evaluate({
      video: claimedLongShort,
      channel: sampleChannel,
      publicationIntentAt: "2026-09-21T12:00:00Z", // Pre-Sept 24
    });

    // Content ID rule is not yet active on Sept 21. Standard 180s duration check passes.
    expect(resultToday.overallOutcome).toBe("READY");
    expect(resultToday.publishAllowed).toBe(true);

    const g12Findings = resultToday.gateFindings.filter((f) => f.gateId === "G12_SHORTS_ELIGIBILITY");
    expect(g12Findings.some((f) => f.status === "PASS")).toBe(true);
    expect(resultToday.blockingFindings.length).toBe(0);
  });

  it("3. Date Boundary Crossing — Scheduled publication on Sept 25, 2026 BLOCKS 110s Short with Content ID claim", () => {
    // Same video, but creator schedules publication for Sept 25, 2026 (AFTER effective date 2026-09-24)
    const resultScheduledPostSept24 = guardian.evaluate({
      video: claimedLongShort,
      channel: sampleChannel,
      publicationIntentAt: "2026-09-25T08:00:00Z", // Post-Sept 24 effective date!
    });

    expect(resultScheduledPostSept24.overallOutcome).toBe("BLOCKED");
    expect(resultScheduledPostSept24.publishAllowed).toBe(false);

    const g12ContentId = resultScheduledPostSept24.gateFindings.find(
      (f) => f.gateId === "G12_SHORTS_ELIGIBILITY" && f.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE"
    );
    expect(g12ContentId?.status).toBe("BLOCKED");
    expect(g12ContentId?.severity).toBe("BLOCKING");
    expect(g12ContentId?.explanation).toContain("Shorts longer than 60s with active Content ID claims are ineligible");
    expect(g12ContentId?.suggestedRemediation).toContain("Replace claimed audio bed");
  });

  it("4. Content ID Claim Replacement — replacing claimed audio with original narration bed PASSES post-Sept 24", () => {
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
      publicationIntentAt: "2026-09-25T08:00:00Z",
    });

    expect(resultPostSept24Clean.overallOutcome).toBe("READY");
    expect(resultPostSept24Clean.publishAllowed).toBe(true);
    expect(resultPostSept24Clean.blockingFindings.length).toBe(0);
  });
});
