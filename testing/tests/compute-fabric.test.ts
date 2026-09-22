import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import {
  ComputeGateway,
  ComputeRouter,
  ContentAddressedStore,
  LocalComputeProvider,
  KaggleComputeProvider,
  LightningComputeProvider,
  GitHubActionsComputeProvider,
  PersistentWorkerComputeProvider,
  ComputeJob,
  ComputePolicy,
  DEFAULT_COMPUTE_POLICY,
  ExecutionReceipt,
  IComputeProvider,
  BaseComputeProvider,
  ProviderCapability,
  ProviderHealth,
  ArtifactRef,
} from '../../apps/web/factoryos/core/compute';

describe('FactoryOS Distributed Compute Fabric', () => {
  const testDir = path.join(process.cwd(), 'data', 'test_cas');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  describe('Content-Addressed Store (CAS)', () => {
    it('stores, hashes, and retrieves physical files with SHA-256 integrity', async () => {
      const cas = ContentAddressedStore.getInstance(testDir);

      // Create dummy artifact file
      const sampleContent = 'FactoryOS distributed compute test artifact content: ' + Date.now();
      const sampleFile = path.join(testDir, 'sample_source.txt');
      fs.writeFileSync(sampleFile, sampleContent, 'utf-8');

      const expectedSha256 = crypto.createHash('sha256').update(sampleContent).digest('hex');

      // Put file into CAS
      const artifactRef = await cas.putFile(sampleFile, 'test_manifest', 'text/plain', {
        testKey: 'testValue',
      });

      expect(artifactRef.artifactId).toBeDefined();
      expect(artifactRef.role).toBe('test_manifest');
      expect(artifactRef.sha256).toBe(expectedSha256);
      expect(artifactRef.byteLength).toBe(Buffer.byteLength(sampleContent));
      expect(artifactRef.uri).toBeDefined();

      // Retrieve from CAS
      const fetched = await cas.get(expectedSha256);
      expect(fetched).not.toBeNull();
      expect(fetched!.sha256).toBe(expectedSha256);
      expect(fetched!.role).toBe('test_manifest');

      // Physical file integrity check
      const isValid = await cas.verify(artifactRef);
      expect(isValid).toBe(true);

      // Check existence
      const exists = await cas.has(expectedSha256);
      expect(exists).toBe(true);
    });

    it('detects tampering or corruption in CAS-stored files', async () => {
      const cas = ContentAddressedStore.getInstance(testDir);

      const content = 'Tamper-proof payload';
      const file = path.join(testDir, 'tamper_test.txt');
      fs.writeFileSync(file, content, 'utf-8');

      const ref = await cas.putFile(file, 'payload', 'text/plain');
      expect(await cas.verify(ref)).toBe(true);

      // Mutate the physical file in CAS
      const realPath = ref.uri!.replace('file://', '');
      fs.appendFileSync(realPath, '_corrupted!');

      // Verification must fail
      const isValidAfterTamper = await cas.verify(ref);
      expect(isValidAfterTamper).toBe(false);
    });
  });

  describe('Provider Capabilities & Health Models', () => {
    it('exposes accurate capability profiles across all 5 canonical providers', async () => {
      const local = new LocalComputeProvider();
      const kaggle = new KaggleComputeProvider();
      const lightning = new LightningComputeProvider();
      const gha = new GitHubActionsComputeProvider();
      const persistent = new PersistentWorkerComputeProvider();

      const [capLocal, capKaggle, capLightning, capGha, capPersistent] = await Promise.all([
        local.getCapability(),
        kaggle.getCapability(),
        lightning.getCapability(),
        gha.getCapability(),
        persistent.getCapability(),
      ]);

      // Local
      expect(capLocal.providerType).toBe('LOCAL');
      expect(capLocal.executionModel).toBe('LOCAL_PROCESS');
      expect(capLocal.isCredentialConfigured).toBe(true);
      expect(capLocal.cpuCores).toBeGreaterThan(0);
      expect(capLocal.memoryMb).toBeGreaterThan(0);

      // Kaggle
      expect(capKaggle.providerType).toBe('KAGGLE');
      expect(capKaggle.executionModel).toBe('EPHEMERAL_BATCH');
      expect(capKaggle.gpuAvailable).toBe(true);
      expect(capKaggle.gpuType).toContain('Tesla T4');
      expect(capKaggle.isCredentialConfigured).toBe(false); // Unconfigured placeholder

      // Lightning AI
      expect(capLightning.providerType).toBe('LIGHTNING');
      expect(capLightning.executionModel).toBe('CLOUD_JOB');
      expect(capLightning.gpuAvailable).toBe(true);
      expect(capLightning.gpuType).toContain('NVIDIA A10G');
      expect(capLightning.isCredentialConfigured).toBe(false);

      // GitHub Actions
      expect(capGha.providerType).toBe('GITHUB_ACTIONS');
      expect(capGha.executionModel).toBe('EPHEMERAL_WORKFLOW');
      expect(capGha.gpuAvailable).toBe(false);
      expect(capGha.isCredentialConfigured).toBe(false);

      // Persistent Worker
      expect(capPersistent.providerType).toBe('PERSISTENT_WORKER');
      expect(capPersistent.executionModel).toBe('PERSISTENT_WORKER');
    });

    it('reports nuanced health states beyond simple online/offline', async () => {
      const kaggle = new KaggleComputeProvider();
      const health = await kaggle.getHealth();

      // Unconfigured external provider reports BLOCKED with actionable reason
      expect(health.state).toBe('BLOCKED');
      expect(health.failureReason).toMatch(/credentials|provisioned/i);
      expect(health.activeJobs).toBe(0);
    });
  });

  describe('Compute Router & Utility Scheduler', () => {
    it('evaluates utility score based on queue wait, startup, transfer, execution, and health', async () => {
      const router = new ComputeRouter();
      router.registerProvider(new LocalComputeProvider());
      router.registerProvider(new KaggleComputeProvider());

      const job: ComputeJob = {
        jobId: 'job_test_utility_01',
        factoryExecutionId: 'exec_factory_01',
        workloadType: 'RENDER',
        manifest: { scenes: [] },
        inputArtifacts: { bundleId: 'b1', artifacts: [], createdTimestamp: Date.now() },
        requirements: {
          workloadType: 'RENDER',
          minCpuCores: 2,
          minMemoryMb: 2048,
          estimatedDurationSeconds: 15,
        },
        priority: 'NORMAL',
        timeoutMs: 60000,
        createdAt: new Date().toISOString(),
      };

      const decision = await router.planProvider(job);

      expect(decision).toBeDefined();
      expect(decision.selectedProvider.type).toBe('LOCAL');
      expect(decision.scoreBreakdown).toBeDefined();
      expect(decision.scoreBreakdown.startupEstSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof decision.scoreBreakdown.utilityScore).toBe('number');
    });

    it('falls back to healthy provider when primary candidate is blocked or fails', async () => {
      const router = new ComputeRouter({
        ...DEFAULT_COMPUTE_POLICY,
        // Force priority order where Kaggle is first
        preferredOrder: ['KAGGLE', 'LOCAL'],
      });

      router.registerProvider(new KaggleComputeProvider()); // BLOCKED
      router.registerProvider(new LocalComputeProvider());   // HEALTHY

      const job: ComputeJob = {
        jobId: 'job_test_failover_01',
        factoryExecutionId: 'exec_factory_02',
        workloadType: 'RENDER',
        manifest: {
          project_id: 'test_proj',
          title: 'Failover Test',
          output_path: path.join(testDir, 'failover_out.mp4'),
          scenes: [
            {
              scene_id: 's1',
              template_id: 'facts.rapid-facts.v1',
              narration_text: 'Failover test narration',
              duration_seconds: 2.0,
              shots: [],
            },
          ],
        },
        inputArtifacts: { bundleId: 'b2', artifacts: [], createdTimestamp: Date.now() },
        requirements: {
          workloadType: 'RENDER',
          minCpuCores: 2,
          estimatedDurationSeconds: 2,
        },
        priority: 'HIGH',
        timeoutMs: 60000,
        createdAt: new Date().toISOString(),
      };

      // Kaggle is blocked, so router should plan LOCAL directly or failover cleanly
      const decision = await router.planProvider(job);
      expect(decision.selectedProvider.type).toBe('LOCAL');
      expect(decision.reason).toContain('Utility');
    });

    it('preserves separate factoryExecutionId and executionId in execution receipts', async () => {
      // Mock a custom provider to verify contract provenance separation
      class MockCloudProvider extends BaseComputeProvider {
        readonly id = 'provider_mock_cloud';
        readonly type = 'LIGHTNING' as const;
        readonly executionModel = 'CLOUD_JOB' as const;

        async getCapability(): Promise<ProviderCapability> {
          return {
            providerId: this.id,
            providerType: this.type,
            executionModel: this.executionModel,
            cpuCores: 8,
            memoryMb: 32768,
            gpuAvailable: true,
            operatingSystem: 'Linux',
            supportedWorkloads: ['RENDER'],
            estimatedStartupSeconds: 5,
            transferBandwidthMbps: 500,
            maxConcurrency: 4,
            maxJobDurationSeconds: 3600,
            isCredentialConfigured: true,
          };
        }

        async getHealth(): Promise<ProviderHealth> {
          return {
            state: 'HEALTHY',
            lastCheckedAt: new Date().toISOString(),
            consecutiveFailures: 0,
            activeJobs: 0,
            successRate: 1.0,
            avgLatencyMs: 200,
          };
        }

        async isAvailable(): Promise<boolean> {
          return true;
        }

        async executeJob(job: ComputeJob): Promise<ExecutionReceipt> {
          const providerExecutionId = `lightning_cloud_run_${Date.now()}`;
          return {
            receiptId: `rcpt_${providerExecutionId}`,
            executionId: providerExecutionId,
            jobId: job.jobId,
            factoryExecutionId: job.factoryExecutionId, // MUST MATCH
            providerId: this.id,
            providerType: this.type,
            executionModel: this.executionModel,
            status: 'COMPLETED',
            exitCode: 0,
            outputArtifacts: [],
            metrics: {
              startupTimeMs: 4000,
              executionTimeMs: 12000,
              transferTimeMs: 1500,
              totalTimeMs: 17500,
            },
            verifiedAt: new Date().toISOString(),
          };
        }
      }

      const router = new ComputeRouter();
      router.registerProvider(new MockCloudProvider());

      const job: ComputeJob = {
        jobId: 'job_provenance_99',
        factoryExecutionId: 'factory_mission_442',
        workloadType: 'RENDER',
        manifest: {},
        inputArtifacts: { bundleId: 'b_prov', artifacts: [], createdTimestamp: Date.now() },
        requirements: { workloadType: 'RENDER' },
        priority: 'NORMAL',
        timeoutMs: 30000,
        createdAt: new Date().toISOString(),
      };

      const { receipt } = await router.dispatchWithFailover(job);

      expect(receipt.status).toBe('COMPLETED');
      expect(receipt.jobId).toBe('job_provenance_99');
      expect(receipt.factoryExecutionId).toBe('factory_mission_442');
      expect(receipt.executionId).toContain('lightning_cloud_run_');
      expect(receipt.executionId).not.toBe(receipt.factoryExecutionId); // Separation confirmed
    });
  });

  describe('ComputeGateway Integration', () => {
    it('initializes canonical providers and routes job requests', async () => {
      const gateway = ComputeGateway.getInstance();
      expect(gateway).toBeDefined();

      const router = gateway.getRouter();
      const providers = router.getProviders();
      expect(providers.length).toBeGreaterThanOrEqual(5);

      const types = providers.map((p) => p.type);
      expect(types).toContain('LOCAL');
      expect(types).toContain('KAGGLE');
      expect(types).toContain('LIGHTNING');
      expect(types).toContain('GITHUB_ACTIONS');
      expect(types).toContain('PERSISTENT_WORKER');
    });

    it('is invoked by TemplateProductionPipeline.executeProductionRender by default', async () => {
      const { TemplateProductionPipeline } = await import('../../apps/web/factoryos/core/templates/TemplateProductionPipeline');
      const pipeline = TemplateProductionPipeline.getInstance();

      const outputPath = path.join(testDir, 'pipeline_compute_render.mp4');
      const localIntent = {
        project_id: 'test_pipeline_compute',
        title: 'Pipeline Compute Test',
        output_path: outputPath,
        scenes: [
          {
            scene_id: 'scene_01',
            template_id: 'facts.rapid-facts.v1',
            narration_text: 'Distributed compute pipeline verification.',
            duration_seconds: 1.0,
            shots: [],
          },
        ],
      };

      const result = await pipeline.executeProductionRender({
        localIntent,
        runId: 'exec_test_pipeline_01',
      });

      expect(result.executionReceipt).toBeDefined();
      expect(result.executionReceipt.status).toBe('COMPLETED');
      expect(result.executionReceipt.providerType).toBe('LOCAL');
      expect(result.executionReceipt.jobId).toBe('test_pipeline_compute');
      expect(result.executionReceipt.factoryExecutionId).toBe('exec_test_pipeline_01');
      expect(fs.existsSync(result.videoPath)).toBe(true);
      expect(result.sha256).toBeDefined();
    });
  });
});
