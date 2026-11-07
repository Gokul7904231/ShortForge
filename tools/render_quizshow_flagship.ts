import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TemplateRegistry } from '../apps/web/lib/templates/registry/TemplateRegistry';
import { TemplateProductionPipeline, ScenePlan } from '../apps/web/factoryos/core/templates/TemplateProductionPipeline';
import { LocalRenderAdapter } from '../apps/web/factoryos/core/render/LocalRenderAdapter';
import { VerificationEngine } from '../apps/web/factoryos/core/verification/VerificationEngine';

async function main() {
  console.log('=============================================================================');
  console.log(' SHORTFORGE QUIZSHOW V1.1 — PRODUCTION REPAIR & FLAGSHIP RENDERING MISSION');
  console.log('=============================================================================');

  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();
  const renderAdapter = LocalRenderAdapter.getInstance();

  const templateDef = registry.getTemplate('quiz.quizshow.v1');
  if (!templateDef) {
    throw new Error('Template quiz.quizshow.v1 not found in registry!');
  }
  console.log(`[1] Loaded Template: ${templateDef.identity.name} (${templateDef.identity.id})`);

  // 8 Questions covering all 4 core subjects: Science, Geography, History, and AI (2 each)
  const universal8Questions = [
    // 1. Science / Astronomy
    {
      question: 'Which planet in our solar system has the shortest day?',
      options: ['Jupiter', 'Venus', 'Mars', 'Mercury'],
      answerIndex: 0,
      answer: 'Jupiter',
      explanation: 'Jupiter rotates once every 9.9 hours, giving it the shortest day of any planet in our Solar System.',
      provenance: { source: 'NASA Planetary Fact Sheet' },
      image_path: 'assets/quiz/science/jupiter_rotation.png'
    },
    // 2. Geography / Oceanic
    {
      question: 'Which oceanic abyss is the deepest measured point on planet Earth?',
      options: ['Mariana Trench', 'Tonga Trench', 'Puerto Rico Trench', 'Java Trench'],
      answerIndex: 0,
      answer: 'Mariana Trench',
      explanation: 'Challenger Deep inside the Mariana Trench plunges approximately 10,994 meters below sea level.',
      provenance: { source: 'NOAA Bathymetric Registry' },
      image_path: 'assets/quiz/geography/mariana_trench.png'
    },
    // 3. History / Antiquity
    {
      question: 'Which ancient civilization built the colossal Great Pyramid of Giza?',
      options: ['Ancient Egypt', 'Babylonian Empire', 'Persian Empire', 'Mycenaean Greece'],
      answerIndex: 0,
      answer: 'Ancient Egypt',
      explanation: 'Pharaoh Khufu commissioned the Great Pyramid during Egypt Old Kingdom era around 2560 BCE.',
      provenance: { source: 'Oxford History of Ancient Egypt' },
      image_path: 'assets/quiz/history/pyramid_giza.png'
    },
    // 4. Artificial Intelligence / Deep Learning
    {
      question: 'Which neural network architecture introduced the self-attention mechanism in 2017?',
      options: ['Transformer', 'Recurrent Neural Net', 'Convolutional Network', 'Boltzmann Machine'],
      answerIndex: 0,
      answer: 'Transformer',
      explanation: 'The seminal Attention Is All You Need paper introduced the Transformer, powering all modern LLMs.',
      provenance: { source: 'Vaswani et al. NeurIPS 2017' },
      image_path: 'assets/quiz/ai/transformer_attention.png'
    },
    // 5. Science / Fundamental Physics
    {
      question: 'What is the approximate speed of light propagating through a physical vacuum?',
      options: ['300,000 km/s', '150,000 km/s', '30,000 km/s', '3,000 km/s'],
      answerIndex: 0,
      answer: '300,000 km/s',
      explanation: 'Light in a vacuum travels at an immutable universal constant of precisely 299,792,458 meters per second.',
      provenance: { source: 'NIST Physical Constants Reference' },
      image_path: 'assets/quiz/science/speed_of_light.png'
    },
    // 6. Geography / Hydrography
    {
      question: 'Which country contains the largest number of natural freshwater lakes in the world?',
      options: ['Canada', 'Russia', 'United States', 'Finland'],
      answerIndex: 0,
      answer: 'Canada',
      explanation: 'Canada contains over two million lakes, holding more natural lake area than the rest of the world combined.',
      provenance: { source: 'Atlas of Canada / Physical Geography' },
      image_path: 'assets/quiz/geography/freshwater_lakes.png'
    },
    // 7. History / Spaceflight
    {
      question: 'In which pivotal year did Apollo 11 first land human astronauts on the Moon?',
      options: ['1969', '1965', '1971', '1973'],
      answerIndex: 0,
      answer: '1969',
      explanation: 'Commander Neil Armstrong stepped onto the lunar surface at Tranquility Base on July 20, 1969.',
      provenance: { source: 'NASA Apollo 11 Mission Telemetry Log' },
      image_path: 'assets/quiz/history/apollo_11_lunar.png'
    },
    // 8. Artificial Intelligence / Compute Hardware
    {
      question: 'What does the G stand for in GPU computing processors essential for AI acceleration?',
      options: ['Graphics', 'General', 'Global', 'Grid'],
      answerIndex: 0,
      answer: 'Graphics',
      explanation: 'A Graphics Processing Unit parallel architecture makes it uniquely suited for high-throughput tensor math.',
      provenance: { source: 'IEEE Computer Architecture Proceedings' },
      image_path: 'assets/quiz/ai/gpu_architecture.png'
    }
  ];

  console.log('[2] Generating ScriptIR for 8 questions...');
  const scriptIR = await pipeline.generateTemplateScript({
    templateDef,
    topic: 'Ultimate Knowledge Challenge',
    userInputs: {
      questions: universal8Questions
    }
  });

  console.log(`[3] Generated ScriptIR with ${scriptIR.beats.length} beats:`);
  const audioDir = path.resolve(process.cwd(), 'data', 'audio', 'quizshow_8q_v11');
  fs.mkdirSync(audioDir, { recursive: true });

  const beatsForSynthesis = scriptIR.beats.map((b, i) => ({
    sceneId: `scene_${String(i + 1).padStart(2, '0')}_${b.beatId}`,
    beatId: b.beatId,
    narration: b.narration
  }));

  const beatsJsonPath = path.join(audioDir, 'beats.json');
  fs.writeFileSync(beatsJsonPath, JSON.stringify(beatsForSynthesis, null, 2), 'utf-8');

  console.log('[4] Synthesizing 26 physical narration tracks with native speech synthesis...');
  execFileSync('python', ['tools/synthesize_quizshow_audio.py', beatsJsonPath, audioDir], { stdio: 'inherit' });

  const manifestPath = path.join(audioDir, 'audio_manifest.json');
  const sceneAudioArtifacts: Array<{ sceneId: string; localPath: string; durationSeconds: number }> = JSON.parse(
    fs.readFileSync(manifestPath, 'utf-8')
  );

  console.log(`[5] Loaded ${sceneAudioArtifacts.length} physical audio artifacts.`);

  // Construct scene plans mapping directly to physical audio
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

  const outputArtifactsDir = path.resolve(process.cwd(), 'artifacts', 'quizshow-v1.1');
  fs.mkdirSync(outputArtifactsDir, { recursive: true });
  const finalVideoPath = path.join(outputArtifactsDir, 'quizshow-v1.1-universal-8q.mp4');

  console.log(`[6] Compiling LocalRenderIntent (Target: ${finalVideoPath})...`);
  const localIntent = pipeline.compileLocalRenderIntent({
    templateDef,
    scenePlans,
    sceneAudioArtifacts,
    jobId: 'SF-QUIZSHOW-V11-UNIVERSAL-8Q',
    outputPath: finalVideoPath
  });

  const rawSum = localIntent.scenes.reduce((acc, s) => acc + s.duration_seconds, 0);
  console.log(`[7] Compiled ${localIntent.scenes.length} scenes. Total planned duration: ${rawSum.toFixed(2)}s (Production Ceiling: 175.0s)`);

  console.log('[8] Dispatching render to LocalRenderAdapter (factoryos-render)...');
  const t0 = Date.now();
  const receipt = await renderAdapter.render(localIntent, 'SF-QUIZSHOW-V11-UNIVERSAL-8Q', (msg) => {
    console.log(`  [RENDER_PROGRESS] ${msg}`);
  });
  const renderTimeSec = (Date.now() - t0) / 1000;
  console.log(`[9] Physical render completed in ${renderTimeSec.toFixed(2)} seconds!`);

  console.log('-----------------------------------------------------------------------------');
  console.log(' RENDER RECEIPT SUMMARY');
  console.log('-----------------------------------------------------------------------------');
  console.log(`Output Path:    ${receipt.output_path}`);
  console.log(`Output SHA-256: ${receipt.output_sha256}`);
  console.log(`Resolution:     ${receipt.width} × ${receipt.height}`);
  console.log(`Duration:       ${receipt.duration_seconds.toFixed(2)}s`);
  console.log(`Total Frames:   ${receipt.total_frames} @ ${receipt.fps} fps`);
  console.log(`File Size:      ${(receipt.validation.file_size_bytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Valid Container: ${receipt.validation.is_valid}`);

  // FFprobe physical verification
  console.log('[10] Running forensic FFprobe verification...');
  const probeRaw = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,channels,sample_rate',
    '-of', 'json',
    finalVideoPath
  ], { encoding: 'utf-8' });

  const probe = JSON.parse(probeRaw);
  console.log('FFprobe streams:', JSON.stringify(probe.streams, null, 2));

  // Extract 6 representative visual QA frames
  console.log('[11] Extracting representative QA frames across the 8-question cycle...');
  const framesDir = path.join(outputArtifactsDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const frameSnapshots = [
    { name: 'frame_01_intro_hook.png', time: '2.0', label: '1. Challenge Intro Hook' },
    { name: 'frame_02_q1_presentation.png', time: '6.0', label: '2. Q01 Jupiter Prompt' },
    { name: 'frame_03_q1_countdown.png', time: '11.5', label: '3. Q01 Countdown (5s)' },
    { name: 'frame_04_q1_reveal_jupiter.png', time: '15.5', label: '4. Q01 Answer Reveal (White Text)' },
    { name: 'frame_05_q2_mariana_trench.png', time: '23.0', label: '5. Q02 Mariana Trench' },
    { name: 'frame_06_q3_great_pyramid.png', time: '41.0', label: '6. Q03 Pyramids of Giza' },
    { name: 'frame_07_q4_transformer_ai.png', time: '59.0', label: '7. Q04 Transformer Attention' },
    { name: 'frame_08_q5_speed_of_light.png', time: '77.0', label: '8. Q05 Speed of Light' },
    { name: 'frame_09_q6_freshwater_lakes.png', time: '96.0', label: '9. Q06 Canada Lakes' },
    { name: 'frame_10_q7_apollo_11_moon.png', time: '114.0', label: '10. Q07 Apollo 11 Landing' },
    { name: 'frame_11_q8_gpu_architecture.png', time: '133.0', label: '11. Q08 GPU Die Architecture' },
    { name: 'frame_12_outro_scoreboard_cta.png', time: `${Math.max(1.0, receipt.duration_seconds - 2.0).toFixed(1)}`, label: '12. Final Scoreboard & CTA' }
  ];

  for (const snap of frameSnapshots) {
    const snapPath = path.join(framesDir, snap.name);
    execFileSync('ffmpeg', [
      '-y',
      '-ss', snap.time,
      '-i', finalVideoPath,
      '-vframes', '1',
      '-q:v', '2',
      snapPath
    ]);
    console.log(`  Extracted: ${snap.label} -> ${snapPath}`);
  }

  // Create Visual Contact Sheet via Python
  console.log('[12] Generating QA visual contact sheet...');
  execFileSync('python', ['tools/create_contact_sheet.py', framesDir, path.join(outputArtifactsDir, 'quizshow-v1.1-contact-sheet.png')], { stdio: 'inherit' });

  // F07 Forensic QA & Gate Audit
  console.log('[13] Running F07 VerificationEngine forensic audit...');
  const f07Report = await VerificationEngine.auditMediaArtifact({
    jobId: 'SF-QUIZSHOW-V11-UNIVERSAL-8Q',
    videoUrl: finalVideoPath,
    durationSeconds: receipt.duration_seconds
  });

  console.log('F07 Verification Result:');
  console.log(`  Passed:  ${f07Report.passed}`);
  console.log(`  Score:   ${f07Report.score}/100`);
  console.log(`  Status:  ${f07Report.status}`);
  console.log(`  Failures: ${f07Report.failures.length > 0 ? f07Report.failures.join('; ') : 'None'}`);

  // Save full manifest
  const manifest = {
    jobId: 'SF-QUIZSHOW-V11-UNIVERSAL-8Q',
    template: 'quiz.quizshow.v1',
    renderedAt: new Date().toISOString(),
    videoPath: finalVideoPath,
    sha256: receipt.output_sha256,
    durationSeconds: receipt.duration_seconds,
    fileSizeBytes: receipt.validation.file_size_bytes,
    width: receipt.width,
    height: receipt.height,
    fps: receipt.fps,
    renderTimeSeconds: renderTimeSec,
    f07Report: {
      passed: f07Report.passed,
      score: f07Report.score,
      status: f07Report.status,
      metrics: f07Report.metrics
    },
    frames: frameSnapshots.map(s => ({ ...s, path: path.join(framesDir, s.name) }))
  };

  fs.writeFileSync(path.join(outputArtifactsDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[14] Mission complete! Manifest saved to ${path.join(outputArtifactsDir, 'manifest.json')}`);
}

main().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});

