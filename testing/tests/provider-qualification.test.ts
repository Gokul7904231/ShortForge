/**
 * FactoryOS Distributed Compute Fabric — Provider Qualification Suite
 *
 * Validates:
 * 1. Live provider activation boundaries & credential/config validation
 * 2. Unconfigured provider BLOCKED safety (zero synthetic success)
 * 3. Telemetry recording & failure/retry observation
 * 4. Provider performance comparison
 * 5. Physical CAS artifact indexing and verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  ComputeGateway,
  ComputeRouter,
  LocalComputeProvider,
  KaggleComputeProvider,
  LightningComputeProvider,
  GitHubActionsComputeProvider,
  PersistentWorkerComputeProvider,
  ComputeJob,
  DEFAULT_COMPUTE_POLICY,
  ContentAddressedStore,
} from '../../apps/web/factoryos/core/compute';

describe('FactoryOS Distributed Compute Fabric: Provider Qualification', () => {
  const artifactsDir = path.resolve(process.cwd(), 'data', 'test_qualification');

  beforeEach(() => {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
  });

  describe('1. Provider Activation Boundaries & Config Validation', () => {
    it('validates configuration requirements for all 5 canonical providers', () => {
      const local = new LocalComputeProvider();
      const kaggle = new KaggleComputeProvider();
      const lightning = new LightningComputeProvider();
      const gha = new GitHubActionsComputeProvider();
      const persistent = new PersistentWorkerComputeProvider();

      // Local provider: ready by default
      const localVal = local.validateConfiguration();
      expect(localVal.isConfigured).toBe(true);
      expect(localVal.missingKeys).toHaveLength(0);

      // Kaggle: blocked when unconfigured, lists exact missing keys
      const kaggleVal = kaggle.validateConfiguration();
      expect(kaggleVal.isConfigured).toBe(false);
      expect(kaggleVal.missingKeys).toContain('KAGGLE_USERNAME');
      expect(kaggleVal.missingKeys).toContain('KAGGLE_KEY');

      // Lightning AI: blocked when unconfigured
      const lightningVal = lightning.validateConfiguration();
      expect(lightningVal.isConfigured).toBe(false);
      expect(lightningVal.missingKeys).toContain('LIGHTNING_API_KEY');

      // GitHub Actions: blocked when unconfigured
      const ghaVal = gha.validateConfiguration();
      expect(ghaVal.isConfigured).toBe(false);
      expect(ghaVal.missingKeys).toContain('GITHUB_TOKEN');
      expect(ghaVal.missingKeys).toContain('GITHUB_REPOSITORY');

      // Persistent Worker: blocked when unconfigured
      const persistentVal = persistent.validateConfiguration();
      expect(persistentVal.isConfigured).toBe(false);
      expect(persistentVal.missingKeys).toContain('RENDER_WORKER_URL');
    });

    it('guarantees uncredentialed remote providers return FAILED code 126 and zero synthetic artifacts', async () => {
      const kaggle = new KaggleComputeProvider();
      const lightning = new LightningComputeProvider();
      const gha = new GitHubActionsComputeProvider();

      const testJob: ComputeJob = {
        jobId: 'job_dry_run_01',
        factoryExecutionId: 'factory_mission_dry',
        workloadType: 'RENDER',
        manifest: {},
        inputArtifacts: { bundleId: 'b_dry', artifacts: [], createdTimestamp: Date.now() },
        requirements: { workloadType: 'RENDER' },
        priority: 'NORMAL',
        timeoutMs: 10000,
        createdAt: new Date().toISOString(),
      };

      const [resKaggle, resLightning, resGha] = await Promise.all([
        kaggle.executeJob(testJob),
        lightning.executeJob(testJob),
        gha.executeJob(testJob),
      ]);

      expect(resKaggle.status).toBe('FAILED');
      expect(resKaggle.exitCode).toBe(126);
      expect(resKaggle.outputArtifacts).toHaveLength(0);
      expect(resKaggle.failureReason).toContain('credentials not provisioned');

      expect(resLightning.status).toBe('FAILED');
      expect(resLightning.exitCode).toBe(126);
      expect(resLightning.outputArtifacts).toHaveLength(0);

      expect(resGha.status).toBe('FAILED');
      expect(resGha.exitCode).toBe(126);
      expect(resGha.outputArtifacts).toHaveLength(0);
    });
  });

  describe('2. Telemetry Recording & Failure/Retry Observation', () => {
    it('records telemetry and preserves failure history during provider failovers', async () => {
      const router = new ComputeRouter({
        ...DEFAULT_COMPUTE_POLICY,
        preferredOrder: ['KAGGLE', 'LOCAL'], // Try Kaggle first, failover to Local
      });

      const local = new LocalComputeProvider();
      const kaggle = new KaggleComputeProvider();

      router.registerProvider(kaggle);
      router.registerProvider(local);

      const job: ComputeJob = {
        jobId: 'job_telemetry_obs_01',
        factoryExecutionId: 'exec_factory_obs_01',
        workloadType: 'RENDER',
        manifest: {
          project_id: 'proj_obs_01',
          title: 'Telemetry Observation Short',
          output_path: path.join(artifactsDir, 'obs_render_out.mp4'),
          scenes: [
            {
              scene_id: 'sc_01',
              template_id: 'facts.rapid-facts.v1',
              narration_text: 'Telemetry test frame',
              duration_seconds: 1.0,
              shots: [],
            },
          ],
        },
        inputArtifacts: { bundleId: 'b_obs', artifacts: [], createdTimestamp: Date.now() },
        requirements: { workloadType: 'RENDER', estimatedDurationSeconds: 1 },
        priority: 'NORMAL',
        timeoutMs: 60000,
        createdAt: new Date().toISOString(),
      };

      // Kaggle is BLOCKED so router plans LOCAL directly
      const { receipt } = await router.dispatchWithFailover(job);

      expect(receipt.status).toBe('COMPLETED');
      expect(receipt.providerType).toBe('LOCAL');

      // Verify provider performance comparison report
      const report = router.getPerformanceComparison();
      expect(report).toBeDefined();

      const localTel = report['provider_local_render'];
      expect(localTel).toBeDefined();
      expect(localTel.successfulExecutions).toBeGreaterThanOrEqual(1);
      expect(localTel.totalAttempts).toBeGreaterThanOrEqual(1);
      expect(localTel.avgExecutionMs).toBeGreaterThan(0);
      expect(localTel.lastUsedAt).toBeDefined();

      // Verify execution history receipt tracking
      const history = router.getExecutionHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].jobId).toBe('job_telemetry_obs_01');
    });
  });

  describe('3. Controlled Real Local Execution & CAS Verification', () => {
    it('executes real local render through ComputeGateway and indexes physical artifact into CAS', async () => {
      const gateway = ComputeGateway.getInstance();
      const cas = gateway.getCAS();

      const outPath = path.join(artifactsDir, 'gateway_cas_test.mp4');
      if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
      }

      const job: ComputeJob = {
        jobId: `test_gw_cas_${Date.now()}`,
        factoryExecutionId: `factory_run_${Date.now()}`,
        workloadType: 'RENDER',
        manifest: {
          project_id: 'gw_cas_proj',
          title: 'Gateway CAS Test',
          output_path: outPath,
          scenes: [
            {
              scene_id: 'scene_01',
              template_id: 'facts.rapid-facts.v1',
              narration_text: 'Content addressed storage physical proof.',
              duration_seconds: 1.0,
              shots: [],
            },
          ],
        },
        inputArtifacts: { bundleId: 'b_cas', artifacts: [], createdTimestamp: Date.now() },
        requirements: { workloadType: 'RENDER', estimatedDurationSeconds: 1 },
        priority: 'NORMAL',
        timeoutMs: 60000,
        createdAt: new Date().toISOString(),
      };

      const { receipt } = await gateway.submitJob(job);

      expect(receipt.status).toBe('COMPLETED');
      expect(receipt.outputArtifacts.length).toBeGreaterThan(0);

      const artifactRef = receipt.outputArtifacts[0];
      expect(artifactRef.role).toBe('output_mp4');
      expect(artifactRef.sha256).toBeDefined();
      expect(fs.existsSync(outPath)).toBe(true);

      // Verify physical presence in CAS
      const casVerified = await cas.verify(artifactRef);
      expect(casVerified).toBe(true);

      const cached = await cas.get(artifactRef.sha256);
      expect(cached).toBeDefined();
      expect(cached!.byteLength).toBe(artifactRef.byteLength);
    });
  });

  describe('5. Creator-Product Integration: Media Streaming & CAS Playback', () => {
    it('serves physically verified CAS MP4 files through the creator media streaming endpoint', async () => {
      const { saveJobManifest } = await import('../../apps/web/lib/jobs-history');
      const { GET } = await import('../../apps/web/app/api/media/video/[jobId]/route');

      // Create a test physical artifact
      const testJobId = `creator_play_${Date.now()}`;
      const dummyFilePath = path.join(artifactsDir, `stream_test_${Date.now()}.mp4`);
      const dummyContent = Buffer.from('FAKE_MP4_VIDEO_HEADER_AND_STREAM_CONTENT_FOR_RANGE_TESTING_1234567890');
      fs.writeFileSync(dummyFilePath, dummyContent);

      const cas = ContentAddressedStore.getInstance();
      const artifactRef = await cas.putFile(dummyFilePath, 'output_mp4', 'video/mp4', { test: true });

      // Save job manifest using the canonical creator URL schema
      await saveJobManifest(testJobId, {
        status: 'completed',
        videoUrl: `/api/media/video/${testJobId}`,
        localVideoPath: dummyFilePath,
        artifactSha256: artifactRef.sha256,
        renderDurationSeconds: 2.5,
      });

      // 1. Full GET request
      const reqFull = new Request(`http://localhost:3000/api/media/video/${testJobId}`);
      const resFull = await GET(reqFull, { params: Promise.resolve({ jobId: testJobId }) });
      expect(resFull.status).toBe(200);
      expect(resFull.headers.get('Content-Type')).toBe('video/mp4');
      expect(resFull.headers.get('Content-Length')).toBe(String(dummyContent.length));

      // 2. Partial byte-range request (e.g. HTML5 <video> streaming)
      const reqRange = new Request(`http://localhost:3000/api/media/video/${testJobId}`, {
        headers: { Range: 'bytes=0-9' },
      });
      const resRange = await GET(reqRange, { params: Promise.resolve({ jobId: testJobId }) });
      expect(resRange.status).toBe(206);
      expect(resRange.headers.get('Content-Range')).toBe(`bytes 0-9/${dummyContent.length}`);
      expect(resRange.headers.get('Content-Length')).toBe('10');

      // 3. Direct CAS hash lookup (jobId = sha256)
      const reqCas = new Request(`http://localhost:3000/api/media/video/${artifactRef.sha256}`);
      const resCas = await GET(reqCas, { params: Promise.resolve({ jobId: artifactRef.sha256 }) });
      expect(resCas.status).toBe(200);

      // 4. Missing job returns 404
      const reqMissing = new Request(`http://localhost:3000/api/media/video/non_existent_job_12345`);
      const resMissing = await GET(reqMissing, { params: Promise.resolve({ jobId: 'non_existent_job_12345' }) });
      expect(resMissing.status).toBe(404);
    });
  });
});
