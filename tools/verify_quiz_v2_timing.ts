/**
 * Physical timing gate for Quiz V2.
 *
 * Verifies, from the actual rendered MP4 plus the render intent and measured audio
 * manifest, that every question is ordered:
 *   question -> options A-D narration -> 150-frame silent think gate -> answer -> explanation
 *
 * Usage:
 *   npx tsx tools/verify_quiz_v2_timing.ts [intent.json] [audio_manifest.json] [video.mp4]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const INTENT_PATH = process.argv[2] || path.join(ROOT, 'artifacts/quiz-v2/render-intent-geography.json');
const MANIFEST_PATH = process.argv[3] || path.join(ROOT, 'data/audio/quiz_v2_geography/audio_manifest.json');
const VIDEO_PATH = process.argv[4] || path.join(ROOT, 'artifacts/quiz-v2/quiz-v2-geography-6q.mp4');
const REPORT_PATH = process.argv[5] || path.join(ROOT, 'artifacts/quiz-v2/quiz-v2-geography-timing-report.json');

const FPS = 30;
const FRAME = 1 / FPS;
const GATE_SECONDS = 5.0;
const GATE_FRAMES = 150;
const SILENCE_DB = -50;

interface IntentScene {
  scene_id: string;
  duration_seconds: number;
  narration_text?: string;
  audio_track?: { audio_path: string; duration_seconds: number };
  shots?: Array<{ props?: Record<string, any> }>;
}

interface RenderIntent {
  scenes: IntentScene[];
}

interface AudioEntry {
  sceneId: string;
  localPath: string;
  durationSeconds: number;
}

const failures: string[] = [];
const checks: string[] = [];

function check(condition: boolean, message: string): void {
  if (condition) checks.push(message);
  else failures.push(message);
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf-8', windowsHide: true });
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function measureMaxVolume(start: number, duration: number): number {
  const output = run('ffmpeg', [
    '-hide_banner', '-vn', '-v', 'info',
    '-i', VIDEO_PATH,
    '-af', `atrim=start=${start.toFixed(3)}:end=${(start + duration).toFixed(3)},volumedetect`,
    '-f', 'null', '-'
  ]);
  const match = output.match(/max_volume:\s*(-?[0-9.]+|-inf)\s*dB/);
  if (!match) return Number.NEGATIVE_INFINITY;
  return match[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1]);
}

interface SilenceInterval { start: number; end: number; duration: number; }

function detectSilences(): SilenceInterval[] {
  const output = run('ffmpeg', [
    '-hide_banner', '-vn', '-v', 'info',
    '-i', VIDEO_PATH,
    '-af', `silencedetect=noise=${SILENCE_DB}dB:d=0.2`,
    '-f', 'null', '-'
  ]);
  const intervals: SilenceInterval[] = [];
  const startRe = /silence_start:\s*(-?[0-9.]+)/g;
  const endRe = /silence_end:\s*(-?[0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;
  const lines = output.split(/\r?\n/);
  let currentStart: number | null = null;
  for (const line of lines) {
    const startMatch = startRe.exec(line);
    if (startMatch) {
      currentStart = Number(startMatch[1]);
      startRe.lastIndex = 0;
    }
    const endMatch = endRe.exec(line);
    if (endMatch && currentStart !== null) {
      intervals.push({ start: currentStart, end: Number(endMatch[1]), duration: Number(endMatch[2]) });
      currentStart = null;
      endRe.lastIndex = 0;
    }
  }
  return intervals;
}

function main(): void {
  const intent: RenderIntent = JSON.parse(fs.readFileSync(INTENT_PATH, 'utf-8'));
  const manifest: AudioEntry[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const audioByScene = new Map(manifest.map((entry) => [entry.sceneId, entry]));

  const probe = JSON.parse(run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=codec_type,duration,nb_frames,width,height,sample_rate,channels',
    '-of', 'json', VIDEO_PATH
  ]) || '{}');

  const streams = probe.streams || [];
  const video = streams.find((s: any) => s.codec_type === 'video');
  const audio = streams.find((s: any) => s.codec_type === 'audio');
  const videoDuration = Number(video?.duration || probe.format?.duration || 0);
  const audioDuration = Number(audio?.duration || 0);

  check(fs.existsSync(VIDEO_PATH), `video exists: ${VIDEO_PATH}`);
  check(!!video, 'video stream present');
  check(!!audio, 'audio stream present');
  check(video?.width === 1080 && video?.height === 1920, `9:16 geometry: ${video?.width}x${video?.height}`);
  check(audio?.sample_rate === '44100' && audio?.channels === 2, `canonical audio format: 44100Hz/2ch (got ${audio?.sample_rate}/${audio?.channels})`);
  check(videoDuration >= 1 && videoDuration <= 180, `video duration within 1-180s: ${videoDuration.toFixed(3)}s`);
  check(Math.abs(videoDuration - audioDuration) <= 0.5, `A/V duration drift <= 500ms: ${(Math.abs(videoDuration - audioDuration) * 1000).toFixed(0)}ms`);

  const starts: number[] = [];
  let cursor = 0;
  for (const scene of intent.scenes) {
    starts.push(cursor);
    cursor += scene.duration_seconds;
  }

  const isThink = (scene: IntentScene) => scene.shots?.[0]?.props?.thinkGate === true;
  const thinkIndexes = intent.scenes.map((scene, i) => (isThink(scene) ? i : -1)).filter((i) => i >= 0);

  check(intent.scenes.length === 50, `scene count 50: ${intent.scenes.length}`);
  check(thinkIndexes.length === 6, `six think gates: ${thinkIndexes.length}`);
  check(manifest.length === 44, `44 measured narration tracks: ${manifest.length}`);

  const silences = detectSilences();
  const questions: any[] = [];

  for (const thinkIndex of thinkIndexes) {
    const questionScene = intent.scenes[thinkIndex - 5];
    const optionScenes = intent.scenes.slice(thinkIndex - 4, thinkIndex);
    const think = intent.scenes[thinkIndex];
    const answer = intent.scenes[thinkIndex + 1];
    const explanation = intent.scenes[thinkIndex + 2];
    const optionD = optionScenes[3];
    const answerAudio = audioByScene.get(answer.scene_id);
    const optionDAudio = audioByScene.get(optionD.scene_id);
    const questionNumber = Number((think.scene_id.match(/_q(\d+)_/) || [])[1]);

    check(
      optionScenes.every((s, i) => s.scene_id.includes(`option_${'abcd'[i]}`) && !!audioByScene.get(s.scene_id)),
      `Q${questionNumber}: options A-D each have measured narration`
    );
    check(optionD.shots?.[0]?.props?.audioTailSeconds === 0, `Q${questionNumber}: option D has zero narration tail`);
    check(isThink(think), `Q${questionNumber}: think scene flagged`);
    check(think.audio_track === undefined, `Q${questionNumber}: think scene has no narration track`);
    check(Math.abs(think.duration_seconds - GATE_SECONDS) < 1e-6, `Q${questionNumber}: think duration ${think.duration_seconds.toFixed(6)}s == 5.000000s`);
    check(Math.round(think.duration_seconds * FPS) === GATE_FRAMES, `Q${questionNumber}: think duration ${Math.round(think.duration_seconds * FPS)} frames == 150`);

    const optionDStart = starts[thinkIndex - 1];
    const optionDAudioEnd = optionDStart + (optionDAudio?.durationSeconds || 0);
    const thinkStart = starts[thinkIndex];
    const thinkEnd = thinkStart + GATE_SECONDS;
    const answerStart = starts[thinkIndex + 1];
    const explanationStart = starts[thinkIndex + 2];

    check(!!optionDAudio, `Q${questionNumber}: option D audio manifest entry present`);
    check(thinkStart >= optionDAudioEnd - 1e-6, `Q${questionNumber}: think starts after option D audio ends (${(thinkStart - optionDAudioEnd).toFixed(3)}s gap)`);
    check(thinkStart - optionDAudioEnd <= FRAME + 1e-6, `Q${questionNumber}: think starts within one frame of option D audio end`);
    check(Math.abs(answerStart - thinkEnd) < 1e-6, `Q${questionNumber}: answer scene starts exactly at think end (${answerStart.toFixed(3)}s)`);
    check(!!answerAudio && answerAudio.durationSeconds > 0, `Q${questionNumber}: answer has measured narration`);
    if (answerAudio) {
      check(explanationStart >= answerStart + answerAudio.durationSeconds - 1e-6, `Q${questionNumber}: explanation starts after answer narration ends`);
    }

    const gateVolume = measureMaxVolume(thinkStart, GATE_SECONDS);
    check(gateVolume <= SILENCE_DB, `Q${questionNumber}: think window is silent (max ${Number.isFinite(gateVolume) ? gateVolume.toFixed(1) : '-inf'} dB <= ${SILENCE_DB} dB)`);

    const answerVolume = measureMaxVolume(answerStart, Math.min(1.0, answerAudio?.durationSeconds || 1.0));
    check(answerVolume > SILENCE_DB, `Q${questionNumber}: answer window contains narration (max ${answerVolume.toFixed(1)} dB > ${SILENCE_DB} dB)`);

    const coveringSilence = silences.find((s) => s.start <= thinkStart + 0.05 && s.end >= thinkEnd - 0.05);
    check(!!coveringSilence, `Q${questionNumber}: decoded silence interval covers the whole think gate${coveringSilence ? ` (${coveringSilence.start.toFixed(2)}-${coveringSilence.end.toFixed(2)}s)` : ''}`);

    questions.push({
      question: questionNumber,
      questionScene: questionScene.scene_id,
      optionDScene: optionD.scene_id,
      optionDStart: Number(optionDStart.toFixed(3)),
      optionDAudioEnd: Number(optionDAudioEnd.toFixed(3)),
      thinkStart: Number(thinkStart.toFixed(3)),
      thinkEnd: Number(thinkEnd.toFixed(3)),
      thinkFrames: Math.round(think.duration_seconds * FPS),
      answerStart: Number(answerStart.toFixed(3)),
      answerAudioEnd: Number((answerStart + (answerAudio?.durationSeconds || 0)).toFixed(3)),
      explanationStart: Number(explanationStart.toFixed(3)),
      gateMaxVolumeDb: Number.isFinite(gateVolume) ? gateVolume : null,
      answerMaxVolumeDb: Number.isFinite(answerVolume) ? answerVolume : null,
      coveringSilence: coveringSilence ? { start: Number(coveringSilence.start.toFixed(3)), end: Number(coveringSilence.end.toFixed(3)) } : null
    });
  }

  const report = {
    video: VIDEO_PATH,
    renderIntent: INTENT_PATH,
    audioManifest: MANIFEST_PATH,
    measuredAt: new Date().toISOString(),
    videoDurationSeconds: Number(videoDuration.toFixed(3)),
    audioDurationSeconds: Number(audioDuration.toFixed(3)),
    audioVideoDriftMs: Number((Math.abs(videoDuration - audioDuration) * 1000).toFixed(1)),
    backgroundMusic: 'none in this render path; all audible content is narration',
    fps: FPS,
    gateSeconds: GATE_SECONDS,
    gateFrames: GATE_FRAMES,
    questions,
    checks,
    failures
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log('QUIZ V2 PHYSICAL TIMING GATE');
  console.log('============================');
  for (const q of questions) {
    console.log(
      `Q${q.question}: optionD audio ${q.optionDStart.toFixed(2)}-${q.optionDAudioEnd.toFixed(2)}s | ` +
      `think ${q.thinkStart.toFixed(2)}-${q.thinkEnd.toFixed(2)}s (${q.thinkFrames}f, max ${q.gateMaxVolumeDb ?? '-inf'} dB) | ` +
      `answer ${q.answerStart.toFixed(2)}s (max ${q.answerMaxVolumeDb?.toFixed(1)} dB)`
    );
  }
  console.log(`A/V drift: ${report.audioVideoDriftMs}ms | duration: ${report.videoDurationSeconds}s | scenes: ${intent.scenes.length}`);
  console.log(`Checks: ${checks.length} passed, ${failures.length} failed`);
  console.log(`Report: ${REPORT_PATH}`);

  if (failures.length > 0) {
    console.error('\nFAILURES:');
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }
}

main();
