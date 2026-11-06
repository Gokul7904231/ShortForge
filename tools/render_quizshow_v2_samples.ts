import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TemplateRegistry } from '../apps/web/lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline, ScenePlan } from '../apps/web/factoryos/core/templates/TemplateProductionPipeline';
import { TemplateCrafter } from '../apps/web/factoryos/core/templates/TemplateCrafter';
import { NarrationTimingLedger } from '../apps/web/factoryos/core/voice/NarrationCrafter';
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
  sampleId: 'SF-QUIZ-V2-GEO-6Q',
  outputFilename: 'quiz-v2-geography-6q.mp4',
  contactSheetFilename: 'geography-contact-sheet.png',
  questions: [
    {
      question: 'Which oceanic abyss is the deepest measured point on planet Earth?',
      options: ['Mariana Trench', 'Tonga Trench', 'Puerto Rico Trench', 'Java Trench'],
      answerIndex: 0,
      answer: 'Mariana Trench',
      explanation: 'Challenger Deep inside the Mariana Trench plunges approximately 10,994 meters below sea level.',
      provenance: { source: 'NOAA Bathymetric Registry' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/mariana_trench.png'
    },
    {
      question: 'Which country contains the largest number of natural freshwater lakes in the world?',
      options: ['Canada', 'Russia', 'United States', 'Finland'],
      answerIndex: 0,
      answer: 'Canada',
      explanation: 'Canada contains over two million lakes, holding more natural lake area than the rest of the world combined.',
      provenance: { source: 'Atlas of Canada / Physical Geography' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/freshwater_lakes.png'
    },
    {
      question: 'What is the highest mountain peak above sea level on Earth?',
      options: ['Mount Everest', 'K2', 'Kangchenjunga', 'Lhotse'],
      answerIndex: 0,
      answer: 'Mount Everest',
      explanation: 'Mount Everest in the Himalayas reaches an official elevation of 8,848 meters above sea level.',
      provenance: { source: 'Survey of Nepal & China' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/mount_everest_himalayas.png'
    },
    {
      question: 'Which river basin contains the largest tropical rainforest in the world?',
      options: ['Amazon Basin', 'Congo Basin', 'Mekong Basin', 'Ganges Basin'],
      answerIndex: 0,
      answer: 'Amazon Basin',
      explanation: 'The Amazon rainforest covers over 5.5 million square kilometers across South America.',
      provenance: { source: 'WWF Biome Survey' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/amazon_rainforest_basin.png'
    },
    {
      question: 'What is the largest subtropical hot desert on planet Earth?',
      options: ['Sahara Desert', 'Arabian Desert', 'Gobi Desert', 'Kalahari Desert'],
      answerIndex: 0,
      answer: 'Sahara Desert',
      explanation: 'The Sahara spans roughly 9.2 million square kilometers across Northern Africa.',
      provenance: { source: 'USGS Global Deserts Registry' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/sahara_desert_dunes.png'
    },
    {
      question: 'Which metropolitan area is the most populous megacity in the world?',
      options: ['Tokyo', 'Delhi', 'Shanghai', 'Sao Paulo'],
      answerIndex: 0,
      answer: 'Tokyo',
      explanation: 'Greater Tokyo is home to approximately 37 million residents across its metropolitan region.',
      provenance: { source: 'UN World Urbanization Prospects' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/tokyo_megacity_urban.png'
    }
  ]
};

const SCIENCE_DATASET: QuizDataset = {
  category: 'Science',
  topic: 'Cosmic Science & Physics Challenge',
  themeToken: 'QUIZ_SCIENCE',
  accentColor: [139, 92, 246], // Deep Cosmic Violet
  sampleId: 'SF-QUIZ-V2-SCI-6Q',
  outputFilename: 'quiz-v2-science-6q.mp4',
  contactSheetFilename: 'science-contact-sheet.png',
  questions: [
    {
      question: 'Which planet in our solar system has the shortest day?',
      options: ['Jupiter', 'Venus', 'Mars', 'Mercury'],
      answerIndex: 0,
      answer: 'Jupiter',
      explanation: 'Jupiter rotates once every 9.9 hours, giving it the shortest day in our Solar System.',
      provenance: { source: 'NASA Planetary Fact Sheet' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/jupiter_rotation.png'
    },
    {
      question: 'What is the approximate speed of light propagating through a physical vacuum?',
      options: ['300,000 km/s', '150,000 km/s', '30,000 km/s', '3,000 km/s'],
      answerIndex: 0,
      answer: '300,000 km/s',
      explanation: 'Light in a vacuum travels at roughly 300,000 kilometers per second.',
      provenance: { source: 'NIST Physical Constants Reference' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/speed_of_light.png'
    },
    {
      question: 'Which moon is the largest natural satellite in our Solar System?',
      options: ['Ganymede', 'Titan', 'Callisto', 'Io'],
      answerIndex: 0,
      answer: 'Ganymede',
      explanation: 'Ganymede orbits Jupiter and is even larger in diameter than Mercury.',
      provenance: { source: 'ESA Juice Mission Data' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/ganymede_internal_ocean.png'
    },
    {
      question: 'Why can acoustic sound waves not travel through the vacuum of outer space?',
      options: ['No Medium', 'Too Cold', 'Zero Gravity', 'Solar Radiation'],
      answerIndex: 0,
      answer: 'No Medium',
      explanation: 'Sound is a mechanical wave requiring atoms or molecules to propagate.',
      provenance: { source: 'Acoustical Society of America' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/vacuum_sound_wave.png'
    },
    {
      question: 'Which planet is the hottest in our Solar System due to runaway greenhouse effect?',
      options: ['Venus', 'Mercury', 'Mars', 'Jupiter'],
      answerIndex: 0,
      answer: 'Venus',
      explanation: 'Venus traps extreme heat at an average 465 degrees Celsius.',
      provenance: { source: 'NASA Venus Fact Sheet' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/venus_atmosphere_diagram.png'
    },
    {
      question: 'What molecular structure forms the double helix of genetic code in living cells?',
      options: ['DNA', 'RNA', 'Enzyme', 'Lipid'],
      answerIndex: 0,
      answer: 'DNA',
      explanation: 'DNA forms the famous double-helix structure discovered by Watson, Crick, and Franklin.',
      provenance: { source: 'Nature Publishing Archives' },
      image_path: 'data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/dna_double_helix_structure.png'
    }
  ]
};

function getWorkspaceRoot(): string {
  let root = process.cwd();
  while (root !== path.dirname(root)) {
    if (fs.existsSync(path.join(root, 'tools', 'synthesize_quizshow_v2_audio.py'))) {
      return root;
    }
    root = path.dirname(root);
  }
  return process.cwd();
}

async function renderDataset(dataset: QuizDataset, outputArtifactsDir: string): Promise<{
  videoPath: string;
  sha256: string;
  duration: number;
  fileSize: number;
  contactSheetPath: string;
}> {
  const workspaceRoot = getWorkspaceRoot();
  console.log('=============================================================================');
  console.log(` RENDERING QUIZ TEMPLATE V2 SAMPLE: ${dataset.category.toUpperCase()}`);
  console.log(` Canonical Template: quiz.universal.cinematic.v2 | Ceiling: 180.0s`);
  console.log(` Voice: Kore (Soft Female) | Backgrounds: 6 Distinct Backblaze B2 Assets`);
  console.log('=============================================================================');

  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();
  const renderAdapter = LocalRenderAdapter.getInstance();

  const templateDef = registry.getTemplate('quiz.universal.cinematic.v2');
  if (!templateDef) {
    throw new Error('Canonical template quiz.universal.cinematic.v2 not found in registry!');
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

  console.log(`[1] Generated ScriptIR with ${scriptIR.beats.length} beats (Expected 50: 1 Hook + 6 questions x 8 + 1 Outro).`);
  if (scriptIR.beats.length !== 50) {
    throw new Error(`Invalid beat count: ${scriptIR.beats.length}, expected 50 (question, options A-D, think, answer, explanation per question)!`);
  }

  // 2. Synthesize Audio with soft female Kore persona
  const audioDir = path.resolve(workspaceRoot, 'data', 'audio', `quiz_v2_${dataset.category.toLowerCase()}`);
  fs.mkdirSync(audioDir, { recursive: true });

  const beatsForSynthesis = scriptIR.beats
    .map((b, i) => ({
      sceneId: `scene_${String(i + 1).padStart(2, '0')}_${b.beatId}`,
      beatId: b.beatId,
      narration: b.narration
    }))
    .filter((b) => b.narration.trim().length > 0);

  const beatsJsonPath = path.join(audioDir, 'beats.json');
  fs.writeFileSync(beatsJsonPath, JSON.stringify(beatsForSynthesis, null, 2), 'utf-8');

  console.log(`[2] Synthesizing ${beatsForSynthesis.length} narration tracks for ${dataset.category} using soft female Kore voice...`);
  execFileSync('python', [path.join(workspaceRoot, 'tools', 'synthesize_quizshow_v2_audio.py'), beatsJsonPath, audioDir], { stdio: 'inherit' });

  const manifestPath = path.join(audioDir, 'audio_manifest.json');
  const sceneAudioArtifacts: Array<{ sceneId: string; localPath: string; durationSeconds: number }> = JSON.parse(
    fs.readFileSync(manifestPath, 'utf-8')
  );

  const totalAudioDuration = sceneAudioArtifacts.reduce((sum, a) => sum + a.durationSeconds, 0);
  console.log(`[3] Synthesized ${sceneAudioArtifacts.length} audio tracks. Total measured speech duration: ${totalAudioDuration.toFixed(2)}s`);

  const ledgerPath = path.join(audioDir, 'narration_timing_ledger.json');
  const timingLedger: NarrationTimingLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
  const finalVideoPath = path.join(outputArtifactsDir, dataset.outputFilename);

  // 3. Compile LocalRenderIntent via High-Intelligence Template Crafter (F05)
  console.log(`[4] Compiling audio-locked LocalRenderIntent via TemplateCrafter (F05)...`);
  const localIntent = TemplateCrafter.getInstance().compileAudioLockedIntent({
    templateDef,
    jobId: dataset.sampleId,
    title: `${dataset.topic} Universal Quiz`,
    outputPath: finalVideoPath,
    topic: dataset.topic,
    categoryBadge: `${dataset.category.toUpperCase()} • QUIZ`,
    accentColor: dataset.accentColor,
    themeToken: dataset.themeToken,
    questions: dataset.questions,
    timingLedger
  });

  const plannedTotalDuration = localIntent.scenes.reduce((acc, s) => acc + s.duration_seconds, 0);
  console.log(`[4] Total planned video duration: ${plannedTotalDuration.toFixed(2)}s (Must be <= 180.0s ceiling)`);
  if (plannedTotalDuration > 180.0) {
    throw new Error(`Planned duration ${plannedTotalDuration}s exceeds 180.0s Shorts ceiling!`);
  }

  const renderIntentPath = path.join(outputArtifactsDir, `render-intent-${dataset.category.toLowerCase()}.json`);
  fs.writeFileSync(renderIntentPath, JSON.stringify(localIntent, null, 2), 'utf-8');
  console.log(`[4b] Wrote render intent for timing verification: ${renderIntentPath}`);

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
  const b2ImageAbsolutePaths = dataset.questions.map((q) => path.resolve(process.cwd(), q.image_path));
  const f07Report = await VerificationEngine.auditMediaArtifact({
    jobId: dataset.sampleId,
    videoUrl: finalVideoPath,
    durationSeconds: receipt.duration_seconds,
    b2Images: b2ImageAbsolutePaths,
    lastSpokenWordEndMs: Math.round(totalAudioDuration * 1000),
    scenes: localIntent.scenes
  });

  if (!f07Report.passed) {
    throw new Error(`F07 Verification Failed: ${JSON.stringify(f07Report.failures)}`);
  }
  console.log(`[8] F07 Quality Gate: PASS (Score: ${f07Report.score}/100, Duration: ${receipt.duration_seconds.toFixed(2)}s, Size: ${(receipt.validation.file_size_bytes / (1024*1024)).toFixed(2)}MB)`);

  // 7. Extract keyframes and generate visual contact sheet
  console.log(`[9] Extracting keyframes for contact sheet and verification proof...`);
  const framesDir = path.join(outputArtifactsDir, `frames_${dataset.category.toLowerCase()}`);
  fs.mkdirSync(framesDir, { recursive: true });

  for (const f of fs.readdirSync(framesDir)) {
    fs.unlinkSync(path.join(framesDir, f));
  }

  // Key verification proof moments:
  // 1. Hook frame (t = 1.0s)
  // 2. Q1 think / countdown frame
  // 3. Q1 reveal emerald highlight frame
  // 4. Q1 explanation drawer frame
  // 5. Outro CTA frame (0.5s before EOF)
  // Plus moments across the 6 questions
  const timestamps: number[] = [1.0];
  let sceneCursor = 0;
  for (const scene of localIntent.scenes) {
    const props = scene.shots?.[0]?.props || {};
    if (props.thinkGate === true) timestamps.push(Number((sceneCursor + 2.5).toFixed(2)));
    if (scene.scene_id.includes('_reveal')) timestamps.push(Number((sceneCursor + 0.8).toFixed(2)));
    if (scene.scene_id.includes('_explanation')) timestamps.push(Number((sceneCursor + 1.2).toFixed(2)));
    sceneCursor += scene.duration_seconds;
  }
  timestamps.push(Number(Math.max(1.0, receipt.duration_seconds - 0.5).toFixed(2)));

  // Extract proof frames
  const proofFramesDir = path.join(outputArtifactsDir, `proof_${dataset.category.toLowerCase()}`);
  fs.mkdirSync(proofFramesDir, { recursive: true });

  const proofTimestamps: Record<string, number> = {
    'hook_t1s': 1.0,
    'countdown': localIntent.scenes.findIndex(s => s.shots?.[0]?.props?.thinkGate === true) >= 0 ? 12.0 : 5.0,
    'reveal_emerald': 16.5,
    'explanation_drawer': 19.0,
    'outro_cta': Number(Math.max(1.0, receipt.duration_seconds - 0.5).toFixed(2))
  };

  for (const [proofName, pts] of Object.entries(proofTimestamps)) {
    const proofOut = path.join(proofFramesDir, `proof_${proofName}.png`);
    execFileSync('ffmpeg', [
      '-y',
      '-ss', pts.toFixed(2),
      '-i', finalVideoPath,
      '-vframes', '1',
      '-q:v', '2',
      proofOut
    ], { stdio: 'ignore' });
  }

  // Extract contact sheet frames
  const contactTimestamps = timestamps.slice(0, 12);
  for (let idx = 0; idx < contactTimestamps.length; idx++) {
    const ts = contactTimestamps[idx];
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
    path.join(workspaceRoot, 'tools', 'create_contact_sheet.py'),
    framesDir,
    contactSheetPath,
    `SHORTFORGE QUIZ TEMPLATE V2 — ${dataset.category.toUpperCase()} (6Q)`,
    'quiz.universal.cinematic.v2 • Soft Female Kore Narration • 6 B2 Backdrops • WCAG AA'
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
  const workspaceRoot = getWorkspaceRoot();
  const outputArtifactsDir = path.resolve(workspaceRoot, 'artifacts', 'quiz-v2');
  fs.mkdirSync(outputArtifactsDir, { recursive: true });

  const requested = (process.argv[2] || 'all').toLowerCase();
  if (!['all', 'geography', 'science'].includes(requested)) {
    throw new Error(`Unknown dataset '${requested}'. Use: geography | science | all`);
  }

  console.log('=============================================================================');
  console.log(' SHORTFORGE QUIZ TEMPLATE V2 — FLAGSHIP PRODUCTION RUN');
  console.log(' Canonical Template: quiz.universal.cinematic.v2');
  console.log(' Narrator: Kore (Soft Female) | Assets: 6 Distinct Backblaze B2 Backgrounds');
  console.log(` Dataset selection: ${requested}`);
  console.log('=============================================================================');

  const geoReceipt = requested === 'science' ? null : await renderDataset(GEOGRAPHY_DATASET, outputArtifactsDir);
  const sciReceipt = requested === 'geography' ? null : await renderDataset(SCIENCE_DATASET, outputArtifactsDir);

  const existingManifestPath = path.join(outputArtifactsDir, 'manifest.json');
  const existing = fs.existsSync(existingManifestPath)
    ? JSON.parse(fs.readFileSync(existingManifestPath, 'utf-8'))
    : null;
  const previousSamples = Array.isArray(existing?.samples) ? existing.samples : [];

  const sampleFor = (dataset: QuizDataset, receipt: NonNullable<typeof geoReceipt>) => ({
    category: dataset.category,
    topic: dataset.topic,
    questionCount: 6,
    beats: 50,
    videoPath: receipt.videoPath,
    sha256: receipt.sha256,
    durationSeconds: receipt.duration,
    fileSizeBytes: receipt.fileSize,
    contactSheetPath: receipt.contactSheetPath,
    b2Assets: dataset.questions.map(q => q.image_path)
  });

  // Keep one entry per category so re-rendering one dataset never leaves a stale duplicate.
  const mergedSamples = new Map<string, any>(previousSamples.map((s: any) => [s.category, s]));
  if (geoReceipt) mergedSamples.set(GEOGRAPHY_DATASET.category, sampleFor(GEOGRAPHY_DATASET, geoReceipt));
  if (sciReceipt) mergedSamples.set(SCIENCE_DATASET.category, sampleFor(SCIENCE_DATASET, sciReceipt));

  const manifest = {
    version: '2.0',
    canonicalTemplateId: 'quiz.universal.cinematic.v2',
    v1BaselineTemplateId: 'quiz.universal.glass.v1',
    narrator: 'Kore profile (Windows SAPI Zira female + warmth filter chain)',
    storageTier: 'Backblaze B2 (shortsfactory-assets/quiz-v2/)',
    timingContract: 'Per question: question -> options A-D narration -> 150-frame silent think gate -> answer visual/narration -> explanation narration',
    timestamp: new Date().toISOString(),
    samples: Array.from(mergedSamples.values())
  };

  const manifestPath = path.join(outputArtifactsDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\nQuiz V2 sample(s) rendered successfully! Manifest written to: ${manifestPath}`);
}

main().catch((err) => {
  console.error('\n[FATAL_ERROR]', err);
  process.exit(1);
});
