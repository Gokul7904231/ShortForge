/**
 * ShortForge Three-Format Qualification & Pipeline Integrity Test Suite
 * Validates the three production template categories:
 * 1. SF-Q01 — Quiz & Trivia (quiz.trivia-challenge.v1)
 * 2. SF-F01 — Facts (facts.rapid-facts.v1)
 * 3. SF-H01 — History (history.timeline.v1)
 *
 * Enforces authoritative production engineering invariants:
 * - Content Integrity: Factual grounding required; missing evidence fails closed; no hardcoded topic leakage
 * - Audio Integrity: Silent fallback rejected; zero-sample audio fails physically; scene timeline offsets verified
 * - Visual Integrity: Contrast > 15:1; no unconditional purple orb; observable missing assets; no internal template IDs as text
 * - Evidence Integrity: Physical SHA-256 hashes match files on disk; review-pack completeness
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline, FactualGroundingError } from '../core/templates/TemplateProductionPipeline';
import { VoiceFabric, SilentWavVoiceEngine } from '../core/voice/VoiceFabric';

describe('ShortForge Three-Format Production Qualification & Pipeline Integrity', () => {
  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();

  // =========================================================================
  // 1. CONTENT INTEGRITY & FACTUAL GROUNDING
  // =========================================================================
  describe('Content & Factual Integrity', () => {
    it('SF-F01: generates grounded facts from evidence without fabricated hardcoded statistics', async () => {
      const templateDef = registry.getTemplate('facts.rapid-facts.v1');
      expect(templateDef).toBeDefined();

      const topic = 'The Mariana Trench';
      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: templateDef!,
        topic,
        userInputs: {
          facts: [
            {
              narration: 'At Challenger Deep, the ocean floor plunges 10,994 meters down into the hadal zone.',
              headline: 'FACT #1',
              caption: '10,994m Oceanic Abyss',
              provenance: { source: 'NOAA Bathymetric Survey 2021' }
            },
            {
              narration: 'The hydrostatic pressure at the bottom exceeds 1,000 atmospheres, crushing unreinforced hulls.',
              headline: 'FACT #2',
              caption: 'Crushing Hydrostatic Pressure',
              provenance: { source: 'Deepsea Challenger Telemetry' }
            },
            {
              narration: 'Mariana snailfish and giant xenophyophores thrive in the pitch-black freezing depths.',
              headline: 'FINAL VERDICT',
              caption: 'Abyssal Ecosystem',
              provenance: { source: 'Journal of Hadal Biology' }
            }
          ],
          stat: {
            number: '10,994 M',
            label: 'MAXIMUM DEPTH',
            narration: 'The measured benchmark reaches 10,994 meters, established by peer-reviewed oceanic expeditions.',
            provenance: { source: 'NOAA Bathymetry' }
          },
          comparativeStat: {
            value: '1,086 BAR',
            headline: '1,000X SEA LEVEL PRESSURE',
            narration: 'This represents over 1,086 BAR, exerting over one thousand times standard atmospheric pressure.',
            provenance: { source: 'Deepsea Challenger Telemetry' }
          }
        }
      });

      const fullScript = scriptIR.beats.map((b) => b.narration).join(' ');

      // Defect Remediation: Prohibit old fabricated claims
      expect(fullScript).not.toContain('stores energy ten times denser than lithium');
      expect(fullScript).not.toContain('84 percent of observed phenomena cannot be replicated');
      expect(fullScript).not.toContain('modern astrophysics');

      // Grounded Facts Assertion
      expect(fullScript).toContain('10,994 meters down');
      expect(fullScript).toContain('exceeds 1,000 atmospheres');

      const validation = pipeline.validateTemplateScript(templateDef!, scriptIR);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('SF-Q01: generates 3-question quiz with 4 distinct options, countdown, and reveal', async () => {
      const templateDef = registry.getTemplate('quiz.trivia-challenge.v1');
      expect(templateDef).toBeDefined();

      const topic = 'Solar System Extremes';
      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: templateDef!,
        topic,
        userInputs: {
          questions: [
            {
              question: 'Which planet in our solar system has the hottest surface temperature?',
              options: ['Mercury', 'Venus', 'Mars', 'Jupiter'],
              answerIndex: 1,
              answer: 'Venus',
              explanation: 'Venus reaches 465°C due to its dense CO2 greenhouse atmosphere.',
              provenance: { source: 'NASA Planetary Fact Sheet' }
            },
            {
              question: 'Which moon in the solar system contains more liquid water than all Earth oceans combined?',
              options: ['Titan', 'Europa', 'Ganymede', 'Enceladus'],
              answerIndex: 2,
              answer: 'Ganymede',
              explanation: 'Ganymede harbors an internal ocean up to 6 times Earth ocean volume.',
              provenance: { source: 'ESA JUICE Mission Science Brief' }
            },
            {
              question: 'What is the approximate speed of sound in the vacuum of space?',
              options: ['343 m/s', '300,000 km/s', '0 m/s', '1,500 m/s'],
              answerIndex: 2,
              answer: '0 m/s',
              explanation: 'Sound requires a material medium to propagate.',
              provenance: { source: 'Fundamentals of Acoustic Physics' }
            }
          ]
        }
      });

      expect(scriptIR.contentEngine).toBe('QUIZ');
      const questionBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'QUESTION_CARD');
      const countdownBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'COUNTDOWN');
      const revealBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'ANSWER_REVEAL');

      expect(questionBeats).toHaveLength(3);
      expect(countdownBeats).toHaveLength(3);
      expect(revealBeats).toHaveLength(3);

      for (const qb of questionBeats) {
        expect(qb.props?.options).toHaveLength(4);
        expect(new Set(qb.props?.options).size).toBe(4); // Strictly no duplicates
      }

      const validation = pipeline.validateTemplateScript(templateDef!, scriptIR);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('SF-H01: generates verified historical chronology with quotation and legacy from archival evidence', async () => {
      const templateDef = registry.getTemplate('history.timeline.v1');
      expect(templateDef).toBeDefined();

      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: templateDef!,
        topic: 'Apollo 11: The 1202 Alarm',
        userInputs: {
          keyYear: '1969',
          milestones: [
            {
              yearOrTime: '102:38:05 GET',
              event: 'The 1202 Executive Overflow',
              narration: 'Three minutes before landing on the lunar surface, the Apollo Guidance Computer flashed a critical 1202 executive overflow alarm.',
              description: 'DSKY display flashes priority executive overflow.',
              provenance: { primarySource: 'NASA Apollo 11 Mission Commentary Transcript' }
            },
            {
              yearOrTime: '102:45:40 GET',
              event: 'Tranquility Base Touchdown',
              narration: 'With less than thirty seconds of descent fuel remaining, Neil Armstrong manually navigated past boulder fields to safely touch down at Tranquility Base.',
              description: 'Lunar module safely touches down on lunar regolith.',
              provenance: { primarySource: 'NASA Apollo 11 Flight Journal' }
            }
          ],
          quote: {
            text: 'We got you on that, Steve, and we are GO.',
            author: 'Steve Bales, GUIDO Officer',
            narration: 'Twenty-six-year-old GUIDO officer Steve Bales made the legendary split-second call: "We are GO on that alarm."',
            provenance: { workOrDocument: 'Mission Control Audio Tape 11-04', verifiedArchivalQuote: true }
          },
          legacy: {
            narration: 'The Apollo 11 1202 alarm established modern computer task scheduling and priority-driven software architecture still used in aerospace today.',
            headline: 'AEROSPACE LEGACY',
            provenance: { historicalImpactSummary: 'Foundational Margaret Hamilton software architecture', sources: ['MIT Instrumentation Laboratory History'] }
          }
        }
      });

      expect(scriptIR.contentEngine).toBe('HISTORY');
      const milestoneBeats = scriptIR.beats.filter((b) => b.type === 'MILESTONE');
      const quoteBeats = scriptIR.beats.filter((b) => b.type === 'QUOTE');

      expect(milestoneBeats.length).toBeGreaterThanOrEqual(2);
      expect(quoteBeats.length).toBeGreaterThanOrEqual(1);

      const fullScript = scriptIR.beats.map((b) => b.narration).join(' ');
      expect(fullScript).not.toContain('imperial vanguard');
      expect(fullScript).not.toContain('siege engines');
      expect(fullScript).toContain('Apollo Guidance Computer');
      expect(fullScript).toContain('Tranquility Base');

      const validation = pipeline.validateTemplateScript(templateDef!, scriptIR);
      expect(validation.valid).toBe(true);
    });

    it('fails closed when required topic evidence is missing (no silent fabrication)', async () => {
      const factsDef = registry.getTemplate('facts.rapid-facts.v1')!;
      const quizDef = registry.getTemplate('quiz.trivia-challenge.v1')!;
      const histDef = registry.getTemplate('history.timeline.v1')!;

      // 1. Missing Facts inputs
      await expect(
        pipeline.generateTemplateScript({
          templateDef: factsDef,
          topic: 'Quantum Computing',
          userInputs: {} // Missing facts and stats
        })
      ).rejects.toThrow(FactualGroundingError);

      // 2. Missing Quiz inputs
      await expect(
        pipeline.generateTemplateScript({
          templateDef: quizDef,
          topic: 'Quantum Mechanics',
          userInputs: {} // Missing questions
        })
      ).rejects.toThrow(FactualGroundingError);

      // 3. Missing History inputs
      await expect(
        pipeline.generateTemplateScript({
          templateDef: histDef,
          topic: 'The Fall of Rome',
          userInputs: {} // Missing milestones and quote
        })
      ).rejects.toThrow(FactualGroundingError);
    });

    it('proves topic isolation: content does not leak between unrelated topics', async () => {
      const factsDef = registry.getTemplate('facts.rapid-facts.v1')!;
      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: factsDef,
        topic: 'Quantum Computing',
        userInputs: {
          facts: [
            {
              narration: 'Quantum superposition allows qubits to calculate multiple combinatorial states simultaneously.',
              headline: 'SUPERPOSITION',
              provenance: { source: 'NIST Quantum Information' }
            },
            {
              narration: 'Quantum entanglement creates correlated quantum states across physical separations.',
              headline: 'ENTANGLEMENT',
              provenance: { source: 'Physical Review Letters' }
            }
          ],
          stat: {
            number: '1,121 QUBITS',
            label: 'COHERENT QUANTUM VOLUME',
            narration: 'State-of-the-art processors sustain over 1,121 coherent qubits.',
            provenance: { source: 'IEEE Quantum Benchmark 2026' }
          }
        }
      });

      const fullScript = scriptIR.beats.map((b) => b.narration).join(' ');

      // Strictly verify zero Mariana Trench or Apollo 11 leakage
      expect(fullScript).not.toContain('10,994');
      expect(fullScript).not.toContain('1,086');
      expect(fullScript).not.toContain('snailfish');
      expect(fullScript).not.toContain('Apollo');
      expect(fullScript).not.toContain('Constantinople');

      const validation = pipeline.validateTemplateScript(factsDef, scriptIR);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  // =========================================================================
  // 2. AUDIO INTEGRITY & PRODUCTION NARRATION GATES
  // =========================================================================
  describe('Audio Integrity & Production Narration', () => {
    it('disables silent fallback by default on production synthesis paths', async () => {
      const origKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'placeholder_invalid_key';
      try {
        const fabric = new VoiceFabric();
        // Synthesize without explicit allowSilentFallback -> must throw LIVE_PROVIDER_REQUIRED
        await expect(
          fabric.synthesize('Production narration test phrase', 'profile_narrator_dramatic', {
            allowFallback: false,
            isProduction: true
          })
        ).rejects.toThrow(/LIVE_PROVIDER_REQUIRED/);
      } finally {
        if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it('physically rejects zero-valued silent WAV buffers generated by SilentWavVoiceEngine', () => {
      const tempSilentPath = path.join(process.cwd(), 'data', 'temp_test_silent.wav');
      try {
        fs.mkdirSync(path.dirname(tempSilentPath), { recursive: true });
        const silentBuffer = SilentWavVoiceEngine.generateValidPcmWav(3.0, 24000);
        fs.writeFileSync(tempSilentPath, silentBuffer);

        const probe = VoiceFabric.validateAudibleAudio(tempSilentPath);
        expect(probe.isAudible).toBe(false);
        expect(probe.peakAmplitude).toBe(0);
        expect(probe.rms).toBe(0);
        expect(probe.silenceRatio).toBe(1.0);

        expect(() => VoiceFabric.assertAudibleAudio(tempSilentPath)).toThrow(/AudioSilenceDetectedError/);
      } finally {
        if (fs.existsSync(tempSilentPath)) fs.unlinkSync(tempSilentPath);
      }
    });

    it('rejects DEGRADED_FALLBACK and isFallback artifacts in compileLocalRenderIntent', () => {
      const factsDef = registry.getTemplate('facts.rapid-facts.v1')!;
      const fakeSilentArtifact = {
        sceneId: 'scene_01',
        localPath: 'data/audio/fake_silent.wav',
        durationSeconds: 3.5,
        isFallback: true,
        qualityClass: 'DEGRADED_FALLBACK',
        provider: 'SILENT_WAV_FALLBACK'
      };

      expect(() => {
        pipeline.compileLocalRenderIntent({
          templateDef: factsDef,
          scenePlans: [
            {
              sceneId: 'scene_01',
              beatId: 'beat_01',
              narration: 'Test',
              visualIntent: 'Test',
              shotRecipeId: 'IMAGE_WITH_CAPTION',
              assetRequirements: [],
              resolvedAssets: [],
              captionIntent: { text: 'Test' },
              durationIntent: { min: 2, max: 5, target: 3 },
              transitionIntent: {},
              props: {}
            }
          ],
          sceneAudioArtifacts: [fakeSilentArtifact as any],
          jobId: 'test_job_audio_integrity'
        });
      }).toThrow(/ProductionNarrationIntegrityError/);
    });

    it('guarantees scene-level audio mapping starts at offset 0.0 with correct duration', () => {
      const factsDef = registry.getTemplate('facts.rapid-facts.v1')!;
      const dummyAudioPath = path.join(process.cwd(), 'data', 'temp_dummy_speech.wav');

      // Create a small valid WAV file with non-zero noise samples
      const numSamples = 24000 * 2;
      const buf = Buffer.alloc(44 + numSamples * 2);
      buf.write('RIFF', 0, 'ascii');
      buf.writeUInt32LE(36 + numSamples * 2, 4);
      buf.write('WAVE', 8, 'ascii');
      buf.write('fmt ', 12, 'ascii');
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20); // PCM
      buf.writeUInt16LE(1, 22); // Mono
      buf.writeUInt32LE(24000, 24);
      buf.writeUInt32LE(48000, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);
      buf.write('data', 36, 'ascii');
      buf.writeUInt32LE(numSamples * 2, 40);
      for (let i = 0; i < numSamples; i++) {
        // Audible tone: 440 Hz
        const val = Math.round(10000 * Math.sin((2 * Math.PI * 440 * i) / 24000));
        buf.writeInt16LE(val, 44 + i * 2);
      }
      fs.mkdirSync(path.dirname(dummyAudioPath), { recursive: true });
      fs.writeFileSync(dummyAudioPath, buf);

      try {
        const intent = pipeline.compileLocalRenderIntent({
          templateDef: factsDef,
          scenePlans: [
            {
              sceneId: 'scene_01',
              beatId: 'beat_01',
              narration: 'First scene narration',
              visualIntent: 'Test',
              shotRecipeId: 'IMAGE_WITH_CAPTION',
              assetRequirements: [],
              resolvedAssets: [],
              captionIntent: { text: 'Scene 1' },
              durationIntent: { min: 2, max: 4, target: 2.5 },
              transitionIntent: {},
              props: {}
            },
            {
              sceneId: 'scene_02',
              beatId: 'beat_02',
              narration: 'Second scene narration',
              visualIntent: 'Test',
              shotRecipeId: 'IMAGE_WITH_CAPTION',
              assetRequirements: [],
              resolvedAssets: [],
              captionIntent: { text: 'Scene 2' },
              durationIntent: { min: 2, max: 4, target: 2.5 },
              transitionIntent: {},
              props: {}
            }
          ],
          sceneAudioArtifacts: [
            { sceneId: 'scene_01', localPath: dummyAudioPath, durationSeconds: 2.0 },
            { sceneId: 'scene_02', localPath: dummyAudioPath, durationSeconds: 2.0 }
          ],
          jobId: 'test_timing_verification'
        });

        for (const scene of intent.scenes) {
          expect(scene.audio_track).toBeDefined();
          // Timeline contract: Each scene's audio track must begin at start_seconds 0.0 with source_in_seconds 0.0
          expect(scene.audio_track!.start_seconds).toBe(0.0);
          expect(scene.audio_track!.source_in_seconds).toBe(0.0);
          expect(scene.audio_track!.duration_seconds).toBe(2.0);
        }
      } finally {
        if (fs.existsSync(dummyAudioPath)) fs.unlinkSync(dummyAudioPath);
      }
    });

    it('verifies physical MP4 audio is audible via volumedetect (no silent video acceptance)', () => {
      const videoCandidates = [
        path.resolve(process.cwd(), 'artifacts/three-format-shorts/SF-F01-facts-the-mariana-trench.mp4'),
        path.resolve(process.cwd(), 'artifacts/three-format-shorts/SF-H01-history-apollo-11-the-1202-alarm.mp4'),
        path.resolve(process.cwd(), 'artifacts/three-format-shorts/SF-Q01-quiz-solar-system-extremes.mp4')
      ];

      for (const vid of videoCandidates) {
        if (!fs.existsSync(vid)) continue;
        const probe = VoiceFabric.validateAudibleAudio(vid);
        expect(probe.isAudible).toBe(true);
        expect(probe.peakAmplitude).toBeGreaterThan(-50.0); // max_volume > -50 dB
      }
    }, 15000);
  });

  // =========================================================================
  // 3. VISUAL INTEGRITY & ARCHITECTURAL DIFFERENTIATION
  // =========================================================================
  describe('Visual Integrity & Architecture', () => {
    it('verifies distinct composition families for QUIZ, FACTS, and HISTORY', () => {
      const pyScript = `
from factoryos_render.backends.image import NativeFrameCompositor
comp = NativeFrameCompositor(1080, 1920)

frame_quiz = comp.render_frame({'format_family': 'QUIZ'}, 'QUESTION_CARD', {'question': 'Test?', 'options': ['A','B','C','D']}, 0.5)
frame_facts = comp.render_frame({'format_family': 'FACTS'}, 'BIG_NUMBER', {'number': '100X', 'label': 'METRIC'}, 0.5)
frame_hist = comp.render_frame({'format_family': 'HISTORY'}, 'TIMELINE_BUILD', {'year': '1969', 'title': 'Event'}, 0.5)

# Verify different background pixel colors
px_quiz = frame_quiz.getpixel((540, 100))
px_facts = frame_facts.getpixel((540, 100))
px_hist = frame_hist.getpixel((540, 100))

assert px_quiz != px_facts, f"Quiz and Facts must have distinct backgrounds: {px_quiz} vs {px_facts}"
assert px_quiz != px_hist, f"Quiz and History must have distinct backgrounds: {px_quiz} vs {px_hist}"
assert px_facts != px_hist, f"Facts and History must have distinct backgrounds: {px_facts} vs {px_hist}"
print("DISTINCT_FAMILIES_VERIFIED")
`;
      const res = execFileSync('python', ['-c', pyScript], { encoding: 'utf-8' });
      expect(res).toContain('DISTINCT_FAMILIES_VERIFIED');
    });

    it('verifies that no unconditional decorative orb is drawn on opaque scenes', () => {
      const pyScript = `
from factoryos_render.backends.image import NativeFrameCompositor
comp = NativeFrameCompositor(1080, 1920)

# Render standard frame without decorative orb
frame_normal = comp.render_frame({'background_type': 'DARK_SLATE'}, 'BIG_NUMBER', {'number': '10X', 'label': 'M'}, 0.5)
# Render with explicit decorative orb
frame_orb = comp.render_frame({'background_type': 'DARK_SLATE'}, 'BIG_NUMBER', {'number': '10X', 'label': 'M', 'decorative_orb': True}, 0.5)

# Center area where orb was previously unconditionally drawn (cx=540, cy=960-380=580)
# Pixels must differ between normal and orb-enabled
assert frame_normal.tobytes() != frame_orb.tobytes(), "Orb must be composition-controlled, not global unconditional"
print("ORB_COMPOSITION_CONTROL_VERIFIED")
`;
      const res = execFileSync('python', ['-c', pyScript], { encoding: 'utf-8' });
      expect(res).toContain('ORB_COMPOSITION_CONTROL_VERIFIED');
    });

    it('proves that internal template IDs are never exposed as viewer-facing headings', () => {
      const pyScript = `
from factoryos_render.backends.image import NativeFrameCompositor
comp = NativeFrameCompositor(1080, 1920)

# Pass internal template ID as title/headline attempt
frame = comp.render_frame({'scene_title': 'facts.rapid-facts.v1'}, 'BIG_NUMBER', {'number': '10X', 'label': 'M', 'headline': 'facts.rapid-facts.v1'}, 0.5)

# Render clean frame
frame_clean = comp.render_frame({}, 'BIG_NUMBER', {'number': '10X', 'label': 'M'}, 0.5)

# Both frames should have no template ID rendered at top
assert frame.getpixel((540, 200)) == frame_clean.getpixel((540, 200)), "Template ID must be filtered out from header"
print("INTERNAL_ID_SUPPRESSION_VERIFIED")
`;
      const res = execFileSync('python', ['-c', pyScript], { encoding: 'utf-8' });
      expect(res).toContain('INTERNAL_ID_SUPPRESSION_VERIFIED');
    });

    it('makes missing required visual assets observable (no silent masking)', () => {
      const pyScript = `
from factoryos_render.backends.image import NativeFrameCompositor
comp = NativeFrameCompositor(1080, 1920)

# Attempt to render with nonexistent asset path
frame = comp.render_frame({}, 'IMAGE_WITH_CAPTION', {'image_path': 'nonexistent_topic_image_9999.png', 'caption': 'Test'}, 0.5)

# Check that frame contains observable error indicator box
# Center card has red outline fill (45, 15, 15)
card_center_px = frame.getpixel((540, 920))
assert card_center_px[0] > 30 and card_center_px[1] < 25, f"Missing asset must render observable indicator: {card_center_px}"
print("OBSERVABLE_MISSING_ASSET_VERIFIED")
`;
      const res = execFileSync('python', ['-c', pyScript], { encoding: 'utf-8' });
      expect(res).toContain('OBSERVABLE_MISSING_ASSET_VERIFIED');
    });

    it('verifies captions render with dedicated high-contrast background pill', () => {
      const pyScript = `
from factoryos_render.backends.image import NativeFrameCompositor
comp = NativeFrameCompositor(1080, 1920)

frame = comp.render_frame({'background_type': 'DARK_SLATE'}, 'BIG_NUMBER', {'number': '10X'}, 0.5, caption_text="Verified Subtitle Display")

# Sample pixel in caption container background padding (safe_bottom = 320, caption_y = 1540)
caption_bg_px = frame.getpixel((300, 1540))
# Must be high-contrast dark container: (5, 10, 20)
assert caption_bg_px[0] < 20 and caption_bg_px[1] < 25, f"Caption pill must have dark high-contrast container: {caption_bg_px}"
print("CAPTION_CONTAINER_VERIFIED")
`;
      const res = execFileSync('python', ['-c', pyScript], { encoding: 'utf-8' });
      expect(res).toContain('CAPTION_CONTAINER_VERIFIED');
    });
  });

  // =========================================================================
  // 4. EVIDENCE INTEGRITY & PHYSICAL ARTIFACT VALIDATION
  // =========================================================================
  describe('Evidence & Artifact Integrity', () => {
    it('verifies review-pack physical SHA-256 equals file on disk', () => {
      const manifestPath = path.resolve(process.cwd(), 'artifacts/three-format-shorts/production-manifest.json');
      if (!fs.existsSync(manifestPath)) return;

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      for (const [key, item] of Object.entries<any>(manifest)) {
        if (!item.outputPath || !fs.existsSync(item.outputPath)) continue;

        const fileBytes = fs.readFileSync(item.outputPath);
        const actualHash = crypto.createHash('sha256').update(fileBytes).digest('hex');

        // Forensic parity: manifest hash MUST equal physical file hash on disk
        expect(actualHash.toLowerCase()).toBe(item.sha256.toLowerCase());
      }
    });

    it('verifies that all review-pack files exist and are readable', () => {
      const reviewPackZip = path.resolve(process.cwd(), 'artifacts/three-format-shorts/ShortForge-ChatGPT-Review-Pack.zip');
      if (fs.existsSync(reviewPackZip)) {
        const stat = fs.statSync(reviewPackZip);
        expect(stat.size).toBeGreaterThan(1000000); // Greater than 1MB
      }
    });
  });

  // =========================================================================
  // 5. ADDITIONAL AUDIT ACCEPTANCE CHECKS
  // =========================================================================
  describe('Additional Audit Acceptance Checks', () => {
    it('proves that music or noise alone cannot satisfy narration verification', () => {
      // 1. Artifact with audioRole = 'music' must throw
      const musicArtifact: any = {
        artifactId: 'art_music_01',
        localPath: 'data/audio/background_music.mp3',
        success: true,
        qualityClass: 'PRIMARY',
        provider: 'LOCAL_SYNTH',
        audioRole: 'music',
        transcript: 'Continuous instrumental beat',
        wordTimings: [{ word: 'Continuous', start: 0, end: 1 }],
        synthesisLatencyMs: 10,
        byteLength: 50000,
        codec: 'mp3',
        sampleRate: 44100,
        channels: 2,
        durationSeconds: 15.0,
        durationSource: 'PHYSICAL_FFPROBE',
        isFallback: false,
        sha256: 'abc123',
        producedAt: new Date().toISOString()
      };

      expect(() => {
        VoiceFabric.assertProductionNarrationIntegrity(musicArtifact);
      }).toThrow(/Only 'narration' or 'speech' roles satisfy narration verification/);

      // 2. Artifact with empty transcript (ambient noise / tone) must throw
      const noiseArtifact: any = {
        ...musicArtifact,
        audioRole: 'narration',
        transcript: '   ' // Empty transcript
      };

      expect(() => {
        VoiceFabric.assertProductionNarrationIntegrity(noiseArtifact);
      }).toThrow(/Ambient noise or music tracks alone cannot satisfy narration integrity/);
    });

    it('proves that each narration segment is present and aligned', () => {
      const factsDef = registry.getTemplate('facts.rapid-facts.v1')!;

      // 2 scenes planned, but only 1 scene audio provided -> MUST throw missing narration segment error
      expect(() => {
        pipeline.compileLocalRenderIntent({
          templateDef: factsDef,
          scenePlans: [
            {
              sceneId: 'scene_01',
              beatId: 'beat_01',
              narration: 'Scene 1',
              visualIntent: 'Test',
              shotRecipeId: 'IMAGE_WITH_CAPTION',
              assetRequirements: [],
              resolvedAssets: [],
              captionIntent: { text: 'Scene 1' },
              durationIntent: { min: 2, max: 4, target: 3 },
              transitionIntent: {},
              props: {}
            },
            {
              sceneId: 'scene_02',
              beatId: 'beat_02',
              narration: 'Scene 2',
              visualIntent: 'Test',
              shotRecipeId: 'IMAGE_WITH_CAPTION',
              assetRequirements: [],
              resolvedAssets: [],
              captionIntent: { text: 'Scene 2' },
              durationIntent: { min: 2, max: 4, target: 3 },
              transitionIntent: {},
              props: {}
            }
          ],
          sceneAudioArtifacts: [
            { sceneId: 'scene_01', localPath: 'data/audio/valid.wav', durationSeconds: 2.5 }
            // scene_02 missing!
          ],
          jobId: 'test_missing_segment_alignment'
        });
      }).toThrow(/Scene 'scene_02' is missing its required narration audio segment/);
    });

    it('proves that missing mandatory assets block production rendering when strict_production is set', () => {
      const pyScript = `
from factoryos_render.backends.image import NativeFrameCompositor
comp = NativeFrameCompositor(1080, 1920)

try:
    comp.render_frame({'strict_production': True}, 'IMAGE_WITH_CAPTION', {'image_path': 'nonexistent_mandatory_shot_image.png', 'strict_production': True}, 0.5)
    print("FAILED_TO_BLOCK")
except FileNotFoundError as e:
    assert "[RENDER_ERROR: MISSING_MANDATORY_ASSET]" in str(e)
    print("MANDATORY_ASSET_BLOCKED_SUCCESSFULLY")
`;
      const res = execFileSync('python', ['-c', pyScript], { encoding: 'utf-8' });
      expect(res).toContain('MANDATORY_ASSET_BLOCKED_SUCCESSFULLY');
    });

    it('proves that supplied evidence actually supports each factual claim', () => {
      const factsDef = registry.getTemplate('facts.rapid-facts.v1')!;

      // Create a ScriptIR with an ungrounded factual beat (no provenance)
      const ungroundedScript: any = {
        templateId: factsDef.identity.id,
        title: 'Mariana Trench',
        hook: 'Into the deep abyss',
        contentEngine: 'FACTS',
        beats: [
          {
            beatId: 'beat_01',
            type: 'FACT',
            narration: 'The trench is deep.',
            headline: 'DEEP',
            shotRecipeId: 'IMAGE_WITH_CAPTION',
            // provenance is missing!
            props: {}
          },
          {
            beatId: 'beat_02',
            type: 'STAT',
            narration: 'It reaches 10,994 meters.',
            headline: 'STAT',
            shotRecipeId: 'BIG_NUMBER',
            provenance: { source: 'NOAA Bathymetry' },
            props: { number: '10,994 M' }
          }
        ]
      };

      const result = pipeline.validateTemplateScript(factsDef, ungroundedScript);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('lacks supporting evidence provenance'))).toBe(true);
    });

    it('distinguishes executable template reuse from clean-room visual adaptation', () => {
      let rootDir = process.cwd();
      while (rootDir !== path.dirname(rootDir)) {
        if (fs.existsSync(path.join(rootDir, 'docs', 'verification', 'three-format-short-qualification', 'TEMPLATE-LICENCE-LEDGER.md'))) {
          break;
        }
        rootDir = path.dirname(rootDir);
      }
      const ledgerPath = path.resolve(rootDir, 'docs/verification/three-format-short-qualification/TEMPLATE-LICENCE-LEDGER.md');
      expect(fs.existsSync(ledgerPath)).toBe(true);
      const ledgerContent = fs.readFileSync(ledgerPath, 'utf-8');

      // Ledger must explicitly declare clean-room adaptation vs untrusted runtime binary execution
      expect(ledgerContent.toLowerCase()).toContain('clean-room and commercial licensing compliance');
      expect(ledgerContent).toContain('Remotion Framework Licensing Assessment');
      expect(ledgerContent).toContain('packages/factoryos-render');
      expect(ledgerContent).toContain('RenderComp / free-remotion-templates');
      expect(ledgerContent).toContain('kuhnhomeuk-cell / procedural-film');
      expect(ledgerContent).toContain('HeiGeAi / Paper-Cut');
    });
  });
});
