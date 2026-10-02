import { describe, expect, it } from "vitest";
import { ComputePool } from "@/factoryos/core/compute/pool/ComputePool";
import { ProviderBackedShortForgeWorker } from "@/factoryos/core/compute/pool/ShortForgeRenderWorker";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderHealth,
} from "@/factoryos/core/compute/contracts/ComputeContracts";
import type { IComputeProvider } from "@/factoryos/core/compute/providers/ComputeProvider";

function provider(
  id: string,
  overrides: Partial<ProviderCapability> = {},
): IComputeProvider {
  const capability: ProviderCapability = {
    providerId: id,
    providerType: overrides.providerType || "LOCAL",
    executionModel: overrides.executionModel || "LOCAL_PROCESS",
    cpuCores: 8,
    memoryMb: 16_384,
    gpuAvailable: true,
    gpuType: "NVIDIA T4",
    operatingSystem: "test",
    supportedWorkloads: ["RENDER"],
    estimatedStartupSeconds: 1,
    transferBandwidthMbps: 1000,
    maxConcurrency: 1,
    maxJobDurationSeconds: 3600,
    isCredentialConfigured: true,
    ...overrides,
  };
  const health: ProviderHealth = {
    state: "HEALTHY",
    lastCheckedAt: new Date().toISOString(),
    consecutiveFailures: 0,
    activeJobs: 0,
    successRate: 1,
    avgLatencyMs: 10,
  };

  return {
    id,
    type: capability.providerType,
    executionModel: capability.executionModel,
    async getCapability() {
      return capability;
    },
    async getHealth() {
      return health;
    },
    async isAvailable() {
      return true;
    },
    async executeJob(job: ComputeJob): Promise<ExecutionReceipt> {
      return {
        receiptId: "test-receipt-" + job.jobId,
        executionId: "test-execution",
        jobId: job.jobId,
        factoryExecutionId: job.factoryExecutionId,
        providerId: id,
        providerType: capability.providerType,
        executionModel: capability.executionModel,
        status: "FAILED",
        exitCode: 1,
        outputArtifacts: [],
        metrics: {
          startupTimeMs: 0,
          executionTimeMs: 0,
          transferTimeMs: 0,
          totalTimeMs: 0,
        },
        failureReason: "test",
      };
    },
  };
}

function renderJob(overrides: Partial<ComputeJob> = {}): ComputeJob {
  return {
    jobId: "job-pool-test",
    factoryExecutionId: "fx-pool-test",
    missionId: "mission-pool-test",
    workloadType: "RENDER",
    manifest: {},
    inputArtifacts: {
      bundleId: "inputs",
      artifacts: [],
      createdTimestamp: Date.now(),
    },
    requirements: {
      workloadType: "RENDER",
      gpuRequired: true,
      minVramMb: 0,
      minCpuCores: 4,
      minMemoryMb: 8_000,
    },
    priority: "NORMAL",
    timeoutMs: 60_000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("unified compute pool", () => {
  it("keeps workers from different execution surfaces in one registry", async () => {
    const pool = new ComputePool();

    pool.registerWorker(
      new ProviderBackedShortForgeWorker(
        provider("local", { providerType: "LOCAL" }),
        "LOCAL",
      ),
    );
    pool.registerWorker(
      new ProviderBackedShortForgeWorker(
        provider("kaggle", { providerType: "KAGGLE", executionModel: "EPHEMERAL_BATCH" }),
        "NOTEBOOK",
      ),
    );
    pool.registerWorker(
      new ProviderBackedShortForgeWorker(
        provider("daytona", { providerType: "DAYTONA", executionModel: "CLOUD_JOB" }),
        "SANDBOX",
      ),
    );

    expect(pool.getWorkers()).toHaveLength(3);
    expect(pool.getWorkersBySurface("LOCAL")).toHaveLength(1);
    expect(pool.getWorkersBySurface("NOTEBOOK")).toHaveLength(1);
    expect(pool.getWorkersBySurface("SANDBOX")).toHaveLength(1);

    const eligible = await pool.getEligibleWorkers(renderJob());
    expect(eligible.map((candidate) => candidate.worker.providerType)).toEqual([
      "LOCAL",
      "KAGGLE",
      "DAYTONA",
    ]);
  });

  it("hard eligibility rejects a worker before advisory selection", async () => {
    const pool = new ComputePool();
    pool.registerWorker(
      new ProviderBackedShortForgeWorker(
        provider("no-gpu", {
          providerType: "LOCAL",
          gpuAvailable: false,
        }),
        "LOCAL",
      ),
    );
    pool.registerWorker(
      new ProviderBackedShortForgeWorker(
        provider("good", {
          providerType: "DAYTONA",
          executionModel: "CLOUD_JOB",
        }),
        "SANDBOX",
      ),
    );

    const eligible = await pool.getEligibleWorkers(renderJob());
    expect(eligible.map((candidate) => candidate.worker.workerId)).toEqual(["good"]);
    expect(eligible[0]?.preflight.reasons).toEqual([]);
  });
});
