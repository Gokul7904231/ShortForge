/**
 * FactoryOS Frontier v3 — Multi-Scene Audio Timing & Silence Prevention Regression Test Suite
 *
 * Verifies that:
 * 1. Scene-aligned narration tracks maintain audible speech across ALL scenes (no dropouts or delays).
 * 2. Continuous audio tracks sliced across scenes with source_in_seconds retain volume in all scenes.
 * 3. F07 audit detects digitally silent AAC streams and strictly rejects them with NARRATION_AUDIO_SILENT.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawn } from "node:child_process";
import { LocalRenderAdapter, LocalRenderIntent } from "../core/render/LocalRenderAdapter";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import { VoiceFabric } from "../core/voice/VoiceFabric";

describe("Audio Timing & Silence Prevention Regression Suite", () => {
  const testDir = path.join(process.cwd(), "data", "test_audio_timing");

  beforeEach(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  async function measureVolume(filePath: string, startSec?: number, durationSec?: number): Promise<{ mean: number; max: number }> {
    const args = ["-hide_banner"];
    if (startSec !== undefined) args.push("-ss", startSec.toFixed(2));
    if (durationSec !== undefined) args.push("-t", durationSec.toFixed(2));
    args.push("-i", filePath, "-af", "volumedetect", "-f", "null", "-");

    const stderr = await new Promise<string>((resolve, reject) => {
      const proc = spawn("ffmpeg", args);
      let out = "";
      proc.stderr.on("data", (d) => (out += d.toString()));
      proc.on("close", () => resolve(out));
      proc.on("error", reject);
    });

    const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
    return {
      mean: meanMatch ? parseFloat(meanMatch[1]) : -91.0,
      max: maxMatch ? parseFloat(maxMatch[1]) : -91.0,
    };
  }

  it("1. Deliberately silent AAC test -> F07 strictly fails with NARRATION_AUDIO_SILENT", async () => {
    const silentMp4 = path.join(testDir, "deliberately_silent.mp4");
    // Generate valid 9:16 H.264 video with anullsrc (digital silence)
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=4 -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -pix_fmt yuv420p -c:a aac -t 4 "${silentMp4}"`,
      { stdio: "ignore" }
    );

    const report = await VerificationEngine.auditMediaArtifact({
      videoUrl: silentMp4,
      requireAudibleSpeech: true,
      sceneCount: 2,
    });

    expect(report.passed).toBe(false);
    expect(report.overallStatus).toBe("FAILED");
    expect(report.hardGates.audioStreamPresent).toBe(true); // Stream exists
    expect(report.measurements.audioSilenceDetected).toBe(true);
    expect(report.failures.some((f) => f.includes("NARRATION_AUDIO_SILENT"))).toBe(true);
  });

  it("2. Multi-scene physical render -> audible narration present across every individual scene", async () => {
    const fabric = new VoiceFabric();

    // Synthesize real audible voice for 3 separate scenes
    const voice1 = await fabric.synthesize("First scene establishes context and setting.", "profile_host_narrator", testDir);
    const voice2 = await fabric.synthesize("Second scene explains fundamental scientific mechanics.", "profile_host_narrator", testDir);
    const voice3 = await fabric.synthesize("Third scene delivers the final conclusive findings.", "profile_host_narrator", testDir);

    const outMp4 = path.join(testDir, "multiscene_audible.mp4");

    const intent: LocalRenderIntent = {
      project_id: "test_multiscene_timing",
      title: "Audio Timing Regression Test",
      output_path: outMp4,
      scenes: [
        {
          scene_id: "scene_01",
          template_id: "facts.rapid-facts.v1",
          narration_text: "First scene establishes context and setting.",
          duration_seconds: Math.max(3.0, voice1.durationSeconds + 0.2),
          shots: [{ id: "shot_1", recipe_id: "KINETIC_HOOK", duration_seconds: 3.0, props: { headline: "SCENE ONE", subtitle: "Context" } }],
          audio_track: {
            track_id: "voice_s1",
            audio_path: voice1.localPath,
            source_in_seconds: 0.0,
            start_seconds: 0.0,
            duration_seconds: voice1.durationSeconds,
            volume: 1.0,
          },
        },
        {
          scene_id: "scene_02",
          template_id: "facts.rapid-facts.v1",
          narration_text: "Second scene explains fundamental scientific mechanics.",
          duration_seconds: Math.max(3.0, voice2.durationSeconds + 0.2),
          shots: [{ id: "shot_2", recipe_id: "BIG_NUMBER", duration_seconds: 3.0, props: { number: "10X", label: "MECHANICS" } }],
          audio_track: {
            track_id: "voice_s2",
            audio_path: voice2.localPath,
            source_in_seconds: 0.0,
            start_seconds: 0.0,
            duration_seconds: voice2.durationSeconds,
            volume: 1.0,
          },
        },
        {
          scene_id: "scene_03",
          template_id: "facts.rapid-facts.v1",
          narration_text: "Third scene delivers the final conclusive findings.",
          duration_seconds: Math.max(3.0, voice3.durationSeconds + 0.2),
          shots: [{ id: "shot_3", recipe_id: "OUTRO_CTA", duration_seconds: 3.0, props: { cta: "VERIFIED", subtitle: "Findings" } }],
          audio_track: {
            track_id: "voice_s3",
            audio_path: voice3.localPath,
            source_in_seconds: 0.0,
            start_seconds: 0.0,
            duration_seconds: voice3.durationSeconds,
            volume: 1.0,
          },
        },
      ],
    };

    const adapter = LocalRenderAdapter.getInstance();
    const receipt = await adapter.render(intent);
    expect(receipt.validation.is_valid).toBe(true);
    expect(fs.existsSync(outMp4)).toBe(true);

    const s1Dur = intent.scenes[0].duration_seconds;
    const s2Dur = intent.scenes[1].duration_seconds;
    const s3Dur = intent.scenes[2].duration_seconds;

    // Physically inspect volume of each scene interval
    const vol1 = await measureVolume(outMp4, 0.0, s1Dur);
    const vol2 = await measureVolume(outMp4, s1Dur, s2Dur);
    const vol3 = await measureVolume(outMp4, s1Dur + s2Dur, s3Dur);

    // Assert that every scene has audible speech (> -35dB mean, > -10dB max)
    expect(vol1.mean).toBeGreaterThan(-35.0);
    expect(vol1.max).toBeGreaterThan(-10.0);

    expect(vol2.mean).toBeGreaterThan(-35.0);
    expect(vol2.max).toBeGreaterThan(-10.0);

    expect(vol3.mean).toBeGreaterThan(-35.0);
    expect(vol3.max).toBeGreaterThan(-10.0);

    // Verify F07 accepts the multi-scene audible video
    const report = await VerificationEngine.auditMediaArtifact({
      videoUrl: outMp4,
      requireAudibleSpeech: true,
      sceneCount: 3,
      scriptText: "Full script with three distinct verified scenes.",
    });

    expect(report.passed).toBe(true);
    expect(report.measurements.audioSilenceDetected).toBe(false);
    expect(report.measurements.audioMeanVolumeDb).toBeGreaterThan(-35.0);
  });

  it("3. Continuous sliced audio track with source_in_seconds -> audible speech in every scene slice", async () => {
    const fabric = new VoiceFabric();

    // Synthesize a continuous audio track spanning ~10-12 seconds
    const fullAudio = await fabric.synthesize(
      "Deep ocean trenches represent the most extreme biome on Earth. Over one thousand atmospheres of pressure warp metal and compress molecular bonds. In this total darkness, alien ecosystems thrive.",
      "profile_host_narrator",
      testDir
    );

    const outMp4 = path.join(testDir, "continuous_sliced.mp4");
    const sceneDur = 3.5;

    const intent: LocalRenderIntent = {
      project_id: "test_sliced_timing",
      title: "Continuous Audio Slicing Test",
      output_path: outMp4,
      scenes: [
        {
          scene_id: "slice_01",
          template_id: "facts.rapid-facts.v1",
          narration_text: "Deep ocean trenches represent the most extreme biome on Earth.",
          duration_seconds: sceneDur,
          shots: [{ id: "shot_s1", recipe_id: "KINETIC_HOOK", duration_seconds: sceneDur, props: { headline: "PART ONE", subtitle: "Trenches" } }],
          audio_track: {
            track_id: "voice_slice_1",
            audio_path: fullAudio.localPath,
            source_in_seconds: 0.0,
            start_seconds: 0.0,
            duration_seconds: sceneDur,
            volume: 1.0,
          },
        },
        {
          scene_id: "slice_02",
          template_id: "facts.rapid-facts.v1",
          narration_text: "Over one thousand atmospheres of pressure warp metal and compress molecular bonds.",
          duration_seconds: sceneDur,
          shots: [{ id: "shot_s2", recipe_id: "BIG_NUMBER", duration_seconds: sceneDur, props: { number: "1,000+", label: "ATMOSPHERES" } }],
          audio_track: {
            track_id: "voice_slice_2",
            audio_path: fullAudio.localPath,
            source_in_seconds: sceneDur,
            start_seconds: 0.0,
            duration_seconds: sceneDur,
            volume: 1.0,
          },
        },
        {
          scene_id: "slice_03",
          template_id: "facts.rapid-facts.v1",
          narration_text: "In this total darkness, alien ecosystems thrive.",
          duration_seconds: sceneDur,
          shots: [{ id: "shot_s3", recipe_id: "STAT", duration_seconds: sceneDur, props: { value: "100%", headline: "DARKNESS ECOSYSTEM" } }],
          audio_track: {
            track_id: "voice_slice_3",
            audio_path: fullAudio.localPath,
            source_in_seconds: sceneDur * 2,
            start_seconds: 0.0,
            duration_seconds: sceneDur,
            volume: 1.0,
          },
        },
      ],
    };

    const adapter = LocalRenderAdapter.getInstance();
    const receipt = await adapter.render(intent);
    expect(receipt.validation.is_valid).toBe(true);
    expect(fs.existsSync(outMp4)).toBe(true);

    // Physically inspect volume of each slice interval
    const vol1 = await measureVolume(outMp4, 0.0, sceneDur);
    const vol2 = await measureVolume(outMp4, sceneDur, sceneDur);
    const vol3 = await measureVolume(outMp4, sceneDur * 2, sceneDur);

    expect(vol1.mean).toBeGreaterThan(-35.0);
    expect(vol1.max).toBeGreaterThan(-10.0);

    expect(vol2.mean).toBeGreaterThan(-35.0);
    expect(vol2.max).toBeGreaterThan(-10.0);

    expect(vol3.mean).toBeGreaterThan(-35.0);
    expect(vol3.max).toBeGreaterThan(-10.0);
  });
});
