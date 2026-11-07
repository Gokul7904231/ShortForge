import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { TemplateRegistry } from '../../lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline } from '../core/templates/TemplateProductionPipeline';
import { normalizeToUniversalQuizPayload, UniversalQuizPayload } from '../core/templates/UniversalQuizPayload';
import { UniversalAssetResolver } from '../../lib/quiz/UniversalAssetResolver';

describe('ShortForge Universal Interactive Quiz Shorts Template v1.2 (quiz.universal.glass.v1)', () => {
  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();

  const categories = [
    {
      categoryName: 'Geography',
      topic: 'World Geography & Extremes',
      questions: [
        { question: 'What is the deepest oceanic trench on Earth?', options: ['Java Trench', 'Puerto Rico Trench', 'Mariana Trench', 'Tonga Trench'], answer: 'Mariana Trench', explanation: 'The Mariana Trench plunges nearly 11,000 meters down in the western Pacific Ocean.' },
        { question: 'Which country has the highest number of natural freshwater lakes?', options: ['Russia', 'Canada', 'United States', 'Brazil'], answer: 'Canada', explanation: 'Canada contains over 2 million lakes, covering approximately 9 percent of its land area.' },
        { question: 'Which peak is the highest mountain above sea level on Earth?', options: ['K2', 'Kangchenjunga', 'Mount Everest', 'Lhotse'], answer: 'Mount Everest', explanation: 'Mount Everest stands at 8,848.86 meters above sea level in the Himalayas.' },
        { question: 'What is the largest tropical rainforest in the world?', options: ['Congo Rainforest', 'Daintree Rainforest', 'Amazon Rainforest', 'Valdivian Rainforest'], answer: 'Amazon Rainforest', explanation: 'The Amazon basin covers over 6.7 million square kilometers in South America.' },
        { question: 'Which is the largest hot desert on Earth?', options: ['Gobi Desert', 'Arabian Desert', 'Sahara Desert', 'Kalahari Desert'], answer: 'Sahara Desert', explanation: 'The Sahara spans over 9.2 million square kilometers across North Africa.' },
        { question: 'Which metropolitan area has the highest population in the world?', options: ['Delhi', 'Shanghai', 'Tokyo', 'Sao Paulo'], answer: 'Tokyo', explanation: 'Greater Tokyo has a population exceeding 37 million residents.' }
      ]
    },
    {
      categoryName: 'Science',
      topic: 'Astrophysics & Solar System',
      questions: [
        { question: 'Which planet has the shortest day in our solar system?', options: ['Saturn', 'Neptune', 'Jupiter', 'Mars'], answer: 'Jupiter', explanation: 'Jupiter rotates once on its axis in just 9 hours and 55 minutes.' },
        { question: 'What is the fundamental speed limit of the universe?', options: ['Speed of Sound', 'Escape Velocity', 'Speed of Light', 'Orbital Velocity'], answer: 'Speed of Light', explanation: 'Light propagates at approximately 299,792 kilometers per second in a vacuum.' },
        { question: 'Which moon of Jupiter is the largest moon in the solar system?', options: ['Europa', 'Callisto', 'Ganymede', 'Titan'], answer: 'Ganymede', explanation: 'Ganymede is 5,268 kilometers across, larger than the planet Mercury.' },
        { question: 'Why is outer space completely silent to human ears?', options: ['Too far from stars', 'No air pressure', 'Sound cannot travel in a vacuum', 'Gravity absorbs sound'], answer: 'Sound cannot travel in a vacuum', explanation: 'Sound requires a mechanical physical medium to transmit acoustic waves.' },
        { question: 'What is the hottest planet in our solar system?', options: ['Mercury', 'Mars', 'Venus', 'Jupiter'], answer: 'Venus', explanation: 'Venus experiences a runaway greenhouse effect reaching 465 degrees Celsius.' },
        { question: 'What molecular structure carries genetic instructions for living organisms?', options: ['Ribosome', 'Hemoglobin', 'DNA Double Helix', 'ATP Synthase'], answer: 'DNA Double Helix', explanation: 'Watson, Crick, and Franklin discovered the double-helical structure of DNA in 1953.' }
      ]
    },
    {
      categoryName: 'History',
      topic: 'Ancient Civilizations & Exploration',
      questions: [
        { question: 'Which ancient wonder of the world still stands today?', options: ['Colossus of Rhodes', 'Lighthouse of Alexandria', 'Great Pyramid of Giza', 'Hanging Gardens'], answer: 'Great Pyramid of Giza', explanation: 'Built for Pharaoh Khufu circa 2560 BC, the Great Pyramid has stood for over 4,500 years.' },
        { question: 'In what year did Apollo 11 land the first humans on the Moon?', options: ['1965', '1968', '1969', '1972'], answer: '1969', explanation: 'Neil Armstrong and Buzz Aldrin touched down on the lunar surface on July 20, 1969.' },
        { question: 'Which empire built the Colosseum in Rome?', options: ['Greek Empire', 'Ottoman Empire', 'Roman Empire', 'Byzantine Empire'], answer: 'Roman Empire', explanation: 'Constructed under the Flavian emperors between 72 and 80 AD.' },
        { question: 'Who was the first emperor of unified China?', options: ['Han Wudi', 'Kublai Khan', 'Qin Shi Huang', 'Tang Taizong'], answer: 'Qin Shi Huang', explanation: 'Qin Shi Huang unified China in 221 BC and founded the Qin dynasty.' },
        { question: 'Which Renaissance polymath painted the Mona Lisa?', options: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Donatello'], answer: 'Leonardo da Vinci', explanation: 'Leonardo painted the iconic portrait in Florence in the early 16th century.' },
        { question: 'What ancient trade route connected China with the Mediterranean?', options: ['Amber Road', 'Incense Route', 'Silk Road', 'Spice Route'], answer: 'Silk Road', explanation: 'The Silk Road facilitated commercial and cultural exchange for centuries.' }
      ]
    },
    {
      categoryName: 'Artificial Intelligence',
      topic: 'Neural Networks & Deep Learning',
      questions: [
        { question: 'What core mechanism powers modern Large Language Models?', options: ['Recurrent Feedback', 'Self-Attention', 'Convolutional Pooling', 'Random Forest'], answer: 'Self-Attention', explanation: 'Introduced in 2017, self-attention calculates contextual token relationships in parallel.' },
        { question: 'Which hardware architecture accelerated deep learning matrix multiplication?', options: ['CPU', 'FPGA', 'GPU', 'ASIC'], answer: 'GPU', explanation: 'Highly parallel GPU compute cores execute tensor matrix operations thousands of times faster.' },
        { question: 'What mathematical technique updates weights during neural network training?', options: ['Binary Search', 'Backpropagation', 'Genetic Mutation', 'Linear Sorting'], answer: 'Backpropagation', explanation: 'Backpropagation applies the calculus chain rule to calculate error gradients.' },
        { question: 'What benchmark evaluates whether an AI can converse indistinguishably from humans?', options: ['Voight-Kampff Test', 'Turing Test', 'Winograd Schema', 'ARC Prize'], answer: 'Turing Test', explanation: 'Proposed by Alan Turing in 1950 under the name the Imitation Game.' },
        { question: 'What algorithm balances exploration versus exploitation in reinforcement learning?', options: ['Q-Learning', 'Bubble Sort', 'Dijkstra Algorithm', 'K-Means'], answer: 'Q-Learning', explanation: 'Q-learning computes optimal action-selection policies via Bellman equations.' },
        { question: 'What is the term for when an AI generates convincingly false information?', options: ['Dropout', 'Overfitting', 'Hallucination', 'Gradient Vanishing'], answer: 'Hallucination', explanation: 'Hallucination occurs when generative models synthesize plausible but fabricated facts.' }
      ]
    },
    {
      categoryName: 'General Knowledge',
      topic: 'World Trivia & Phenomenon',
      questions: [
        { question: 'What is the most abundant chemical element in the universe?', options: ['Helium', 'Oxygen', 'Hydrogen', 'Carbon'], answer: 'Hydrogen', explanation: 'Hydrogen accounts for roughly 75 percent of all baryonic mass in the universe.' },
        { question: 'How many bones are in the adult human skeleton?', options: ['186', '206', '226', '246'], answer: '206', explanation: 'An adult human skeleton has exactly 206 bones after infantile fusion.' },
        { question: 'Which ocean is the largest by surface area on Earth?', options: ['Atlantic Ocean', 'Indian Ocean', 'Pacific Ocean', 'Arctic Ocean'], answer: 'Pacific Ocean', explanation: 'The Pacific Ocean covers over 165 million square kilometers, larger than all land combined.' },
        { question: 'What is the hardest natural mineral known to science?', options: ['Topaz', 'Corundum', 'Diamond', 'Quartz'], answer: 'Diamond', explanation: 'Diamond scores a maximum 10 on the Mohs scale of mineral hardness.' },
        { question: 'Which planet has the most extensive visible ring system?', options: ['Jupiter', 'Uranus', 'Saturn', 'Neptune'], answer: 'Saturn', explanation: 'Saturn rings span up to 282,000 kilometers across, composed mainly of water ice.' },
        { question: 'What gas do photosynthetic plants absorb from the atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Argon'], answer: 'Carbon Dioxide', explanation: 'Plants use carbon dioxide, water, and sunlight to synthesize glucose and oxygen.' }
      ]
    },
    {
      categoryName: 'Custom User Topic',
      topic: 'Quantum Cryptography & Zero-Knowledge Proofs',
      questions: [
        { question: 'What quantum property prevents an eavesdropper from intercepting photons without detection?', options: ['Superposition', 'No-Cloning Theorem', 'Quantum Tunneling', 'Quantum Decoherence'], answer: 'No-Cloning Theorem', explanation: 'The no-cloning theorem states that an unknown quantum state cannot be copied perfectly without measurement collapse.' },
        { question: 'Which cryptographic protocol is the most famous quantum key distribution scheme?', options: ['RSA-2048', 'AES-GCM', 'BB84 Protocol', 'Diffie-Hellman'], answer: 'BB84 Protocol', explanation: 'Bennett and Brassard invented BB84 in 1984 using polarized photon states.' },
        { question: 'What mathematical property allows verifying computation without revealing the input data?', options: ['Zero-Knowledge Proof', 'Homomorphic Hash', 'Merkle Tree', 'Elliptic Curve'], answer: 'Zero-Knowledge Proof', explanation: 'ZKPs prove statement validity with completeness, soundness, and zero knowledge leakage.' },
        { question: 'What post-quantum algorithm family is resilient to Shor algorithm factoring?', options: ['Lattice-based cryptography', 'RSA', 'Diffie-Hellman', 'DSA'], answer: 'Lattice-based cryptography', explanation: 'Lattice problems like Learning With Errors (LWE) are considered intractable for quantum computers.' },
        { question: 'What quantum algorithm solves discrete logarithms in polynomial time?', options: ['Grover Algorithm', 'Shor Algorithm', 'Deutsch-Jozsa', 'Simon Algorithm'], answer: 'Shor Algorithm', explanation: 'Peter Shor published the polynomial-time quantum factoring algorithm in 1994.' },
        { question: 'What cryptographic construct bundles hundreds of transactions into a single recursive proof?', options: ['zk-SNARK', 'SHA-256', 'HMAC', 'Scrypt'], answer: 'zk-SNARK', explanation: 'Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge enable sub-second verification.' }
      ]
    }
  ];

  it('registers quiz.universal.glass.v1 in TemplateRegistry as the authoritative universal quiz template', () => {
    const tmpl = registry.getTemplate('quiz.universal.glass.v1');
    expect(tmpl).toBeDefined();
    expect(tmpl?.category).toBe('QUIZ');
    expect(tmpl?.formatFamily).toBe('Universal Interactive Quiz');
    expect(tmpl?.outputPolicy.targetDurationRange[1]).toBe(145);
    expect(tmpl?.storyStructure.length).toBe(20); // 1 Hook + 6*3 + 1 Outro
  });

  it('preserves quiz.quizshow.v1 as a backwards-compatible alias', () => {
    const alias = registry.getTemplate('quiz.quizshow.v1');
    expect(alias).toBeDefined();
    expect(alias?.category).toBe('QUIZ');
  });

  for (const cat of categories) {
    it(`normalizes ${cat.categoryName} into UniversalQuizPayload without category branching`, () => {
      const payload: UniversalQuizPayload = normalizeToUniversalQuizPayload({
        topic: cat.topic,
        questions: cat.questions
      });

      expect(payload.templateId).toBe('quiz.universal.glass.v1');
      expect(payload.category.topic).toBe(cat.topic);
      expect(payload.questions.length).toBe(6);

      for (const q of payload.questions) {
        expect(q.options.length).toBe(4);
        expect(['A', 'B', 'C', 'D']).toContain(q.correctOptionId);
        expect(q.correctAnswerText).toBeDefined();
        expect(q.explanation.length).toBeGreaterThan(10);
        expect(q.narration.question).toContain(q.question);
      }
    });

    it(`compiles 50-beat production story structure for ${cat.categoryName} using quiz.universal.glass.v1`, async () => {
      const templateDef = registry.getTemplate('quiz.universal.glass.v1');
      expect(templateDef).toBeDefined();

      const payload = normalizeToUniversalQuizPayload({
        topic: cat.topic,
        questions: cat.questions
      });

      const scriptIR = await pipeline.generateTemplateScript({
        templateDef: templateDef!,
        topic: payload.category.topic || cat.topic,
        userInputs: {
          title: payload.title,
          hook: payload.hook,
          cta: payload.branding?.outroText,
          questions: payload.questions.map((q) => ({
            question: q.question,
            options: q.options.map((o) => o.text),
            answer: q.correctAnswerText,
            explanation: q.explanation
          }))
        }
      });

      expect(scriptIR.beats.length).toBe(50);
      expect(scriptIR.beats[0].type).toBe('HOOK');
      expect(scriptIR.beats[0].shotRecipeId).toBe('KINETIC_HOOK');

      // 6 question cycles: question -> options A-D -> 5s think -> answer -> explanation
      for (let q = 1; q <= 6; q++) {
        const base = 1 + (q - 1) * 8;
        const cardBeat = scriptIR.beats[base];
        const optionBeats = scriptIR.beats.slice(base + 1, base + 5);
        const thinkBeat = scriptIR.beats[base + 5];
        const revealBeat = scriptIR.beats[base + 6];
        const explanationBeat = scriptIR.beats[base + 7];

        expect(cardBeat.type).toBe('QUESTION');
        expect(cardBeat.shotRecipeId).toBe('QUESTION_CARD');
        expect(cardBeat.props.options.length).toBe(4);

        expect(optionBeats.map((b) => b.type)).toEqual(['OPTION_A', 'OPTION_B', 'OPTION_C', 'OPTION_D']);

        expect(thinkBeat.type).toBe('THINK');
        expect(thinkBeat.shotRecipeId).toBe('COUNTDOWN');
        expect(thinkBeat.props.seconds).toBe(5);
        expect(thinkBeat.props.thinkGate).toBe(true);
        expect(thinkBeat.narration).toBe('');
        expect(thinkBeat.durationSeconds).toBe(5.0);

        expect(revealBeat.type).toBe('ANSWER_REVEAL');
        expect(revealBeat.shotRecipeId).toBe('ANSWER_REVEAL');
        expect(revealBeat.props.correctOption).toBeDefined();

        expect(explanationBeat.type).toBe('EXPLANATION');
      }

      // Outro
      const outroBeat = scriptIR.beats[49];
      expect(outroBeat.type).toBe('CTA');
      expect(outroBeat.shotRecipeId).toBe('OUTRO_CTA');
    });

    it(`resolves authentic visual assets across all questions for ${cat.categoryName}`, () => {
      for (const q of cat.questions) {
        const asset = UniversalAssetResolver.resolveQuestionAsset({
          topic: cat.topic,
          questionText: q.question,
          answerText: q.answer
        });

        expect(asset).toBeDefined();
        expect(fs.existsSync(asset.localPath)).toBe(true);
        expect(asset.assetId.length).toBeGreaterThan(2);
      }
    });
  }

  it('keeps the 6-question Universal QuizShow plan under the 180.0s production ceiling', async () => {
    const templateDef = registry.getTemplate('quiz.universal.glass.v1');
    expect(templateDef).toBeDefined();

    const geo = categories[0];
    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: geo.topic,
      userInputs: {
        questions: geo.questions
      }
    });

    // Sum of default planned beat durations stays within the platform-bound ceiling.
    const totalPlanned = scriptIR.beats.reduce((acc, b) => acc + (b.durationSeconds || 0), 0);
    expect(totalPlanned).toBeGreaterThanOrEqual(150);
    expect(totalPlanned).toBeLessThanOrEqual(180);
  });
});
