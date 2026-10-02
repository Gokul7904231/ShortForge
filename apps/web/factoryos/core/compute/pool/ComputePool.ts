import type {
  ComputeJob,
  ProviderCapability,
  ProviderHealth,
  ProviderType,
} from "../contracts/ComputeContracts";
import type { IComputeProvider } from "../providers/ComputeProvider";
import {
  ProviderBackedShortForgeWorker,
  type ComputeSurface,
  type ShortForgeRenderWorker,
  type WorkerPreflight,
} from "./ShortForgeRenderWorker";

export interface ComputePoolWorkerSnapshot {
  workerId: string;
  providerId: string;
  providerType: ProviderType;
  surface: ComputeSurface;
  capability: ProviderCapability;
  health: ProviderHealth;
  eligible: boolean;
  reasons: string[];
}

export interface ComputePoolCandidate {
  worker: ShortForgeRenderWorker;
  preflight: WorkerPreflight;
}

export class ComputePool {
  private readonly workers = new Map<string, ShortForgeRenderWorker>();

  registerWorker(worker: ShortForgeRenderWorker): void {
    if (this.workers.has(worker.workerId)) {
      throw new Error("COMPUTE_WORKER_ALREADY_REGISTERED:" + worker.workerId);
    }
    this.workers.set(worker.workerId, worker);
  }

  registerProvider(
    provider: IComputeProvider,
    surface: ComputeSurface,
    workerId = provider.id,
  ): ShortForgeRenderWorker {
    const worker = new ProviderBackedShortForgeWorker(provider, surface, workerId);
    this.registerWorker(worker);
    return worker;
  }

  getWorker(workerId: string): ShortForgeRenderWorker | undefined {
    return this.workers.get(workerId);
  }

  getWorkers(): ShortForgeRenderWorker[] {
    return [...this.workers.values()];
  }

  getWorkersBySurface(surface: ComputeSurface): ShortForgeRenderWorker[] {
    return this.getWorkers().filter((worker) => worker.surface === surface);
  }

  getWorkersByProviderType(providerType: ProviderType): ShortForgeRenderWorker[] {
    return this.getWorkers().filter(
      (worker) => worker.providerType === providerType,
    );
  }

  async getEligibleWorkers(job: ComputeJob): Promise<ComputePoolCandidate[]> {
    const workers = this.getWorkers();
    const results = await Promise.all(
      workers.map(async (worker) => ({
        worker,
        preflight: await worker.canAccept(job),
      })),
    );
    return results.filter((candidate) => candidate.preflight.admitted);
  }

  async snapshot(job?: ComputeJob): Promise<ComputePoolWorkerSnapshot[]> {
    const rows: ComputePoolWorkerSnapshot[] = [];
    for (const worker of this.workers.values()) {
      const capability = await worker.getCapability();
      const health = await worker.getHealth();
      const preflight = job
        ? await worker.canAccept(job)
        : {
            admitted:
              health.state !== "BLOCKED" && health.state !== "DRAINING",
            reasons: [],
            capability,
            health,
          };
      rows.push({
        workerId: worker.workerId,
        providerId: worker.providerId,
        providerType: worker.providerType,
        surface: worker.surface,
        capability,
        health,
        eligible: preflight.admitted,
        reasons: [...preflight.reasons],
      });
    }
    return rows;
  }
}
