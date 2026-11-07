import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline } from '../core/templates/TemplateProductionPipeline';
import { normalizeToUniversalQuizPayload, UniversalQuizPayload } from '../core/templates/UniversalQuizPayload';
import { UniversalAssetResolver } from '../../lib/quiz/UniversalAssetResolver';

describe('ShortForge Universal Cinematic Quiz Shorts Template V2 (quiz.universal.cinematic.v2)', () => {
  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();

  const flagshipDatasets = [
    {
      categoryName: 'Geography',
      topic: 'World Geography Challenge',
      questions: [
        { question: 'Which oceanic abyss is the deepest measured point on planet Earth?', options: ['Mariana Trench', 'Tonga Trench', 'Puerto Rico Trench', 'Java Trench'], answer: 'Mariana Trench', explanation: 'Challenger Deep inside the Mariana Trench plunges approximately 10,994 meters below sea level.', b2Asset: 'mariana_trench.png' },
        { question: 'Which country contains the largest number of natural freshwater lakes in the world?', options: ['Canada', 'Russia', 'United States', 'Finland'], answer: 'Canada', explanation: 'Canada contains over two million lakes, holding more natural lake area than the rest of the world combined.', b2Asset: 'freshwater_lakes.png' },
        { question: 'What is the highest mountain peak above sea level on Earth?', options: ['Mount Everest', 'K2', 'Kangchenjunga', 'Lhotse'], answer: 'Mount Everest', explanation: 'Mount Everest in the Himalayas reaches an official elevation of 8,848 meters above sea level.', b2Asset: 'mount_everest_himalayas.png' },
        { question: 'Which river basin contains the largest tropical rainforest in the world?', options: ['Amazon Basin', 'Congo Basin', 'Mekong Basin', 'Ganges Basin'], answer: 'Amazon Basin', explanation: 'The Amazon rainforest covers over 5.5 million square kilometers across South America.', b2Asset: 'amazon_rainforest_basin.png' },
        { question: 'What is the largest subtropical hot desert on planet Earth?', options: ['Sahara Desert', 'Arabian Desert', 'Gobi Desert', 'Kalahari Desert'], answer: 'Sahara Desert', explanation: 'The Sahara spans roughly 9.2 million square kilometers across Northern Africa.', b2Asset: 'sahara_desert_dunes.png' },
        { question: 'Which metropolitan area is the most populous megacity in the world?', options: ['Tokyo', 'Delhi', 'Shanghai', 'Sao Paulo'], answer: 'Tokyo', explanation: 'Greater Tokyo is home to approximately 37 million residents across its metropolitan region.', b2Asset: 'tokyo_megacity_urban.png' }
      ]
    },
    {
      categoryName: 'Science',
      topic: 'Cosmic Science & Physics Challenge',
      questions: [
        { question: 'Which planet in our solar system has the shortest day?', options: ['Jupiter', 'Venus', 'Mars', 'Mercury'], answer: 'Jupiter', explanation: 'Jupiter rotates once every 9.9 hours, giving it the shortest day of any planet in our Solar System.', b2Asset: 'jupiter_rotation.png' },
        { question: 'What is the approximate speed of light propagating through a physical vacuum?', options: ['300,000 km/s', '150,000 km/s', '30,000 km/s', '3,000 km/s'], answer: '300,000 km/s', explanation: 'Light in a vacuum travels at an immutable universal constant of precisely 299,792,458 meters per second.', b2Asset: 'speed_of_light.png' },
        { question: 'Which moon is the largest natural satellite in our Solar System?', options: ['Ganymede', 'Titan', 'Callisto', 'Io'], answer: 'Ganymede', explanation: 'Ganymede orbits Jupiter and is even larger in diameter than the planet Mercury.', b2Asset: 'ganymede_internal_ocean.png' },
        { question: 'Why can acoustic sound waves not travel through the vacuum of outer space?', options: ['No Medium', 'Too Cold', 'Zero Gravity', 'Solar Radiation'], answer: 'No Medium', explanation: 'Sound is a mechanical vibration requiring physical atoms or molecules to propagate.', b2Asset: 'vacuum_sound_wave.png' },
        { question: 'Which planet is the hottest in our Solar System due to runaway greenhouse effect?', options: ['Venus', 'Mercury', 'Mars', 'Jupiter'], answer: 'Venus', explanation: 'Venus has a dense carbon dioxide atmosphere trapping heat at an average 465 degrees Celsius.', b2Asset: 'venus_atmosphere_diagram.png' },
        { question: 'What molecular structure forms the double helix of genetic code in living cells?', options: ['DNA', 'RNA', 'Enzyme', 'Lipid'], answer: 'DNA', explanation: 'Watson, Crick, and Rosalind Franklin discovered the antiparallel double-helix structure of DNA.', b2Asset: 'dna_double_helix_structure.png' }
      ]
    }
  ];

  it('registers quiz.universal.cinematic.v2 in TemplateRegistry as the upgraded canonical V2 template', () => {
    const tmpl = registry.getTemplate('quiz.universal.cinematic.v2');
    expect(tmpl).toBeDefined();
    expect(tmpl?.category).toBe('QUIZ');
    expect(tmpl?.identity.id).toBe('quiz.universal.cinematic.v2');
    expect(tmpl?.identity.version).toBe('2.0.0');
    expect(tmpl?.outputPolicy.targetDurationRange[1]).toBe(145);
    expect(tmpl?.storyStructure.length).toBe(20);
    expect(tmpl?.voicePolicy?.suggestedVoices).toContain('Kore');
  });

  it('preserves quiz.universal.glass.v1 unchanged as the V1 baseline invariant', () => {
    const v1 = registry.getTemplate('quiz.universal.glass.v1');
    expect(v1).toBeDefined();
    expect(v1?.identity.id).toBe('quiz.universal.glass.v1');
    expect(v1?.category).toBe('QUIZ');
  });

  for (const ds of flagshipDatasets) {
    it(`normalizes ${ds.categoryName} into UniversalQuizPayload with templateId quiz.universal.cinematic.v2`, () => {
      const payload: UniversalQuizPayload = normalizeToUniversalQuizPayload({
        templateId: 'quiz.universal.cinematic.v2',
        topic: ds.topic,
        questions: ds.questions
      });

      expect(payload.templateId).toBe('quiz.universal.cinematic.v2');
      expect(payload.category.topic).toBe(ds.topic);
      expect(payload.questions.length).toBe(6);

      for (const q of payload.questions) {
        expect(q.options.length).toBe(4);
        expect(['A', 'B', 'C', 'D']).toContain(q.correctOptionId);
        expect(q.correctAnswerText).toBeDefined();
        expect(q.explanation.length).toBeGreaterThan(10);
      }
    });

    it(`compiles 50-beat production story structure for ${ds.categoryName} under V2 pipeline`, async () => {
      const templateDef = registry.getTemplate('quiz.universal.cinematic.v2');
      expect(templateDef).toBeDefined();

      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: templateDef!,
        topic: ds.topic,
        userInputs: {
          questions: ds.questions
        }
      });

      expect(scriptIR.beats.length).toBe(50);
      expect(scriptIR.beats[0].type).toBe('HOOK');

      for (let q = 1; q <= 6; q++) {
        const base = 1 + (q - 1) * 8;
        const cardBeat = scriptIR.beats[base];
        const optionBeats = scriptIR.beats.slice(base + 1, base + 5);
        const thinkBeat = scriptIR.beats[base + 5];
        const revealBeat = scriptIR.beats[base + 6];
        const explanationBeat = scriptIR.beats[base + 7];

        expect(cardBeat.type).toBe('QUESTION');
        expect(optionBeats.map((b) => b.type)).toEqual(['OPTION_A', 'OPTION_B', 'OPTION_C', 'OPTION_D']);
        expect(optionBeats[3].props?.audioTailSeconds).toBe(0);
        expect(thinkBeat.type).toBe('THINK');
        expect(thinkBeat.narration).toBe('');
        expect(thinkBeat.durationSeconds).toBe(5.0);
        expect(thinkBeat.props?.thinkGate).toBe(true);
        expect(revealBeat.type).toBe('ANSWER_REVEAL');
        expect(explanationBeat.type).toBe('EXPLANATION');
      }

      const outroBeat = scriptIR.beats[49];
      expect(outroBeat.type).toBe('CTA');
    });

    it(`verifies 6 distinct Backblaze B2 backgrounds exist for ${ds.categoryName}`, () => {
      let rootDir = process.cwd();
      while (rootDir !== path.dirname(rootDir)) {
        if (fs.existsSync(path.join(rootDir, 'data', 'visual-assets-store')) || fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml'))) {
          break;
        }
        rootDir = path.dirname(rootDir);
      }
      const b2StoreDir = path.resolve(rootDir, 'data', 'visual-assets-store', 'b2', 'shortsfactory-assets', 'quiz-v2');
      const seenAssets = new Set<string>();

      for (const q of ds.questions) {
        const expectedFile = path.join(b2StoreDir, q.b2Asset);
        expect(fs.existsSync(expectedFile)).toBe(true);
        expect(seenAssets.has(q.b2Asset)).toBe(false);
        seenAssets.add(q.b2Asset);
      }

      expect(seenAssets.size).toBe(6); // Exactly 6 distinct backgrounds!
    });
  }

  it('keeps the full-narration quiz plan under the 180.0s production ceiling', async () => {
    const templateDef = registry.getTemplate('quiz.universal.cinematic.v2');
    expect(templateDef).toBeDefined();

    const geo = flagshipDatasets[0];
    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: geo.topic,
      userInputs: {
        questions: geo.questions
      }
    });

    const totalPlanned = scriptIR.beats.reduce((acc, b) => acc + (b.durationSeconds || 0), 0);
    expect(totalPlanned).toBeGreaterThanOrEqual(150);
    expect(totalPlanned).toBeLessThanOrEqual(180);
  });
});
