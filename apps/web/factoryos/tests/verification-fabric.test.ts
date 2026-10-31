import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SileroVADAdapter,
  WhisperXAdapter,
  PySceneDetectAdapter,
  OpenTelemetryAdapter
} from '../core/verification/VerificationFabric';

describe('Wave 4 — Verification Fabric (Speech VAD, WhisperX ASR, Visual PySceneDetect, OpenTelemetry)', () => {
  describe('SileroVADAdapter', () => {
    it('fails closed when audio file is missing', async () => {
      const report = await SileroVADAdapter.analyzeVoiceActivity('non_existent_audio.wav');
      expect(report.passed).toBe(false);
      expect(report.speechOccupancyRatio).toBe(0);
      expect(report.failureReason).toContain('VAD_FILE_MISSING');
    });

    it('evaluates mock voice activity correctly', async () => {
      // Mock analyzeVoiceActivity
      const originalAnalyze = SileroVADAdapter.analyzeVoiceActivity;
      try {
        SileroVADAdapter.analyzeVoiceActivity = async () => ({
          passed: true,
          speechDurationMs: 5100,
          totalDurationMs: 6000,
          speechOccupancyRatio: 0.85,
          maxConsecutiveSilenceMs: 400,
          speechIntervals: [{ startMs: 200, endMs: 5300, durationMs: 5100 }],
        });

        const res = await SileroVADAdapter.analyzeVoiceActivity('mock.wav');
        expect(res.passed).toBe(true);
        expect(res.speechOccupancyRatio).toBe(0.85);
        expect(res.maxConsecutiveSilenceMs).toBeLessThan(1000);
      } finally {
        SileroVADAdapter.analyzeVoiceActivity = originalAnalyze;
      }
    });

    it('rejects predominantly silent audio with low occupancy', async () => {
      const originalAnalyze = SileroVADAdapter.analyzeVoiceActivity;
      try {
        SileroVADAdapter.analyzeVoiceActivity = async () => ({
          passed: false,
          speechDurationMs: 1000,
          totalDurationMs: 6000,
          speechOccupancyRatio: 0.167,
          maxConsecutiveSilenceMs: 4500,
          speechIntervals: [{ startMs: 0, endMs: 1000, durationMs: 1000 }],
          failureReason: 'VAD_SPEECH_OCCUPANCY_TOO_LOW: Observed speech occupancy 16.7% is below required 60.0%',
        });

        const res = await SileroVADAdapter.analyzeVoiceActivity('silent_mock.wav');
        expect(res.passed).toBe(false);
        expect(res.failureReason).toContain('VAD_SPEECH_OCCUPANCY_TOO_LOW');
      } finally {
        SileroVADAdapter.analyzeVoiceActivity = originalAnalyze;
      }
    });
  });

  describe('WhisperXAdapter ASR Script Alignment', () => {
    it('evaluates and passes when recognized audio matches script', () => {
      const script = 'The Mariana Trench reaches approximately eleven thousand meters depth in the Challenger Deep.';
      const recognized = 'The Mariana Trench reaches approximately eleven thousand meters depth in the Challenger Deep.';

      const report = WhisperXAdapter.evaluateScriptAlignment({
        recognizedText: recognized,
        expectedScript: script,
        threshold: 0.8,
      });

      expect(report.passed).toBe(true);
      expect(report.alignmentSimilarityScore).toBeGreaterThanOrEqual(0.9);
      expect(report.wordErrorRate).toBeLessThan(0.1);
      expect(report.missingKeywords.length).toBe(0);
    });

    it('rejects when recognized audio severely diverges from script (e.g. wrong audio track)', () => {
      const script = 'The Mariana Trench reaches approximately eleven thousand meters depth in the Challenger Deep.';
      const recognized = 'Buy our cheap discount sneakers today click the link in bio.';

      const report = WhisperXAdapter.evaluateScriptAlignment({
        recognizedText: recognized,
        expectedScript: script,
        threshold: 0.7,
      });

      expect(report.passed).toBe(false);
      expect(report.alignmentSimilarityScore).toBeLessThan(0.2);
      expect(report.failureReason).toContain('ASR_ALIGNMENT_MISMATCH');
      expect(report.missingKeywords).toContain('mariana');
      expect(report.missingKeywords).toContain('trench');
    });
  });

  describe('PySceneDetectAdapter Visual Diversity', () => {
    it('fails closed when video file does not exist', async () => {
      const report = await PySceneDetectAdapter.analyzeSceneDiversity('missing_video.mp4');
      expect(report.passed).toBe(false);
      expect(report.blackFrameDetected).toBe(true);
      expect(report.failureReason).toContain('SCENEDETECT_FILE_MISSING');
    });

    it('detects scene diversity on mock video inspection', async () => {
      const originalAnalyze = PySceneDetectAdapter.analyzeSceneDiversity;
      try {
        PySceneDetectAdapter.analyzeSceneDiversity = async () => ({
          passed: true,
          detectedCuts: 8,
          expectedScenes: 8,
          cutTimestamps: [0, 7.5, 15.0, 22.5, 30.0, 37.5, 45.0, 52.5],
          blackFrameDetected: false,
          frozenFrameDetected: false,
          visualDiversityScore: 0.95,
        });

        const res = await PySceneDetectAdapter.analyzeSceneDiversity('mock.mp4', { expectedScenes: 8 });
        expect(res.passed).toBe(true);
        expect(res.detectedCuts).toBe(8);
        expect(res.blackFrameDetected).toBe(false);
      } finally {
        PySceneDetectAdapter.analyzeSceneDiversity = originalAnalyze;
      }
    });
  });

  describe('OpenTelemetryAdapter W3C Trace Propagation', () => {
    it('generates a compliant W3C traceparent header', () => {
      const context = OpenTelemetryAdapter.createTraceContext();
      expect(context.traceId.length).toBe(32);
      expect(context.spanId.length).toBe(16);
      expect(context.traceFlags).toBe('01');
      expect(context.traceparent).toBe(`00-${context.traceId}-${context.spanId}-01`);
    });

    it('propagates traceId to child spans with distinct spanId', () => {
      const parent = OpenTelemetryAdapter.createTraceContext();
      const child = OpenTelemetryAdapter.createTraceContext(parent);

      expect(child.traceId).toBe(parent.traceId);
      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.traceparent.startsWith(`00-${parent.traceId}`)).toBe(true);
    });

    it('parses valid W3C traceparent header and rejects malformed strings', () => {
      const valid = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const parsed = OpenTelemetryAdapter.parseTraceparent(valid);

      expect(parsed).toBeDefined();
      expect(parsed?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(parsed?.spanId).toBe('00f067aa0ba902b7');
      expect(parsed?.traceFlags).toBe('01');

      const invalid = 'invalid-traceparent-header';
      expect(OpenTelemetryAdapter.parseTraceparent(invalid)).toBeNull();
    });
  });
});

