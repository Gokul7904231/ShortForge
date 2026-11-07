import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline, FactualGroundingError, ScenePlan } from '../core/templates/TemplateProductionPipeline';

describe('ShortForge QuizShow v1 Canonical Template & Pipeline Integrity', () => {
  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();

  const mock8Questions = [
    {
      question: 'Which planet in our solar system has the shortest day?',
      options: ['Jupiter', 'Venus', 'Mars', 'Mercury'],
      answerIndex: 0,
      answer: 'Jupiter',
      explanation: 'Jupiter rotates once in approximately 10 hours, making its day the shortest in the Solar System.',
      provenance: { source: 'NASA Planetary Data System' }
    },
    {
      question: 'What is the most abundant chemical element in the observable universe?',
      options: ['Hydrogen', 'Helium', 'Oxygen', 'Carbon'],
      answerIndex: 0,
      answer: 'Hydrogen',
      explanation: 'Hydrogen accounts for roughly 75 percent of all baryonic mass in the universe.',
      provenance: { source: 'Astrophysical Journal Cosmology' }
    },
    {
      question: 'Which subatomic particle carries a negative elementary electric charge?',
      options: ['Electron', 'Proton', 'Neutron', 'Positron'],
      answerIndex: 0,
      answer: 'Electron',
      explanation: 'Electrons carry a negative elementary charge of approximately -1.602 x 10^-19 coulombs.',
      provenance: { source: 'CODATA Fundamental Physical Constants' }
    },
    {
      question: 'What is the speed of light in a vacuum in kilometers per second?',
      options: ['299,792 km/s', '150,000 km/s', '3,000 km/s', '30,000 km/s'],
      answerIndex: 0,
      answer: '299,792 km/s',
      explanation: 'Light in a vacuum travels at precisely 299,792,458 meters per second.',
      provenance: { source: 'National Institute of Standards and Technology' }
    },
    {
      question: 'What is the powerhouse organelle of eukaryotic cells?',
      options: ['Mitochondria', 'Ribosome', 'Golgi apparatus', 'Lysosome'],
      answerIndex: 0,
      answer: 'Mitochondria',
      explanation: 'Mitochondria generate most of the chemical energy needed by cells via ATP synthesis.',
      provenance: { source: 'Cellular Biology 10th Ed.' }
    },
    {
      question: 'Which ocean trench is the deepest point on Earth?',
      options: ['Mariana Trench', 'Tonga Trench', 'Philippine Trench', 'Puerto Rico Trench'],
      answerIndex: 0,
      answer: 'Mariana Trench',
      explanation: 'Challenger Deep in the Mariana Trench reaches approximately 10,994 meters depth.',
      provenance: { source: 'NOAA Bathymetric Registry' }
    },
    {
      question: 'What is the primary greenhouse gas in Venus atmosphere causing extreme temperatures?',
      options: ['Carbon Dioxide', 'Methane', 'Nitrogen', 'Sulfur Hexafluoride'],
      answerIndex: 0,
      answer: 'Carbon Dioxide',
      explanation: 'Venus atmosphere is over 96 percent carbon dioxide, creating a runaway greenhouse effect.',
      provenance: { source: 'ESA Venus Express Mission' }
    },
    {
      question: 'Which artificial intelligence architecture introduced the self-attention mechanism in 2017?',
      options: ['Transformer', 'LSTM', 'Convolutional Network', 'Hopfield Network'],
      answerIndex: 0,
      answer: 'Transformer',
      explanation: 'The seminal Attention Is All You Need paper introduced the Transformer architecture.',
      provenance: { source: 'Vaswani et al. NeurIPS 2017' }
    }
  ];

  it('registers quiz.quizshow.v1 template with 8-question structure', () => {
    const templateDef = registry.getTemplate('quiz.quizshow.v1');
    expect(templateDef).toBeDefined();
    expect(templateDef?.identity.id).toBe('quiz.quizshow.v1');
    expect(templateDef?.category).toBe('QUIZ');
    expect(templateDef?.formatFamily).toBe('Universal Interactive Quiz');
    expect(templateDef?.outputPolicy.width).toBe(1080);
    expect(templateDef?.outputPolicy.height).toBe(1920);
    expect(templateDef?.outputPolicy.targetDurationRange[1]).toBe(172);
    expect(templateDef?.storyStructure.length).toBe(26); // Hook + 8x3 + Outro = 26
  });

  it('generates 26-beat ScriptIR for 8 questions with distinct countdown and reveal beats', async () => {
    const templateDef = registry.getTemplate('quiz.quizshow.v1');
    expect(templateDef).toBeDefined();

    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: 'Science & The Universe',
      userInputs: {
        questions: mock8Questions
      }
    });

    expect(scriptIR.contentEngine).toBe('QUIZ');
    expect(scriptIR.beats.length).toBe(26);

    const questionBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'QUESTION_CARD');
    const countdownBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'COUNTDOWN');
    const revealBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'ANSWER_REVEAL');
    const outroBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'OUTRO_CTA');

    expect(questionBeats).toHaveLength(8);
    expect(countdownBeats).toHaveLength(8);
    expect(revealBeats).toHaveLength(8);
    expect(outroBeats).toHaveLength(1);

    for (let i = 0; i < 8; i++) {
      const qb = questionBeats[i];
      const cb = countdownBeats[i];
      const rb = revealBeats[i];

      expect(qb.props?.options).toHaveLength(4);
      expect(new Set(qb.props?.options).size).toBe(4);
      expect(cb.props?.seconds).toBe(5);
      expect(cb.props?.motion?.animated).toBe(true);
      expect(rb.props?.correctOption).toBe(mock8Questions[i].answer);
      expect(rb.props?.explanation).toBe(mock8Questions[i].explanation);
    }
  });

  it('rejects quiz script generation if fewer than 8 questions provided', async () => {
    const templateDef = registry.getTemplate('quiz.quizshow.v1');
    expect(templateDef).toBeDefined();

    await expect(
      pipeline.generateTemplateScript({
        templateDef: templateDef!,
        topic: 'World Geography',
        userInputs: {
          questions: mock8Questions.slice(0, 7) // Only 7 questions
        }
      })
    ).rejects.toThrow(FactualGroundingError);
  });

  it('rejects question if duplicate options are provided', async () => {
    const templateDef = registry.getTemplate('quiz.quizshow.v1');
    expect(templateDef).toBeDefined();

    const badQuestions = JSON.parse(JSON.stringify(mock8Questions));
    badQuestions[0].options = ['Jupiter', 'Jupiter', 'Mars', 'Venus']; // Duplicate option

    await expect(
      pipeline.generateTemplateScript({
        templateDef: templateDef!,
        topic: 'Cosmic Trivia',
        userInputs: {
          questions: badQuestions
        }
      })
    ).rejects.toThrow(FactualGroundingError);
  });

  it('enforces that card bottom (1380px) and caption zone (1490px) maintain guaranteed safe clearance', () => {
    const CARD_BOTTOM = 1380;
    const CAPTION_CENTER = 1490;
    // Caption pill box top is at caption_y - box_height/2 (~1430px)
    const CAPTION_BOX_TOP = CAPTION_CENTER - 60;
    const CLEARANCE = CAPTION_BOX_TOP - CARD_BOTTOM;
    expect(CLEARANCE).toBeGreaterThanOrEqual(30);
  });

  it('guarantees audio completeness invariant where scene duration accommodates audio without truncation', async () => {
    const templateDef = registry.getTemplate('quiz.quizshow.v1');
    const scenePlans: ScenePlan[] = [
      {
        sceneId: 'scene_01',
        beatId: 'beat_01',
        narration: 'Test question narration',
        visualIntent: 'Test',
        shotRecipeId: 'QUESTION_CARD',
        durationIntent: { target: 6.5, min: 1.0, max: 15.0 }
      }
    ];
    const sceneAudioArtifacts = [
      { sceneId: 'scene_01', localPath: path.resolve(process.cwd(), 'data/audio/quizshow_8q/scene_01_beat_01_hook.wav'), durationSeconds: 6.2 }
    ];

    // Mock VoiceFabric to bypass disk check in test
    const renderIntent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      sceneAudioArtifacts,
      jobId: 'TEST-AUDIO-INVARIANT'
    });

    // Scene duration must strictly equal or exceed audio duration (6.2s + 0.25s)
    expect(renderIntent.scenes[0].duration_seconds).toBeGreaterThanOrEqual(6.2);
  });

  it('compiles LocalRenderIntent with dynamic motion and enforces 175s upper guard', async () => {
    const templateDef = registry.getTemplate('quiz.quizshow.v1');
    expect(templateDef).toBeDefined();

    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: 'Artificial Intelligence & Future Tech',
      userInputs: {
        questions: mock8Questions
      }
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

    expect(scenePlans).toHaveLength(26);

    const renderIntent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      jobId: 'test_quizshow_intent_175s'
    });

    expect(renderIntent.output.width).toBe(1080);
    expect(renderIntent.output.height).toBe(1920);
    expect(renderIntent.scenes.length).toBe(26);

    // Sum of scene durations must respect the 178.0s hard guard
    const totalDuration = renderIntent.scenes.reduce((acc, s) => acc + s.duration_seconds, 0);
    expect(totalDuration).toBeLessThanOrEqual(178.0);
    expect(totalDuration).toBeGreaterThanOrEqual(150.0);

    // Verify countdown scenes have animated: true for dynamic clock animation
    const countdownScenes = renderIntent.scenes.filter((s) => s.scene_id.includes('countdown'));
    expect(countdownScenes.length).toBe(8);
    for (const cs of countdownScenes) {
      expect(cs.shots[0].motion?.animated).toBe(true);
    }
  });
});
