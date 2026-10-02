import { describe, expect, it } from "vitest";
import { ComputeRouter } from "../core/compute/router/ComputeRouter";
import { ComputePool } from "../core/compute/pool/ComputePool";
import { ProviderBackedShortForgeWorker } from "../core/compute/pool/ShortForgeRenderWorker";
import { BaseComputeProvider } from "../core/compute/providers/ComputeProvider";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderHealth,
  ProviderType,
} from "../core/compute/contracts/ComputeContracts";

type MockOptions = {
  providerType?: ProviderType;
  available?: boolean;
  startupSeconds?: number;
  executionMs?: number;
  healthState?: ProviderHealth["state"];
  execute?: (job: ComputeJob) => Promise<ExecutionReceipt>;
};

class ChaosProvider extends BaseComputeProvider {
  readonly executionModel = "LOCAL_PROCESS" as const;
  private readonly opts: MockOptions;
  private readonly providerType: ProviderType;
  private activeJobs = 0;

  constructor(
    readonly id: string,
    opts: MockOptions = {},
  ) {
    super();
    this.opts = opts;
    this.providerType = opts.providerType || "LOCAL";
  }

  readonly type: ProviderType = "LOCAL";

  async getCapability(): Promise<ProviderCapability> {
    return {
      providerId: this.id,
      providerType: this.providerType,
      executionModel: this.executionModel,
      cpuCores: 8,
      memoryMb: 16_384,
      gpuAvailable: true,
      gpuType: "T4",
      operatingSystem: "test",
      supportedWorkloads: ["RENDER", "INFERENCE"],
      estimatedStartupSeconds: this.opts.startupSeconds ?? 1,
      transferBandwidthMbps: 10_000,
      maxConcurrency: 1,
      maxJobDurationSeconds: 3600,
      isCredentialConfigured: true,
    };
  }

  async getHealth(): Promise<ProviderHealth> {
    return {
      state: this.opts.healthState || "HEALTHY",
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: this.opts.healthState === "FLAKY" ? 1 : 0,
      activeJobs: this.activeJobs,
      successRate: this.opts.healthState === "FLAKY" ? 0.5 : 1,
      avgLatencyMs: this.opts.executionMs ?? 1,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.opts.available !== false && this.activeJobs < 1;
  }

  async executeJob(job: ComputeJob): Promise<ExecutionReceipt> {
    this.activeJobs++;
    const started = Date.now();
    try {
      if (this.opts.execute) return await this.opts.execute(job);
      const delay = this.opts.executionMs ?? 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return {
        receiptId: "receipt_" + this.id + "_" + job.jobId,
        executionId: "execution_" + this.id,
        jobId: job.jobId,
        factoryExecutionId: job.factoryExecutionId,
        providerId: this.id,
        providerType: this.providerType,
        executionModel: this.executionModel,
        status: "COMPLETED",
        exitCode: 0,
        outputArtifacts: [],
        metrics: {
          startupTimeMs: (this.opts.startupSeconds ?? 1) * 1000,
          executionTimeMs: Math.max(delay, Date.now() - started),
          transferTimeMs: 5,
          totalTimeMs: (this.opts.startupSeconds ?? 1) * 1000 + delay + 5,
        },
      };
    } finally {
      this.activeJobs = 0;
    }
  }
}

function job(jobId: string, workloadType: "RENDER" | "INFERENCE" = "INFERENCE"): ComputeJob {
  return {
    jobId,
    factoryExecutionId: "factory_" + jobId,
    workloadType,
    manifest: {},
    inputArtifacts: {
      bundleId: "bundle_" + jobId,
      artifacts: [],
      createdTimestamp: Date.now(),
    },
    requirements: {
      workloadType,
      estimatedDurationSeconds: 1,
      minCpuCores: 1,
    },
    priority: "HIGH",
    timeoutMs: 10_000,
    createdAt: new Date().toISOString(),
  };
}

function router(): ComputeRouter {
  return new ComputeRouter({
    policyVersion: "chaos-v1",
    allowedProviders: ["LOCAL"],
    preferredOrder: ["LOCAL"],
    maxRetries: 3,
    failoverAllowed: true,
    preferLocalForShortVideos: false,
    shortVideoThresholdSeconds: 60,
    allowSimulatedInTest: false,
  });
}

describe("compute resilience chaos matrix", () => {
  it("skips a dead worker during admission and uses a live worker", async () => {
    const r = router();
    r.registerProvider(new ChaosProvider("dead", { available: false }));
    r.registerProvider(new ChaosProvider("live", { executionMs: 2 }));

    const planned = await r.planProvider(job("dead-worker"));
    expect(planned.selectedProvider.id).toBe("live");
    expect(planned.rejectionReasons.dead).toContain("not currently available");

    const result = await r.dispatchWithFailover(job("dead-worker"));
    expect(result.receipt.providerId).toBe("live");
  });

  it("uses the pool to reject a saturated worker before routing", async () => {
    const r = router();
    const pool = new ComputePool();
    const saturated = new ChaosProvider("saturated", { available: false });
    const live = new ChaosProvider("live-capacity", { executionMs: 1 });

    pool.registerWorker(new ProviderBackedShortForgeWorker(saturated, "LOCAL"));
    pool.registerWorker(new ProviderBackedShortForgeWorker(live, "LOCAL"));
    r.bindWorkerPool(pool);
    r.registerProvider(saturated);
    r.registerProvider(live);

    const planned = await r.planProvider(job("capacity-gate"));
    expect(planned.selectedProvider.id).toBe("live-capacity");
    expect(planned.rejectionReasons.saturated).toContain("Worker pool preflight");
  });

  it("fails over from a timeout to the next worker", async () => {
    const r = router();
    r.registerProvider(
      new ChaosProvider("timeout", {
        execute: async (j) => ({
          receiptId: "timeout",
          executionId: "timeout-exec",
          jobId: j.jobId,
          factoryExecutionId: j.factoryExecutionId,
          providerId: "timeout",
          providerType: "LOCAL",
          executionModel: "LOCAL_PROCESS",
          status: "TIMED_OUT",
          exitCode: 124,
          outputArtifacts: [],
          metrics: {
            startupTimeMs: 10,
            executionTimeMs: 50,
            transferTimeMs: 0,
            totalTimeMs: 60,
          },
          failureReason: "deadline exceeded",
        }),
      }),
    );
    r.registerProvider(new ChaosProvider("recovery", { executionMs: 2 }));

    const result = await r.dispatchWithFailover(job("timeout-recovery"));
    expect(result.receipt.providerId).toBe("recovery");
    expect(result.failovers.join(" | ")).toContain("timeout");
  });

  it("learns measured execution time only after repeated observations", async () => {
    const r = router();
    const fast = new ChaosProvider("fast", { startupSeconds: 0.5, executionMs: 2 });
    const slow = new ChaosProvider("slow", { startupSeconds: 3, executionMs: 40 });
    r.registerProvider(fast);
    r.registerProvider(slow);

    const first = await r.planProvider(job("sparse-telemetry"));
    expect(first.selectedProvider.id).toBe("fast");

    await r.dispatchWithFailover(job("learn-1"));
    await r.dispatchWithFailover(job("learn-2"));
    await r.dispatchWithFailover(job("learn-3"));

    const telemetry = r.getProviderTelemetry("fast");
    expect(telemetry?.successfulExecutions).toBe(3);
    expect(telemetry?.avgExecutionMs).toBeGreaterThan(0);

    const comparison = r.getPerformanceComparison();
    expect(comparison.fast.avgTotalMs).toBeGreaterThan(0);
  });
});
