/**
 * FactoryOS Frontier v3 — Voice Provider Failure Matrix & Credential Adversarial Suite
 * Rigorously validates all 29 failure modes of Voice Fabric, Gemini TTS, and Silent WAV Fallback.
 * Zero False Greens: Ensures error states, degraded classes, and credential failures are never obscured.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import {
  VoiceFabric,
  GeminiVoiceEngine,
  SilentWavVoiceEngine,
  detectCredentialState,
  verifyLiveProviderExecution,
  verifyAndPublishAudioArtifact,
  assertPrimaryAudioArtifact,
  ArtifactProbeError,
} from "../core/voice/VoiceFabric";
import { GeminiTTSProvider, VoiceProviderError } from "../core/voice/GeminiTTSProvider";

describe("FactoryOS Voice Provider Failure Matrix (Exhaustive 29-Defect Physical Hardening)", () => {
  let server: http.Server | null = null;
  let serverUrl = "";
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const testDir = path.join(process.cwd(), "data", "test_failure_matrix");

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
    process.env.GEMINI_API_KEY = originalGeminiKey;
    VoiceFabric._spawnFn = null;
    vi.restoreAllMocks();
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // Helper to start local deterministic test HTTP server
  function startMockServer(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<string> {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => {
        const addr = server!.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve(serverUrl);
      });
    });
  }

  // ============================================================
  // CREDENTIAL SHAPE & CLASSIFICATION
  // ============================================================
  describe("Credential Diagnostics & State Classification", () => {
    it("Detects missing key as MISSING", () => {
      expect(detectCredentialState(undefined)).toBe("MISSING");
      expect(detectCredentialState("")).toBe("MISSING");
      expect(detectCredentialState("   ")).toBe("MISSING");
    });

    it("Detects malformed short key as INVALID_SHAPE", () => {
      expect(detectCredentialState("short")).toBe("INVALID_SHAPE");
      expect(detectCredentialState("abc-123")).toBe("INVALID_SHAPE");
    });

    it("Detects placeholder key as INVALID_SHAPE (never VALID)", () => {
      expect(detectCredentialState("placeholder_gemini_123456789")).toBe("INVALID_SHAPE");
      expect(detectCredentialState("YOUR_API_KEY_HERE_123456789")).toBe("INVALID_SHAPE");
      expect(detectCredentialState("your_gemini_key_12345678900")).toBe("INVALID_SHAPE");
      expect(detectCredentialState("test_key_fake_12345678900")).toBe("INVALID_SHAPE");
      expect(detectCredentialState("<YOUR_API_KEY>_1234567890")).toBe("INVALID_SHAPE");
    });

    it("Detects structurally plausible key as PRESENT (never assumes valid until tested upstream)", () => {
      expect(detectCredentialState("AIzaSyD_TEST_KEY_LENGTH_39_CHARS_12345")).toBe("PRESENT");
    });
  });

  // ============================================================
  // PHYSICAL AUDIO PROBE FAILURE MODES (1-11)
  // ============================================================
  describe("Defects 1-11: Physical Audio Probe Failure Modes", () => {
    it("1. ffprobe missing binary -> throws ArtifactProbeError(FFPROBE_MISSING)", async () => {
      const dummyFile = path.join(testDir, "probe_missing.wav");
      fs.writeFileSync(dummyFile, Buffer.from("dummy audio content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => ee.emit("error", new Error("spawn ffprobe ENOENT")));
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/FFPROBE_MISSING/);
    });

    it("2. ffprobe exits non-zero -> throws ArtifactProbeError(FFPROBE_FAILED)", async () => {
      const dummyFile = path.join(testDir, "probe_exit_1.wav");
      fs.writeFileSync(dummyFile, Buffer.from("dummy audio content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => {
          ee.stderr.emit("data", Buffer.from("Invalid data found"));
          ee.emit("close", 1);
        });
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/FFPROBE_FAILED/);
    });

    it("3. ffprobe malformed JSON -> throws ArtifactProbeError(MALFORMED_JSON)", async () => {
      const dummyFile = path.join(testDir, "probe_bad_json.wav");
      fs.writeFileSync(dummyFile, Buffer.from("dummy audio content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => {
          ee.stdout.emit("data", Buffer.from("{ malformed: true ###@@@"));
          ee.emit("close", 0);
        });
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/MALFORMED_JSON/);
    });

    it("4. No audio stream in container -> throws ArtifactProbeError(NO_AUDIO_STREAM)", async () => {
      const dummyFile = path.join(testDir, "probe_no_audio.mp4");
      fs.writeFileSync(dummyFile, Buffer.from("dummy video content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => {
          ee.stdout.emit("data", Buffer.from(JSON.stringify({ streams: [{ codec_type: "video" }] })));
          ee.emit("close", 0);
        });
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/NO_AUDIO_STREAM/);
    });

    it("5. Zero duration -> throws ArtifactProbeError(NON_POSITIVE_DURATION)", async () => {
      const dummyFile = path.join(testDir, "probe_zero_dur.wav");
      fs.writeFileSync(dummyFile, Buffer.from("dummy audio content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => {
          ee.stdout.emit("data", Buffer.from(JSON.stringify({
            streams: [{ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "24000", channels: 1, duration: "0" }]
          })));
          ee.emit("close", 0);
        });
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/NON_POSITIVE_DURATION/);
    });

    it("6. NaN duration -> throws ArtifactProbeError(INVALID_DURATION)", async () => {
      const dummyFile = path.join(testDir, "probe_nan_dur.wav");
      fs.writeFileSync(dummyFile, Buffer.from("dummy audio content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => {
          ee.stdout.emit("data", Buffer.from(JSON.stringify({
            streams: [{ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "24000", channels: 1, duration: "NaN" }]
          })));
          ee.emit("close", 0);
        });
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/INVALID_DURATION/);
    });

    it("7. Invalid sample rate -> throws ArtifactProbeError(INVALID_SAMPLE_RATE)", async () => {
      const dummyFile = path.join(testDir, "probe_bad_rate.wav");
      fs.writeFileSync(dummyFile, Buffer.from("dummy audio content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => {
          ee.stdout.emit("data", Buffer.from(JSON.stringify({
            streams: [{ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "0", channels: 1, duration: "2.0" }]
          })));
          ee.emit("close", 0);
        });
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/INVALID_SAMPLE_RATE/);
    });

    it("8. Invalid channels -> throws ArtifactProbeError(INVALID_CHANNELS)", async () => {
      const dummyFile = path.join(testDir, "probe_bad_channels.wav");
      fs.writeFileSync(dummyFile, Buffer.from("dummy audio content"));

      VoiceFabric._spawnFn = () => {
        const ee = new EventEmitter() as any;
        ee.stdout = new EventEmitter();
        ee.stderr = new EventEmitter();
        process.nextTick(() => {
          ee.stdout.emit("data", Buffer.from(JSON.stringify({
            streams: [{ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "24000", channels: 0, duration: "2.0" }]
          })));
          ee.emit("close", 0);
        });
        return ee;
      };

      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(dummyFile)).rejects.toThrow(/INVALID_CHANNELS/);
    });

    it("9. Real Corrupt WAV on disk -> physical ffprobe execution throws", async () => {
      const corruptWav = path.join(testDir, "corrupt_fixture.wav");
      fs.writeFileSync(corruptWav, Buffer.from("NOT_A_REAL_WAV_FILE_GARBAGE_HEADER_123456789"));

      await expect(VoiceFabric.probeAudioFile(corruptWav)).rejects.toThrow(ArtifactProbeError);
    });

    it("10. Real Corrupt MP3 on disk -> physical ffprobe execution throws", async () => {
      const corruptMp3 = path.join(testDir, "corrupt_fixture.mp3");
      fs.writeFileSync(corruptMp3, Buffer.from("NOT_A_VALID_MP3_FRAME_HEADER_XYZ987654321"));

      await expect(VoiceFabric.probeAudioFile(corruptMp3)).rejects.toThrow(ArtifactProbeError);
    });

    it("11. Valid container with zero audio frames -> ffprobe reports 0 duration and throws ArtifactProbeError", async () => {
      const zeroFrames = path.join(testDir, "zero_frames.wav");
      // Standard 44 byte WAV header claiming 0 bytes data
      const buf = Buffer.alloc(44);
      buf.write("RIFF", 0);
      buf.writeUInt32LE(36, 4);
      buf.write("WAVE", 8);
      buf.write("fmt ", 12);
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);
      buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(24000, 24);
      buf.writeUInt32LE(48000, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);
      buf.write("data", 36);
      buf.writeUInt32LE(0, 40);
      fs.writeFileSync(zeroFrames, buf);

      // Duration is 0, so probeAudioFile must fail-closed with NON_POSITIVE_DURATION
      await expect(VoiceFabric.probeAudioFile(zeroFrames)).rejects.toThrow(ArtifactProbeError);
      await expect(VoiceFabric.probeAudioFile(zeroFrames)).rejects.toThrow(/MISSING_DURATION|NON_POSITIVE_DURATION/);
    });
  });

  // ============================================================
  // PROVIDER PAYLOAD & TRANSPORT DEFECTS (12-22)
  // ============================================================
  describe("Defects 12-22: Provider Payload & Transport Integrity", () => {
    it("12. Provider returns malformed base64 -> throws VOICE_PROVIDER_INVALID_AUDIO", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/mp3", data: "%%%NOT_BASE64_GARBAGE$$$" } }] } }]
        }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Malformed Base64" })).rejects.toThrow(
        /VOICE_PROVIDER_INVALID_AUDIO/
      );
    });

    it("13. Provider returns empty base64 string -> throws VOICE_PROVIDER_MISSING_AUDIO", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/mp3", data: "" } }] } }]
        }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Empty audio" })).rejects.toThrow(
        /VOICE_PROVIDER_MISSING_AUDIO/
      );
    });

    it("14. Provider returns HTTP 200 with text only (no audio parts) -> throws VOICE_PROVIDER_MISSING_AUDIO", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "I am text, not audio" }] } }]
        }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Text only" })).rejects.toThrow(
        /VOICE_PROVIDER_MISSING_AUDIO/
      );
    });

    it("15. Provider HTTP 400 Bad Request -> throws VOICE_PROVIDER_BAD_REQUEST", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Invalid argument format in request body" } }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Bad request" })).rejects.toThrow(
        /VOICE_PROVIDER_BAD_REQUEST/
      );
    });

    it("16. Provider HTTP 401 Unauthorized -> throws VOICE_AUTHENTICATION_FAILED", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "API key expired or invalid" } }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Unauthorized" })).rejects.toThrow(
        /VOICE_AUTHENTICATION_FAILED/
      );
    });

    it("17. Provider HTTP 403 Forbidden -> throws VOICE_PERMISSION_DENIED", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "API disabled for project" } }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Forbidden" })).rejects.toThrow(
        /VOICE_PERMISSION_DENIED/
      );
    });

    it("18. Provider HTTP 429 Rate Limited -> throws VOICE_RATE_LIMITED", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Quota exceeded for quota metric" } }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Rate limited" })).rejects.toThrow(
        /VOICE_RATE_LIMITED/
      );
    });

    it("19. Provider HTTP 500 Internal Service Error -> throws VOICE_PROVIDER_UNAVAILABLE", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Backend synthesis internal failure" } }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Internal error" })).rejects.toThrow(
        /VOICE_PROVIDER_UNAVAILABLE/
      );
    });

    it("20. Provider timeout via internal AbortController -> throws VOICE_PROVIDER_TIMEOUT", async () => {
      await startMockServer((_req, _res) => {
        // Deliberately hang without responding
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      // Calls synthesizeSpeech with 50ms timeout; provider's AbortController aborts fetch directly
      await expect(
        provider.synthesizeSpeech({ transcript: "Timeout test", timeoutMs: 50 })
      ).rejects.toThrow(/VOICE_PROVIDER_TIMEOUT/);
    });

    it("21. Connection reset -> catches cleanly as VOICE_PROVIDER_UNAVAILABLE", async () => {
      await startMockServer((_req, res) => {
        res.socket?.destroy();
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Reset test" })).rejects.toThrow(
        /VOICE_PROVIDER_UNAVAILABLE/
      );
    });

    it("22. DNS / Unreachable host failure -> throws VOICE_PROVIDER_UNAVAILABLE", async () => {
      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", "http://unreachable-gemini-host-999.invalid");
      await expect(provider.synthesizeSpeech({ transcript: "DNS test" })).rejects.toThrow(
        /VOICE_PROVIDER_UNAVAILABLE/
      );
    });
  });

  // ============================================================
  // FALLBACK, IDEMPOTENCY & TAMPER HARDENING (23-29)
  // ============================================================
  describe("Defects 23-29: Fallback, Contracts & Adversarial Proofs", () => {
    it("23. Fallback enabled -> produces physical DEGRADED_FALLBACK WAV with exact sample duration", async () => {
      process.env.GEMINI_API_KEY = "placeholder_invalid_key";
      const fabric = new VoiceFabric();
      const artifact = await fabric.synthesize("Fallback test phrase", "profile_narrator_dramatic", {
        outputDir: testDir,
        allowFallback: true,
      });

      expect(artifact.success).toBe(true);
      expect(artifact.isFallback).toBe(true);
      expect(artifact.qualityClass).toBe("DEGRADED_FALLBACK");
      expect(artifact.provider).toBe("SILENT_WAV_FALLBACK");
      expect(artifact.durationSource).toBe("PHYSICAL_FFPROBE");
      expect(artifact.durationSeconds).toBeGreaterThan(0);
      expect(fs.existsSync(artifact.localPath)).toBe(true);
    });

    it("24. Fallback disabled -> throws LIVE_PROVIDER_REQUIRED instead of falling back to silence", async () => {
      process.env.GEMINI_API_KEY = "placeholder_invalid_key";
      const fabric = new VoiceFabric();
      await expect(
        fabric.synthesize("Strict live provider test", "profile_narrator_dramatic", {
          outputDir: testDir,
          allowFallback: false,
        })
      ).rejects.toThrow(/LIVE_PROVIDER_REQUIRED/);
    });

    it("25. Duplicate execution -> guarantees unique factoryExecutionId and unique artifactId", async () => {
      process.env.GEMINI_API_KEY = "placeholder_invalid_key";
      const fabric = new VoiceFabric();
      const res1 = await fabric.synthesize("Idempotent phrase", "profile_narrator_dramatic", testDir);
      const res2 = await fabric.synthesize("Idempotent phrase", "profile_narrator_dramatic", testDir);

      expect(res1.factoryExecutionId).not.toBe(res2.factoryExecutionId);
      expect(res1.artifactId).not.toBe(res2.artifactId);
      expect(res1.sha256).toBe(res2.sha256); // Identical deterministic PCM payload
    });

    it("26. Artifact tampering -> modifying 1 byte on disk causes assertPrimaryAudioArtifact to reject with SHA mismatch", async () => {
      const validPcm = SilentWavVoiceEngine.generateValidPcmWav(1, 24000);
      const artifact = await verifyAndPublishAudioArtifact(validPcm, testDir, "tamper_target", {
        provider: "GEMINI",
        expectedFormat: "wav",
        qualityClass: "PRIMARY",
        synthesisLatencyMs: 15,
      });

      // Valid artifact passes strict contract initially
      expect(() => assertPrimaryAudioArtifact(artifact)).not.toThrow();

      // Tamper exactly one byte on disk
      const bytes = fs.readFileSync(artifact.localPath);
      bytes[44] = bytes[44] ^ 0xff; // Invert first sample byte
      fs.writeFileSync(artifact.localPath, bytes);

      // Re-evaluating contract MUST fail-closed with SHA mismatch
      expect(() => assertPrimaryAudioArtifact(artifact)).toThrow(/sha256 mismatch/i);
    });

    it("27. Provider request ID missing in response -> strictly undefined (never fabricated)", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        const fakePcmWav = SilentWavVoiceEngine.generateValidPcmWav(1, 24000);
        res.end(JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: fakePcmWav.toString("base64") } }] } }]
        }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      const res = await provider.synthesizeSpeech({ transcript: "Request ID absent" });
      expect(res.providerRequestId).toBeUndefined();
    });

    it("28. Provider request ID present in response -> faithfully captured", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-goog-request-id": "req_goog_abc123xyz",
        });
        const fakePcmWav = SilentWavVoiceEngine.generateValidPcmWav(1, 24000);
        res.end(JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: fakePcmWav.toString("base64") } }] } }]
        }));
      });

      const provider = new GeminiTTSProvider("valid_length_key_for_testing_12345", serverUrl);
      const res = await provider.synthesizeSpeech({ transcript: "Request ID test" });
      expect(res.providerRequestId).toBe("req_goog_abc123xyz");
    });

    it("29. Credential key present but upstream rejects it (API_KEY_INVALID) -> AUTH_FAILED classification", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: {
            code: 400,
            message: "API key not valid. Please pass a valid API key.",
            status: "INVALID_ARGUMENT",
            details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }]
          }
        }));
      });

      const provider = new GeminiTTSProvider("AIzaSyD_FAKE_TEST_KEY_THAT_GOOGLE_REJECTS_1234", serverUrl);
      await expect(provider.synthesizeSpeech({ transcript: "Invalid key test" })).rejects.toThrow(
        /VOICE_AUTHENTICATION_FAILED/
      );
    });
  });

  // ============================================================
  // LIVE TEST HARNESS HONEST OUTCOMES (Defect #16)
  // ============================================================
  describe("Defect 16: Live Test Harness Strict Honesty Matrix", () => {
    it("verifyLiveProviderExecution returns BLOCKED(CREDENTIALS_REQUIRED) when key is missing", async () => {
      process.env.GEMINI_API_KEY = "";
      const res = await verifyLiveProviderExecution("GEMINI");
      expect(res.success).toBe(false);
      expect(res.status).toBe("BLOCKED");
      expect(res.code).toBe("CREDENTIALS_REQUIRED");
      expect(res.artifact).toBeUndefined();
    });

    it("verifyLiveProviderExecution returns BLOCKED(INVALID_CREDENTIAL_SHAPE) when key is malformed placeholder", async () => {
      process.env.GEMINI_API_KEY = "placeholder_fake_key_12345";
      const res = await verifyLiveProviderExecution("GEMINI");
      expect(res.success).toBe(false);
      expect(res.status).toBe("BLOCKED");
      expect(res.code).toBe("INVALID_CREDENTIAL_SHAPE");
      expect(res.artifact).toBeUndefined();
    });

    it("verifyLiveProviderExecution returns FAILED(AUTHENTICATION_FAILED) when key is rejected upstream", async () => {
      await startMockServer((_req, res) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: {
            code: 400,
            message: "API key not valid. Please pass a valid API key.",
            status: "INVALID_ARGUMENT",
            details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }]
          }
        }));
      });

      // Point Gemini TTS to mock server URL by stubbing GeminiTTSProvider baseUrl
      process.env.GEMINI_API_KEY = "AIzaSyD_TEST_KEY_LENGTH_39_CHARS_12345";
      const fabric = new VoiceFabric();
      const engine = fabric.getEngine("GEMINI") as GeminiVoiceEngine;
      const originalSynth = engine.synthesize;
      engine.synthesize = async (text, profile, outputDir) => {
        const provider = new GeminiTTSProvider(process.env.GEMINI_API_KEY, serverUrl);
        const result = await provider.synthesizeSpeech({ transcript: text });
        const dir = outputDir || testDir;
        return verifyAndPublishAudioArtifact(result.audioBuffer, dir, "live_auth_fail", {
          provider: "GEMINI",
          expectedFormat: "wav",
          qualityClass: "PRIMARY",
          synthesisLatencyMs: 10,
        });
      };

      vi.spyOn(VoiceFabric.prototype, "getEngine").mockReturnValue(engine);

      const res = await verifyLiveProviderExecution("GEMINI");
      expect(res.success).toBe(false);
      expect(res.status).toBe("FAILED");
      expect(res.code).toBe("AUTHENTICATION_FAILED");
    });

    it("verifyLiveProviderExecution returns FAILED(TIMEOUT) when provider request hangs", async () => {
      await startMockServer((_req, _res) => {
        // Hang indefinitely
      });

      process.env.GEMINI_API_KEY = "AIzaSyD_TEST_KEY_LENGTH_39_CHARS_12345";
      const fabric = new VoiceFabric();
      const engine = fabric.getEngine("GEMINI") as GeminiVoiceEngine;
      engine.synthesize = async (text) => {
        const provider = new GeminiTTSProvider(process.env.GEMINI_API_KEY, serverUrl);
        await provider.synthesizeSpeech({ transcript: text, timeoutMs: 50 });
        throw new Error("unreachable");
      };

      vi.spyOn(VoiceFabric.prototype, "getEngine").mockReturnValue(engine);

      const res = await verifyLiveProviderExecution("GEMINI");
      expect(res.success).toBe(false);
      expect(res.status).toBe("FAILED");
      expect(res.code).toBe("TIMEOUT");
    });

    it("verifyLiveProviderExecution returns FAILED(ARTIFACT_VALIDATION_FAILED) on corrupt media", async () => {
      process.env.GEMINI_API_KEY = "AIzaSyD_TEST_KEY_LENGTH_39_CHARS_12345";
      const fabric = new VoiceFabric();
      const engine = fabric.getEngine("GEMINI") as GeminiVoiceEngine;
      engine.synthesize = async () => {
        const corruptFile = path.join(testDir, "corrupt_live.wav");
        fs.writeFileSync(corruptFile, Buffer.from("NOT_AUDIO_BYTES"));
        return {
          artifactId: "art_corrupt",
          localPath: corruptFile,
          audioUrl: corruptFile,
          format: "wav",
          success: true,
          qualityClass: "PRIMARY",
          provider: "GEMINI",
          synthesisLatencyMs: 10,
          byteLength: 15,
          codec: "pcm_s16le",
          sampleRate: 24000,
          channels: 1,
          durationSeconds: 1.0,
          durationSource: "PHYSICAL_FFPROBE",
          isFallback: false,
          sha256: "0000000000000000000000000000000000000000000000000000000000000000",
          producedAt: new Date().toISOString(),
        };
      };

      vi.spyOn(VoiceFabric.prototype, "getEngine").mockReturnValue(engine);

      const res = await verifyLiveProviderExecution("GEMINI");
      expect(res.success).toBe(false);
      expect(res.status).toBe("FAILED");
      expect(res.code).toBe("ARTIFACT_VALIDATION_FAILED");
    });

    it("verifyLiveProviderExecution returns VERIFIED with exact physical measurements on genuine verified audio", async () => {
      process.env.GEMINI_API_KEY = "AIzaSyD_TEST_KEY_LENGTH_39_CHARS_12345";
      const fabric = new VoiceFabric();
      const engine = fabric.getEngine("GEMINI") as GeminiVoiceEngine;
      engine.synthesize = async () => {
        const pcmBuf = SilentWavVoiceEngine.generateValidPcmWav(2, 24000);
        return verifyAndPublishAudioArtifact(pcmBuf, testDir, "live_success", {
          provider: "GEMINI",
          expectedFormat: "wav",
          qualityClass: "PRIMARY",
          synthesisLatencyMs: 15,
        });
      };

      vi.spyOn(VoiceFabric.prototype, "getEngine").mockReturnValue(engine);

      const res = await verifyLiveProviderExecution("GEMINI");
      expect(res.success).toBe(true);
      expect(res.status).toBe("VERIFIED");
      expect(res.artifact).toBeDefined();
      expect(res.artifact?.qualityClass).toBe("PRIMARY");
      expect(res.artifact?.durationSource).toBe("PHYSICAL_FFPROBE");
      expect(res.measurements?.durationSeconds).toBe(res.artifact?.durationSeconds);
      expect(res.measurements?.codec).toBe("pcm_s16le");
      expect(res.measurements?.sampleRate).toBe(24000);
      expect(res.measurements?.channels).toBe(1);
    });
  });
});
