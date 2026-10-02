import { describe, expect, it, vi } from "vitest";
import { ComputeRouter } from "../core/compute/router/ComputeRouter";
import type { GlideWorkerSelectionAdvice } from "../core/compute/router/GlideWorkerSelectionAdvisor";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderHealth,
} from "../core/compute/contracts/ComputeContracts";
import { BaseComputeProvider } from "../core/compute/providers/ComputeProvider";

function provider(id: string, startupSeconds: number): BaseComputeProvider {
  return new (class extends BaseComputeProvider {
    readonly id = id;
    readonly type = "LOCAL" as const;
    readonly executionModel = "LOCAL_PROCESS" as const;

    async getCapability(): Promise<ProviderCapability> {
      return {
        providerId: id,
        providerType: "LOCAL",
        executionModel: this.executionModel,
        cpuCores: 8,
        memoryMb: 16000,
        gpuAvailable: false,
        gpuType: "CPU",
        operatingSystem: "test",
        supportedWorkloads: ["RENDER"],
        estimatedStartupSeconds: startupSeconds,
        transferBandwidthMbps: 10000,
        maxConcurrency: 4,
        maxJobDurationSeconds: 3600,
        isCredentialConfigured: true,
      };
    }

    async getHealth(): Promise<ProviderHealth> {
      return {
        state: "HEALTHY",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        activeJobs: 0,
        successRate: 1,
        avgLatencyMs: 1,
      };
    }

    async isAvailable(): Promise<boolean> {
      return true;
    }

    async executeJob(_job: ComputeJob): Promise<ExecutionReceipt> {
      throw new Error("not executed in routing test");
    }
  })();
}

const policy = {
  policyVersion: "glide-router-test",
  allowedProviders: ["LOCAL"] as const,
  preferredOrder: ["LOCAL"] as const,
  maxRetries: 1,
  failoverAllowed: true,
  preferLocalForShortVideos: false,
  shortVideoThresholdSeconds: 60,
  allowSimulatedInTest: false,
};

const job: ComputeJob = {
  jobId: "glide-router-mode",
  factoryExecutionId: "factory-glide-router-mode",
  workloadType: "RENDER",
  manifest: {
    localRenderIntent: {
      output: { width: 320, height: 180, fps: 30, video_codec: "h264", audio_codec: "aac" },
    },
  },
  inputArtifacts: { bundleId: "bundle", artifacts: [], createdTimestamp: Date.now() },
  requirements: { estimatedDurationSeconds: 1, diskSpaceMb: 1, workloadType: "RENDER" },
  priority: "HIGH",
  timeoutMs: 60_000,
  createdAt: new Date().toISOString(),
};

function advice(selectedProviderId: string): GlideWorkerSelectionAdvice {
  return {
    status: "ADVISED",
    jobId: job.jobId,
    selectedProviderId,
    selectedConfidence: 0.6,
    selectedProbability: 0.8,
    fastestProviderId: selectedProviderId,
    mostReliableProviderId: selectedProviderId,
    freestProviderId: selectedProviderId,
    candidateProviderIds: ["provider_first", "provider_second"],
    latencyMs: 50,
    reason: "GLiDE test advice",
    decisionBatchId: "glide_worker_glide-router-mode",
    modelRef: "fastino/GLiDE",
  };
}

describe("GLiDE ComputeRouter modes", () => {
  it("keeps SHADOW non-blocking and leaves deterministic selection authoritative", async () => {
    const advisor = {
      advise: vi.fn(
        () =>
          new Promise<GlideWorkerSelectionAdvice>((resolve) =>
            setTimeout(() => resolve(advice("provider_second")), 800),
          ),
      ),
    } as any;

    const router = new ComputeRouter(policy, {
      glideWorkerSelectionAdvisor: advisor,
      glideRoutingMode: "SHADOW",
    });

    router.registerProvider(provider("provider_first", 0.1));
    router.registerProvider(provider("provider_second", 2));

    const startedAt = Date.now();
    const decision = await router.planProvider(job);
    const elapsed = Date.now() - startedAt;

    expect(decision.selectedProvider.id).toBe("provider_first");
    expect(elapsed).toBeLessThan(500);
    expect(advisor.advise).toHaveBeenCalledTimes(1);
    expect(decision.admissionRecord.glideDecision).toBeUndefined();
  });

  it("allows CANARY to use GLiDE only inside the deterministic eligible candidate set", async () => {
    const advisor = {
      advise: vi.fn(async () => advice("provider_second")),
    } as any;

    const router = new ComputeRouter(policy, {
      glideWorkerSelectionAdvisor: advisor,
      glideRoutingMode: "CANARY",
    });

    router.registerProvider(provider("provider_first", 0.1));
    router.registerProvider(provider("provider_second", 2));

    const decision = await router.planProvider(job);

    expect(decision.selectedProvider.id).toBe("provider_second");
    expect(decision.evaluatedCandidates[0].provider.id).toBe("provider_second");
    expect(decision.admissionRecord.glideDecision?.mode).toBe("CANARY");
    expect(decision.admissionRecord.glideDecision?.deterministicProviderId).toBe(
      "provider_first",
    );
  });

  it("falls back to deterministic routing when GLiDE cannot advise", async () => {
    const advisor = {
      advise: vi.fn(async (): Promise<GlideWorkerSelectionAdvice> => ({
        ...advice("provider_second"),
        status: "UNRESOLVED",
        selectedProviderId: undefined,
        selectedProbability: undefined,
        selectedConfidence: 0,
        reason: "GLiDE unavailable",
      })),
    } as any;

    const router = new ComputeRouter(policy, {
      glideWorkerSelectionAdvisor: advisor,
      glideRoutingMode: "CANARY",
    });

    router.registerProvider(provider("provider_first", 0.1));
    router.registerProvider(provider("provider_second", 2));

    const decision = await router.planProvider(job);

    expect(decision.selectedProvider.id).toBe("provider_first");
    expect(decision.admissionRecord.glideDecision?.status).toBe("UNRESOLVED");
  });
});
