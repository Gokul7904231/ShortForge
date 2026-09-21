import { describe, it, expect, beforeEach } from "vitest";
import { AutonomousFactoryController } from "../core/controller/AutonomousFactoryController";
import { ResearchRuntime } from "../core/research/ResearchRuntime";
import { VoiceFabric } from "../core/voice/VoiceFabric";
import { RenderFabric } from "../core/rendering/RenderFabric";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import type { RenderIntent } from "../core/contracts/RenderIntentContracts";

describe("FactoryOS Frontier v3 — Canonical Eight-Floor Architecture & Subsystem Suite", () => {
  let controller: AutonomousFactoryController;
  let renderedArtifact: any;

  beforeEach(async () => {
    controller = new AutonomousFactoryController({ storageType: "memory" });
    await controller.boot();
  });

  it("1. Conditional Floor 0: Standard mission omits F0, research mission includes F0 as dependency", () => {
    const overseer = controller.overseer;

    // A: Standard video command (No research required)
    const standardNodes = (overseer as any).generateTaskNodesForGoal("Generate video: Quantum Computing Facts");
    expect(standardNodes.find((n: any) => n.taskId === "task_f00_analyst")).toBeUndefined();
    const f01Standard = standardNodes.find((n: any) => n.taskId === "task_f01_strategy");
    expect(f01Standard.dependencies).toEqual([]);

    // B: Research-intensive command
    const researchNodes = (overseer as any).generateTaskNodesForGoal("Research market trends and analyze competitor hooks for AI agent shorts");
    const f00Node = researchNodes.find((n: any) => n.taskId === "task_f00_analyst");
    expect(f00Node).toBeDefined();
    expect(f00Node.requiredAgentType).toBe("FLOOR_ANALYST");

    const f01Research = researchNodes.find((n: any) => n.taskId === "task_f01_strategy");
    expect(f01Research.dependencies).toContain("task_f00_analyst");
  });

  it("2. Research Runtime & Research Passport: Formulates classified claims and structured passport", async () => {
    // A: Zero external sources produces UNVERIFIED_ASSERTION
    const unverifiedRuntime = new ResearchRuntime();
    const unverifiedReport = await unverifiedRuntime.executeResearch({
      missionId: "mis_unverified_test",
      topic: "Obscure Unindexed Topic",
    });
    const unverifiedClaim = unverifiedReport.passport.claims.find((c) => c.claimType === "UNVERIFIED_ASSERTION");
    expect(unverifiedClaim).toBeDefined();
    expect(unverifiedClaim?.verificationStatus).toBe("UNVERIFIED");

    // B: Explicit test double provider verifies claim classification with observable provenance
    const testProvider = {
      isTestFixture: true as const,
      async acquire() {
        return [
          {
            id: "src_test_bh_1",
            url: "https://astronomy.org/black-holes",
            title: "Deep Space Black Holes Discovery",
            publisher: "astronomy.org",
            retrievedAt: new Date().toISOString(),
            extractionMethod: "TEST_FIXTURE" as const,
            snippet: "Deep Space Black Holes exhibit extreme gravitational time dilation.",
            reliabilityScore: 0.95,
            contentHash: "hash_bh_1",
            sourceStatus: "TEST_FIXTURE" as const,
          },
          {
            id: "src_test_bh_2",
            url: "https://physics-review.org/black-holes",
            title: "Deep Space Black Holes Physics",
            publisher: "physics-review.org",
            retrievedAt: new Date().toISOString(),
            extractionMethod: "TEST_FIXTURE" as const,
            snippet: "Astrophysical measurements confirm deep space black holes behavior.",
            reliabilityScore: 0.92,
            contentHash: "hash_bh_2",
            sourceStatus: "TEST_FIXTURE" as const,
          },
        ];
      },
    };
    const { ReachSubsystem } = await import("../core/research/ReachSubsystem");
    const runtime = new ResearchRuntime(new ReachSubsystem(testProvider));
    const report = await runtime.executeResearch({
      missionId: "mis_test_research_01",
      topic: "Deep Space Black Holes",
      methodology: "TREND_SCAN",
    });

    expect(report).toBeDefined();
    expect(report.topic).toBe("Deep Space Black Holes");
    expect(report.hookIntelligence.hookArchetype).toBe("CURIOSITY_GAP");
    expect(report.hookIntelligence.recommendedHook).toContain("untold truth");

    // Verify Research Passport
    const passport = report.passport;
    expect(passport.passportId).toBeDefined();
    expect(passport.sources.length).toBeGreaterThan(0);
    expect(passport.claims.length).toBeGreaterThanOrEqual(2);

    // Verify Claim Integrity Classification
    const verifiedFact = passport.claims.find((c) => c.claimType === "VERIFIED_FACT");
    expect(verifiedFact).toBeDefined();
    expect(verifiedFact?.verificationStatus).toBe("VERIFIED");

    const modelClaim = passport.claims.find((c) => c.claimType === "MODEL_CLAIM");
    expect(modelClaim).toBeDefined();
    expect(modelClaim?.verificationStatus).toBe("UNVERIFIED");
  });

  it("3. Voice Fabric: Preflight benchmark and multi-engine synthesis with fallback", async () => {
    const voiceFabric = new VoiceFabric();
    const profile = voiceFabric.getProfile("profile_narrator_dramatic");
    expect(profile).toBeDefined();
    expect(profile.tone).toBe("DRAMATIC");

    const preflight = await voiceFabric.preflight(profile);
    expect(preflight.healthy).toBe(true);
    expect(preflight.selectedEngine).toBeDefined();

    const synthRes = await voiceFabric.synthesize("Welcome to the edge of the observable universe.");
    expect(synthRes.success).toBe(true);
    expect(synthRes.audioUrl).toBeDefined();
    expect(synthRes.durationSeconds).toBeGreaterThanOrEqual(3);
    expect(synthRes.format).toBe("wav");
  });

  it("4. Render Fabric: Plans FFmpeg for standard media and HyperFrames for kinetic text", async () => {
    const fabric = new RenderFabric();

    const standardIntent: RenderIntent = {
      intentId: "intent_001",
      jobId: "job_001",
      missionId: "mis_001",
      compositionType: "FACTS_SHORTS",
      durationSeconds: 45,
      fps: 30,
      resolution: { width: 1080, height: 1920 },
      tracks: { visualAssets: [], audioTracks: [], captions: [] },
      preferredCompiler: "AUTO",
      constraints: {},
      createdAt: new Date().toISOString(),
    };

    const compiler = fabric.planCompiler(standardIntent);
    expect(compiler.id).toBe("FFMPEG");

    const kineticIntent: RenderIntent = {
      ...standardIntent,
      intentId: "intent_002",
      compositionType: "KINETIC_TEXT",
    };
    const kineticCompiler = fabric.planCompiler(kineticIntent, true);
    expect(kineticCompiler.id).toBe("HYPERFRAMES");

    const localExec = await fabric.executeRender({ ...standardIntent, durationSeconds: 2 }, "LOCAL");
    expect(localExec.success).toBe(true);
    expect(localExec.providerUsed).toBe("LOCAL");
    expect(localExec.compilerUsed).toBe("FFMPEG");
    expect(localExec.artifact).toBeDefined();

    renderedArtifact = localExec.artifact;
  }, 45000);

  it("5. Floor 7 Verification: Evaluates multi-dimensional evidence score rather than placeholder", async () => {
    const report = await VerificationEngine.auditMediaArtifact({
      jobId: "job_verify_101",
      artifact: renderedArtifact,
      durationSeconds: 2,
      aspectRatio: "9:16",
      scriptText: "Did you know that black holes silently warp time?",
      sceneCount: 3,
      audioVerified: true,
      policyViolations: [],
    });

    expect(report.verified).toBe(true);
    expect(report.qualityScore).toBeGreaterThanOrEqual(80);
    expect(report.scores.technicalQuality).toBeGreaterThan(80);
    expect(report.scores.deliveryReadiness).toBe(100);
    expect(report.scores.policy).toBe(100);
    expect(report.evidence.length).toBe(5);

    // Negative case: defective aspect ratio & missing container
    const badReport = await VerificationEngine.auditMediaArtifact({
      jobId: "job_bad_001",
      videoUrl: "",
      durationSeconds: 0,
      aspectRatio: "16:9",
      scriptText: "",
      sceneCount: 0,
      audioVerified: false,
      policyViolations: ["banned_violence_keyword"],
    });

    expect(badReport.verified).toBe(false);
    expect(badReport.failures.length).toBeGreaterThan(0);
    expect(badReport.qualityScore).toBeLessThan(50);
  }, 30000);
});
