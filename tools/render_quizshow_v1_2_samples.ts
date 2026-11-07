import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TemplateRegistry } from '../apps/web/lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline, ScenePlan } from '../apps/web/factoryos/core/templates/TemplateProductionPipeline';
import { LocalRenderAdapter } from '../apps/web/factoryos/core/render/LocalRenderAdapter';
import { VerificationEngine } from '../apps/web/factoryos/core/verification/VerificationEngine';

interface QuizQuestionDef {
  question: string;
  options: string[];
  answerIndex: number;
  answer: string;
  explanation: string;
  provenance: { source: string };
  image_path: string;
}

interface QuizDataset {
  category: string;
  topic: string;
  themeToken: string;
  accentColor: [number, number, number];
  sampleId: string;
  outputFilename: string;
  contactSheetFilename: string;
  questions: QuizQuestionDef[];
}

const GEOGRAPHY_DATASET: QuizDataset = {
  category: 'Geography',
  topic: 'World Geography Challenge',
  themeToken: 'QUIZ_GEOGRAPHY',
  accentColor: [6, 182, 212], // Oceanic Cyan
  sampleId: 'SF-QUIZSHOW-V12-GEO-6Q',
  outputFilename: 'quizshow-v1.2-geography-6q.mp4',
  contactSheetFilename: 'geography-contact-sheet.png',
  questions: [
    {
      question: 'Which oceanic abyss is the deepest measured point on planet Earth?',
      options: ['Mariana Trench', 'Tonga Trench', 'Puerto Rico Trench', 'Java Trench'],
      answerIndex: 0,
      answer: 'Mariana Trench',
      explanation: 'Challenger Deep inside the Mariana Trench plunges approximately 10,994 meters below sea level.',
      provenance: { source: 'NOAA Bathymetric Registry' },
      image_path: 'assets/quiz/geography/mariana_trench.png'
    },
    {
      question: 'Which country contains the largest number of natural freshwater lakes in the world?',
      options: ['Canada', 'Russia', 'United States', 'Finland'],
      answerIndex: 0,
      answer: 'Canada',
      explanation: 'Canada contains over two million lakes, holding more natural lake area than the rest of the world combined.',
      provenance: { source: 'Atlas of Canada / Physical Geography' },
      image_path: 'assets/quiz/geography/freshwater_lakes.png'
    },
    {
      question: 'What is the highest mountain peak above sea level on Earth?',
      options: ['Mount Everest', 'K2', 'Kangchenjunga', 'Lhotse'],
      answerIndex: 0,
      answer: 'Mount Everest',
      explanation: 'Mount Everest in the Himalayas reaches an official elevation of 8,848 meters above sea level.',
      provenance: { source: 'Survey of Nepal & China' },
      image_path: 'assets/quiz/geography/mount_everest_himalayas.png'
    },
    {
      question: 'Which river basin contains the largest tropical rainforest in the world?',
      options: ['Amazon Basin', 'Congo Basin', 'Mekong Basin', 'Ganges Basin'],
      answerIndex: 0,
      answer: 'Amazon Basin',
      explanation: 'The Amazon rainforest covers over 5.5 million square kilometers across South America.',
      provenance: { source: 'WWF Biome Survey' },
      image_path: 'assets/quiz/geography/amazon_rainforest_basin.png'
    },
    {
      question: 'What is the largest subtropical hot desert on planet Earth?',
      options: ['Sahara Desert', 'Arabian Desert', 'Gobi Desert', 'Kalahari Desert'],
      answerIndex: 0,
      answer: 'Sahara Desert',
      explanation: 'The Sahara spans roughly 9.2 million square kilometers across Northern Africa.',
      provenance: { source: 'USGS Global Deserts Registry' },
      image_path: 'assets/quiz/geography/sahara_desert_dunes.png'
    },
    {
      question: 'Which metropolitan area is the most populous megacity in the world?',
      options: ['Tokyo', 'Delhi', 'Shanghai', 'Sao Paulo'],
      answerIndex: 0,
      answer: 'Tokyo',
      explanation: 'Greater Tokyo is home to approximately 37 million residents across its metropolitan region.',
      provenance: { source: 'UN World Urbanization Prospects' },
      image_path: 'assets/quiz/geography/tokyo_megacity_urban.png'
    }
  ]
};

const SCIENCE_DATASET: QuizDataset = {
  category: 'Science',
  topic: 'Cosmic Science & Physics Challenge',
  themeToken: 'QUIZ_SCIENCE',
  accentColor: [139, 92, 246], // Deep Cosmic Violet
  sampleId: 'SF-QUIZSHOW-V12-SCI-6Q',
  outputFilename: 'quizshow-v1.2-science-6q.mp4',
  contactSheetFilename: 'science-contact-sheet.png',
  questions: [
    {
      question: 'Which planet in our solar system has the shortest day?',
      options: ['Jupiter', 'Venus', 'Mars', 'Mercury'],
      answerIndex: 0,
      answer: 'Jupiter',
      explanation: 'Jupiter rotates once every 9.9 hours, giving it the shortest day of any planet in our Solar System.',
      provenance: { source: 'NASA Planetary Fact Sheet' },
      image_path: 'assets/quiz/science/jupiter_rotation.png'
    },
    {
      question: 'What is the approximate speed of light propagating through a physical vacuum?',
      options: ['300,000 km/s', '150,000 km/s', '30,000 km/s', '3,000 km/s'],
      answerIndex: 0,
      answer: '300,000 km/s',
      explanation: 'Light in a vacuum travels at an immutable universal constant of precisely 299,792,458 meters per second.',
      provenance: { source: 'NIST Physical Constants Reference' },
      image_path: 'assets/quiz/science/speed_of_light.png'
    },
    {
      question: 'Which moon is the largest natural satellite in our Solar System?',
      options: ['Ganymede', 'Titan', 'Callisto', 'Io'],
      answerIndex: 0,
      answer: 'Ganymede',
      explanation: 'Ganymede orbits Jupiter and is even larger in diameter than the planet Mercury.',
      provenance: { source: 'ESA Juice Mission Data' },
      image_path: 'assets/quiz/science/ganymede_internal_ocean.png'
    },
    {
      question: 'Why can acoustic sound waves not travel through the vacuum of outer space?',
      options: ['No Medium', 'Too Cold', 'Zero Gravity', 'Solar Radiation'],
      answerIndex: 0,
      answer: 'No Medium',
      explanation: 'Sound is a mechanical vibration requiring physical atoms or molecules to propagate.',
      provenance: { source: 'Acoustical Society of America' },
      image_path: 'assets/quiz/science/vacuum_sound_wave.png'
    },
    {
      question: 'Which planet is the hottest in our Solar System due to runaway greenhouse effect?',
      options: ['Venus', 'Mercury', 'Mars', 'Jupiter'],
      answerIndex: 0,
      answer: 'Venus',
      explanation: 'Venus has a dense carbon dioxide atmosphere trapping heat at an average 465 degrees Celsius.',
      provenance: { source: 'NASA Venus Fact Sheet' },
      image_path: 'assets/quiz/science/venus_atmosphere_diagram.png'
    },
    {
      question: 'What molecular structure forms the double helix of genetic code in living cells?',
      options: ['DNA', 'RNA', 'Enzyme', 'Lipid'],
      answerIndex: 0,
      answer: 'DNA',
      explanation: 'Watson, Crick, and Rosalind Franklin discovered the antiparallel double-helix structure of DNA.',
      provenance: { source: 'Nature Publishing Archives' },
      image_path: 'assets/quiz/science/dna_double_helix_structure.png'
    }
  ]
};

async function renderDataset(dataset: QuizDataset, outputArtifactsDir: string): Promise<{
  videoPath: string;
  sha256: string;
  duration: number;
  fileSize: number;
  contactSheetPath: string;
}> {
  console.log('=============================================================================');
  console.log(` RENDERING UNIVERSAL QUIZSHOW V1.2 SAMPLE: ${dataset.category.toUpperCase()}`);
  console.log(` Topic: ${dataset.topic} | Ceiling: 145.0s`);
  console.log('=============================================================================');

  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();
  const renderAdapter = LocalRenderAdapter.getInstance();

  const templateDef = registry.getTemplate('quiz.universal.glass.v1');
  if (!templateDef) {
    throw new Error('Canonical template quiz.universal.glass.v1 not found in registry!');
  }

  // 1. Generate ScriptIR with 6 questions
  const scriptIR = await pipeline.generateTemplateScript({
    templateDef,
    topic: dataset.topic,
    userInputs: {
      categoryBadge: `${dataset.category.toUpperCase()} • Q`,
      themeToken: dataset.themeToken,
      accentColor: dataset.accentColor,
      questions: dataset.questions
    }
  });

  console.log(`[1] Generated ScriptIR with ${scriptIR.beats.length} beats (Expected 20: 1 Hook + 6x3 + 1 Outro).`);
  if (scriptIR.beats.length !== 20) {
    throw new Error(`Invalid beat count: ${scriptIR.beats.length}, expected 20!`);
  }

  // 2. Synthesize Audio
  const audioDir = path.resolve(process.cwd(), 'data', 'audio', `quizshow_v12_${dataset.category.toLowerCase()}`);
  fs.mkdirSync(audioDir, { recursive: true });

  const beatsForSynthesis = scriptIR.beats.map((b, i) => ({
    sceneId: `scene_${String(i + 1).padStart(2, '0')}_${b.beatId}`,
    beatId: b.beatId,
    narration: b.narration
  }));

  const beatsJsonPath = path.join(audioDir, 'beats.json');
  fs.writeFileSync(beatsJsonPath, JSON.stringify(beatsForSynthesis, null, 2), 'utf-8');

  console.log(`[2] Synthesizing 20 narration tracks for ${dataset.category}...`);
  execFileSync('python', ['tools/synthesize_quizshow_audio.py', beatsJsonPath, audioDir], { stdio: 'inherit' });

  const manifestPath = path.join(audioDir, 'audio_manifest.json');
  const sceneAudioArtifacts: Array<{ sceneId: string; localPath: string; durationSeconds: number }> = JSON.parse(
    fs.readFileSync(manifestPath, 'utf-8')
  );

  const totalAudioDuration = sceneAudioArtifacts.reduce((sum, a) => sum + a.durationSeconds, 0);
  console.log(`[3] Synthesized 20 audio tracks. Total measured speech duration: ${totalAudioDuration.toFixed(2)}s`);

  // 3. Compile Scene Plans ensuring video >= audio + 0.35s
  const scenePlans: ScenePlan[] = scriptIR.beats.map((beat, i) => {
    const sceneId = `scene_${String(i + 1).padStart(2, '0')}_${beat.beatId}`;
    const audioMatch = sceneAudioArtifacts.find((a) => a.sceneId === sceneId);
    return {
      sceneId,
      beatId: beat.beatId,
      narration: beat.narration,
      visualIntent: beat.visualIntent,
      shotRecipeId: beat.shotRecipeId,
      props: beat.props,
      durationIntent: {
        target: audioMatch ? Number((audioMatch.durationSeconds + 0.35).toFixed(2)) : (beat.durationSeconds || 3.5),
        min: 1.0,
        max: 15.0
      }
    };
  });

  const finalVideoPath = path.join(outputArtifactsDir, dataset.outputFilename);

  // 4. Compile LocalRenderIntent
  const localIntent = pipeline.compileLocalRenderIntent({
    templateDef,
    scenePlans,
    sceneAudioArtifacts,
    jobId: dataset.sampleId,
    outputPath: finalVideoPath
  });

  const plannedTotalDuration = localIntent.scenes.reduce((acc, s) => acc + s.duration_seconds, 0);
  console.log(`[4] Total planned video duration: ${plannedTotalDuration.toFixed(2)}s (Must be <= 145.0s ceiling)`);
  if (plannedTotalDuration > 145.0) {
    throw new Error(`Planned duration ${plannedTotalDuration}s exceeds 145.0s Shorts ceiling!`);
  }

  // 5. Render via LocalRenderAdapter
  console.log(`[5] Rendering ${dataset.category} video via LocalRenderAdapter...`);
  const t0 = Date.now();
  const receipt = await renderAdapter.render(localIntent, dataset.sampleId, (msg) => {
    console.log(`  [RENDER_PROGRESS] ${msg}`);
  });
  const renderTimeSec = (Date.now() - t0) / 1000;
  console.log(`[6] Render completed in ${renderTimeSec.toFixed(2)}s!`);

  // 6. Verify via VerificationEngine
  console.log(`[7] Running VerificationEngine F07 acceptance gates...`);
  const f07Report = await VerificationEngine.auditMediaArtifact({
    jobId: dataset.sampleId,
    videoUrl: finalVideoPath,
    durationSeconds: receipt.duration_seconds
  });

  if (!f07Report.passed) {
    throw new Error(`F07 Verification Failed: ${JSON.stringify(f07Report.failures)}`);
  }
  console.log(`[8] F07 Quality Gate: PASS (Score: ${f07Report.score}/100, Duration: ${receipt.duration_seconds.toFixed(2)}s, Size: ${(receipt.validation.file_size_bytes / (1024*1024)).toFixed(2)}MB)`);

  // 7. Extract 12 keyframes and generate visual contact sheet
  console.log(`[9] Extracting 12 keyframes for contact sheet...`);
  const framesDir = path.join(outputArtifactsDir, `frames_${dataset.category.toLowerCase()}`);
  fs.mkdirSync(framesDir, { recursive: true });

  // Clean old frames
  for (const f of fs.readdirSync(framesDir)) {
    fs.unlinkSync(path.join(framesDir, f));
  }

  // Extract keyframes across the 120s video:
  // Hook (2s), Q1 Question (8s), Q1 Countdown (12s), Q1 Reveal (18s),
  // Q2 Reveal (36s), Q3 Reveal (54s), Q4 Reveal (72s), Q5 Reveal (90s),
  // Q6 Question (100s), Q6 Countdown (105s), Q6 Reveal (112s), Outro CTA (plannedTotalDuration - 2s)
  const timestamps = [
    2.0, 8.0, 12.0, 18.0,
    36.0, 54.0, 72.0, 90.0,
    100.0, 105.0, 112.0, Math.max(10.0, plannedTotalDuration - 2.0)
  ];

  for (let idx = 0; idx < timestamps.length; idx++) {
    const ts = timestamps[idx];
    const frameOut = path.join(framesDir, `frame_${String(idx + 1).padStart(2, '0')}.png`);
    execFileSync('ffmpeg', [
      '-y',
      '-ss', ts.toFixed(2),
      '-i', finalVideoPath,
      '-vframes', '1',
      '-q:v', '2',
      frameOut
    ], { stdio: 'ignore' });
  }

  const contactSheetPath = path.join(outputArtifactsDir, dataset.contactSheetFilename);
  console.log(`[10] Generating contact sheet: ${contactSheetPath}...`);
  execFileSync('python', [
    'tools/create_contact_sheet.py',
    framesDir,
    contactSheetPath,
    `SHORTFORGE QUIZSHOW V1.2 — ${dataset.category.toUpperCase()} (6Q)`,
    'Canonical Universal Template (quiz.universal.glass.v1) • 1080x1920 (9:16) • WCAG AA Verified'
  ], { stdio: 'inherit' });

  return {
    videoPath: finalVideoPath,
    sha256: receipt.output_sha256,
    duration: receipt.duration_seconds,
    fileSize: receipt.validation.file_size_bytes,
    contactSheetPath
  };
}

async function main() {
  const outputArtifactsDir = path.resolve(process.cwd(), 'artifacts', 'quizshow-v1.2');
  fs.mkdirSync(outputArtifactsDir, { recursive: true });

  console.log('=============================================================================');
  console.log(' SHORTFORGE QUIZSHOW V1.2 — UNIVERSAL QUIZ CONTENT ENGINE QUALIFICATION');
  console.log(' Canonical Template: quiz.universal.glass.v1');
  console.log(' Samples: Geography (6Q) & Science (6Q)');
  console.log('=============================================================================');

  // Render Sample A: Geography
  const geoReceipt = await renderDataset(GEOGRAPHY_DATASET, outputArtifactsDir);

  // Render Sample B: Science
  const sciReceipt = await renderDataset(SCIENCE_DATASET, outputArtifactsDir);

  // Write Manifest
  const manifest = {
    version: '1.2',
    canonicalTemplateId: 'quiz.universal.glass.v1',
    aliasTemplateId: 'quiz.quizshow.v1',
    timestamp: new Date().toISOString(),
    samples: [
      {
        category: 'Geography',
        topic: GEOGRAPHY_DATASET.topic,
        questionCount: 6,
        beats: 20,
        videoPath: geoReceipt.videoPath,
        sha256: geoReceipt.sha256,
        durationSeconds: geoReceipt.duration,
        fileSizeBytes: geoReceipt.fileSize,
        contactSheetPath: geoReceipt.contactSheetPath
      },
      {
        category: 'Science',
        topic: SCIENCE_DATASET.topic,
        questionCount: 6,
        beats: 20,
        videoPath: sciReceipt.videoPath,
        sha256: sciReceipt.sha256,
        durationSeconds: sciReceipt.duration,
        fileSizeBytes: sciReceipt.fileSize,
        contactSheetPath: sciReceipt.contactSheetPath
      }
    ]
  };

  const manifestPath = path.join(outputArtifactsDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nAll v1.2 samples rendered successfully! Manifest written to: ${manifestPath}`);
}

main().catch((err) => {
  console.error('\n[FATAL_ERROR]', err);
  process.exit(1);
});
