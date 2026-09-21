/**
 * ShortForge Voice Fabric — Authoritative Implementation
 * Multi-Engine Voice Synthesis Architecture:
 * VoiceProfile -> VoicePreflight -> VoiceRouter -> VoiceEngineRegistry -> VoiceDiagnostics -> Silent Fallback
 * Guarantees physical audio artifact generation, forensic RIFF/WAVE header validation,
 * explicit qualityClass degradation tracking ("PRIMARY" | "FALLBACK" | "DEGRADED_FALLBACK"),
 * and zero false greens: never confuses fallback with primary live provider execution.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";

export type CredentialState = "MISSING" | "PRESENT" | "INVALID_SHAPE" | "INVALID" | "UNKNOWN";

export function detectCredentialState(key?: string): "MISSING" | "PRESENT" | "INVALID_SHAPE" {
  if (!key || key.trim() === "") return "MISSING";
  const trimmed = key.trim();
  if (
    trimmed.startsWith("placeholder_") ||
    trimmed.includes("YOUR_") ||
    trimmed.includes("your_") ||
    trimmed.startsWith("test_key_fake") ||
    trimmed.startsWith("<") ||
    trimmed.length <= 10
  ) {
    return "INVALID_SHAPE";
  }
  return "PRESENT";
}

export interface VoiceProfile {
  readonly profileId: string;
  readonly name: string;
  readonly gender: "MALE" | "FEMALE" | "NEUTRAL";
  readonly language: string;
  readonly pitch: number;   // -1.0 to 1.0
  readonly speed: number;   // 0.5 to 2.0
  readonly tone: "DRAMATIC" | "ENERGETIC" | "CALM" | "CURIOUS" | "AUTHORITATIVE";
  readonly preferredEngine?: "GEMINI" | "ELEVENLABS" | "EDGE" | "SYSTEM";
}

export type VoicePreflightStatus = "NOT_CONFIGURED" | "CONFIGURED" | "READY" | "UNAVAILABLE";
export type ProviderHealth = "UNKNOWN" | "READY" | "UNAVAILABLE" | "AUTH_FAILED";
export type LatencyStatus = "MEASURED" | "UNMEASURED" | "ESTIMATED";

export interface VoicePreflightResult {
  readonly healthy: boolean;
  readonly status: VoicePreflightStatus;
  readonly providerHealth: ProviderHealth;
  readonly selectedEngine: string;
  readonly latencyStatus: LatencyStatus;
  readonly measuredLatencyMs: number | null;
  readonly estimatedCostUsd: number | null;
  readonly credentialState: CredentialState;
  readonly benchmarkTimestamp: string;
}

export type DurationSource =
  | "PHYSICAL_FFPROBE"
  | "PROVIDER_REPORTED"
  | "ESTIMATED"
  | "UNKNOWN";

export interface VoiceArtifact {
  readonly artifactId: string;
  readonly localPath: string;
  readonly audioUrl: string;
  readonly format: string;
  readonly success: boolean;
  readonly storageUri?: string;
  readonly qualityClass: "PRIMARY" | "FALLBACK" | "DEGRADED_FALLBACK" | "PROTOTYPE";
  readonly provider: string;
  readonly factoryExecutionId?: string;
  readonly providerRequestId?: string;
  readonly synthesisLatencyMs: number;
  readonly byteLength: number;
  readonly codec: "pcm_s16le" | "mp3" | "aac";
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSeconds: number;
  readonly durationSource: DurationSource;
  readonly isFallback: boolean;
  readonly fallbackReason?: string;
  readonly sha256: string;
  readonly producedAt: string;
}

export class ArtifactProbeError extends Error {
  readonly code:
    | "FILE_NOT_FOUND"
    | "EMPTY_FILE"
    | "FFPROBE_MISSING"
    | "FFPROBE_FAILED"
    | "MALFORMED_JSON"
    | "NO_AUDIO_STREAM"
    | "MISSING_CODEC"
    | "INVALID_SAMPLE_RATE"
    | "INVALID_CHANNELS"
    | "MISSING_DURATION"
    | "NON_POSITIVE_DURATION"
    | "INVALID_DURATION";

  constructor(message: string, code: ArtifactProbeError["code"]) {
    super(`[ArtifactProbeError:${code}] ${message}`);
    this.name = "ArtifactProbeError";
    this.code = code;
  }
}

/**
 * Strict forensic contract helper asserting all physical invariants for a PRIMARY VoiceArtifact.
 * Throws immediately on any invariant violation.
 */
export function assertPrimaryAudioArtifact(artifact: VoiceArtifact, expectedFilePath?: string): void {
  if (artifact.success !== true) {
    throw new Error("Primary invariant violation: artifact.success !== true");
  }
  if (artifact.qualityClass !== "PRIMARY") {
    throw new Error(`Primary invariant violation: qualityClass is '${artifact.qualityClass}', expected 'PRIMARY'`);
  }
  if (artifact.isFallback !== false) {
    throw new Error("Primary invariant violation: isFallback is true for PRIMARY artifact");
  }
  if (artifact.durationSource !== "PHYSICAL_FFPROBE") {
    throw new Error(`Primary invariant violation: durationSource is '${artifact.durationSource}', expected 'PHYSICAL_FFPROBE'`);
  }

  const targetPath = expectedFilePath || artifact.localPath;
  if (!targetPath || !fs.existsSync(targetPath)) {
    throw new Error(`Primary invariant violation: physical file missing at '${targetPath}'`);
  }

  const stat = fs.statSync(targetPath);
  if (stat.size === 0) {
    throw new Error(`Primary invariant violation: physical file size is 0 bytes at '${targetPath}'`);
  }
  if (stat.size !== artifact.byteLength) {
    throw new Error(`Primary invariant violation: disk file size (${stat.size}B) != artifact byteLength (${artifact.byteLength}B)`);
  }

  if (!artifact.codec || (artifact.codec as string) === "unknown") {
    throw new Error("Primary invariant violation: audio codec is unknown or empty");
  }
  if (!artifact.sampleRate || artifact.sampleRate <= 0 || isNaN(artifact.sampleRate)) {
    throw new Error(`Primary invariant violation: invalid sample rate '${artifact.sampleRate}'`);
  }
  if (!artifact.channels || artifact.channels <= 0 || isNaN(artifact.channels)) {
    throw new Error(`Primary invariant violation: invalid channel count '${artifact.channels}'`);
  }
  if (!artifact.durationSeconds || artifact.durationSeconds <= 0 || isNaN(artifact.durationSeconds) || !isFinite(artifact.durationSeconds)) {
    throw new Error(`Primary invariant violation: invalid durationSeconds '${artifact.durationSeconds}'`);
  }
  if (!artifact.sha256 || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) {
    throw new Error(`Primary invariant violation: sha256 is not 64 hex characters ('${artifact.sha256}')`);
  }

  // Strictly verify that hash in metadata matches current physical bytes on disk
  const physicalBytes = fs.readFileSync(targetPath);
  const physicalHash = crypto.createHash("sha256").update(physicalBytes).digest("hex");
  if (physicalHash !== artifact.sha256) {
    throw new Error(`Primary invariant violation: sha256 mismatch (disk: ${physicalHash}, artifact: ${artifact.sha256})`);
  }
}

export interface CanonicalPublishOptions {
  provider: string;
  expectedFormat: "wav" | "mp3";
  qualityClass: "PRIMARY";
  factoryExecutionId?: string;
  providerRequestId?: string;
  synthesisLatencyMs: number;
}

/**
 * Shared Canonical Audio Verification & Atomic Publishing Pipeline (Defects #6, #7, #19):
 * rawBuffer -> write temp -> fsync -> verify size -> ffprobe -> SHA-256 of disk bytes -> atomic rename -> assertPrimaryAudioArtifact
 */
export async function verifyAndPublishAudioArtifact(
  rawBuffer: Buffer,
  outputDir: string,
  fileNameBase: string,
  options: CanonicalPublishOptions
): Promise<VoiceArtifact> {
  if (!rawBuffer || rawBuffer.length === 0) {
    throw new Error("[CanonicalAudioPipeline] Raw audio buffer is 0 bytes");
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const tempFileName = `${fileNameBase}.tmp_${randomUUID().substring(0, 8)}`;
  const tempFilePath = path.join(outputDir, tempFileName);

  try {
    // 1. Persist temporary file and sync to disk
    const fd = fs.openSync(tempFilePath, "w");
    fs.writeSync(fd, rawBuffer);
    try {
      fs.fsyncSync(fd);
    } catch {}
    fs.closeSync(fd);

    // 2. Verify file exists and byte length matches
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`[CanonicalAudioPipeline] Temp file not found after write: ${tempFilePath}`);
    }
    const stat = fs.statSync(tempFilePath);
    if (stat.size === 0) {
      throw new Error("[CanonicalAudioPipeline] Persisted temp audio file is 0 bytes");
    }
    if (stat.size !== rawBuffer.length) {
      throw new Error(`[CanonicalAudioPipeline] Persisted byte length (${stat.size}) does not match buffer length (${rawBuffer.length})`);
    }

    // 3. Fail-closed physical probe via ffprobe
    const probe = await VoiceFabric.probeAudioFile(tempFilePath);

    // 4. Validate physical media semantics
    if (probe.durationSeconds <= 0 || isNaN(probe.durationSeconds) || !isFinite(probe.durationSeconds)) {
      throw new Error(`[CanonicalAudioPipeline] Forensic probe measured non-positive duration: ${probe.durationSeconds}`);
    }
    if (probe.sampleRate <= 0 || isNaN(probe.sampleRate)) {
      throw new Error(`[CanonicalAudioPipeline] Forensic probe measured invalid sample rate: ${probe.sampleRate}`);
    }
    if (probe.channels <= 0 || isNaN(probe.channels)) {
      throw new Error(`[CanonicalAudioPipeline] Forensic probe measured invalid channels: ${probe.channels}`);
    }

    // 5. Authoritative SHA-256 strictly computed from persisted file bytes on disk
    const diskBytes = fs.readFileSync(tempFilePath);
    const sha256 = crypto.createHash("sha256").update(diskBytes).digest("hex");

    // 6. Atomically move into final artifact path
    const finalFileName = `${fileNameBase}.${options.expectedFormat}`;
    const finalFilePath = path.join(outputDir, finalFileName);
    fs.renameSync(tempFilePath, finalFilePath);

    const finalStat = fs.statSync(finalFilePath);

    const artifact: VoiceArtifact = {
      artifactId: `art_voice_${randomUUID().substring(0, 8)}`,
      localPath: finalFilePath,
      audioUrl: finalFilePath,
      format: options.expectedFormat,
      success: true,
      storageUri: `file://${finalFilePath}`,
      qualityClass: "PRIMARY",
      provider: options.provider,
      factoryExecutionId: options.factoryExecutionId || `fexec_voice_${randomUUID().substring(0, 8)}`,
      providerRequestId: options.providerRequestId || undefined,
      synthesisLatencyMs: options.synthesisLatencyMs,
      byteLength: finalStat.size,
      codec: (probe.codec.includes("pcm") ? "pcm_s16le" : probe.codec.includes("mp3") ? "mp3" : "aac") as any,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      durationSeconds: probe.durationSeconds,
      durationSource: "PHYSICAL_FFPROBE",
      isFallback: false,
      sha256,
      producedAt: new Date().toISOString(),
    };

    // 7. Verify strict contract
    assertPrimaryAudioArtifact(artifact, finalFilePath);

    return artifact;
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
    throw err;
  }
}

export interface IVoiceEngine {
  readonly id: string;
  readonly name: string;
  readonly isProductionReady: boolean;
  readonly isPrimaryRoutable: boolean;
  readonly isEmergencyFallback: boolean;
  getCredentialState(): CredentialState;
  isAvailable(): Promise<boolean>;
  synthesize(text: string, profile: VoiceProfile, outputDir?: string): Promise<VoiceArtifact>;
}

export class GeminiVoiceEngine implements IVoiceEngine {
  readonly id = "GEMINI";
  readonly name = "Google Gemini Neural TTS";
  readonly isProductionReady = true;
  readonly isPrimaryRoutable = true;
  readonly isEmergencyFallback = false;

  getCredentialState(): CredentialState {
    return detectCredentialState(process.env.GEMINI_API_KEY);
  }

  async isAvailable(): Promise<boolean> {
    return this.getCredentialState() === "PRESENT";
  }

  async synthesize(text: string, profile: VoiceProfile, outputDir?: string): Promise<VoiceArtifact> {
    const credState = this.getCredentialState();
    if (credState !== "PRESENT") {
      throw new Error(`[GeminiVoiceEngine] LIVE_PROVIDER_REQUIRED: GEMINI_API_KEY is not configured with live credentials (state: ${credState})`);
    }

    const apiKey = process.env.GEMINI_API_KEY!;
    const startTime = Date.now();
    const { GeminiTTSProvider } = await import("./GeminiTTSProvider");
    const provider = new GeminiTTSProvider(apiKey);
    const result = await provider.synthesizeSpeech({
      transcript: text,
      voice: profile.name || "Puck",
      style: profile.tone === "DRAMATIC" ? "DRAMATIC" : "NATURAL",
    });

    if (!result.audioBuffer || result.audioBuffer.length === 0) {
      throw new Error("[GeminiVoiceEngine] Gemini provider returned empty audio buffer");
    }

    const dir = outputDir || path.join(process.cwd(), "data", "audio");
    const ext = result.mimeType?.includes("wav") ? "wav" : "mp3";
    const baseName = `voice_gemini_${randomUUID().substring(0, 8)}`;
    const latency = Date.now() - startTime;

    return verifyAndPublishAudioArtifact(result.audioBuffer, dir, baseName, {
      provider: "GEMINI",
      expectedFormat: ext,
      qualityClass: "PRIMARY",
      providerRequestId: result.providerRequestId,
      synthesisLatencyMs: latency,
    });
  }
}

export class ElevenLabsVoiceEngine implements IVoiceEngine {
  readonly id = "ELEVENLABS";
  readonly name = "ElevenLabs Multilingual v2";
  readonly isProductionReady = true;
  readonly isPrimaryRoutable = true;
  readonly isEmergencyFallback = false;

  getCredentialState(): CredentialState {
    return detectCredentialState(process.env.ELEVENLABS_API_KEY);
  }

  async isAvailable(): Promise<boolean> {
    return this.getCredentialState() === "PRESENT";
  }

  async synthesize(text: string, profile: VoiceProfile, outputDir?: string): Promise<VoiceArtifact> {
    const credState = this.getCredentialState();
    if (credState !== "PRESENT") {
      throw new Error(`[ElevenLabsVoiceEngine] LIVE_PROVIDER_REQUIRED: ELEVENLABS_API_KEY is not configured with live credentials (state: ${credState})`);
    }

    const startTime = Date.now();
    const { ElevenLabsProvider } = await import("../../../lib/voice/providers/elevenlabs");
    const provider = new ElevenLabsProvider();
    const audioBuf = await provider.synthesize(text, {
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      modelId: "eleven_multilingual_v2",
    });

    if (!audioBuf || audioBuf.length === 0) {
      throw new Error("[ElevenLabsVoiceEngine] ElevenLabs provider returned 0 audio bytes");
    }

    const dir = outputDir || path.join(process.cwd(), "data", "audio");
    const baseName = `voice_elevenlabs_${randomUUID().substring(0, 8)}`;
    const latency = Date.now() - startTime;

    return verifyAndPublishAudioArtifact(audioBuf, dir, baseName, {
      provider: "ELEVENLABS",
      expectedFormat: "mp3",
      qualityClass: "PRIMARY",
      providerRequestId: undefined,
      synthesisLatencyMs: latency,
    });
  }
}

export class EdgeVoiceEngine implements IVoiceEngine {
  readonly id = "EDGE";
  readonly name = "Microsoft Edge Speech TTS";
  readonly isProductionReady = true;
  readonly isPrimaryRoutable = true;
  readonly isEmergencyFallback = false;

  getCredentialState(): CredentialState {
    const val = process.env.EDGE_TTS_ENABLED;
    if (!val || val === "false") return "MISSING";
    if (val === "true") return "PRESENT";
    return "INVALID_SHAPE";
  }

  async isAvailable(): Promise<boolean> {
    return this.getCredentialState() === "PRESENT";
  }

  async synthesize(text: string, profile: VoiceProfile, outputDir?: string): Promise<VoiceArtifact> {
    if (this.getCredentialState() !== "PRESENT") {
      throw new Error("[EdgeVoiceEngine] LIVE_PROVIDER_REQUIRED: EDGE_TTS_ENABLED is not set to true");
    }

    const startTime = Date.now();
    let audioBuffer: Buffer;
    try {
      const { EdgeTTS } = await import("@travisvn/edge-tts");
      const voice = "en-US-GuyNeural";
      const tts = new EdgeTTS(text, voice);
      const res = await Promise.race([
        tts.synthesize(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Edge TTS network connection timed out")), 5000)
        ),
      ]);
      const arrayBuffer = await (res as any).audio.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
      if (audioBuffer.length === 0) {
        throw new Error("Edge TTS returned 0 audio bytes");
      }
    } catch (err: any) {
      throw new Error(`[EdgeVoiceEngine] Edge TTS synthesis failed: ${err.message}`);
    }

    const dir = outputDir || path.join(process.cwd(), "data", "audio");
    const baseName = `voice_edge_${randomUUID().substring(0, 8)}`;
    const latency = Date.now() - startTime;

    return verifyAndPublishAudioArtifact(audioBuffer, dir, baseName, {
      provider: "EDGE",
      expectedFormat: "mp3",
      qualityClass: "PRIMARY",
      providerRequestId: undefined,
      synthesisLatencyMs: latency,
    });
  }
}

export class SilentWavVoiceEngine implements IVoiceEngine {
  readonly id = "SILENT_WAV_FALLBACK";
  readonly name = "Deterministic Silent PCM WAV Fallback";
  readonly isProductionReady = false; // Emergency degradation fallback only; not a primary routable provider
  readonly isPrimaryRoutable = false;
  readonly isEmergencyFallback = true;

  getCredentialState(): CredentialState {
    return "PRESENT";
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available as emergency safety net
  }

  /**
   * Generates a forensically valid 16-bit PCM Mono WAV buffer with standard 44-byte RIFF header.
   */
  static generateValidPcmWav(durationSeconds: number, sampleRate: number = 24000): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) / 8; // 2 bytes
    const byteRate = sampleRate * blockAlign;
    const numSamples = Math.round(sampleRate * durationSeconds);
    const dataSize = numSamples * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF Chunk
    buffer.write("RIFF", 0, "ascii");
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8, "ascii");

    // fmt Chunk
    buffer.write("fmt ", 12, "ascii");
    buffer.writeUInt32LE(16, 16); // Subchunk1Size for PCM
    buffer.writeUInt16LE(1, 20);  // AudioFormat 1 = PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data Chunk
    buffer.write("data", 36, "ascii");
    buffer.writeUInt32LE(dataSize, 40);

    // Audio samples: zeros (deterministic silence)
    buffer.fill(0, 44);

    // Forensic Validation of generated buffer
    SilentWavVoiceEngine.validateWavStructure(buffer, sampleRate, numChannels, bitsPerSample, dataSize);

    return buffer;
  }

  /**
   * Forensic Structural Validator for WAV files:
   * Validates RIFF, WAVE, fmt chunk, PCM format (1), channels, sample rate, bits/sample, data chunk, byte length.
   */
  static validateWavStructure(
    buf: Buffer,
    expectedSampleRate?: number,
    expectedChannels?: number,
    expectedBits?: number,
    expectedDataSize?: number
  ): boolean {
    if (buf.length < 44) throw new Error("WAV buffer too small (< 44 bytes)");
    if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("Missing 'RIFF' header at offset 0");
    if (buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Missing 'WAVE' format at offset 8");
    if (buf.toString("ascii", 12, 16) !== "fmt ") throw new Error("Missing 'fmt ' chunk at offset 12");

    const audioFormat = buf.readUInt16LE(20);
    if (audioFormat !== 1) throw new Error(`Invalid audio format ${audioFormat}; expected PCM (1)`);

    const channels = buf.readUInt16LE(22);
    if (expectedChannels && channels !== expectedChannels) {
      throw new Error(`Channel count mismatch: got ${channels}, expected ${expectedChannels}`);
    }

    const sampleRate = buf.readUInt32LE(24);
    if (expectedSampleRate && sampleRate !== expectedSampleRate) {
      throw new Error(`Sample rate mismatch: got ${sampleRate}, expected ${expectedSampleRate}`);
    }

    const bitsPerSample = buf.readUInt16LE(34);
    if (expectedBits && bitsPerSample !== expectedBits) {
      throw new Error(`Bits per sample mismatch: got ${bitsPerSample}, expected ${expectedBits}`);
    }

    if (buf.toString("ascii", 36, 40) !== "data") throw new Error("Missing 'data' chunk at offset 36");

    const dataSize = buf.readUInt32LE(40);
    if (expectedDataSize && dataSize !== expectedDataSize) {
      throw new Error(`Data size mismatch: got ${dataSize}, expected ${expectedDataSize}`);
    }
    if (buf.length !== 44 + dataSize) {
      throw new Error(`Inconsistent WAV length: buffer is ${buf.length} bytes, header claims ${44 + dataSize}`);
    }

    return true;
  }

  async synthesize(
    text: string,
    profile: VoiceProfile,
    outputDir?: string,
    fallbackReason: string = "Primary neural TTS unconfigured or unreachable"
  ): Promise<VoiceArtifact> {
    const startTime = Date.now();
    const durationSeconds = Math.max(2, Math.round(text.length / 15));
    const dir = outputDir || path.join(process.cwd(), "data", "audio");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fileName = `voice_silent_fallback_${randomUUID().substring(0, 8)}.wav`;
    const filePath = path.join(dir, fileName);

    const buffer = SilentWavVoiceEngine.generateValidPcmWav(durationSeconds, 24000);
    fs.writeFileSync(filePath, buffer);

    const probe = await VoiceFabric.probeAudioFile(filePath);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const latency = Date.now() - startTime; // Forensic truth: exact measured elapsed time without synthetic minimums

    return {
      artifactId: `art_voice_fallback_${randomUUID().substring(0, 8)}`,
      localPath: filePath,
      audioUrl: filePath,
      format: "wav",
      success: true,
      storageUri: `file://${filePath}`,
      qualityClass: "DEGRADED_FALLBACK",
      provider: "SILENT_WAV_FALLBACK",
      factoryExecutionId: `fexec_voice_${randomUUID().substring(0, 8)}`,
      providerRequestId: undefined,
      synthesisLatencyMs: latency,
      byteLength: buffer.length,
      codec: "pcm_s16le",
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      durationSeconds: probe.durationSeconds,
      durationSource: "PHYSICAL_FFPROBE",
      isFallback: true,
      fallbackReason,
      sha256,
      producedAt: new Date().toISOString(),
    };
  }
}

export interface VoiceSynthesisOptions {
  allowFallback?: boolean;
  outputDir?: string;
}

export class VoiceFabric {
  static _spawnFn: any = null;
  private engines: Map<string, IVoiceEngine> = new Map();
  private profiles: Map<string, VoiceProfile> = new Map();

  constructor() {
    this.engines.set("GEMINI", new GeminiVoiceEngine());
    this.engines.set("ELEVENLABS", new ElevenLabsVoiceEngine());
    this.engines.set("EDGE", new EdgeVoiceEngine());
    this.engines.set("SILENT_WAV_FALLBACK", new SilentWavVoiceEngine());

    this.registerDefaultProfiles();
  }

  registerProfile(profile: VoiceProfile): void {
    this.profiles.set(profile.profileId, profile);
  }

  getProfile(profileId: string): VoiceProfile {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      return this.profiles.get("profile_narrator_dramatic")!;
    }
    return profile;
  }

  getEngine(engineId: string): IVoiceEngine | undefined {
    return this.engines.get(engineId);
  }

  /**
   * Preflight benchmark: Evaluates engine configuration status.
   * Never claims READY based only on key shape (Defect #14).
   * providerHealth remains UNKNOWN until an actual upstream invocation verifies it.
   */
  async preflight(profile?: VoiceProfile): Promise<VoicePreflightResult> {
    const preferredId = profile?.preferredEngine || "GEMINI";
    const primaryEngine = this.engines.get(preferredId);
    const credState = primaryEngine ? primaryEngine.getCredentialState() : "UNKNOWN";
    const isAvail = primaryEngine ? await primaryEngine.isAvailable() : false;

    if (isAvail) {
      return {
        healthy: true,
        status: "CONFIGURED",
        providerHealth: "UNKNOWN", // Strictly UNKNOWN until authenticated upstream
        selectedEngine: preferredId,
        latencyStatus: "UNMEASURED",
        measuredLatencyMs: null,
        estimatedCostUsd: preferredId === "ELEVENLABS" ? 0.0035 : 0.0008,
        credentialState: "PRESENT",
        benchmarkTimestamp: new Date().toISOString(),
      };
    }

    return {
      healthy: false,
      status: "NOT_CONFIGURED",
      providerHealth: "UNAVAILABLE",
      selectedEngine: "SILENT_WAV_FALLBACK",
      latencyStatus: "UNMEASURED",
      measuredLatencyMs: null,
      estimatedCostUsd: 0.0,
      credentialState: credState,
      benchmarkTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Fail-Closed Physical Audio File Probe (Defect #1):
   * Strictly evaluates audio container & streams via ffprobe.
   * Throws ArtifactProbeError on:
   * 1. missing file
   * 2. empty file
   * 3. missing ffprobe binary
   * 4. non-zero ffprobe exit
   * 5. malformed JSON
   * 6. no audio stream
   * 7. missing/unknown codec
   * 8. invalid sample rate
   * 9. invalid channels
   * 10. missing duration
   * 11. non-positive duration
   * 12. NaN / Infinity duration
   * NEVER returns synthetic metadata or infers values from file extension!
   */
  static async probeAudioFile(filePath: string): Promise<{
    codec: string;
    sampleRate: number;
    channels: number;
    durationSeconds: number;
  }> {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new ArtifactProbeError(`Audio file not found: ${filePath}`, "FILE_NOT_FOUND");
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      throw new ArtifactProbeError(`Audio file is 0 bytes: ${filePath}`, "EMPTY_FILE");
    }

    const spawn = VoiceFabric._spawnFn || (await import("node:child_process")).spawn;
    let stdout = "";
    let stderr = "";

    try {
      stdout = await new Promise<string>((resolve, reject) => {
        const proc = spawn("ffprobe", [
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-print_format",
          "json",
          filePath,
        ]);
        proc.stdout.on("data", (d: any) => (stdout += d.toString()));
        proc.stderr.on("data", (d: any) => (stderr += d.toString()));
        proc.on("close", (code: any) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new ArtifactProbeError(`ffprobe exited with code ${code}: ${stderr.trim()}`, "FFPROBE_FAILED"));
          }
        });
        proc.on("error", (err: any) => {
          reject(new ArtifactProbeError(`ffprobe failed to spawn: ${err.message}`, "FFPROBE_MISSING"));
        });
      });
    } catch (err: any) {
      if (err instanceof ArtifactProbeError) throw err;
      throw new ArtifactProbeError(`ffprobe execution failed: ${err.message}`, "FFPROBE_FAILED");
    }

    let data: any;
    try {
      data = JSON.parse(stdout);
    } catch {
      throw new ArtifactProbeError("ffprobe returned malformed JSON", "MALFORMED_JSON");
    }

    if (!data || typeof data !== "object") {
      throw new ArtifactProbeError("ffprobe output is not a valid JSON object", "MALFORMED_JSON");
    }

    const streams = Array.isArray(data.streams) ? data.streams : [];
    const audioStream = streams.find((s: any) => s.codec_type === "audio");

    if (!audioStream) {
      throw new ArtifactProbeError("No audio stream found in media", "NO_AUDIO_STREAM");
    }

    const codec = audioStream.codec_name;
    if (!codec || typeof codec !== "string" || codec.trim() === "" || codec === "unknown") {
      throw new ArtifactProbeError("Missing or unknown audio codec in media stream", "MISSING_CODEC");
    }

    const rawSampleRate = audioStream.sample_rate;
    const sampleRate = parseInt(rawSampleRate, 10);
    if (!rawSampleRate || isNaN(sampleRate) || !isFinite(sampleRate) || sampleRate <= 0) {
      throw new ArtifactProbeError(`Invalid sample rate: ${rawSampleRate}`, "INVALID_SAMPLE_RATE");
    }

    const rawChannels = audioStream.channels;
    const channels = parseInt(rawChannels, 10);
    if (!rawChannels || isNaN(channels) || !isFinite(channels) || channels <= 0) {
      throw new ArtifactProbeError(`Invalid channels: ${rawChannels}`, "INVALID_CHANNELS");
    }

    const rawDuration = audioStream.duration ?? data.format?.duration;
    if (rawDuration === undefined || rawDuration === null || rawDuration === "") {
      throw new ArtifactProbeError("Missing audio duration in stream and format header", "MISSING_DURATION");
    }

    const durationSeconds = parseFloat(rawDuration);
    if (isNaN(durationSeconds) || !isFinite(durationSeconds)) {
      throw new ArtifactProbeError(`Audio duration is NaN or infinite: ${rawDuration}`, "INVALID_DURATION");
    }

    if (durationSeconds <= 0) {
      throw new ArtifactProbeError(`Audio duration is non-positive: ${durationSeconds}`, "NON_POSITIVE_DURATION");
    }

    return {
      codec,
      sampleRate,
      channels,
      durationSeconds,
    };
  }

  /**
   * Authoritative Synthesis Pipeline:
   * VoiceProfile -> VoicePreflight -> Router -> Provider Execution -> Physical File on Disk -> WAV/MP3 Forensic Validation -> VoiceArtifact
   * Strictly tracks fallback as DEGRADED_FALLBACK; never masquerades as primary success.
   */
  async synthesize(
    text: string,
    profileIdOrProfile?: string | VoiceProfile,
    optionsOrOutputDir?: string | VoiceSynthesisOptions
  ): Promise<VoiceArtifact> {
    const profile = typeof profileIdOrProfile === "object"
      ? profileIdOrProfile
      : (profileIdOrProfile ? this.getProfile(profileIdOrProfile) : this.getProfile("profile_narrator_dramatic"));

    const options: VoiceSynthesisOptions = typeof optionsOrOutputDir === "string"
      ? { outputDir: optionsOrOutputDir, allowFallback: true }
      : { allowFallback: true, ...optionsOrOutputDir };

    const preferredId = profile?.preferredEngine || "GEMINI";
    const primaryEngine = this.engines.get(preferredId);

    let primaryFailure: Error | null = null;
    if (primaryEngine && primaryEngine.id !== "SILENT_WAV_FALLBACK") {
      try {
        if (await primaryEngine.isAvailable()) {
          return await primaryEngine.synthesize(text, profile, options.outputDir);
        } else {
          primaryFailure = new Error(
            `[VoiceFabric] LIVE_PROVIDER_REQUIRED: Primary engine ${preferredId} credentials not configured (state: ${primaryEngine.getCredentialState()})`
          );
        }
      } catch (err: any) {
        primaryFailure = err;
        console.warn(`[VoiceFabric] Primary engine ${primaryEngine.id} failed: ${err.message}.`);
      }
    }

    if (options.allowFallback === false) {
      throw primaryFailure || new Error(`[VoiceFabric] LIVE_PROVIDER_REQUIRED: Primary engine ${preferredId} failed and fallback is disabled.`);
    }

    // Explicitly marked DEGRADED_FALLBACK
    const fallbackEngine = this.engines.get("SILENT_WAV_FALLBACK") as SilentWavVoiceEngine;
    return fallbackEngine.synthesize(
      text,
      profile,
      options.outputDir,
      primaryFailure ? primaryFailure.message : `Primary engine ${preferredId} unavailable`
    );
  }

  static async synthesize(
    text: string,
    profileId?: string,
    outputDirOrOptions?: string | VoiceSynthesisOptions
  ): Promise<VoiceArtifact> {
    return new VoiceFabric().synthesize(text, profileId, outputDirOrOptions);
  }

  private registerDefaultProfiles(): void {
    this.registerProfile({
      profileId: "profile_narrator_dramatic",
      name: "Deep Dramatic Narrator",
      gender: "MALE",
      language: "en-US",
      pitch: -0.2,
      speed: 1.05,
      tone: "DRAMATIC",
      preferredEngine: "GEMINI",
    });

    this.registerProfile({
      profileId: "profile_curious_educator",
      name: "Fast Curiosity Educator",
      gender: "FEMALE",
      language: "en-US",
      pitch: 0.1,
      speed: 1.15,
      tone: "CURIOUS",
      preferredEngine: "GEMINI",
    });
  }
}

/**
 * Opt-in Live Smoke Test Harness (Defect #16)
 * Strictly honest:
 * No credentials: BLOCKED / CREDENTIALS_REQUIRED
 * Malformed key: BLOCKED / INVALID_CREDENTIAL_SHAPE
 * Upstream key rejection: FAILED / AUTHENTICATION_FAILED
 * Network timeout: FAILED / TIMEOUT
 * Corrupt media / probe failure: FAILED / ARTIFACT_VALIDATION_FAILED
 * Genuine success: VERIFIED
 * Never converts BLOCKED or FAILED into PASS via fallback!
 */
export async function verifyLiveProviderExecution(
  providerId: "GEMINI" | "ELEVENLABS" | "EDGE" = "GEMINI",
  sampleText: string = "FactoryOS live provider verification proof."
): Promise<{
  success: boolean;
  status: "VERIFIED" | "BLOCKED" | "FAILED";
  code?: string;
  reason?: string;
  artifact?: VoiceArtifact;
  measurements?: {
    byteLength: number;
    durationSeconds: number;
    sha256: string;
    codec: string;
    sampleRate: number;
    channels: number;
  };
}> {
  const fabric = new VoiceFabric();
  const engine = fabric.getEngine(providerId);

  if (!engine) {
    return {
      success: false,
      status: "FAILED",
      code: "UNKNOWN_PROVIDER",
      reason: `Unknown voice provider: ${providerId}`,
    };
  }

  const credState = engine.getCredentialState();
  if (credState === "MISSING") {
    return {
      success: false,
      status: "BLOCKED",
      code: "CREDENTIALS_REQUIRED",
      reason: `LIVE_PROVIDER_REQUIRED: ${providerId} credentials are not present in environment (state: ${credState})`,
    };
  }
  if (credState === "INVALID_SHAPE" || credState === "INVALID") {
    return {
      success: false,
      status: "BLOCKED",
      code: "INVALID_CREDENTIAL_SHAPE",
      reason: `LIVE_PROVIDER_REQUIRED: ${providerId} credentials have invalid shape/placeholder format (state: ${credState})`,
    };
  }

  try {
    const profile = fabric.getProfile("profile_narrator_dramatic");
    const artifact = await engine.synthesize(sampleText, { ...profile, preferredEngine: providerId });

    if (!artifact.success || artifact.qualityClass !== "PRIMARY" || artifact.isFallback) {
      return {
        success: false,
        status: "FAILED",
        code: "ARTIFACT_VALIDATION_FAILED",
        reason: `Artifact produced was fallback or degraded: ${artifact.qualityClass}`,
      };
    }

    // Strictly enforce contract
    assertPrimaryAudioArtifact(artifact);

    // Defect #5: Duration MUST come strictly from ffprobe physical measurement
    const probe = await VoiceFabric.probeAudioFile(artifact.localPath);
    if (probe.durationSeconds <= 0) {
      return {
        success: false,
        status: "FAILED",
        code: "ARTIFACT_VALIDATION_FAILED",
        reason: "ffprobe was unable to measure valid duration on audio file",
      };
    }

    return {
      success: true,
      status: "VERIFIED",
      artifact,
      measurements: {
        byteLength: artifact.byteLength,
        durationSeconds: probe.durationSeconds, // Defect #5: strictly probe.durationSeconds
        sha256: artifact.sha256,
        codec: probe.codec,
        sampleRate: probe.sampleRate,
        channels: probe.channels,
      },
    };
  } catch (err: any) {
    const isAuth =
      err.code === "VOICE_AUTHENTICATION_FAILED" ||
      err.message?.includes("API_KEY_INVALID") ||
      err.message?.includes("401") ||
      err.message?.includes("authentication failed") ||
      err.message?.includes("API key rejected");

    const isTimeout =
      err.code === "VOICE_PROVIDER_TIMEOUT" ||
      err.message?.includes("timed out") ||
      err.message?.includes("TIMEOUT");

    const isProbe =
      err instanceof ArtifactProbeError ||
      err.message?.includes("Primary invariant violation") ||
      err.message?.includes("CanonicalAudioPipeline");

    let code = "PROVIDER_UNAVAILABLE";
    if (isAuth) code = "AUTHENTICATION_FAILED";
    else if (isTimeout) code = "TIMEOUT";
    else if (isProbe) code = "ARTIFACT_VALIDATION_FAILED";

    return {
      success: false,
      status: "FAILED",
      code,
      reason: `Live synthesis execution failed: ${err.message}`,
    };
  }
}
