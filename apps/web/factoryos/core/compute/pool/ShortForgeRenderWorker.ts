import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderHealth,
  ProviderType,
} from "../contracts/ComputeContracts";
import type { IComputeProvider } from "../providers/ComputeProvider";

export type ComputeSurface =
  | "LOCAL"
  | "API_GPU"
  | "NOTEBOOK"
  | "SANDBOX"
  | "PERSISTENT_WORKER";

export interface WorkerPreflight {
  admitted: boolean;
  reasons: string[];
  capability: ProviderCapability;
  health: ProviderHealth;
}

export interface ShortForgeRenderWorker {
  readonly workerId: string;
  readonly providerId: string;
  readonly providerType: ProviderType;
  readonly surface: ComputeSurface;
  readonly provider: IComputeProvider;

  getCapability(): Promise<ProviderCapability>;
  getHealth(): Promise<ProviderHealth>;
  canAccept(job: ComputeJob): Promise<WorkerPreflight>;
  execute(job: ComputeJob, onProgress?: (message: string) => void): Promise<ExecutionReceipt>;
}

export class ProviderBackedShortForgeWorker implements ShortForgeRenderWorker {
  readonly workerId: string;
  readonly providerId: string;
  readonly providerType: ProviderType;
  readonly provider: IComputeProvider;

  constructor(
    provider: IComputeProvider,
    readonly surface: ComputeSurface,
    workerId = provider.id,
  ) {
    this.provider = provider;
    this.providerId = provider.id;
    this.providerType = provider.type;
    this.workerId = workerId;
  }

  getCapability(): Promise<ProviderCapability> {
    return this.provider.getCapability();
  }

  getHealth(): Promise<ProviderHealth> {
    return this.provider.getHealth();
  }

  async canAccept(job: ComputeJob): Promise<WorkerPreflight> {
    const [capability, health] = await Promise.all([
      this.provider.getCapability(),
      this.provider.getHealth(),
    ]);
    const available = health.state === "HEALTHY"
      ? await this.provider.isAvailable()
      : false;

    const reasons: string[] = [];
    if (health.state === "BLOCKED" || health.state === "DRAINING") {
      reasons.push("worker-health-" + health.state.toLowerCase());
    } else if (!available) {
      reasons.push("worker-not-currently-available");
    }
    if (!capability.supportedWorkloads.includes(job.workloadType)) {
      reasons.push("workload-not-supported");
    }
    if (job.requirements.gpuRequired && !capability.gpuAvailable) {
      reasons.push("gpu-required");
    }
    if (
      job.requirements.minCpuCores &&
      capability.cpuCores < job.requirements.minCpuCores
    ) {
      reasons.push("cpu-capacity-insufficient");
    }
    if (
      job.requirements.minMemoryMb &&
      capability.memoryMb < job.requirements.minMemoryMb
    ) {
      reasons.push("memory-capacity-insufficient");
    }
    if (
      job.requirements.preferredGpuType &&
      capability.gpuType &&
      !capability.gpuType
        .toLowerCase()
        .includes(job.requirements.preferredGpuType.toLowerCase())
    ) {
      reasons.push("gpu-type-mismatch");
    }
    if (
      typeof job.requirements.estimatedDurationSeconds === "number" &&
      job.requirements.estimatedDurationSeconds > capability.maxJobDurationSeconds
    ) {
      reasons.push("estimated-duration-exceeds-worker-limit");
    }

    return {
      admitted: reasons.length === 0,
      reasons,
      capability,
      health,
    };
  }

  execute(
    job: ComputeJob,
    onProgress?: (message: string) => void,
  ): Promise<ExecutionReceipt> {
    return this.provider.executeJob(job, onProgress);
  }
}
