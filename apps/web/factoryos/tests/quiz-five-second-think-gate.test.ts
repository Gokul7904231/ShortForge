import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline, ScenePlan } from '../core/templates/TemplateProductionPipeline';

/**
 * Regression guard for the Quiz V2 narration timing defect:
 * question -> options A-D narration -> 5.000s silent think gate -> answer -> explanation.
 * The gate must be exactly 150 frames at 30fps, must contain no audio track, and the
 * answer scene must start on the first frame at or after the gate ends.
 */
describe('Quiz five-second think gate (compiled render intent)', () => {
  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();
  const FPS = 30;
  const FRAME = 1 / FPS;
  const AUDIO_SECONDS = 1.2;

  let tempDir = '';
  let tonePath = '';

  function writeAudibleTone(filePath: string): void {
    const sampleRate = 24000;
    const seconds = Math.ceil(AUDIO_SECONDS);
    const samples = sampleRate * seconds;
    const dataSize = samples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < samples; i++) {
      const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
      buffer.writeInt16LE(sample, 44 + i * 2);
    }
    fs.writeFileSync(filePath, buffer);
  }

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-think-gate-'));
    tonePath = path.join(tempDir, 'tone.wav');
    writeAudibleTone(tonePath);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('places a silent 150-frame gate after option D and holds the answer until it ends', async () => {
    const templateDef = registry.getTemplate('quiz.universal.cinematic.v2');
    expect(templateDef).toBeDefined();

    const questions = [
      ['Which oceanic abyss is the deepest measured point on planet Earth?', ['Mariana Trench', 'Tonga Trench', 'Puerto Rico Trench', 'Java Trench'], 'Mariana Trench'],
      ['Which country contains the largest number of natural freshwater lakes in the world?', ['Canada', 'Russia', 'United States', 'Finland'], 'Canada'],
      ['What is the highest mountain peak above sea level on Earth?', ['Mount Everest', 'K2', 'Kangchenjunga', 'Lhotse'], 'Mount Everest'],
      ['Which river basin contains the largest tropical rainforest in the world?', ['Amazon Basin', 'Congo Basin', 'Mekong Basin', 'Ganges Basin'], 'Amazon Basin'],
      ['What is the largest subtropical hot desert on planet Earth?', ['Sahara Desert', 'Arabian Desert', 'Gobi Desert', 'Kalahari Desert'], 'Sahara Desert'],
      ['Which metropolitan area is the most populous megacity in the world?', ['Tokyo', 'Delhi', 'Shanghai', 'Sao Paulo'], 'Tokyo']
    ].map(([question, options, answer]) => ({
      question: question as string,
      options: options as string[],
      answer: answer as string,
      explanation: 'Verified geography fact for the timing regression fixture.',
      provenance: { source: 'timing-fixture' }
    }));

    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: 'World Geography Challenge',
      userInputs: { questions }
    });

    const scenePlans: ScenePlan[] = scriptIR.beats.map((beat, i) => ({
      sceneId: `scene_${String(i + 1).padStart(2, '0')}_${beat.beatId}`,
      beatId: beat.beatId,
      narration: beat.narration,
      visualIntent: beat.visualIntent,
      shotRecipeId: beat.shotRecipeId,
      props: beat.props,
      durationIntent: {
        target: beat.durationSeconds || 3.5,
        min: 1.0,
        max: 15.0
      }
    }));

    const sceneAudioArtifacts = scenePlans
      .filter((s) => s.props?.thinkGate !== true)
      .map((s) => ({ sceneId: s.sceneId, localPath: tonePath, durationSeconds: AUDIO_SECONDS }));

    const intent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      sceneAudioArtifacts,
      jobId: 'quiz-think-gate-regression'
    });

    expect(intent.scenes.length).toBe(50);

    const startTimes: number[] = [];
    let cursor = 0;
    for (const scene of intent.scenes) {
      startTimes.push(cursor);
      cursor += scene.duration_seconds;
    }

    for (let q = 1; q <= 6; q++) {
      const base = 1 + (q - 1) * 8;
      const optionD = intent.scenes[base + 4];
      const gate = intent.scenes[base + 5];
      const answer = intent.scenes[base + 6];
      const explanation = intent.scenes[base + 7];

      expect(gate.shots[0].props?.thinkGate).toBe(true);
      expect(gate.audio_track).toBeUndefined();
      expect(gate.duration_seconds).toBeCloseTo(5.0, 6);
      expect(Math.round(gate.duration_seconds * FPS)).toBe(150);

      // Option D ends at its own audio end: no 0.35s narration tail before the gate.
      const optionDStart = startTimes[base + 4];
      const optionDAudioEnd = optionDStart + AUDIO_SECONDS;
      const gateStart = startTimes[base + 5];
      expect(optionD.duration_seconds).toBeCloseTo(Math.ceil(AUDIO_SECONDS * FPS) / FPS, 6);
      expect(gateStart).toBeGreaterThanOrEqual(optionDAudioEnd - 1e-9);
      expect(gateStart - optionDAudioEnd).toBeLessThanOrEqual(FRAME + 1e-9);

      // Answer audio starts exactly when the gate ends.
      expect(startTimes[base + 6]).toBeCloseTo(gateStart + 5.0, 6);
      expect(answer.audio_track).toBeDefined();

      // Explanation does not begin before answer narration can finish.
      const answerAudioEnd = startTimes[base + 6] + AUDIO_SECONDS;
      expect(startTimes[base + 7]).toBeGreaterThanOrEqual(answerAudioEnd - 1e-9);
      expect(explanation.audio_track).toBeDefined();
    }
  });
});
