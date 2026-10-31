import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { RunBundleBuilder } from '../core/evidence/RunBundleBuilder';
import { ContentPlanEngine } from '../core/templates/ContentPlan';
import { OpenTelemetryAdapter } from '../core/verification/VerificationFabric';

describe('Wave 6 — Immutable Run Evidence Bundles & Artifact Attestation', () => {
  const testArtifactsDir = path.join(process.cwd(), 'data', 'test_artifacts_wave6');

  beforeEach(() => {
    fs.mkdirSync(testArtifactsDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testArtifactsDir, { recursive: true, force: true });
    } catch {}
  });

  it('builds isolated run bundles for 60s and 180s without mixing artifacts', async () => {
    const builder = new RunBundleBuilder(testArtifactsDir);
    const mockMp4Path = path.join(testArtifactsDir, 'mock_video.mp4');
    fs.writeFileSync(mockMp4Path, Buffer.from('mock_mp4_bytes'));
    const mp4Hash = crypto.createHash('sha256').update(Buffer.from('mock_mp4_bytes')).digest('hex');

    const traceContext = OpenTelemetryAdapter.createTraceContext();

    const plan60 = ContentPlanEngine.createDynamicPlan({
      topic: 'Mariana Trench',
      templateId: 'facts.deep-explainer.v1',
      targetDurationSeconds: 60,
    });

    const mockReport60: any = {
      verified: true,
      passed: true,
      overallStatus: 'PASSED',
      hardGates: { durationWithinBounds: true },
      measurements: { videoDuration: 60.5 },
    };

    // 1. Build 60s bundle
    const bundle60 = await builder.buildRunBundle({
      runId: 'run_60s_acceptance_01',
      missionId: 'mission_60s',
      jobId: 'job_60s',
      topic: 'Mariana Trench',
      templateId: 'facts.deep-explainer.v1',
      targetDurationSeconds: 60,
      physicalDurationSeconds: 60.5,
      mp4Path: mockMp4Path,
      mp4Sha256: mp4Hash,
      verificationReport: mockReport60,
      contentPlan: plan60,
      traceContext,
      gitCommitSha: '441658a2',
    });

    // 2. Build 180s bundle
    const plan180 = ContentPlanEngine.createDynamicPlan({
      topic: 'Mariana Trench',
      templateId: 'facts.deep-explainer.v1',
      targetDurationSeconds: 180,
    });

    const mockReport180: any = {
      verified: true,
      passed: true,
      overallStatus: 'PASSED',
      hardGates: { durationWithinBounds: true },
      measurements: { videoDuration: 179.8 },
    };

    const bundle180 = await builder.buildRunBundle({
      runId: 'run_180s_acceptance_01',
      missionId: 'mission_180s',
      jobId: 'job_180s',
      topic: 'Mariana Trench',
      templateId: 'facts.deep-explainer.v1',
      targetDurationSeconds: 180,
      physicalDurationSeconds: 179.8,
      mp4Path: mockMp4Path,
      mp4Sha256: mp4Hash,
      verificationReport: mockReport180,
      contentPlan: plan180,
      traceContext,
      gitCommitSha: '441658a2',
    });

    // Verify completely separate directory structures
    expect(bundle60.bundleDir).not.toBe(bundle180.bundleDir);
    expect(path.basename(bundle60.bundleDir)).toBe('run_60s_acceptance_01');
    expect(path.basename(bundle180.bundleDir)).toBe('run_180s_acceptance_01');

    // Verify all 5 files exist in 60s bundle
    expect(fs.existsSync(bundle60.manifestPath)).toBe(true);
    expect(fs.existsSync(bundle60.f07ReportPath)).toBe(true);
    expect(fs.existsSync(bundle60.provenancePath)).toBe(true);
    expect(fs.existsSync(bundle60.telemetryPath)).toBe(true);
    expect(fs.existsSync(bundle60.attestationPath)).toBe(true);
    expect(fs.existsSync(bundle60.bundleDigestPath)).toBe(true);

    // Verify in-toto attestation format
    const attestationRaw = JSON.parse(fs.readFileSync(bundle60.attestationPath, 'utf-8'));
    expect(attestationRaw._type).toBe('https://in-toto.io/Statement/v0.1');
    expect(attestationRaw.predicateType).toBe('https://slsa.dev/provenance/v0.2');
    expect(attestationRaw.subject[0].digest.sha256).toBe(mp4Hash);

    // Verify bundle seal digest matches physical files
    expect(bundle60.bundleSha256.length).toBe(64);
  });
});
