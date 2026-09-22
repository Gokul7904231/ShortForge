/**
 * FactoryOS YouTube Monetization Guardian — Test Suite 1: Policy Engine
 * Tests policy snapshot creation, versioning, diffing, date-awareness, and deterministic gates.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  PolicySourceRegistry,
  YouTubePolicySnapshotManager,
  YouTubePolicyStore,
  YouTubePolicyEvaluator,
  YouTubePolicyGuardian,
  PolicySnapshot,
} from "../core/verification/youtube";
import { MediaProbeMeasurements } from "../core/verification/VerificationEngine";
import { ContentGenome } from "../core/creative/ContentGenome";

describe("YouTube Policy Engine — Snapshots, Versioning, Diffs & Date-Aware IR", () => {
  let policyStore: YouTubePolicyStore;

  const sampleMeasurements: MediaProbeMeasurements = {
    fileExists: true,
    byteLength: 2500000,
    hasFtypBox: true,
    decodeSmokePassed: true,
    width: 1080,
    height: 1920,
    videoCodec: "h264",
    audioCodec: "aac",
    videoDuration: 45.0,
    audioDuration: 45.0,
    syncDriftMs: 15,
    pixelFormat: "yuv420p",
    fps: 30,
    bitrateKbps: 4500,
    streamCount: 2,
    audioSampleRate: 48000,
    audioChannels: 2,
  };

  const sampleGenome: ContentGenome = {
    topic: "Why Quantum Computers Need Absolute Zero",
    thesis: "Superconducting qubits lose quantum coherence if thermal noise disrupts their zero-resistance Josephson junctions.",
    storyType: "engineering-breakdown",
    hookType: "curiosity-gap",
    narrativeStructure: "three-layer-breakdown",
    durationSeconds: 45,
    narrationSpeedWpm: 160,
    visualGrammar: "isometric-diagrammatic",
    captionGrammar: "kinetic-emphasis",
    audioGrammar: "narration-plus-light-bed",
    factualClaims: [],
    sourceSetHash: "src_quantum_01",
    scriptHash: "script_hash_quantum_01",
    variationProfile: "profile_quantum",
    originalityProfile: "orig_v2",
    contentGenomeVersion: 2,
  };

  beforeEach(() => {
    YouTubePolicyStore.resetInstance();
    policyStore = YouTubePolicyStore.getInstance();
  });

  it("1. Official Source Registry — contains canonical official Google documentation with SHA-256 hashes", () => {
    const sources = PolicySourceRegistry.getOfficialSources();
    expect(sources.length).toBeGreaterThanOrEqual(10);

    for (const doc of sources) {
      expect(doc.officialUrl).toMatch(/https:\/\/(support\.google\.com|www\.youtube\.com)/);
      expect(doc.contentChecksumSha256).toHaveLength(64);
      expect(doc.effectiveDate).toBeDefined();
    }

    const monetizationDoc = PolicySourceRegistry.getSourceByDomain("CHANNEL_MONETIZATION");
    expect(monetizationDoc?.officialUrl).toBe("https://support.google.com/youtube/answer/1311392");
  });

  it("2. Policy Snapshot Creation & Hashing — generates reproducible deterministic SHA-256 fingerprints", () => {
    const snapshot = policyStore.getSnapshot("2026.09.15");
    expect(snapshot).toBeDefined();
    expect(snapshot?.policyPack).toBe("youtube");
    expect(snapshot?.snapshotHashSha256).toHaveLength(64);

    // Recomputing with same inputs produces identical hash
    const recomputedHash = YouTubePolicySnapshotManager.computeSnapshotHash(
      snapshot!.policyVersion,
      snapshot!.effectiveAt,
      snapshot!.sourceHashes,
      snapshot!.rules
    );
    expect(recomputedHash).toBe(snapshot!.snapshotHashSha256);
  });

  it("3. Policy Diffing — accurately tracks added, removed, and modified rules between versions", () => {
    const v1 = policyStore.getSnapshot("2026.09.15")!;

    // Create synthetic v2 with one added rule, one modified severity, and one removed rule
    const modifiedRules = v1.rules.map((r) => {
      if (r.ruleId === "YT.INAUTHENTIC.MASS_PRODUCED") {
        return { ...r, severity: "BLOCKING" as const }; // Upgraded severity
      }
      return r;
    }).filter((r) => r.ruleId !== "YT.KIDS.QUALITY_STANDARDS"); // Removed rule

    const addedRule = {
      ruleId: "YT.FUTURE.NEW_REGULATION",
      gateId: "G00_POLICY_FRESHNESS" as const,
      sourceDocumentId: "src_yt_policy_updates",
      title: "New Experimental Regulation",
      description: "Test future rule",
      severity: "WARNING" as const,
      evaluationMethod: "DETERMINISTIC" as const,
      appliesBy: "PUBLICATION_DATE" as const,
      policyEffect: "PLAYBACK_IMPACT" as const,
      effectiveFrom: "2026-10-01",
      condition: {},
      affectedStagesOnFailure: ["F07" as const],
      suggestedRemediationAction: "Adapt",
      forbiddenShallowRepairs: [],
    };

    const v2: PolicySnapshot = YouTubePolicySnapshotManager.createSnapshot({
      policyVersion: "2026.10.01",
      retrievedAt: "2026-10-01T00:00:00Z",
      effectiveAt: "2026-10-01T00:00:00Z",
      sourceDocuments: v1.sourceDocuments,
      rules: [...modifiedRules, addedRule],
    });

    const diff = YouTubePolicySnapshotManager.diffSnapshots(v1, v2);
    expect(diff.priorVersion).toBe("2026.09.15");
    expect(diff.currentVersion).toBe("2026.10.01");
    expect(diff.addedRules.length).toBe(1);
    expect(diff.addedRules[0].ruleId).toBe("YT.FUTURE.NEW_REGULATION");
    expect(diff.removedRules.length).toBe(1);
    expect(diff.removedRules[0].ruleId).toBe("YT.KIDS.QUALITY_STANDARDS");
    expect(diff.modifiedRules.length).toBe(1);
    expect(diff.modifiedRules[0].ruleId).toBe("YT.INAUTHENTIC.MASS_PRODUCED");
    expect(diff.modifiedRules[0].changes[0]).toContain("severity: REPAIRABLE -> BLOCKING");
  });

  it("4. Date-Aware Rule Filtering — resolves active rules based on publication-intent date", () => {
    const snapshot = policyStore.getSnapshot("2026.09.15")!;

    // Case A: Published BEFORE Sept 24, 2026 (e.g. Sept 21)
    const activeRulesPreSept24 = YouTubePolicyEvaluator.filterActiveRules(
      snapshot.rules,
      "2026-09-21T12:00:00Z"
    );
    const contentIdRulePre = activeRulesPreSept24.find(
      (r) => r.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE"
    );
    expect(contentIdRulePre).toBeUndefined(); // Not yet effective

    // Case B: Published ON or AFTER Sept 24, 2026 (e.g. Sept 25)
    const activeRulesPostSept24 = YouTubePolicyEvaluator.filterActiveRules(
      snapshot.rules,
      "2026-09-25T12:00:00Z"
    );
    const contentIdRulePost = activeRulesPostSept24.find(
      (r) => r.ruleId === "YT.SHORTS.CONTENT_ID_OVER_ONE_MINUTE"
    );
    expect(contentIdRulePost).toBeDefined(); // Effective!
    expect(contentIdRulePost?.effectiveFrom).toBe("2026-09-24");
  });

  it("5. Deterministic Hard Gate Execution — zero overrides allowed on physical and rights failures", () => {
    const guardian = new YouTubePolicyGuardian(policyStore);

    const invalidRightsVideo = {
      videoId: "vid_test_01",
      title: "Valid Title About Quantum Computing",
      description: "Description of quantum physics",
      tags: ["quantum", "physics"],
      contentEngine: "Coding",
      genome: sampleGenome,
      measurements: sampleMeasurements,
      assets: [
        {
          assetId: "asset_unlicensed_01",
          role: "VIDEO_BROLL",
          source: "unknown_web",
          license: "NONE",
          isCommercialSafe: false, // Uncleared rights
          isOriginalSynthesis: false,
        },
      ],
      scriptText: "A complete script explaining quantum superposition and decoherence...",
      scenes: [{}],
    };

    const channel = {
      channelId: "chan_001",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      yppStatus: "CURRENTLY_MONETIZING" as const,
      subscriberCount: 25000,
      validWatchHoursLast365Days: 8000,
      shortsViewsLast90Days: 5000000,
      activeCommunityGuidelinesStrikes: 0,
      countryRegion: "US",
      isChannelThemeConsistent: true,
    };

    const result = guardian.evaluate({
      video: invalidRightsVideo,
      channel,
      publicationIntentAt: "2026-09-21T00:00:00Z",
    });

    expect(result.overallOutcome).toBe("BLOCKED");
    expect(result.publishAllowed).toBe(false);
    expect(result.blockingFindings.some((f) => f.gateId === "G05_COMMERCIAL_RIGHTS")).toBe(true);
  });
});
