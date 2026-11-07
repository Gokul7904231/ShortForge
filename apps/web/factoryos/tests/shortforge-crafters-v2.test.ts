import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ShortForgeComponentRegistry } from '../core/templates/components/ShortForgeComponentRegistry';
import { NarrationCrafter } from '../core/voice/NarrationCrafter';
import { TemplateCrafter } from '../core/templates/TemplateCrafter';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { VerificationEngine } from '../core/verification/VerificationEngine';

describe('ShortForge Exclusive Component Registry & Crafters V2 Suite', () => {
  const registry = ShortForgeComponentRegistry.getInstance();
  const narrationCrafter = NarrationCrafter.getInstance();
  const templateCrafter = TemplateCrafter.getInstance();
  const templateRegistry = TemplateRegistry.getInstance();

  describe('Exclusive ShortForge Component Registry (Phase 2)', () => {
    it('registers all 8 canonical Exclusive ShortForge components', () => {
      const expectedComponents = [
        'sf.hook.kinetic_stack',
        'sf.stage.semantic_b2_bg',
        'sf.quiz.question_glass_card',
        'sf.quiz.option_matrix_4x1',
        'sf.timer.countdown_ring_5s',
        'sf.payoff.explanation_drawer',
        'sf.outro.scoreboard_cta',
        'sf.brand.watermark_lock'
      ];

      for (const compId of expectedComponents) {
        const comp = registry.getComponent(compId);
        expect(comp, `Component ${compId} must be registered`).toBeDefined();
        expect(comp?.safeZone.width).toBeGreaterThan(0);
        expect(comp?.safeZone.height).toBeGreaterThan(0);
        expect(comp?.zIndex).toBeGreaterThanOrEqual(0);
      }
    });

    it('enforces WCAG contrast contract >= 7:1 for all text components', () => {
      const components = registry.getAllComponents();
      for (const comp of components) {
        if (comp.id === 'sf.brand.watermark_lock' || comp.id === 'sf.stage.semantic_b2_bg') continue;
        const ratio = ShortForgeComponentRegistry.calculateContrastRatio(
          comp.contrastContract.foregroundHex,
          comp.contrastContract.backgroundScrimHex
        );
        expect(ratio).toBeGreaterThanOrEqual(7.0);
      }
    });

    it('detects singleton violations if multiple question cards are mounted', () => {
      const check = registry.validateActiveLayout([
        'sf.quiz.question_glass_card',
        'sf.quiz.question_glass_card'
      ]);
      expect(check.valid).toBe(false);
      expect(check.errors.some((e) => e.includes('Singleton violation'))).toBe(true);
    });

    it('enforces mutual exclusion between countdown timer and explanation drawer', () => {
      const check = registry.validateActiveLayout([
        'sf.timer.countdown_ring_5s',
        'sf.payoff.explanation_drawer'
      ]);
      expect(check.valid).toBe(false);
      expect(check.errors.some((e) => e.includes('Mutual exclusion violation'))).toBe(true);
    });

    it('protects watermark safe zone from collisions', () => {
      const check = registry.validateActiveLayout(
        ['sf.brand.watermark_lock', 'sf.quiz.question_glass_card'],
        {
          'sf.quiz.question_glass_card': { x: 930, y: 1790, width: 100, height: 100 }
        }
      );
      expect(check.valid).toBe(false);
      expect(check.errors.some((e) => e.includes('Watermark collision'))).toBe(true);
    });
  });

  describe('High-Intelligence Narration Crafter (F02 + F04)', () => {
    it('calibrates female voice correctly and never defaults to male narrator', () => {
      const koreProfile = narrationCrafter.calibrateVoice('Kore');
      expect(koreProfile.gender).toBe('FEMALE');
      expect(koreProfile.targetLufs).toBe(-14);
      expect(koreProfile.tailSafetyPadMs).toBe(250);

      const neuralProfile = narrationCrafter.calibrateVoice('en-US-Neural2-F');
      expect(neuralProfile.gender).toBe('FEMALE');
      expect(neuralProfile.supportsSSML).toBe(true);

      const chirpProfile = narrationCrafter.calibrateVoice('en-IN-Chirp3-HD-Aoede');
      expect(chirpProfile.gender).toBe('FEMALE');
      expect(chirpProfile.supportsSSML).toBe(false);
    });

    it('generates a signed NarrationTimingLedger with precise beat anchors', () => {
      const dummyArtifacts = [
        { sceneId: 'scene_01_beat_01_hook', localPath: 'dummy_hook.wav', durationSeconds: 3.2 },
        { sceneId: 'scene_02_beat_q1_card', localPath: 'dummy_q1.wav', durationSeconds: 2.8 },
        { sceneId: 'scene_03_beat_q1_option_a', localPath: 'dummy_q1_a.wav', durationSeconds: 1.1 },
        { sceneId: 'scene_04_beat_q1_option_b', localPath: 'dummy_q1_b.wav', durationSeconds: 1.2 },
        { sceneId: 'scene_05_beat_q1_option_c', localPath: 'dummy_q1_c.wav', durationSeconds: 1.0 },
        { sceneId: 'scene_06_beat_q1_option_d', localPath: 'dummy_q1_d.wav', durationSeconds: 1.4 },
        { sceneId: 'scene_07_beat_q1_reveal', localPath: 'dummy_q1_rev.wav', durationSeconds: 1.9 },
        { sceneId: 'scene_08_beat_q1_explanation', localPath: 'dummy_q1_exp.wav', durationSeconds: 4.5 },
        { sceneId: 'scene_09_beat_outro_cta', localPath: 'dummy_outro.wav', durationSeconds: 3.0 }
      ];

      const ledger = narrationCrafter.createTimingLedger({
        jobId: 'TEST-LEDGER-01',
        voiceProfile: narrationCrafter.calibrateVoice('Kore'),
        audioArtifacts: dummyArtifacts
      });

      expect(ledger.version).toBe('2.0.0');
      expect(ledger.signature.length).toBe(64);
      expect(ledger.anchors.anchor_hook_end_ms).toBeGreaterThan(0);
      expect(ledger.anchors.anchor_q_opt_d_ends_ms.length).toBe(1);
      expect(ledger.anchors.anchor_q_reveal_ends_ms.length).toBe(1);
      expect(ledger.anchors.anchor_outro_end_ms).toBeGreaterThan(0);
      expect(ledger.segments['scene_01_beat_01_hook'].safetyTailMs).toBe(250);
    });

    it('verifies duration budget against 180.0s Shorts ceiling', () => {
      const validFit = narrationCrafter.verifyDurationBudget(125.0, 180.0);
      expect(validFit.fitsBudget).toBe(true);
      expect(validFit.headroomSeconds).toBe(55.0);

      const invalidFit = narrationCrafter.verifyDurationBudget(182.5, 180.0);
      expect(invalidFit.fitsBudget).toBe(false);
      expect(invalidFit.headroomSeconds).toBeLessThan(0);
    });
  });

  describe('High-Intelligence Template Crafter (F05)', () => {
    const templateDef = templateRegistry.getTemplate('quiz.universal.cinematic.v2');
    expect(templateDef).toBeDefined();

    const mockQuestions = [
      {
        question: 'What is the deepest trench?',
        options: ['Mariana', 'Tonga', 'Java', 'Puerto Rico'],
        answerIndex: 0,
        explanation: 'The Mariana trench is deepest.',
        provenance: { source: 'NOAA' }
      },
      {
        question: 'Largest lake country?',
        options: ['Canada', 'Russia', 'USA', 'Finland'],
        answerIndex: 0,
        explanation: 'Canada has over two million lakes.',
        provenance: { source: 'Atlas' }
      },
      {
        question: 'Highest mountain peak?',
        options: ['Everest', 'K2', 'Kangchenjunga', 'Lhotse'],
        answerIndex: 0,
        explanation: 'Mount Everest reaches 8,848 meters.',
        provenance: { source: 'Survey' }
      },
      {
        question: 'Largest rainforest basin?',
        options: ['Amazon', 'Congo', 'Mekong', 'Ganges'],
        answerIndex: 0,
        explanation: 'The Amazon spans 5.5 million sq km.',
        provenance: { source: 'WWF' }
      },
      {
        question: 'Largest hot desert?',
        options: ['Sahara', 'Arabian', 'Gobi', 'Kalahari'],
        answerIndex: 0,
        explanation: 'The Sahara spans 9.2 million sq km.',
        provenance: { source: 'USGS' }
      },
      {
        question: 'Most populous megacity?',
        options: ['Tokyo', 'Delhi', 'Shanghai', 'Sao Paulo'],
        answerIndex: 0,
        explanation: 'Greater Tokyo has 37 million residents.',
        provenance: { source: 'UN' }
      }
    ];

    it('assembles an audio-locked LocalRenderIntent with zero desync', () => {
      // Build mock ledger for 50 beats
      const audioArtifacts: Array<{ sceneId: string; localPath: string; durationSeconds: number }> = [
        { sceneId: 'scene_01_beat_01_hook', localPath: 'hook.wav', durationSeconds: 3.0 }
      ];
      for (let i = 1; i <= 6; i++) {
        audioArtifacts.push({ sceneId: `beat_q${i}_card`, localPath: `q${i}_card.wav`, durationSeconds: 2.5 });
        audioArtifacts.push({ sceneId: `beat_q${i}_option_a`, localPath: `q${i}_a.wav`, durationSeconds: 1.0 });
        audioArtifacts.push({ sceneId: `beat_q${i}_option_b`, localPath: `q${i}_b.wav`, durationSeconds: 1.0 });
        audioArtifacts.push({ sceneId: `beat_q${i}_option_c`, localPath: `q${i}_c.wav`, durationSeconds: 1.0 });
        audioArtifacts.push({ sceneId: `beat_q${i}_option_d`, localPath: `q${i}_d.wav`, durationSeconds: 1.0 });
        audioArtifacts.push({ sceneId: `beat_q${i}_reveal`, localPath: `q${i}_rev.wav`, durationSeconds: 1.5 });
        audioArtifacts.push({ sceneId: `beat_q${i}_explanation`, localPath: `q${i}_exp.wav`, durationSeconds: 3.5 });
      }
      audioArtifacts.push({ sceneId: 'beat_outro_cta', localPath: 'outro.wav', durationSeconds: 2.5 });

      const ledger = narrationCrafter.createTimingLedger({
        jobId: 'TEST-INTENT-01',
        voiceProfile: narrationCrafter.calibrateVoice('Kore'),
        audioArtifacts
      });

      const intent = templateCrafter.compileAudioLockedIntent({
        templateDef: templateDef!,
        jobId: 'TEST-INTENT-01',
        outputPath: 'dummy_out.mp4',
        topic: 'Geography',
        questions: mockQuestions,
        timingLedger: ledger
      });

      expect(intent.scenes.length).toBe(26); // 1 hook + 6 * 4 + 1 outro (options not narrated)
      const totalDur = intent.scenes.reduce((sum, s) => sum + s.duration_seconds, 0);
      expect(totalDur).toBeLessThanOrEqual(180.0);
      expect(totalDur).toBeGreaterThan(60.0);
    });

    it('rejects quiz question sets with fewer than 6 questions', () => {
      const ledger = narrationCrafter.createTimingLedger({
        jobId: 'TEST-REJECT-01',
        voiceProfile: narrationCrafter.calibrateVoice('Kore'),
        audioArtifacts: []
      });

      expect(() => {
        templateCrafter.compileAudioLockedIntent({
          templateDef: templateDef!,
          jobId: 'TEST-REJECT-01',
          outputPath: 'dummy_out.mp4',
          topic: 'Geography',
          questions: mockQuestions.slice(0, 5), // Only 5
          timingLedger: ledger
        });
      }).toThrow(/requires exactly 6 verified questions/);
    });
  });

  describe('Upgraded F07 Physical Verification Gates (Phase 5)', () => {
    it('rejects video if duration is shorter than last spoken word + 400ms buffer', async () => {
      const report = await VerificationEngine.auditMediaArtifact({
        jobId: 'TEST-F07-SHORT-01',
        videoUrl: 'nonexistent.mp4',
        lastSpokenWordEndMs: 120000 // 120.0s, requiring 120.4s
      });

      expect(report.passed).toBe(false);
      expect(report.failures.some((f) => f.includes('Start & End Completeness Gate failed'))).toBe(true);
    });

    it('rejects video if fewer than 6 distinct B2 images are verified', async () => {
      const report = await VerificationEngine.auditMediaArtifact({
        jobId: 'TEST-F07-B2-01',
        videoUrl: 'nonexistent.mp4',
        b2Images: ['img1.png', 'img1.png', 'img2.png'] // Duplicate and only 3
      });

      expect(report.passed).toBe(false);
      expect(report.failures.some((f) => f.includes('Visual & B2 Audit failed'))).toBe(true);
    });

    it('rejects video if audio track is truncated by scene duration', async () => {
      const report = await VerificationEngine.auditMediaArtifact({
        jobId: 'TEST-F07-TRUNC-01',
        videoUrl: 'nonexistent.mp4',
        scenes: [
          {
            scene_id: 'scene_01_hook',
            duration_seconds: 2.0,
            audio_track: { duration_seconds: 2.5 } // Truncated by 0.5s!
          }
        ]
      });

      expect(report.passed).toBe(false);
      expect(report.failures.some((f) => f.includes('Zero Cut-Off Audit failed'))).toBe(true);
    });

    it('rejects video if Scene 0 is shorter than 0.5s or Final Scene is shorter than 1.5s', async () => {
      const report = await VerificationEngine.auditMediaArtifact({
        jobId: 'TEST-F07-START-END-01',
        videoUrl: 'nonexistent.mp4',
        scenes: [
          { scene_id: 'scene_01_hook', duration_seconds: 0.3 }, // < 0.5s
          { scene_id: 'scene_02_outro', duration_seconds: 0.8 }  // < 1.5s
        ]
      });

      expect(report.passed).toBe(false);
      expect(report.failures.some((f) => f.includes('Scene 0 duration 0.3s must cover t = 0.5s'))).toBe(true);
      expect(report.failures.some((f) => f.includes('Final scene duration 0.8s must cover the final 1.5s'))).toBe(true);
    });
  });
});
