/**
 * FactoryOS V3 Phase 4 — Template Render Integration Tests
 *
 * Tests the physical rendering and verification bridge:
 * LocalRenderIntent -> LocalRenderAdapter -> factoryos-render -> physical MP4 -> F7 Verification
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LocalRenderAdapter, LocalRenderIntent } from '../../apps/web/factoryos/core/render/LocalRenderAdapter';
import { VerificationEngine } from '../../apps/web/factoryos/core/verification/VerificationEngine';

describe('FactoryOS V3 Template Render Integration', () => {
  const adapter = LocalRenderAdapter.getInstance();
  const artifactsDir = path.resolve(process.cwd(), 'testing', 'artifacts');

  beforeAll(() => {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
  });

  it('verifies local renderer environment is operational (doctor check)', async () => {
    const health = await adapter.healthCheck();
    expect(health.installed).toBe(true);
    expect(health.allHealthy).toBe(true);
    expect(health.ffmpegVersion).toBeDefined();
  });

  it('renders a multi-scene 9:16 composition and passes authoritative F7 verification', async () => {
    const jobId = `test_render_int_${Date.now()}`;
    const outputPath = path.join(artifactsDir, `${jobId}.mp4`);

    const intent: LocalRenderIntent = {
      project_id: jobId,
      title: 'Render Integration Test',
      output_path: outputPath,
      scenes: [
        {
          scene_id: 'scene_01',
          template_id: 'facts.rapid-facts.v1',
          narration_text: 'Rapid Fact 1: Light from the sun takes eight minutes to reach Earth.',
          duration_seconds: 2.0,
          shots: [
            {
              id: 'shot_01',
              recipe_id: 'KINETIC_HOOK',
              start_seconds: 0.0,
              duration_seconds: 2.0,
              props: {
                headline: 'SOLAR RADIATION',
                subtitle: 'Takes eight minutes to travel across space',
                highlightWord: 'MINUTES',
                tag: 'RAPID FACT'
              }
            }
          ]
        },
        {
          scene_id: 'scene_02',
          template_id: 'facts.rapid-facts.v1',
          narration_text: 'The exact distance covered is one hundred and fifty million kilometers.',
          duration_seconds: 2.0,
          shots: [
            {
              id: 'shot_02',
              recipe_id: 'BIG_NUMBER',
              start_seconds: 0.0,
              duration_seconds: 2.0,
              props: {
                number: '150M KM',
                label: 'DISTANCE FROM SUN',
                headline: 'EXACT METRIC'
              }
            }
          ]
        }
      ],
      output: {
        width: 1080,
        height: 1920,
        fps: 30,
        video_codec: 'libx264',
        audio_codec: 'aac'
      },
      safe_area: {
        top: 160,
        bottom: 320,
        left: 60,
        right: 120
      },
      metadata: {
        templateId: 'facts.rapid-facts.v1',
        contentEngine: 'FACTS',
        formatFamily: 'Rapid Fire Information'
      }
    };

    const startTime = Date.now();
    const receipt = await adapter.render(intent, `run_${jobId}`);
    const renderTimeMs = Date.now() - startTime;

    // Physical proof checks
    expect(receipt).toBeDefined();
    expect(receipt.run_id).toBeDefined();
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(receipt.validation.is_valid).toBe(true);
    expect(receipt.validation.has_video_stream).toBe(true);
    expect(receipt.validation.width).toBe(1080);
    expect(receipt.validation.height).toBe(1920);
    expect(receipt.output_sha256).toMatch(/^[a-f0-9]{64}$/i);
    expect(receipt.scenes_rendered).toHaveLength(2);

    // Run authoritative F7 verification
    const renderArtifact = {
      artifactId: `art_${jobId}`,
      jobId,
      location: { kind: 'LOCAL' as const, path: outputPath },
      sha256: receipt.output_sha256,
      byteLength: receipt.validation.file_size_bytes,
      duration: receipt.duration_seconds,
      width: 1080,
      height: 1920,
      fps: 30,
      mimeType: 'video/mp4' as const,
      videoCodec: 'h264',
      audioCodec: 'aac',
      createdAt: new Date().toISOString()
    };

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      artifact: renderArtifact,
      videoUrl: outputPath,
      scriptText: 'Solar radiation facts',
      sceneCount: 2,
      durationSeconds: receipt.duration_seconds,
      policyViolations: []
    });

    if (!audit.verified) {
      console.log('AUDIT FAILURES:', JSON.stringify(audit.failures, null, 2));
      console.log('AUDIT MEASUREMENTS:', JSON.stringify(audit.measurements, null, 2));
    }

    expect(audit.verified).toBe(true);
    expect(audit.overallStatus).toBe('PASSED');
    expect(audit.hardGates.artifactExists).toBe(true);
    expect(audit.hardGates.exact9x16Geometry).toBe(true);
    expect(audit.hardGates.videoStreamPresent).toBe(true);
    expect(audit.hardGates.decodeSmokePassed).toBe(true);
  }, 45000);

  it('rejects invalid or unrenderable scene intents with typed errors', async () => {
    const corruptedIntent: any = {
      project_id: 'bad_intent',
      title: 'Bad Intent',
      output_path: '',
      scenes: []
    };

    await expect(adapter.render(corruptedIntent)).rejects.toThrow();
  });
});
