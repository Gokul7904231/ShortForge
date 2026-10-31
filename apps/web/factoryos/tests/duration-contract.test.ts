import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  DurationEngine,
  CANONICAL_DURATION_POLICY,
  DurationContract
} from '../core/contracts/DurationContract';
import {
  VoiceArtifact,
  validateMandatoryNarration
} from '../core/voice/VoiceFabric';
import { VerificationEngine } from '../core/verification/VerificationEngine';

describe('Wave 1 — Duration Contract & Fail-Closed Voice Invariants', () => {
  const tmpDir = path.join(process.cwd(), 'data', 'test-duration-tmp');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('DurationEngine Contract Creation & Evaluation', () => {
    it('creates a strict ±5% contract for 60s target (window [57s, 63s])', () => {
      const contract = DurationEngine.createContract(60);
      expect(contract.targetDurationSeconds).toBe(60);
      expect(contract.tolerancePercent).toBe(5.0);
      expect(contract.toleranceSeconds).toBe(3.0);
      expect(contract.minDurationSeconds).toBe(57.0);
      expect(contract.maxDurationSeconds).toBe(63.0);
      expect(contract.durationPolicyVersion).toBe(CANONICAL_DURATION_POLICY.policyVersion);
    });

    it('creates a strict ±5% contract for 180s target (window [171s, 189s])', () => {
      const contract = DurationEngine.createContract(180);
      expect(contract.targetDurationSeconds).toBe(180);
      expect(contract.tolerancePercent).toBe(5.0);
      expect(contract.toleranceSeconds).toBe(9.0);
      expect(contract.minDurationSeconds).toBe(171.0);
      expect(contract.maxDurationSeconds).toBe(189.0);
    });

    it('evaluates and passes 60s target when physical duration is 60.5s', () => {
      const contract = DurationEngine.createContract(60);
      const evalResult = DurationEngine.evaluateContract(contract, 60.5);
      expect(evalResult.passed).toBe(true);
      expect(evalResult.physicalDurationSeconds).toBe(60.5);
      expect(evalResult.failureReason).toBeUndefined();
    });

    it('evaluates and rejects 60s target when physical duration is 93.93s (DURATION_OVERFLOW)', () => {
      const contract = DurationEngine.createContract(60);
      const evalResult = DurationEngine.evaluateContract(contract, 93.93);
      expect(evalResult.passed).toBe(false);
      expect(evalResult.physicalDurationSeconds).toBe(93.93);
      expect(evalResult.failureReason).toContain('DURATION_OVERFLOW');
      expect(evalResult.failureReason).toContain('93.93s exceeds maximum allowed 63s');
    });

    it('evaluates and passes 180s target when physical duration is 179.5s', () => {
      const contract = DurationEngine.createContract(180);
      const evalResult = DurationEngine.evaluateContract(contract, 179.5);
      expect(evalResult.passed).toBe(true);
      expect(evalResult.physicalDurationSeconds).toBe(179.5);
      expect(evalResult.failureReason).toBeUndefined();
    });

    it('evaluates and rejects 180s target when physical duration is 150.0s (DURATION_UNDERFLOW)', () => {
      const contract = DurationEngine.createContract(180);
      const evalResult = DurationEngine.evaluateContract(contract, 150.0);
      expect(evalResult.passed).toBe(false);
      expect(evalResult.physicalDurationSeconds).toBe(150.0);
      expect(evalResult.failureReason).toContain('DURATION_UNDERFLOW');
      expect(evalResult.failureReason).toContain('150.00s is below minimum allowed 171s');
    });

    it('fails closed when physical duration is missing or NaN', () => {
      const contract = DurationEngine.createContract(60);
      const evalResult = DurationEngine.evaluateContract(contract, undefined);
      expect(evalResult.passed).toBe(false);
      expect(evalResult.failureReason).toContain('MISSING_PHYSICAL_DURATION');
    });
  });

  describe('Word Budgeting & Narration Fitting', () => {
    it('calculates safe word budget based on speech time and pacing', () => {
      // 6.67 seconds scene at ~85% speech occupancy = ~5.67s speech * 2.3 wps = ~13 words
      const budget6 = DurationEngine.calculateWordBudget(6.67);
      expect(budget6).toBe(13);

      // 20.0 seconds scene = 17.0s speech * 2.3 wps = 39 words
      const budget20 = DurationEngine.calculateWordBudget(20.0);
      expect(budget20).toBe(39);
    });

    it('allocates beat budgets guaranteeing exact sum of durations', () => {
      const beats = [
        { beatId: 'b1', weight: 1.0 },
        { beatId: 'b2', weight: 1.0 },
        { beatId: 'b3', weight: 1.0 },
      ];
      const budgets = DurationEngine.allocateBeatBudgets(60, beats);
      expect(budgets.length).toBe(3);
      const sumDurations = budgets.reduce((acc, b) => acc + b.targetSeconds, 0);
      expect(Math.abs(sumDurations - 60)).toBeLessThan(0.01);
      expect(budgets[0].maxWords).toBeGreaterThan(10);
    });

    it('fits narration cleanly to word budget without crude mid-sentence cutting', () => {
      const rawText =
        'To comprehend the Mariana Trench, we must examine the physical and geographic setting. Descending beneath the planetary threshold, sunlight vanishes completely.';
      // Budget: 13 words
      const fitted = DurationEngine.fitNarrationToBudget(rawText, 13);
      const wordCount = fitted.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(13);
      expect(fitted.endsWith('.') || fitted.endsWith(';') || fitted.endsWith('!')).toBe(true);
    });
  });

  describe('Fail-Closed VoiceArtifact Invariants (validateMandatoryNarration)', () => {
    const testAudioFile = path.join(tmpDir, 'test-voice.wav');
    const dummyBytes = Buffer.from('RIFF....WAVEfmt ....data....');
    const validHash = crypto.createHash('sha256').update(dummyBytes).digest('hex');

    beforeEach(() => {
      fs.writeFileSync(testAudioFile, dummyBytes);
    });

    it('accepts a valid PRIMARY voice artifact with physical file and matching SHA-256', () => {
      const artifact: VoiceArtifact = {
        artifactId: 'va_test_01',
        localPath: testAudioFile,
        audioPath: testAudioFile,
        audioUrl: `file://${testAudioFile}`,
        format: 'wav',
        success: true,
        qualityClass: 'PRIMARY',
        provider: 'SystemVoiceEngine',
        sampleRate: 24000,
        channels: 1,
        durationSeconds: 5.2,
        physicalDurationSeconds: 5.2,
        durationSource: 'PHYSICAL_PROBE',
        isFallback: false,
        sha256: validHash,
        producedAt: new Date().toISOString(),
      };

      const result = validateMandatoryNarration(artifact);
      expect(result.valid).toBe(true);
      expect(result.failureReason).toBeUndefined();
    });

    it('fails closed when voice artifact is marked SILENT', () => {
      const artifact: VoiceArtifact = {
        artifactId: 'va_silent',
        localPath: testAudioFile,
        audioUrl: `file://${testAudioFile}`,
        format: 'wav',
        success: true,
        qualityClass: 'SILENT',
        provider: 'SilentFallback',
        sampleRate: 24000,
        channels: 1,
        durationSeconds: 5.0,
        durationSource: 'ESTIMATED',
        isFallback: true,
        sha256: validHash,
        producedAt: new Date().toISOString(),
      };

      const result = validateMandatoryNarration(artifact);
      expect(result.valid).toBe(false);
      expect(result.failureReason).toContain('VOICE_SILENT_DISALLOWED');
    });

    it('fails closed when audio file does not exist on disk', () => {
      const artifact: VoiceArtifact = {
        artifactId: 'va_missing_file',
        localPath: path.join(tmpDir, 'non_existent_file.wav'),
        audioUrl: 'file://non_existent',
        format: 'wav',
        success: true,
        qualityClass: 'PRIMARY',
        provider: 'SystemVoiceEngine',
        sampleRate: 24000,
        channels: 1,
        durationSeconds: 5.0,
        durationSource: 'ESTIMATED',
        isFallback: false,
        sha256: validHash,
        producedAt: new Date().toISOString(),
      };

      const result = validateMandatoryNarration(artifact);
      expect(result.valid).toBe(false);
      expect(result.failureReason).toContain('AUDIO_FILE_MISSING');
    });

    it('fails closed when physical audio file has 0 bytes', () => {
      const emptyFile = path.join(tmpDir, 'empty.wav');
      fs.writeFileSync(emptyFile, Buffer.alloc(0));

      const artifact: VoiceArtifact = {
        artifactId: 'va_empty',
        localPath: emptyFile,
        audioUrl: `file://${emptyFile}`,
        format: 'wav',
        success: true,
        qualityClass: 'PRIMARY',
        provider: 'SystemVoiceEngine',
        sampleRate: 24000,
        channels: 1,
        durationSeconds: 0,
        durationSource: 'ESTIMATED',
        isFallback: false,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        producedAt: new Date().toISOString(),
      };

      const result = validateMandatoryNarration(artifact);
      expect(result.valid).toBe(false);
      expect(result.failureReason).toContain('AUDIO_FILE_EMPTY');
    });

    it('fails closed when declared SHA-256 does not match physical file content', () => {
      const artifact: VoiceArtifact = {
        artifactId: 'va_corrupted_hash',
        localPath: testAudioFile,
        audioUrl: `file://${testAudioFile}`,
        format: 'wav',
        success: true,
        qualityClass: 'PRIMARY',
        provider: 'SystemVoiceEngine',
        sampleRate: 24000,
        channels: 1,
        durationSeconds: 5.2,
        durationSource: 'PHYSICAL_PROBE',
        isFallback: false,
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
        producedAt: new Date().toISOString(),
      };

      const result = validateMandatoryNarration(artifact);
      expect(result.valid).toBe(false);
      expect(result.failureReason).toContain('AUDIO_HASH_MISMATCH');
    });
  });

  describe('VerificationEngine Integration with DurationContract', () => {
    it('audits media artifact and passes when duration is within ±5% tolerance', async () => {
      // Mock probeMediaFile to return 60.5s duration and valid 9:16 specs
      const originalProbe = (VerificationEngine as any).probeMediaFile;
      (VerificationEngine as any).probeMediaFile = async () => ({
        fileExists: true,
        byteLength: 500000,
        hasFtypBox: true,
        decodeSmokePassed: true,
        width: 1080,
        height: 1920,
        videoCodec: 'h264',
        audioCodec: 'aac',
        videoDuration: 60.5,
        audioDuration: 60.5,
        syncDriftMs: 20,
        pixelFormat: 'yuv420p',
        fps: 30,
        bitrateKbps: 2000,
        streamCount: 2,
        audioSampleRate: 44100,
        audioChannels: 2,
        audioMeanVolumeDb: -22.0,
        audioMaxVolumeDb: -1.0,
        audioSilenceDetected: false,
      });

      try {
        const dummyPath = path.join(tmpDir, 'mock_60s.mp4');
        fs.writeFileSync(dummyPath, Buffer.from('mock'));

        const report = await VerificationEngine.auditMediaArtifact({
          jobId: 'job_test_60s',
          videoUrl: `file://${dummyPath}`,
          durationSeconds: 60, // Requesting 60s
        });

        expect(report.hardGates.durationWithinBounds).toBe(true);
        expect(report.durationContract).toBeDefined();
        expect(report.durationContract?.passed).toBe(true);
        expect(report.durationContract?.targetDurationSeconds).toBe(60);
      } finally {
        (VerificationEngine as any).probeMediaFile = originalProbe;
      }
    });

    it('audits media artifact and rejects when duration overflows (93.93s on 60s target)', async () => {
      const originalProbe = (VerificationEngine as any).probeMediaFile;
      (VerificationEngine as any).probeMediaFile = async () => ({
        fileExists: true,
        byteLength: 800000,
        hasFtypBox: true,
        decodeSmokePassed: true,
        width: 1080,
        height: 1920,
        videoCodec: 'h264',
        audioCodec: 'aac',
        videoDuration: 93.93,
        audioDuration: 93.93,
        syncDriftMs: 15,
        pixelFormat: 'yuv420p',
        fps: 30,
        bitrateKbps: 2000,
        streamCount: 2,
        audioSampleRate: 44100,
        audioChannels: 2,
        audioMeanVolumeDb: -22.0,
        audioMaxVolumeDb: -1.0,
        audioSilenceDetected: false,
      });

      try {
        const dummyPath = path.join(tmpDir, 'mock_93s.mp4');
        fs.writeFileSync(dummyPath, Buffer.from('mock'));

        const report = await VerificationEngine.auditMediaArtifact({
          jobId: 'job_test_overflow',
          videoUrl: `file://${dummyPath}`,
          durationSeconds: 60, // Requesting 60s
        });

        expect(report.hardGates.durationWithinBounds).toBe(false);
        expect(report.passed).toBe(false);
        expect(report.durationContract).toBeDefined();
        expect(report.durationContract?.passed).toBe(false);
        expect(report.failures.some((f) => f.includes('DURATION_OVERFLOW'))).toBe(true);
      } finally {
        (VerificationEngine as any).probeMediaFile = originalProbe;
      }
    });
  });
});
