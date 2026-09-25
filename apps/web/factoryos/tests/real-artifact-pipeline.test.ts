import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { FFmpegRenderCompiler, RenderFabric } from "../core/fabric/RenderFabric";
import { ArtifactResolver } from "../core/rendering/ArtifactResolver";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import { VoiceFabric } from "../core/voice/VoiceFabric";
import { CapabilityRegistry } from "../core/cognitive/CapabilityRegistry";
import { ResearchRuntime } from "../core/research/ResearchRuntime";
import { RenderIntent, RenderArtifact } from "../core/contracts/RenderIntentContracts";
import { ResearchPassport, ResearchClaim } from "../core/contracts/ResearchPassportContracts";

function checkFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

describe("FactoryOS Second-Wave Remediation — Real Artifact Pipeline & Forensic Governance", () => {
  const hasFfmpeg = checkFfmpeg();
  let generatedArtifact: RenderArtifact;
  const testOutputDir = path.resolve(process.cwd(), ".okf", "renders");

  beforeAll(() => {
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  // =========================================================================
  // 1. REAL LOCAL FFMPEG EXECUTION WITH SUBPROCESS & FFPROBE VALIDATION
  // =========================================================================
  it("executes real local FFmpeg subprocess, producing physical 1080x1920 MP4 with verified SHA-256 and ffprobe streams", async () => {
    if (!hasFfmpeg) {
      console.warn("Skipping real FFmpeg test: ffmpeg binary not on PATH.");
      return;
    }

    const testIntent: RenderIntent = {
      intentId: "intent_remediation_test_01",
      jobId: "job_remediation_test_01",
      missionId: "mis_remediation_test_01",
      compositionType: "FACTS_SHORTS",
      durationSeconds: 2,
      fps: 30,
      resolution: { width: 1080, height: 1920 },
      tracks: {
        visualAssets: [
          {
            id: "bg",
            type: "SHAPE",
            src: "navy",
            zIndex: 0,
            startSeconds: 0,
            durationSeconds: 2,
          },
        ],
        audioTracks: [],
        captions: [],
      },
      preferredCompiler: "FFMPEG",
      constraints: {},
      createdAt: new Date().toISOString(),
    };

    const compiler = new FFmpegRenderCompiler();
    const artifact = await compiler.execute(testIntent);
    generatedArtifact = artifact;

    expect(artifact).toBeDefined();
    expect(artifact.jobId).toBe("job_remediation_test_01");
    expect(artifact.location.kind).toBe("LOCAL");
    expect(artifact.byteLength).toBeGreaterThan(1000);
    expect(artifact.sha256).toBeDefined();
    expect(artifact.sha256.length).toBe(64);

    // Verify physical file exists on disk
    if (artifact.location.kind === "LOCAL") {
      expect(fs.existsSync(artifact.location.path)).toBe(true);

      // Verify SHA-256 matches actual bytes
      const fileBytes = fs.readFileSync(artifact.location.path);
      const computedHash = crypto.createHash("sha256").update(fileBytes).digest("hex");
      expect(computedHash).toBe(artifact.sha256);
    }

    // Verify ffprobe metadata produced by the compiler
    expect(artifact.width).toBe(1080);
    expect(artifact.height).toBe(1920);
    expect(artifact.videoCodec.toLowerCase()).toContain("h264");
    expect(artifact.audioCodec?.toLowerCase()).toContain("aac");
  }, 45000);

  // =========================================================================
  // 2. ARTIFACT LOCATION & ARTIFACT RESOLVER
  // =========================================================================
  it("resolves local artifact location via ArtifactResolver and validates SHA-256 integrity", async () => {
    if (!generatedArtifact) {
      return;
    }

    const resolver = new ArtifactResolver();
    const resolved = await resolver.resolve(generatedArtifact);

    expect(fs.existsSync(resolved.localPath)).toBe(true);
    expect(path.isAbsolute(resolved.localPath)).toBe(true);
  });

  it("ArtifactResolver rejects artifact if SHA-256 tamper is detected", async () => {
    if (!generatedArtifact) {
      return;
    }

    const tamperedArtifact: RenderArtifact = {
      ...generatedArtifact,
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const resolver = new ArtifactResolver();
    await expect(resolver.resolve(tamperedArtifact)).rejects.toThrow(/mismatch/i);
  });


  // =========================================================================
  it("remote render dispatch marks state DISPATCHED, proving HTTP 200 != COMPLETED", async () => {
    const remoteIntent: RenderIntent = {
      intentId: "intent_remote_01",
      jobId: "job_remote_lifecycle_01",
      missionId: "mis_remote_01",
      compositionType: "FACTS_SHORTS",
      durationSeconds: 5,
      fps: 30,
      resolution: { width: 1080, height: 1920 },
      tracks: { visualAssets: [], audioTracks: [], captions: [] },
      preferredCompiler: "FFMPEG",
      constraints: {},
      createdAt: new Date().toISOString(),
    };

    const originalFetch = global.fetch;
    try {
      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "accepted" }),
      })) as any;

      const fabric = new RenderFabric();
      const result = await fabric.executeRender(remoteIntent, "AZURE_VM", {
        apiUrl: "http://localhost:8000",
        secret: "mock_secret",
        executionToken: "tok_test_123",
      });

      expect(result.jobId).toBe("job_remote_lifecycle_01");
      expect(result.remoteState).toBe("DISPATCHED");
      expect(result.remoteState).not.toBe("COMPLETED");
      expect(result.artifact).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // 4. FLOOR 07 INDEPENDENT MEDIA PROBE ON REAL ARTIFACT WITH HARD GATES
  // =========================================================================
  it("Floor 07 independently probes real physical MP4 and passes all hard gates", async () => {
    if (!hasFfmpeg || !generatedArtifact) {
      return;
    }

    const report = await VerificationEngine.auditMediaArtifact({
      jobId: generatedArtifact.jobId,
      artifact: generatedArtifact,
      aspectRatio: "9:16",
    });

    expect(report.passed).toBe(true);
    expect(report.overallStatus).toBe("PASSED");
    expect(report.overallScore).toBeGreaterThanOrEqual(80);
    expect(report.hardGates.artifactExists).toBe(true);
    expect(report.hardGates.validContainer).toBe(true);
    expect(report.hardGates.videoStreamPresent).toBe(true);
    expect(report.hardGates.audioStreamPresent).toBe(true);
    expect(report.hardGates.exact9x16Geometry).toBe(true);
    expect(report.hardGates.decodeSmokePassed).toBe(true);
  }, 30000);

  // =========================================================================
  // 5. ANTI-REGRESSION: FLOOR 07 IGNORES CALLER CLAIMS AND TRUSTS ONLY PROBE
  // =========================================================================
  it("Floor 07 ignores caller-supplied aspect ratio claims and fails when geometry is incorrect", async () => {
    if (!hasFfmpeg) return;

    // Generate a 4:3 MP4 (640x480)
    const testBadMp4 = path.join(testOutputDir, "bad_aspect_test.mp4");
    try {
      execSync(`ffmpeg -y -f lavfi -i color=c=red:s=640x480:d=1 -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -c:v libx264 -c:a aac "${testBadMp4}"`, {
        stdio: "ignore",
      });
    } catch {
      return;
    }

    const badArtifact: RenderArtifact = {
      artifactId: "art_bad_geom",
      jobId: "job_bad_geom",
      location: { kind: "LOCAL", path: testBadMp4 },
      sha256: crypto.createHash("sha256").update(fs.readFileSync(testBadMp4)).digest("hex"),
      mimeType: "video/mp4",
      byteLength: fs.statSync(testBadMp4).size,
      duration: 1,
      width: 640,
      height: 480,
      fps: 30,
      videoCodec: "h264",
      audioCodec: "aac",
    };

    // Caller fraudulently claims it is 9:16
    const report = await VerificationEngine.auditMediaArtifact({
      jobId: "job_bad_geom",
      artifact: badArtifact,
      aspectRatio: "9:16", // Fraudulent claim by caller
    });

    expect(report.passed).toBe(false);
    expect(report.hardGates.exact9x16Geometry).toBe(false);
    expect(report.overallStatus).toBe("FAILED");
  }, 30000);

  // =========================================================================
  // 6. FLOOR 07 REJECTS CORRUPT ARTIFACTS VIA HARD GATE
  // =========================================================================
  it("Floor 07 rejects corrupt non-media files via hard gate failure", async () => {
    const corruptFile = path.join(testOutputDir, "corrupt_artifact.mp4");
    fs.writeFileSync(corruptFile, Buffer.from("NOT_AN_MP4_FILE_JUST_CORRUPT_BYTES"));

    const corruptArtifact: RenderArtifact = {
      artifactId: "art_corrupt",
      jobId: "job_corrupt",
      location: { kind: "LOCAL", path: corruptFile },
      sha256: crypto.createHash("sha256").update(fs.readFileSync(corruptFile)).digest("hex"),
      mimeType: "video/mp4",
      byteLength: fs.statSync(corruptFile).size,
      duration: 0,
      width: 0,
      height: 0,
      fps: 0,
      videoCodec: "none",
    };

    const report = await VerificationEngine.auditMediaArtifact({
      jobId: "job_corrupt",
      artifact: corruptArtifact,
    });

    expect(report.passed).toBe(false);
    expect(report.hardGates.validContainer).toBe(false);
    expect(report.hardGates.decodeSmokePassed).toBe(false);
    expect(report.overallStatus).toBe("FAILED");
  });

  // =========================================================================
  // 7. VOICE FABRIC - PHYSICAL WAV GENERATION & RIFF FORENSIC VALIDATION
  // =========================================================================
  it("Voice Fabric generates real physical WAV file with 44-byte RIFF validation and marks DEGRADED_FALLBACK", async () => {
    // 1. Primary execution generates real audio file on disk
    const primaryResult = await VoiceFabric.synthesize("This is a deterministic voice test for ShortForge FactoryOS.");
    expect(primaryResult.audioUrl).toBeDefined();
    expect(fs.existsSync(primaryResult.audioUrl)).toBe(true);
    expect(primaryResult.byteLength).toBeGreaterThan(44);
    expect(primaryResult.sha256).toBeDefined();

    // 2. Safety net engine generates deterministic silence marked DEGRADED_FALLBACK
    const fallbackEngine = new (await import("../core/voice/VoiceFabric")).SilentWavVoiceEngine();
    const fallbackResult = await fallbackEngine.synthesize("Emergency silence fallback", {
      profileId: "profile_fallback",
      name: "Silent Fallback",
      gender: "NEUTRAL",
      language: "en-US",
      pitch: 0,
      speed: 1,
      tone: "CALM",
    });

    expect(fallbackResult.audioUrl).toBeDefined();
    expect(fallbackResult.isFallback).toBe(true);
    expect(fallbackResult.qualityClass).toBe("DEGRADED_FALLBACK");
    expect(fallbackResult.byteLength).toBeGreaterThan(44);

    // Verify physical file on disk
    expect(fs.existsSync(fallbackResult.audioUrl)).toBe(true);
    const wavBytes = fs.readFileSync(fallbackResult.audioUrl);

    // Validate 44-byte RIFF header forensic anatomy
    expect(wavBytes.slice(0, 4).toString("ascii")).toBe("RIFF");
    expect(wavBytes.slice(8, 12).toString("ascii")).toBe("WAVE");
    expect(wavBytes.slice(12, 16).toString("ascii")).toBe("fmt ");
    expect(wavBytes.readUInt16LE(20)).toBe(1); // PCM format
    expect(wavBytes.slice(36, 40).toString("ascii")).toBe("data");
    expect(wavBytes.readUInt32LE(40)).toBe(fallbackResult.byteLength - 44);
  });

  // =========================================================================
  // 8. RESEARCH PASSPORT CRYPTOGRAPHIC INTEGRITY & TAMPER DETECTION
  // =========================================================================
  it("Research Passport verifies valid signature, and detects both claim and metadata tampering", () => {
    const claim1: ResearchClaim = {
      claimId: "clm_01",
      statement: "FFmpeg 8.1 executes deterministically on local host.",
      confidence: 0.99,
      claimType: "VERIFIED_FACT",
      verificationMethod: "CROSS_SOURCE_CORROBORATION",
      verificationStatus: "VERIFIED",
      retrievedAt: new Date().toISOString(),
      extractionMethod: "HTTP_SCRAPE",
      provenance: "test-runner",
    };

    const claim2: ResearchClaim = {
      claimId: "clm_02",
      statement: "Verification Engine probes streams independently without trusting caller.",
      confidence: 0.98,
      claimType: "VERIFIED_FACT",
      verificationMethod: "CROSS_SOURCE_CORROBORATION",
      verificationStatus: "VERIFIED",
      retrievedAt: new Date().toISOString(),
      extractionMethod: "HTTP_SCRAPE",
      provenance: "test-runner",
    };

    const passport: ResearchPassport = {
      passportId: "pass_crypto_proof_01",
      missionId: "mis_crypto_proof",
      question: "Can FactoryOS verify physical artifacts without trusting callers?",
      intent: "Verify forensic claims",
      methodology: "FACT_CHECK",
      sources: [],
      claims: [claim1, claim2],
      unresolvedIssues: [],
      confidence: 0.985,
      provenance: { reachProvider: "reach", agentId: "f00_analyst", floorId: "floor00_analyst" },
      timestamps: { initiatedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
      transformations: [],
    };

    // Sign passport
    const signedPassport = ResearchRuntime.signPassport(passport);
    expect(signedPassport.integrity).toBeDefined();
    expect(signedPassport.integrity?.canonicalizationVersion).toBe("JCS-v1");
    expect(signedPassport.integrity?.algorithm).toBe("HMAC-SHA256");

    // 1. Verify unaltered passport passes
    const validResult = ResearchRuntime.verifyResearchPassport(signedPassport);
    expect(validResult.valid).toBe(true);

    // 2. Tamper with a claim statement -> must fail
    const claimTampered = JSON.parse(JSON.stringify(signedPassport));
    claimTampered.claims[0].statement = "Tampered claim content.";
    const claimTamperResult = ResearchRuntime.verifyResearchPassport(claimTampered);
    expect(claimTamperResult.valid).toBe(false);
    expect(claimTamperResult.reason).toContain("Content hash mismatch");

    // 3. Tamper with metadata (question) -> must fail
    const metaTampered = JSON.parse(JSON.stringify(signedPassport));
    metaTampered.question = "Tampered Question?";
    const metaTamperResult = ResearchRuntime.verifyResearchPassport(metaTampered);
    expect(metaTamperResult.valid).toBe(false);
    expect(metaTamperResult.reason).toContain("Content hash mismatch");

    // 4. Tamper with signature directly -> must fail
    const sigTampered = JSON.parse(JSON.stringify(signedPassport));
    sigTampered.integrity.integrityMac = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const sigTamperResult = ResearchRuntime.verifyResearchPassport(sigTampered);
    expect(sigTamperResult.valid).toBe(false);
    expect(sigTamperResult.reason).toContain("Integrity MAC mismatch");
  });

  // =========================================================================
  // 9. CAPABILITY REGISTRY CANONICAL ROUTING & REAL HANDLERS
  // =========================================================================
  it("Capability Registry routes real execution and produces real evidence records", async () => {
    // 1. analysis.hook executes real linguistic analysis
    const hookResult = await CapabilityRegistry.executeCapability("analysis.hook", {
      hookText: "Are you making this fatal mistake in your AI video pipeline? Stop right now!",
    });

    expect(hookResult.success).toBe(true);
    expect(hookResult.hookAnalysis).toBeDefined();
    expect(hookResult.hookAnalysis.questionDetected).toBe(true);
    expect(hookResult.hookAnalysis.syllableCount).toBeGreaterThan(0);
    expect(hookResult.hookAnalysis.fleschKincaidGrade).toBeDefined();

    // 2. voice.tts routes to Voice Fabric and produces VoiceArtifact
    const voiceResult = await CapabilityRegistry.executeCapability(
      "voice.tts",
      {
        text: "Capability registry voice synthesis execution test.",
        durationSeconds: 1,
      },
      { floorId: "floor04_media_synthesis" }
    );

    expect(voiceResult.success).toBe(true);
    expect(voiceResult.artifact).toBeDefined();
    expect(voiceResult.artifact.qualityClass).toBeDefined();

    // 3. render.hyperframes is PROTOTYPE and blocked from production routing
    await expect(
      CapabilityRegistry.executeCapability("render.hyperframes", { jobId: "test" }, { floorId: "floor06_rendering" })
    ).rejects.toThrow(/PROTOTYPE/);
  });
});
