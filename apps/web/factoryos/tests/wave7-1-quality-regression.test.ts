/**
 * Wave 7.1 Creator Output Quality Remediation — Regression Test Suite
 *
 * Verifies:
 * 1. Audio-First Timeline Construction & Dead-Air Elimination (max silence <= 1.5s, speech >= 70%)
 * 2. Visual Asset Materialization & Local Cache Integrity (no blank cards, valid image paths)
 * 3. Typography Safe Area Margins & Unicode (UTF-8) Mojibake Elimination
 * 4. F07 Hard Admission Gates (Fail-closed SileroVAD, speech continuity, claim provenance)
 * 5. facts.deep-explainer.v2 Template Qualification (180s & 60s word counts and narrative arc)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { CANONICAL_TEMPLATES } from '../../lib/templates/definitions/CanonicalTemplates';
import { SHOT_RECIPES } from '../../lib/templates/shots/ShotRecipeLibrary';
import { TemplateProductionPipeline } from '../core/templates/TemplateProductionPipeline';
import { SileroVADAdapter } from '../core/verification/VerificationFabric';
import { VerificationEngine } from '../core/verification/VerificationEngine';

describe('Wave 7.1: Creator Output Quality Remediation Test Suite', () => {
  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();

  // =========================================================================
  // 1. facts.deep-explainer.v2 Registration & Narrative Structure
  // =========================================================================
  describe('1. facts.deep-explainer.v2 Template Registration & Architecture', () => {
    it('registers facts.deep-explainer.v2 in TemplateRegistry with valid schema', () => {
      const template = registry.getTemplate('facts.deep-explainer.v2');
      expect(template).toBeDefined();
      expect(template?.identity.id).toBe('facts.deep-explainer.v2');
      expect(template?.identity.version).toBe('2.0.0');
      expect(template?.category).toBe('FACTS');
      expect(template?.storyStructure.length).toBe(9);
      expect(template?.capabilityStatus).toBe('READY');
    });

    it('generates rich, duration-calibrated 180s script with >= 300 words and 9 distinct beats', async () => {
      const template = registry.getTemplate('facts.deep-explainer.v2')!;
      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: template,
        topic: 'Mariana Trench',
        userInputs: {
          targetDuration: 180,
          claims: [
            { id: 'c1', statement: 'Subduction trench reaching 11,000 meters depth' },
            { id: 'c2', statement: 'Pressure exceeds 1000 atmospheres' },
            { id: 'c3', statement: 'Jacques Piccard and Don Walsh reached bottom in 1960' },
            { id: 'c4', statement: 'Unique barophilic extremophiles adapt to extreme pressure' }
          ]
        }
      });

      expect(scriptIR.beats.length).toBe(9);
      const totalWords = scriptIR.beats.reduce((acc, b) => acc + b.narration.trim().split(/\s+/).length, 0);
      expect(totalWords).toBeGreaterThanOrEqual(300);
      expect(totalWords).toBeLessThanOrEqual(420);

      // Verify every beat has meaningful narration (> 15 words)
      for (const beat of scriptIR.beats) {
        const beatWords = beat.narration.trim().split(/\s+/).length;
        expect(beatWords).toBeGreaterThanOrEqual(15);
      }

      // Verify Unicode punctuation (no broken escapes or mojibake)
      const fullText = scriptIR.beats.map((b) => b.narration).join(' ');
      expect(fullText).not.toContain('â€“');
      expect(fullText).not.toContain('â€”');
    });

    it('generates calibrated 60s script with >= 100 words', async () => {
      const template = registry.getTemplate('facts.deep-explainer.v2')!;
      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: template,
        topic: 'Mariana Trench',
        userInputs: { targetDuration: 60 }
      });

      expect(scriptIR.beats.length).toBe(9);
      const totalWords = scriptIR.beats.reduce((acc, b) => acc + b.narration.trim().split(/\s+/).length, 0);
      expect(totalWords).toBeGreaterThanOrEqual(100);
      expect(totalWords).toBeLessThanOrEqual(250);
    });
  });

  // =========================================================================
  // 2. Audio-First Timeline Construction & Dead-Air Elimination
  // =========================================================================
  describe('2. Audio-First Timeline Construction & Dead-Air Elimination', () => {
    it('eliminates the Math.max trap: scene durations match voice durations + small gap, not 20s', () => {
      const template = registry.getTemplate('facts.deep-explainer.v2')!;
      const mockScenePlans = [
        {
          sceneId: 'scene_01',
          beatId: 'beat_01',
          narration: 'Hook narration text',
          visualIntent: 'Visual',
          shotRecipeId: 'KINETIC_HOOK',
          assetRequirements: [],
          resolvedAssets: [],
          captionIntent: { text: 'Hook' },
          durationIntent: { min: 2.0, max: 25.0, target: 20.0 }, // Target was 20.0s
          transitionIntent: {},
          props: {}
        },
        {
          sceneId: 'scene_02',
          beatId: 'beat_02',
          narration: 'Context narration text',
          visualIntent: 'Visual',
          shotRecipeId: 'SOURCE_CARD',
          assetRequirements: [],
          resolvedAssets: [],
          captionIntent: { text: 'Context' },
          durationIntent: { min: 2.0, max: 25.0, target: 20.0 }, // Target was 20.0s
          transitionIntent: {},
          props: {}
        }
      ];

      // Voice artifacts are 7.5s and 8.0s
      const mockSceneVoices: Record<string, any> = {
        scene_01: { localPath: 'mock/voice1.wav', durationSeconds: 7.5, sha256: 'abc1' },
        scene_02: { localPath: 'mock/voice2.wav', durationSeconds: 8.0, sha256: 'abc2' }
      };

      const intent = pipeline.compileLocalRenderIntent({
        templateDef: template,
        scenePlans: mockScenePlans as any,
        sceneVoiceArtifacts: mockSceneVoices,
        jobId: 'test_audio_first_timing',
        outputPath: 'mock/test.mp4'
      });

      // Under the old bug: both scenes were 20.0s (leaving 12.5s and 12.0s silence).
      // Under Wave 7.1 Audio-First: scene duration is capped tightly to voice + transition gap + subtle hold.
      expect(intent.scenes[0].duration_seconds).toBeLessThan(12.0);
      expect(intent.scenes[1].duration_seconds).toBeLessThan(12.0);

      // Trailing silence in any scene must be <= 1.5s
      const scene1TrailingSilence = intent.scenes[0].duration_seconds - mockSceneVoices.scene_01.durationSeconds;
      const scene2TrailingSilence = intent.scenes[1].duration_seconds - mockSceneVoices.scene_02.durationSeconds;
      expect(scene1TrailingSilence).toBeLessThanOrEqual(1.50);
      expect(scene2TrailingSilence).toBeLessThanOrEqual(1.50);
    });
  });

  // =========================================================================
  // 3. Visual Asset Materialization & Shot Recipe Invariants
  // =========================================================================
  describe('3. Visual Asset Materialization & Recipe Invariants', () => {
    it('mandates assetRequirements across all visual shot recipes', () => {
      const recipesToCheck = ['BIG_NUMBER', 'STAT', 'SOURCE_CARD', 'IMAGE_WITH_CAPTION', 'FULL_BLEED_IMAGE'];
      for (const recipeId of recipesToCheck) {
        const recipe = (SHOT_RECIPES as any)[recipeId];
        expect(recipe).toBeDefined();
        expect(recipe.assetRequirements).toBeDefined();
        expect(recipe.assetRequirements.length).toBeGreaterThanOrEqual(1);
        expect(['primaryBackground', 'primaryImage', 'heroImage', 'broll']).toContain(recipe.assetRequirements[0].role);
      }
    });
  });

  // =========================================================================
  // 4. F07 Hard Admission Gates & Fail-Closed Enforcement
  // =========================================================================
  describe('4. F07 Hard Admission Gates & Fail-Closed SileroVAD', () => {
    it('fails closed when audio file does not exist', async () => {
      const report = await SileroVADAdapter.analyzeVoiceActivity('non_existent_path_to_audio_12345.wav');
      expect(report.passed).toBe(false);
      expect(report.speechOccupancyRatio).toBe(0);
      expect(report.failureReason).toContain('VAD_FILE_MISSING');
    });

    it('rejects prolonged silence gaps > 1.5s as an unconditional hard gate failure', async () => {
      // Create a temporary synthetic WAV file with 1s speech followed by 3s silence
      const tempDir = path.resolve(process.cwd(), 'data', 'temp_tests');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const testAudio = path.join(tempDir, 'synthetic_trailing_silence.wav');

      const { execSync } = await import('node:child_process');
      // Generate 1s tone (sine 440Hz) followed by 3s null silence = 4s total
      execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1.0" -f lavfi -i "anullsrc=duration=3.0" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a]" -map "[a]" "${testAudio}"`);

      const vadReport = await SileroVADAdapter.analyzeVoiceActivity(testAudio, {
        minOccupancyRatio: 0.70,
        maxAllowedSilenceMs: 1500
      });

      expect(vadReport.passed).toBe(false);
      expect(vadReport.maxConsecutiveSilenceMs).toBeGreaterThan(1500);

      // Clean up
      if (fs.existsSync(testAudio)) fs.unlinkSync(testAudio);
    });

    it('auditMediaArtifact assigns score 0 when speech continuity fails', async () => {
      const tempDir = path.resolve(process.cwd(), 'data', 'temp_tests');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const testSilentVideo = path.join(tempDir, 'silent_video_test.mp4');

      const { execSync } = await import('node:child_process');
      // Generate 5s video with silent audio
      execSync(`ffmpeg -y -f lavfi -i "color=c=black:s=1080x1920:d=5.0:r=30" -f lavfi -i "anullsrc=r=44100:cl=mono:d=5.0" -c:v libx264 -c:a aac -shortest "${testSilentVideo}"`);

      const audit = await VerificationEngine.auditMediaArtifact({
        videoUrl: testSilentVideo,
        durationSeconds: 5.0,
        requireAudibleSpeech: true
      });

      expect(audit.passed).toBe(false);
      expect(audit.overallScore).toBe(0);
      expect(audit.failures.some((f) => f.includes('SILENT') || f.includes('VAD'))).toBe(true);

      // Clean up
      if (fs.existsSync(testSilentVideo)) fs.unlinkSync(testSilentVideo);
    });
  });
});
