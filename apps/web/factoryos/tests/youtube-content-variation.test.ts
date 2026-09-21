/**
 * FactoryOS YouTube Monetization Guardian — Test Suite 3: Content Variation & Scoped Engines
 * Verifies all 11 approved engines, rejection of out-of-scope clipping, and 3 conceptual variants per engine.
 */

import { describe, it, expect } from "vitest";
import {
  APPROVED_CONTENT_ENGINES,
  ApprovedContentEngine,
  EnginePolicyProfiles,
  VariationPlanner,
  CreativeFatigueAnalyzer,
  YouTubePolicyGuardian,
  YouTubePolicyStore,
} from "../core/verification/youtube";
import { ContentGenome, computeGenomeHash, computeGenomeSimilarity } from "../core/creative/ContentGenome";
import { MediaProbeMeasurements } from "../core/verification/VerificationEngine";

describe("YouTube Content Variation — 11 Approved Engines & Anti-Template Proof", () => {
  const policyStore = YouTubePolicyStore.getInstance();
  const guardian = new YouTubePolicyGuardian(policyStore);

  const sampleMeasurements: MediaProbeMeasurements = {
    fileExists: true,
    byteLength: 2800000,
    hasFtypBox: true,
    decodeSmokePassed: true,
    width: 1080,
    height: 1920,
    videoCodec: "h264",
    audioCodec: "aac",
    videoDuration: 40.0,
    audioDuration: 40.0,
    syncDriftMs: 12,
    pixelFormat: "yuv420p",
    fps: 30,
    bitrateKbps: 4200,
    streamCount: 2,
    audioSampleRate: 48000,
    audioChannels: 2,
  };

  const sampleChannel = {
    channelId: "chan_variety_01",
    isTwoStepVerificationEnabled: true,
    hasAdvancedFeaturesAccess: true,
    hasLinkedAdSense: true,
    yppStatus: "CURRENTLY_MONETIZING" as const,
    subscriberCount: 80000,
    validWatchHoursLast365Days: 22000,
    shortsViewsLast90Days: 9000000,
    activeCommunityGuidelinesStrikes: 0,
    countryRegion: "US",
    isChannelThemeConsistent: true,
  };

  it("1. Scoped Engine Boundary — validates exactly the 11 approved engines", () => {
    expect(APPROVED_CONTENT_ENGINES).toHaveLength(11);
    const expected = [
      "Quiz",
      "GK",
      "History",
      "Coding",
      "Motivation",
      "Psychology",
      "News",
      "Reddit",
      "Story",
      "Guess Flag",
      "Guess Logo",
    ];
    for (const engine of expected) {
      expect(EnginePolicyProfiles.isEngineApproved(engine)).toBe(true);
      const profile = EnginePolicyProfiles.getProfile(engine);
      expect(profile.engine).toBe(engine);
    }
  });

  it("2. Out-of-Scope Engine Rejection — strictly rejects movie/TV/cartoon clipping", () => {
    const forbiddenEngines = ["Movie Clipping", "TV Show Clips", "Anime Episodes", "Podcast Clipper", "Celebrity Gossip"];
    for (const forbidden of forbiddenEngines) {
      expect(EnginePolicyProfiles.isEngineApproved(forbidden)).toBe(false);
      expect(() => EnginePolicyProfiles.getProfile(forbidden)).toThrow(/OUT OF SCOPE/);
    }
  });

  it("3. Conceptual Variation Matrix — generates 3 materially distinct variants for every approved engine", () => {
    for (const engine of APPROVED_CONTENT_ENGINES) {
      const topic = `Essential Principles of ${engine}`;
      const plan = VariationPlanner.planVariations(topic, engine, []);

      expect(plan.recommendedOption).toBeDefined();
      expect(plan.alternativeOptions.length).toBeGreaterThanOrEqual(2);

      const all3Options = [plan.recommendedOption, plan.alternativeOptions[0], plan.alternativeOptions[1]];

      // Create 3 genomes
      const gA = VariationPlanner.createGenomeFromOption({
        topic,
        option: all3Options[0],
        scriptText: `Script text for variant A of ${engine}...`,
      });
      const gB = VariationPlanner.createGenomeFromOption({
        topic,
        option: all3Options[1],
        scriptText: `Script text for variant B of ${engine} with contrasting viewpoint...`,
      });
      const gC = VariationPlanner.createGenomeFromOption({
        topic,
        option: all3Options[2],
        scriptText: `Script text for variant C of ${engine} with analytical breakdown...`,
      });

      // Assert distinct hashes
      const hashA = computeGenomeHash(gA);
      const hashB = computeGenomeHash(gB);
      const hashC = computeGenomeHash(gC);
      expect(hashA).not.toBe(hashB);
      expect(hashB).not.toBe(hashC);

      // Assert substantive differences
      const simAB = computeGenomeSimilarity(gA, gB);
      const simBC = computeGenomeSimilarity(gB, gC);
      expect(simAB.compositeSimilarity).toBeLessThanOrEqual(0.70);
      expect(simBC.compositeSimilarity).toBeLessThanOrEqual(0.70);
      expect(simAB.breakdown.storyTypeMatch).toBe(false);
    }
  });

  it("4. Exact Duplicate Gate — strictly blocks candidate with identical script hash", () => {
    const topic = "Why Stars Twinkle";
    const plan = VariationPlanner.planVariations(topic, "GK", []);
    const gOriginal = VariationPlanner.createGenomeFromOption({
      topic,
      option: plan.recommendedOption,
      scriptText: "Atmospheric scintillation causes stellar wavefront perturbation...",
    });

    const gCloneWithRewordedSummary: ContentGenome = {
      ...gOriginal,
      thesis: "Minor cosmetic thesis summary adjustment",
    };

    const duplicateVideo = {
      videoId: "vid_duplicate_01",
      title: "Why Stars Twinkle in the Night Sky",
      description: "Explanation of atmospheric twinkling",
      tags: ["stars", "astronomy"],
      contentEngine: "GK",
      genome: gCloneWithRewordedSummary,
      measurements: sampleMeasurements,
      assets: [],
      scriptText: "Atmospheric scintillation causes stellar wavefront perturbation...",
      scenes: [{}],
    };

    const result = guardian.evaluate({
      video: duplicateVideo,
      channel: {
        ...sampleChannel,
        recentGenomes: [gOriginal],
      },
    });

    expect(result.overallOutcome).toBe("BLOCKED");
    const inauthentic = result.gateFindings.find((f) => f.gateId === "G03_INAUTHENTIC_CONTENT");
    expect(inauthentic?.status).toBe("BLOCKED");
    expect(inauthentic?.explanation).toContain("Exact script clone detected");
  });

  it("5. Superficial Modification Rejection — detects template reuse and high similarity", () => {
    const topic = "History of the Roman Colosseum";
    const plan = VariationPlanner.planVariations(topic, "History", []);
    const gOriginal = VariationPlanner.createGenomeFromOption({
      topic,
      option: plan.recommendedOption,
      scriptText: "Original script of Roman Colosseum...",
      durationSeconds: 42,
    });

    // Cosmetic-only change: identical storyType, hookType, narrativeStructure, visualGrammar, duration + 1s
    const gCosmeticClone: ContentGenome = {
      ...gOriginal,
      durationSeconds: 43,
      scriptHash: "different_script_hash_same_structure",
      // Keep exact storyType, hookType, narrativeStructure, visualGrammar, thesis
    };

    const fatigue = CreativeFatigueAnalyzer.analyze(gCosmeticClone, [gOriginal]);
    expect(fatigue.risk).toBe("HIGH");
    expect(fatigue.templateReuse).toBe(1.0);

    const cosmeticVideo = {
      videoId: "vid_cosmetic_01",
      title: "History of the Roman Colosseum Explored",
      description: "Roman colosseum architecture",
      tags: ["rome", "history", "colosseum"],
      contentEngine: "History",
      genome: gCosmeticClone,
      measurements: sampleMeasurements,
      assets: [],
      scriptText: "Cosmetic clone script with identical thesis...",
      scenes: [{}],
    };

    const result = guardian.evaluate({
      video: cosmeticVideo,
      channel: {
        ...sampleChannel,
        recentGenomes: [gOriginal],
      },
    });

    expect(result.overallOutcome).toBe("REPAIR_REQUIRED");
    const g03 = result.gateFindings.find((f) => f.gateId === "G03_INAUTHENTIC_CONTENT");
    expect(g03?.status).toBe("REPAIR_REQUIRED");
    expect(g03?.explanation).toContain("ShortForge internal creative-diversity threshold");
  });

  it("6. Special Engine Handling — News and Reddit guard against verbatim copying and raw TTS reading", () => {
    // A. Reddit raw TTS check
    const rawRedditVideo = {
      videoId: "vid_reddit_raw",
      title: "r/AskReddit What is your craziest story?",
      description: "Reading top reddit post",
      tags: ["reddit", "stories"],
      contentEngine: "Reddit",
      genome: {
        topic: "Reddit Stories",
        thesis: "verbatim reading of user post",
        storyType: "perspective-narrative" as const,
        hookType: "curiosity-gap" as const,
        narrativeStructure: "chronological-discovery" as const,
        durationSeconds: 40,
        narrationSpeedWpm: 150,
        visualGrammar: "documentary-fast-cut" as const,
        captionGrammar: "kinetic-emphasis" as const,
        audioGrammar: "narration-plus-light-bed" as const,
        sourceSetHash: "src_reddit",
        scriptHash: "hash_reddit_raw",
        variationProfile: "p",
        originalityProfile: "o",
        contentGenomeVersion: 2,
      },
      measurements: sampleMeasurements,
      assets: [],
      scriptText: "r/AskReddit User Throwaway123 writes: Today I woke up...", // Raw TTS signature
      scenes: [{}],
    };

    const redditResult = guardian.evaluate({
      video: rawRedditVideo,
      channel: sampleChannel,
    });
    expect(redditResult.overallOutcome).toBe("REPAIR_REQUIRED");
    const g04 = redditResult.gateFindings.find((f) => f.gateId === "G04_REUSED_CONTENT");
    expect(g04?.status).toBe("REPAIR_REQUIRED");
    expect(g04?.explanation).toContain("Reddit engine output appears to be a direct text-to-speech reading");

    // B. News unverified claims check
    const unverifiedNewsVideo = {
      videoId: "vid_news_unverified",
      title: "Breaking News: Major Financial Merger",
      description: "News wire report",
      tags: ["news", "finance"],
      contentEngine: "News",
      genome: {
        topic: "Breaking News Finance",
        thesis: "Unverified corporate takeover wire",
        storyType: "perspective-narrative" as const,
        hookType: "provocative-statement" as const,
        narrativeStructure: "problem-mechanism-solution" as const,
        durationSeconds: 35,
        narrationSpeedWpm: 165,
        visualGrammar: "documentary-fast-cut" as const,
        captionGrammar: "kinetic-emphasis" as const,
        audioGrammar: "narration-plus-light-bed" as const,
        sourceSetHash: "src_news",
        scriptHash: "hash_news_unverified",
        variationProfile: "p",
        originalityProfile: "o",
        contentGenomeVersion: 2,
      },
      measurements: sampleMeasurements,
      assets: [],
      scriptText: "Sources report that an unconfirmed multi-billion acquisition has occurred...",
      scenes: [{}],
      factualClaimsCount: 4,
      verifiedFactualClaimsCount: 0, // Zero verified claims!
    };

    const newsResult = guardian.evaluate({
      video: unverifiedNewsVideo,
      channel: sampleChannel,
    });
    expect(newsResult.overallOutcome).toBe("READY_WITH_EXTERNAL_REVIEW");
    const g04News = newsResult.gateFindings.find((f) => f.gateId === "G04_REUSED_CONTENT");
    expect(g04News?.status).toBe("EXTERNAL_REVIEW");
    expect(g04News?.explanation).toContain("News topic contains factual assertions without verified source provenance");
  });
});
