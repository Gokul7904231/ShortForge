/**
 * FactoryOS YouTube Monetization Guardian — Test Suite 4: ReMaker Remediation & Evidence Invalidation
 * Verifies structured RemediationCases, targeted floor repair routing, and downstream evidence invalidation.
 */

import { describe, it, expect } from "vitest";
import {
  YouTubeRemediationPlanner,
  EvidenceInvalidationTracker,
  GateEvaluationFinding,
  F07ReleaseGuardian,
  YouTubePolicyStore,
} from "../core/verification/youtube";
import { ContentGenome } from "../core/creative/ContentGenome";
import { MediaProbeMeasurements } from "../core/verification/VerificationEngine";

describe("YouTube ReMaker Remediation & Evidence Invalidation — Targeted Repairs & Proof", () => {
  const policyStore = YouTubePolicyStore.getInstance();

  const sampleMeasurements: MediaProbeMeasurements = {
    fileExists: true,
    byteLength: 2600000,
    hasFtypBox: true,
    decodeSmokePassed: true,
    width: 1080,
    height: 1920,
    videoCodec: "h264",
    audioCodec: "aac",
    videoDuration: 45.0,
    audioDuration: 45.0,
    syncDriftMs: 8,
    pixelFormat: "yuv420p",
    fps: 30,
    bitrateKbps: 4100,
    streamCount: 2,
    audioSampleRate: 48000,
    audioChannels: 2,
  };

  const sampleGenome: ContentGenome = {
    topic: "Why Airplanes Fly In Cold Weather",
    thesis: "Air density increases with cold temperatures, providing greater aerodynamic lift per unit of thrust.",
    storyType: "engineering-breakdown",
    hookType: "curiosity-gap",
    narrativeStructure: "three-layer-breakdown",
    durationSeconds: 45,
    narrationSpeedWpm: 160,
    visualGrammar: "isometric-diagrammatic",
    captionGrammar: "kinetic-emphasis",
    audioGrammar: "narration-plus-light-bed",
    factualClaims: [],
    sourceSetHash: "src_aero_01",
    scriptHash: "script_aero_01",
    variationProfile: "profile_aero",
    originalityProfile: "orig_v2",
    contentGenomeVersion: 2,
  };

  it("1. Structured Remediation Case Generation — includes policyId, affected floors, allowed/forbidden actions", () => {
    const finding: GateEvaluationFinding = {
      gateId: "G03_INAUTHENTIC_CONTENT",
      ruleId: "YT.INAUTHENTIC.MASS_PRODUCED",
      status: "REPAIR_REQUIRED",
      severity: "REPAIRABLE",
      observedSignal: { maxSimilarity: 0.88, threshold: 0.70 },
      explanation: "Substantive narrative structure repeated from recent channel videos.",
      evidence: ["Similarity score: 88.0%", "Hook match: TRUE", "Structure match: TRUE"],
      affectedStages: ["F01", "F02"],
      suggestedRemediation: "Change substantive narrative experience and restructure hook.",
      forbiddenShallowRepairs: ["font-only change", "color-only change", "zoom-only change"],
      evaluationType: "HYBRID",
      confidence: 0.95,
    };

    const remCase = YouTubeRemediationPlanner.planRemediation(finding, {
      topic: "Why Airplanes Fly In Cold Weather",
      contentEngine: "GK",
    });

    expect(remCase.caseId).toMatch(/^case_g03_inauthentic_content_/);
    expect(remCase.policyId).toBe("YT.INAUTHENTIC.MASS_PRODUCED");
    expect(remCase.affectedStages).toEqual(["F01", "F02"]);
    expect(remCase.allowedActions).toContain("rewrite hook");
    expect(remCase.allowedActions).toContain("change narrative structure");
    expect(remCase.forbiddenShallowRepairs).toContain("font-only change");
    expect(remCase.preserve).toContain("verified facts");
    expect(remCase.rerunRequired).toContain("variation");
    expect(remCase.rerunRequired).toContain("f07");
  });

  it("2. Targeted Stage Routing — maps smallest affected surface without resetting whole factory", () => {
    // A. AudioBed issue -> affectedStages: F04
    const audioFinding: GateEvaluationFinding = {
      gateId: "G05_COMMERCIAL_RIGHTS",
      ruleId: "YT.RIGHTS.COMMERCIAL_CLEARANCE",
      status: "REPAIR_REQUIRED",
      severity: "REPAIRABLE",
      observedSignal: { unapprovedAudioBed: true },
      explanation: "Audio bed lacks commercial license documentation.",
      evidence: ["Audio bed 'track_99' unverified"],
      affectedStages: ["F04"],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
    const audioCase = YouTubeRemediationPlanner.planRemediation(audioFinding);
    expect(audioCase.affectedStages).toEqual(["F04"]);
    expect(audioCase.rerunRequired).toContain("render");
    expect(audioCase.rerunRequired).not.toContain("variation"); // F01/F02 script unaffected!

    // B. Metadata packaging issue -> affectedStages: F02, F07
    const metaFinding: GateEvaluationFinding = {
      gateId: "G10_METADATA_PACKAGING",
      ruleId: "YT.METADATA.PACKAGING_INTEGRITY",
      status: "REPAIR_REQUIRED",
      severity: "REPAIRABLE",
      observedSignal: { tagStuffing: true },
      explanation: "Tag stuffing detected.",
      evidence: ["Tags count: 32"],
      affectedStages: ["F07"],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
    const metaCase = YouTubeRemediationPlanner.planRemediation(metaFinding);
    expect(metaCase.affectedStages).toEqual(["F07"]);
    expect(metaCase.rerunRequired).toContain("f07");
    expect(metaCase.rerunRequired).not.toContain("render"); // No re-render needed for metadata!
  });

  it("3. Evidence Invalidation — invalidates downstream evidence when upstream stage is modified", () => {
    const tracker = new EvidenceInvalidationTracker();

    // Register valid evidence for F02, F03, F04, F05, F06, F07
    const evF02 = tracker.registerEvidence("F02", "hash_script_v1");
    const evF03 = tracker.registerEvidence("F03", "hash_assets_v1");
    const evF04 = tracker.registerEvidence("F04", "hash_voice_v1");
    const evF05 = tracker.registerEvidence("F05", "hash_timeline_v1");
    const evF06 = tracker.registerEvidence("F06", "hash_mp4_v1");
    const evF07 = tracker.registerEvidence("F07", "hash_receipt_v1");

    expect(tracker.isEvidenceValid("F02", "hash_script_v1")).toBe(true);
    expect(tracker.isEvidenceValid("F06", "hash_mp4_v1")).toBe(true);

    // ReMaker repairs F02 (Script)!
    const { invalidatedStages, invalidatedRevisionIds } = tracker.invalidateDownstream(
      ["F02"],
      "Script rewritten due to creative fatigue"
    );

    // Dependent downstream floors [F03, F04, F05, F06, F07] must be marked STALE
    expect(invalidatedStages).toContain("F02");
    expect(invalidatedStages).toContain("F03");
    expect(invalidatedStages).toContain("F04");
    expect(invalidatedStages).toContain("F05");
    expect(invalidatedStages).toContain("F06");
    expect(invalidatedStages).toContain("F07");

    // Check validity
    expect(tracker.isEvidenceValid("F02", "hash_script_v1")).toBe(false);
    expect(tracker.isEvidenceValid("F06", "hash_mp4_v1")).toBe(false);
    expect(tracker.isEvidenceValid("F07", "hash_receipt_v1")).toBe(false);

    // Register new F02 script and new F06 render
    tracker.registerEvidence("F02", "hash_script_v2");
    tracker.registerEvidence("F06", "hash_mp4_v2");

    expect(tracker.isEvidenceValid("F02", "hash_script_v2")).toBe(true);
    expect(tracker.isEvidenceValid("F06", "hash_mp4_v2")).toBe(true);
    // Old mp4 v1 remains STALE
    expect(tracker.isEvidenceValid("F06", "hash_mp4_v1")).toBe(false);
  });

  it("4. End-to-End Remediation Loop in F07ReleaseGuardian", async () => {
    const guardian = new F07ReleaseGuardian(policyStore);

    const candidateGenome = {
      ...sampleGenome,
      scriptHash: "script_aero_diff_words_same_structure",
      thesis: "Air density increases with cold temperatures, giving airplanes extra lift despite freezing weather.",
    };

    const candidateVideo = {
      videoId: "vid_remed_loop_01",
      title: "Why Airplanes Fly in Cold Weather: Aerodynamics Explained",
      description: "Air density and lift",
      tags: ["airplanes", "aerodynamics", "physics"],
      contentEngine: "GK",
      genome: candidateGenome,
      measurements: sampleMeasurements,
      assets: [],
      scriptText: "Air density increases with cold temperatures, providing greater aerodynamic lift...",
      scenes: [{}],
    };

    const channelWithCloneHistory = {
      channelId: "chan_remed_01",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      yppStatus: "CURRENTLY_MONETIZING" as const,
      subscriberCount: 90000,
      validWatchHoursLast365Days: 25000,
      shortsViewsLast90Days: 10000000,
      activeCommunityGuidelinesStrikes: 0,
      countryRegion: "US",
      isChannelThemeConsistent: true,
      // 4 out of last 5 with exact same hook and structure to trigger G13 channel repetition!
      recentGenomes: [
        sampleGenome,
        sampleGenome,
        sampleGenome,
        sampleGenome,
      ],
    };

    // Run 1: Should detect creative repetition and generate RemediationCase
    const receipt1 = await guardian.verifyRelease({
      video: candidateVideo,
      channel: channelWithCloneHistory,
      publicationIntentAt: "2026-09-21T00:00:00Z",
    });

    expect(receipt1.youtubePolicy.overallOutcome).toBe("REPAIR_REQUIRED");
    expect(receipt1.youtubePolicy.publishAllowed).toBe(false);
    expect(receipt1.remediationCases.length).toBeGreaterThan(0);
    const case1 = receipt1.remediationCases[0];
    expect(case1.allowedActions.length).toBeGreaterThan(0);
    expect(case1.forbiddenShallowRepairs.length).toBeGreaterThan(0);

    // Run 2: ReMaker applies repair — switches hook and structure to 'myth-busting' and 'myth-test-reality'
    const remediatedGenome: ContentGenome = {
      ...sampleGenome,
      hookType: "myth-busting",
      narrativeStructure: "myth-test-reality",
      storyType: "myth-vs-reality",
      thesis: "Passengers assume freezing air impedes jet engines, but thermodynamic efficiency actually peaks in dense subzero air.",
      scriptHash: "remediated_script_hash_distinct",
      visualGrammar: "split-screen-comparison",
    };

    const remediatedVideo = {
      ...candidateVideo,
      genome: remediatedGenome,
      title: "Cold Weather Aviation Myth: Why Airplanes Fly Better in Freezing Air",
    };

    const receipt2 = await guardian.verifyRelease({
      video: remediatedVideo,
      channel: channelWithCloneHistory,
      publicationIntentAt: "2026-09-21T00:00:00Z",
    });

    expect(receipt2.youtubePolicy.overallOutcome).toBe("READY");
    expect(receipt2.youtubePolicy.publishAllowed).toBe(true);
    expect(receipt2.remediationCases.length).toBe(0);
  });
});
