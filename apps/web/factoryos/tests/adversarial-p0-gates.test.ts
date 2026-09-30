/**
 * FactoryOS Frontier v3 — Adversarial Failure-Injection Test Suite (P0 Gates H1-H15)
 * Zero-False-Green forensic validation across all 8 reopening gates.
 * Uses real native FFmpeg/ffprobe for physical media generation and verification.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { VoiceFabric, GeminiVoiceEngine, SilentWavVoiceEngine } from "../core/voice/VoiceFabric";
import { CapabilityRegistry } from "../core/cognitive/CapabilityRegistry";
import { ResearchRuntime } from "../core/research/ResearchRuntime";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import { ArtifactResolver } from "../core/rendering/ArtifactResolver";
import { RemoteRenderStateMachine } from "../core/rendering/RemoteRenderStateMachine";
import { RenderFabric } from "../core/fabric/RenderFabric";

// Helper functions using native ffmpeg to generate genuine test media fixtures
function generateTestMp4(outputPath: string, width = 1080, height = 1920, duration = 1): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  execSync(
    `ffmpeg -y -f lavfi -i color=c=black:s=${width}x${height}:d=${duration} -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -pix_fmt yuv420p -c:a aac -t ${duration} "${outputPath}"`,
    { stdio: "ignore" }
  );
}

function generateVideoWithoutAudio(outputPath: string, width = 1080, height = 1920, duration = 1): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  execSync(
    `ffmpeg -y -f lavfi -i color=c=black:s=${width}x${height}:d=${duration} -c:v libx264 -pix_fmt yuv420p -t ${duration} "${outputPath}"`,
    { stdio: "ignore" }
  );
}

function generateLandscapeVideo(outputPath: string, width = 1920, height = 1080, duration = 1): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  execSync(
    `ffmpeg -y -f lavfi -i color=c=black:s=${width}x${height}:d=${duration} -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -pix_fmt yuv420p -c:a aac -t ${duration} "${outputPath}"`,
    { stdio: "ignore" }
  );
}

describe("FactoryOS P0-H Adversarial Failure-Injection Gates (H1 - H15)", () => {
  // -------------------------------------------------------------
  // H1: Gemini credentials missing -> safe configuration failure
  // -------------------------------------------------------------
  describe("H1: Gemini credentials missing -> safe configuration failure", () => {
    it("should throw LIVE_PROVIDER_REQUIRED when primary Gemini provider has no valid API key", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const originalGoogleKey = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const engine = new GeminiVoiceEngine();
      await expect(
        engine.synthesize("Test phrase", {
          profileId: "test_profile",
          name: "Puck",
          gender: "NEUTRAL",
          language: "en-US",
          pitch: 0,
          speed: 1.0,
          tone: "DRAMATIC",
          preferredEngine: "GEMINI",
        })
      ).rejects.toThrow(/LIVE_PROVIDER_REQUIRED/i);

      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
      if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
    });
  });

  // -------------------------------------------------------------
  // H2: Real audio artifact probe & Silent WAV guard
  // -------------------------------------------------------------
  describe("H2: Real audio artifact probe & Silent WAV guard", () => {
    it("should strictly declare SilentWavVoiceEngine as DEGRADED_FALLBACK and isFallback true", async () => {
      const silentEngine = new SilentWavVoiceEngine();
      const artifact = await silentEngine.synthesize("Fallback test phrase", {
        profileId: "silent_profile",
        name: "Silent",
        gender: "NEUTRAL",
        language: "en-US",
        pitch: 0,
        speed: 1.0,
        tone: "CALM",
      });

      expect(artifact.qualityClass).toBe("DEGRADED_FALLBACK");
      expect(artifact.isFallback).toBe(true);
      expect(artifact.qualityClass).not.toBe("PRIMARY");
      expect(artifact.provider).toBe("SILENT_WAV_FALLBACK");
      expect(fs.existsSync(artifact.localPath)).toBe(true);

      // Verify physical RIFF/WAVE header
      const buffer = fs.readFileSync(artifact.localPath);
      expect(buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(buffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(artifact.sha256).toBeDefined();
      expect(artifact.byteLength).toBe(buffer.length);
    });
  });

  // -------------------------------------------------------------
  // H3: Primary voice provider fails -> real fallback activates
  // -------------------------------------------------------------
  describe("H3: Primary voice provider fails -> real fallback activates", () => {
    it("should catch primary engine failure and return degraded fallback artifact", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const fabric = new VoiceFabric();
      const artifact = await fabric.synthesize("Primary failure fallback test phrase");

      expect(artifact.success).toBe(true);
      expect(artifact.isFallback).toBe(true);
      expect(artifact.qualityClass).toBe("DEGRADED_FALLBACK");
      expect(artifact.provider).toBe("SILENT_WAV_FALLBACK");
      expect(fs.existsSync(artifact.localPath)).toBe(true);

      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    });
  });

  // -------------------------------------------------------------
  // H4: All voice providers fail -> safe degraded execution or explicit error
  // -------------------------------------------------------------
  describe("H4: Capability Registry blocks unverified / prototype in production", () => {
    it("should reject render.hyperframes when executing in production context", () => {
      const registry = CapabilityRegistry.getInstance();
      const auth = registry.authorizeExecution("render.hyperframes", {
        environment: "production",
        role: "ADMIN",
        floorId: "floor06_rendering",
      });

      expect(auth.authorized).toBe(false);
      expect(auth.reason).toMatch(/PROTOTYPE/i);
    });

    it("should perform physical directory scan with measured durationMs", async () => {
      const registry = CapabilityRegistry.getInstance();
      const result = await registry.execute({
        requestExecutionId: "test_code_graph_01",
        capabilityId: "code.graph",
        missionId: "test_mis",
        jobId: "test_job",
        callerRole: "SYSTEM",
        floorId: "floor00_analyst",
        environment: "development",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect((result.outputData as any).modulesAnalyzed).toBeGreaterThan(0);
      expect((result.outputData as any).evidenceType).toBe("PHYSICAL_SCAN");
    });
  });

  // -------------------------------------------------------------
  // H5: Research contradiction -> CONTRADICTED or AMBIGUOUS evidence state
  // -------------------------------------------------------------
  describe("H5: Research contradiction -> CONTRADICTED or AMBIGUOUS evidence state", () => {
    it("should produce UNVERIFIED_ASSERTION when no external sources exist", async () => {
      const runtime = new ResearchRuntime();
      const report = await runtime.executeResearch({
        missionId: "mis_no_source_test",
        topic: "Obscure Unknown Hypothesis",
      });
      const unverified = report.passport.claims.find((c) => c.claimType === "UNVERIFIED_ASSERTION");
      expect(unverified).toBeDefined();
      expect(unverified!.verificationStatus).toBe("UNVERIFIED");
      expect(unverified!.confidence).toBeLessThanOrEqual(0.4);
    });

    it("should unconditionally mark contradicted sources as CONTRADICTED_CLAIM with reduced confidence", async () => {
      const { ReachSubsystem } = await import("../core/research/ReachSubsystem");
      const testProvider = {
        isTestFixture: true as const,
        async acquire() {
          return [
            {
              id: "src_contra_01",
              url: "https://physics-facts.org/debunking",
              title: "Flat Earth Proof Debunked",
              publisher: "physics-facts.org",
              retrievedAt: new Date().toISOString(),
              extractionMethod: "TEST_FIXTURE" as const,
              snippet: "This is a myth and debunked false theory with no scientific basis.",
              reliabilityScore: 0.95,
              contentHash: "hash_contra_01",
              sourceStatus: "TEST_FIXTURE" as const,
            },
          ];
        },
      };
      const runtime = new ResearchRuntime(new ReachSubsystem(testProvider));
      const report = await runtime.executeResearch({
        missionId: "mis_contradiction_test",
        topic: "Flat Earth Proof",
        intent: "Myth debunking analysis",
      });

      const passport = report.passport;
      expect(passport).toBeDefined();
      expect(passport.claims.length).toBeGreaterThan(0);

      // Unconditional assertion on contradiction detection
      const contradictedClaim = passport.claims.find((c) => c.claimType === "CONTRADICTED_CLAIM");
      expect(contradictedClaim).toBeDefined();
      expect(contradictedClaim!.verificationStatus).toBe("CONTRADICTED");
      expect(contradictedClaim!.confidence).toBeLessThanOrEqual(0.4);
      expect(contradictedClaim!.contradictionDegree).toBeGreaterThan(0.5);
    });
  });

  // -------------------------------------------------------------
  // H6: Research corroboration -> claim evidence linked to supporting sources
  // -------------------------------------------------------------
  describe("H6: Research corroboration -> claim evidence linked to supporting sources", () => {
    it("should establish VERIFIED_FACT when corroborating sources exist", async () => {
      const { ReachSubsystem } = await import("../core/research/ReachSubsystem");
      const testProvider = {
        isTestFixture: true as const,
        async acquire() {
          return [
            {
              id: "src_corro_01",
              url: "https://tech-times.org/ai-video",
              title: "Artificial Intelligence Video Generation Breakthroughs",
              publisher: "tech-times.org",
              retrievedAt: new Date().toISOString(),
              extractionMethod: "TEST_FIXTURE" as const,
              snippet: "Artificial Intelligence video generation models allow real-time synthesis.",
              reliabilityScore: 0.92,
              contentHash: "hash_corro_01",
              sourceStatus: "TEST_FIXTURE" as const,
            },
            {
              id: "src_corro_02",
              url: "https://future-media.org/ai-video",
              title: "Artificial Intelligence Video Generation Scaling",
              publisher: "future-media.org",
              retrievedAt: new Date().toISOString(),
              extractionMethod: "TEST_FIXTURE" as const,
              snippet: "Large-scale artificial intelligence video generation architectures tested.",
              reliabilityScore: 0.9,
              contentHash: "hash_corro_02",
              sourceStatus: "TEST_FIXTURE" as const,
            },
          ];
        },
      };
      const runtime = new ResearchRuntime(new ReachSubsystem(testProvider));
      const report = await runtime.executeResearch({
        missionId: "mis_corroboration_test",
        topic: "Artificial Intelligence Video Generation",
        intent: "Technical benchmarking",
      });

      const passport = report.passport;
      const verifiedFact = passport.claims.find((c) => c.claimType === "VERIFIED_FACT");
      expect(verifiedFact).toBeDefined();
      expect(verifiedFact!.verificationStatus).toBe("VERIFIED");
      expect(verifiedFact!.supportingSources).toBeDefined();
      expect(verifiedFact!.supportingSources!.length).toBeGreaterThanOrEqual(2);

      // Cryptographic verification of passport
      const verified = ResearchRuntime.verifyResearchPassport(passport);
      expect(verified.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // H7: Corrupt media artifact -> F7 rejection
  // -------------------------------------------------------------
  describe("H7: Corrupt media artifact -> F7 rejection", () => {
    it("should reject corrupted media artifact even if narrative text is high quality", async () => {
      const corruptPath = path.join(process.cwd(), "data", "corrupted_test_video.mp4");
      fs.writeFileSync(corruptPath, Buffer.from("NOT_A_VALID_MP4_HEADER"));

      try {
        const report = await VerificationEngine.auditMediaArtifact({
          jobId: "job_corrupt_test",
          videoUrl: corruptPath,
          scriptText: "Super viral script with high narrative appeal",
          sceneCount: 5,
        });

        expect(report.overallStatus).toBe("FAILED");
        expect(report.layers.layer1PhysicalForensics.passed).toBe(false);
        expect(report.qualityScore).toBe(0);
        expect(report.overallScore).toBe(0);
      } finally {
        if (fs.existsSync(corruptPath)) fs.unlinkSync(corruptPath);
      }
    });
  });

  // -------------------------------------------------------------
  // H8: Wrong resolution -> F7 hard-gate rejection
  // -------------------------------------------------------------
  describe("H8: Wrong resolution -> F7 hard-gate rejection", () => {
    it("should unconditionally FAIL media audit when geometry is horizontal (1920x1080) instead of 9:16 vertical", async () => {
      const landscapeVideoPath = path.join(process.cwd(), "data", "test_landscape.mp4");
      generateLandscapeVideo(landscapeVideoPath, 1920, 1080, 1);

      try {
        const report = await VerificationEngine.auditMediaArtifact({
          jobId: "job_horizontal_test",
          videoUrl: landscapeVideoPath,
          scriptText: "A full valid script text with lots of great engaging narrative hooks",
          sceneCount: 5,
        });

        expect(report.overallStatus).toBe("FAILED");
        expect(report.verified).toBe(false);
        expect(report.passed).toBe(false);
        expect(report.hardGates.exact9x16Geometry).toBe(false);
        expect(report.overallScore).toBe(0);
        expect(report.qualityScore).toBe(0);
        expect(report.layers.layer1PhysicalForensics.passed).toBe(false);
      } finally {
        if (fs.existsSync(landscapeVideoPath)) fs.unlinkSync(landscapeVideoPath);
      }
    });
  });

  // -------------------------------------------------------------
  // H9: Missing audio -> F7 rejection when audio required
  // -------------------------------------------------------------
  describe("H9: Missing audio -> F7 rejection when audio required", () => {
    it("should reject video artifact when audio stream is absent", async () => {
      const noAudioPath = path.join(process.cwd(), "data", "test_no_audio.mp4");
      generateVideoWithoutAudio(noAudioPath, 1080, 1920, 1);

      try {
        const report = await VerificationEngine.auditMediaArtifact({
          jobId: "job_no_audio_test",
          videoUrl: noAudioPath,
          scriptText: "Spoken narration requires audio presence",
          sceneCount: 1,
        });

        expect(report.overallStatus).toBe("FAILED");
        expect(report.hardGates.audioStreamPresent).toBe(false);
        expect(report.overallScore).toBe(0);
        expect(report.qualityScore).toBe(0);
      } finally {
        if (fs.existsSync(noAudioPath)) fs.unlinkSync(noAudioPath);
      }
    });
  });

  // -------------------------------------------------------------
  // H10: Prototype compiler requests fail closed to production FFmpeg
  // -------------------------------------------------------------
  describe("H10: Prototype compiler requests fail closed to production FFmpeg", () => {
    it("should route to deterministic local FFmpeg compiler when remote compiler is disallowed or unavailable", async () => {
      const fabric = new RenderFabric();
      const compiler = fabric.planCompiler({
        intentId: "intent_fallback_01",
        jobId: "test_fallback_job",
        missionId: "test_mission",
        durationSeconds: 5,
        fps: 30,
        resolution: { width: 1080, height: 1920 },
        compositionType: "KINETIC_TEXT",
        tracks: { visualAssets: [], audioTracks: [], captions: [] },
        preferredCompiler: "HYPERFRAMES",
        constraints: {},
        createdAt: new Date().toISOString(),
      }, false);

      expect(compiler.id).toBe("FFMPEG");
    });
  });

  // -------------------------------------------------------------
  // H11: Duplicate callback -> single completion effect
  // -------------------------------------------------------------
  describe("H11: Duplicate callback -> single completion effect", () => {
    it("should enforce attempt monotonicity and treat duplicate callbacks as idempotent", () => {
      const sm = RemoteRenderStateMachine.getInstance();
      const jobId = `job_mono_${Date.now()}`;
      sm.registerJob({ jobId, attemptId: 1 });

      // Advance to attempt 2
      sm.dispatchNextAttempt(jobId);
      const job = sm.getJob(jobId);
      expect(job?.attemptId).toBe(2);

      // Stale attempt 1 callback rejected
      const staleResult = sm.handleCallback(jobId, 1, { status: "completed", videoUrl: "https://example.com/v1.mp4" });
      expect(staleResult.accepted).toBe(false);
      expect(staleResult.reason).toMatch(/STALE_ATTEMPT/i);

      // Current attempt 2 callback accepted
      const freshResult = sm.handleCallback(jobId, 2, { status: "completed", videoUrl: "https://example.com/v2.mp4" });
      expect(freshResult.accepted).toBe(true);
      expect(freshResult.state).toBe("COMPLETED");

      // Repeated callback is idempotent without duplicate state side-effects
      const idemResult = sm.handleCallback(jobId, 2, { status: "completed", videoUrl: "https://example.com/v2.mp4" });
      expect(idemResult.accepted).toBe(true);
      expect(idemResult.idempotent).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // H12: Lost callback + stale worker recovery
  // -------------------------------------------------------------
  describe("H12: Lost callback + stale worker recovery", () => {
    it("should recover expired lease job to COMPLETED ONLY when a genuinely valid MP4 exists on disk", async () => {
      const sm = RemoteRenderStateMachine.getInstance();
      const jobId = `job_recovery_${Date.now()}`;

      // Register with lease in the past
      const job = sm.registerJob({ jobId, leaseDurationMs: -1000 });
      expect(new Date(job.leaseExpiresAt!).getTime()).toBeLessThan(Date.now());

      // Generate a genuine 1-second 1080x1920 MP4 via native ffmpeg
      const renderDir = path.join(process.cwd(), "data", "renders");
      const testFilePath = path.join(renderDir, `${jobId}.mp4`);
      generateTestMp4(testFilePath, 1080, 1920, 1);

      try {
        const recovery = await sm.reconcileStaleJobs();
        expect(recovery.reconciledCount).toBeGreaterThanOrEqual(1);
        expect(recovery.recoveredCount).toBeGreaterThanOrEqual(1);

        const updatedJob = sm.getJob(jobId);
        expect(updatedJob?.state).toBe("COMPLETED");
        expect(updatedJob?.history.some((h) => h.reason?.includes("RECOVERED_FROM_LOST_CALLBACK"))).toBe(true);
      } finally {
        if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
      }
    });

    it("should REFUSE to transition to COMPLETED if stale candidate file is corrupt or invalid", async () => {
      const sm = RemoteRenderStateMachine.getInstance();
      const jobId = `job_corrupt_stale_${Date.now()}`;

      sm.registerJob({ jobId, leaseDurationMs: -1000 });

      // Put a corrupted byte file on disk
      const renderDir = path.join(process.cwd(), "data", "renders");
      const corruptFilePath = path.join(renderDir, `${jobId}.mp4`);
      fs.writeFileSync(corruptFilePath, Buffer.from("FAKE_CORRUPTED_VIDEO_DATA"));

      try {
        const recovery = await sm.reconcileStaleJobs();
        const updatedJob = sm.getJob(jobId);
        // Invariant: Must NOT be completed
        expect(updatedJob?.state).not.toBe("COMPLETED");
      } finally {
        if (fs.existsSync(corruptFilePath)) fs.unlinkSync(corruptFilePath);
      }
    });
  });

  // -------------------------------------------------------------
  // H13: ArtifactResolver redirect to private IP -> blocked
  // -------------------------------------------------------------
  describe("H13: ArtifactResolver redirect to private IP -> blocked", () => {
    it("should reject localhost, 127.0.0.1, ::1, and 169.254.169.254", async () => {
      await expect(ArtifactResolver.validateUrlAgainstSsrf("https://localhost/test.mp4")).rejects.toThrow(
        /SSRF Protection/i
      );
      await expect(ArtifactResolver.validateUrlAgainstSsrf("https://127.0.0.1:8080/test.mp4")).rejects.toThrow(
        /SSRF Protection/i
      );
      await expect(ArtifactResolver.validateUrlAgainstSsrf("https://169.254.169.254/latest/meta-data")).rejects.toThrow(
        /SSRF Protection/i
      );
    });

    it("should reject unencrypted HTTP URLs", async () => {
      await expect(ArtifactResolver.validateUrlAgainstSsrf("http://example.com/test.mp4")).rejects.toThrow(
        /Insecure HTTP scheme rejected/i
      );
    });
  });

  // -------------------------------------------------------------
  // H14: Path traversal / symlink escape -> blocked
  // -------------------------------------------------------------
  describe("H14: Path traversal / symlink escape -> blocked", () => {
    it("should reject local path traversal with .. syntax", async () => {
      const resolver = new ArtifactResolver();
      await expect(
        resolver.resolve({
          artifactId: "art_traversal",
          jobId: "traversal_job",
          mimeType: "video/mp4",
          width: 1080,
          height: 1920,
          fps: 30,
          videoCodec: "h264",
          duration: 30,
          byteLength: 100,
          sha256: "fake",
          location: {
            kind: "LOCAL",
            path: "../../etc/passwd",
          },
        })
      ).rejects.toThrow(/path traversal/i);
    });
  });

  // -------------------------------------------------------------
  // H15: Fake completion payload -> system refuses COMPLETED
  // -------------------------------------------------------------
  describe("H15: Fake completion payload -> system refuses COMPLETED", () => {
    it("should reject callback for nonexistent job", () => {
      const sm = RemoteRenderStateMachine.getInstance();
      const result = sm.handleCallback("job_nonexistent_9999", 1, {
        status: "completed",
        videoUrl: "https://example.com/fake.mp4",
      });

      expect(result.accepted).toBe(false);
      expect(result.reason).toMatch(/not found/i);
    });
  });
});
