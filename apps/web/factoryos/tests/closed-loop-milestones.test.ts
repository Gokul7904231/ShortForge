import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  runBoundedFeedbackLoop,
} from "../core/governance/FloorClosedLoop";
import {
  CANONICAL_FLOOR_LOOPS,
  validateFloorLoopCoverage,
} from "../core/governance/FloorClosedLoopRegistry";
import { ResearchRuntime } from "../core/research/ResearchRuntime";
import { ReachSubsystem, type ReachFetchRequest, type ReachTestProvider } from "../core/research/ReachSubsystem";
import type { EvidenceSource } from "../core/contracts/ResearchPassportContracts";
import {
  F07ReleaseGuardian,
  YouTubePolicyStore,
} from "../core/verification/youtube";

function source(id: string, title: string, snippet: string): EvidenceSource {
  return {
    id,
    url: "https://example.test/" + id,
    title,
    publisher: "Example Research",
    retrievedAt: new Date().toISOString(),
    extractionMethod: "TEST_FIXTURE",
    snippet,
    reliabilityScore: 0.9,
    contentHash: createHash("sha256").update(snippet).digest("hex"),
    sourceStatus: "TEST_FIXTURE",
    sourceQuality: "TIER_2_SECONDARY",
  };
}

describe("Closed-loop milestone wave 2026-09-29", () => {
  it("registers exactly one closure contract for all eight canonical floors", () => {
    const coverage = validateFloorLoopCoverage();
    expect(coverage.valid).toBe(true);
    expect(coverage.missingFloorIds).toEqual([]);
    expect(coverage.duplicateFloorIds).toEqual([]);
    expect(CANONICAL_FLOOR_LOOPS).toHaveLength(8);
  });

  it("bounds iterations and terminates repeated no-progress states", async () => {
    const result = await runBoundedFeedbackLoop({
      initialOutput: { value: 1 },
      maxIterations: 4,
      verify: async (output, iteration) => ({
        iteration,
        pass: output.value >= 3,
      }),
      isSatisfied: (feedback) => feedback.pass,
      fingerprint: (output) => String(output.value),
      revise: async (output) => ({
        value: output.value === 1 ? 2 : 2,
      }),
    });

    expect(result.termination).toBe("NO_PROGRESS");
    expect(result.iterations).toBe(2);
    expect(result.history).toHaveLength(2);
  });

  it("closes F00 through bounded evidence feedback when corroboration improves", async () => {
    let calls = 0;
    const provider: ReachTestProvider = {
      isTestFixture: true,
      acquire: async (request: ReachFetchRequest) => {
        calls += 1;
        if ((request.maxSources || 0) <= 1) {
          return [
            source(
              "f00-a",
              "Cold weather aircraft aerodynamics",
              "Cold air increases density and can increase aerodynamic lift."
            ),
          ];
        }

        return [
          source(
            "f00-a",
            "Cold weather aircraft aerodynamics",
            "Cold air increases density and can increase aerodynamic lift."
          ),
          source(
            "f00-b",
            "Aerodynamic lift in dense air",
            "Cold air increases density and can increase aerodynamic lift for aircraft."
          ),
        ];
      },
    };

    const runtime = new ResearchRuntime(new ReachSubsystem(provider));
    const result = await runtime.executeResearchLoop(
      {
        missionId: "milestone-f00",
        topic: "Why airplanes fly in cold weather",
        methodology: "TREND_SCAN",
        targetSourceCount: 1,
      },
      {
        maxIterations: 3,
        minVerifiedClaims: 1,
        minConfidence: 0.7,
        sourceGrowthPerIteration: 2,
      }
    );

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.receipt.loopType).toBe("BOUNDED_FEEDBACK");
    expect(result.receipt.termination).toBe("COMPLETED");
    expect(result.receipt.verified).toBe(true);
    expect(result.analystReport.passport.claims.some((claim) => claim.verificationStatus === "VERIFIED")).toBe(true);
  });

  it("closes F07 through bounded verification -> authorized remediation -> re-verification", async () => {
    const policyStore = YouTubePolicyStore.getInstance();
    const guardian = new F07ReleaseGuardian(policyStore);

    const sampleMeasurements = {
      fileExists: true,
      byteLength: 2600000,
      hasFtypBox: true,
      decodeSmokePassed: true,
      width: 1080,
      height: 1920,
      videoCodec: "h264",
      audioCodec: "aac",
      videoDuration: 45,
      audioDuration: 45,
      syncDriftMs: 8,
      pixelFormat: "yuv420p",
      fps: 30,
      bitrateKbps: 4100,
      streamCount: 2,
      audioSampleRate: 48000,
      audioChannels: 2,
    } as const;

    const baseGenome: any = {
      topic: "Why Airplanes Fly In Cold Weather",
      thesis: "Air density changes with temperature.",
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

    const video = {
      videoId: "vid_f07_loop",
      title: "Why Airplanes Fly in Cold Weather",
      description: "Air density and lift",
      tags: ["airplanes", "aerodynamics", "physics"],
      contentEngine: "GK",
      genome: {
        ...baseGenome,
        thesis: "Air density changes with temperature.",
      },
      measurements: sampleMeasurements,
      assets: [],
      scriptText: "Air density changes with temperature.",
      scenes: [{}],
    };

    const channel = {
      channelId: "chan_f07_loop",
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
      recentGenomes: [baseGenome, baseGenome, baseGenome, baseGenome],
    };

    const result = await guardian.verifyReleaseLoop(
      {
        video,
        channel,
        publicationIntentAt: "2026-09-21T00:00:00Z",
        artifactSha256: "e".repeat(64),
      },
      {
        maxIterations: 2,
        remediate: async ({ receipt, remediationCases }) => {
          expect(receipt.youtubePolicy.publishAllowed).toBe(false);
          expect(remediationCases.length).toBeGreaterThan(0);
          return {
            video: {
              ...video,
              title: "Cold Weather Aviation Myth: How Dense Air Changes Flight",
              genome: {
                ...baseGenome,
                hookType: "myth-busting",
                narrativeStructure: "myth-test-reality",
                storyType: "myth-vs-reality",
                thesis: "Dense freezing air changes aircraft performance in measurable ways.",
                scriptHash: "remediated_script_hash_distinct",
                visualGrammar: "split-screen-comparison",
              },
            },
            channel,
            publicationIntentAt: "2026-09-21T00:00:00Z",
            artifactSha256: "f".repeat(64),
          };
        },
      }
    );

    expect(result.loopReceipt.loopType).toBe("VERIFICATION_REMEDIATION");
    expect(result.loopReceipt.termination).toBe("COMPLETED");
    expect(result.loopReceipt.verified).toBe(true);
    expect(result.finalReceipt.youtubePolicy.publishAllowed).toBe(true);
    expect(result.finalReceipt.remediationCases).toHaveLength(0);
    expect(result.history.length).toBe(2);
  });
});
