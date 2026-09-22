/**
 * FactoryOS YouTube Monetization Guardian — Test Suite 2: Channel Audit
 * Verifies channel YPP readiness, 2-Step verification, AdSense, standing, and state distinctions.
 */

import { describe, it, expect } from "vitest";
import { YouTubePolicyGuardian, YouTubePolicyStore } from "../core/verification/youtube";
import { MediaProbeMeasurements } from "../core/verification/VerificationEngine";
import { ContentGenome } from "../core/creative/ContentGenome";

describe("YouTube Channel Audit — YPP Readiness, Account Standing & Truthful State Proof", () => {
  const policyStore = YouTubePolicyStore.getInstance();
  const guardian = new YouTubePolicyGuardian(policyStore);

  const validMeasurements: MediaProbeMeasurements = {
    fileExists: true,
    byteLength: 3000000,
    hasFtypBox: true,
    decodeSmokePassed: true,
    width: 1080,
    height: 1920,
    videoCodec: "h264",
    audioCodec: "aac",
    videoDuration: 50.0,
    audioDuration: 50.0,
    syncDriftMs: 10,
    pixelFormat: "yuv420p",
    fps: 30,
    bitrateKbps: 4000,
    streamCount: 2,
    audioSampleRate: 48000,
    audioChannels: 2,
  };

  const sampleGenome: ContentGenome = {
    topic: "The Great Filter Theory in Astrobiology",
    thesis: "If evolutionary transitions are astronomically improbable, humanity may have already passed the barrier that silences the cosmos.",
    storyType: "deep-analogy",
    hookType: "curiosity-gap",
    narrativeStructure: "problem-mechanism-solution",
    durationSeconds: 50,
    narrationSpeedWpm: 155,
    visualGrammar: "cinematic-macro",
    captionGrammar: "kinetic-emphasis",
    audioGrammar: "ambient-documentary",
    factualClaims: [],
    sourceSetHash: "src_fermi_01",
    scriptHash: "script_fermi_01",
    variationProfile: "profile_filter",
    originalityProfile: "orig_v2",
    contentGenomeVersion: 2,
  };

  const baseVideo = {
    videoId: "vid_fermi_01",
    title: "The Great Filter: Why The Silence of the Universe Is Terrifying",
    description: "An empirical look at the Great Filter solution to the Fermi Paradox.",
    tags: ["fermi paradox", "space", "astrobiology", "science"],
    contentEngine: "History",
    genome: sampleGenome,
    measurements: validMeasurements,
    assets: [
      {
        assetId: "asset_jwst_space",
        role: "IMAGE",
        source: "NASA/ESA Public Domain",
        license: "CC0_PUBLIC_DOMAIN",
        isCommercialSafe: true,
        isOriginalSynthesis: false,
      },
    ],
    scriptText: "Where is everybody? In 1950, Enrico Fermi asked a simple question that still haunts astronomers...",
    scenes: [{}],
    isAutomatedEngagementUsed: false,
  };

  it("1. Missing 2-Step Verification or Advanced Features — triggers EXTERNAL_REVIEW", () => {
    const channelIncomplete = {
      channelId: "chan_unverified",
      isTwoStepVerificationEnabled: false, // Missing 2SV
      hasAdvancedFeaturesAccess: false,    // Missing advanced features
      hasLinkedAdSense: true,
      yppStatus: "ACCEPTED_INTO_YPP" as const,
      subscriberCount: 50000,
      validWatchHoursLast365Days: 12000,
      shortsViewsLast90Days: 8000000,
      activeCommunityGuidelinesStrikes: 0,
      countryRegion: "US",
      isChannelThemeConsistent: true,
    };

    const result = guardian.evaluate({
      video: baseVideo,
      channel: channelIncomplete,
    });

    expect(result.overallOutcome).toBe("READY_WITH_EXTERNAL_REVIEW");
    expect(result.publishAllowed).toBe(false);
    const g01 = result.gateFindings.find((f) => f.gateId === "G01_CHANNEL_READINESS");
    expect(g01?.status).toBe("EXTERNAL_REVIEW");
    expect(g01?.explanation).toContain("2-Step Verification is not enabled");
  });

  it("2. Channel Ready To Apply — distinguishes ready to apply from currently monetizing", () => {
    const channelReadyToApply = {
      channelId: "chan_ready_apply",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      yppStatus: "CHANNEL_READY_TO_APPLY" as const, // Eligible but under review
      subscriberCount: 1500,
      validWatchHoursLast365Days: 4500,
      shortsViewsLast90Days: 1200000,
      activeCommunityGuidelinesStrikes: 0,
      countryRegion: "US",
      isChannelThemeConsistent: true,
    };

    const result = guardian.evaluate({
      video: baseVideo,
      channel: channelReadyToApply,
    });

    expect(result.overallOutcome).toBe("READY_WITH_EXTERNAL_REVIEW");
    const g01 = result.gateFindings.find((f) => f.gateId === "G01_CHANNEL_READINESS");
    expect(g01?.status).toBe("EXTERNAL_REVIEW");
    expect(g01?.explanation).toContain("not yet been accepted into YPP review");
  });

  it("3. Channel Not Yet Eligible — allows video validation but marks revenue share not yet eligible", () => {
    const channelNotYetEligible = {
      channelId: "chan_new",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      yppStatus: "NOT_YET_ELIGIBLE" as const,
      subscriberCount: 120, // Below threshold
      validWatchHoursLast365Days: 80,
      shortsViewsLast90Days: 2000,
      activeCommunityGuidelinesStrikes: 0,
      countryRegion: "US",
      isChannelThemeConsistent: true,
    };

    const result = guardian.evaluate({
      video: baseVideo,
      channel: channelNotYetEligible,
    });

    const g01 = result.gateFindings.find((f) => f.gateId === "G01_CHANNEL_READINESS");
    expect(g01?.status).toBe("NOT_YET_ELIGIBLE");
    expect(g01?.severity).toBe("WARNING");
    // Does not fail the technical video quality
    expect(result.blockingFindings.length).toBe(0);
  });

  it("4. Active Community Guidelines Strike on Channel — strictly BLOCKS publishing", () => {
    const channelWithStrike = {
      channelId: "chan_penalized",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      yppStatus: "CURRENTLY_MONETIZING" as const,
      subscriberCount: 100000,
      validWatchHoursLast365Days: 25000,
      shortsViewsLast90Days: 15000000,
      activeCommunityGuidelinesStrikes: 1, // Active Strike!
      countryRegion: "US",
      isChannelThemeConsistent: true,
    };

    const result = guardian.evaluate({
      video: baseVideo,
      channel: channelWithStrike,
    });

    expect(result.overallOutcome).toBe("BLOCKED");
    expect(result.publishAllowed).toBe(false);
    const g02 = result.gateFindings.find((f) => f.gateId === "G02_COMMUNITY_GUIDELINES");
    expect(g02?.status).toBe("BLOCKED");
    expect(g02?.explanation).toContain("active Community Guidelines strike");
  });

  it("5. Fully Qualified Monetizing Channel — yields PASS on channel readiness gate", () => {
    const channelClean = {
      channelId: "chan_monetizing",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      yppStatus: "CURRENTLY_MONETIZING" as const,
      subscriberCount: 250000,
      validWatchHoursLast365Days: 60000,
      shortsViewsLast90Days: 20000000,
      activeCommunityGuidelinesStrikes: 0,
      countryRegion: "US",
      isChannelThemeConsistent: true,
    };

    const result = guardian.evaluate({
      video: baseVideo,
      channel: channelClean,
    });

    const g01 = result.gateFindings.find((f) => f.gateId === "G01_CHANNEL_READINESS");
    expect(g01?.status).toBe("PASS");
    expect(result.overallOutcome).toBe("READY");
    expect(result.publishAllowed).toBe(true);
  });
});
