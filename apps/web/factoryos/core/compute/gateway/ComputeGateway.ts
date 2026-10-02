/**
 * FactoryOS Distributed Compute Gateway
 *
 * Front door for compute dispatch across FactoryOS and ShortForge.
 * Initializes default providers (Local, Kaggle, Lightning, GitHub Actions, Persistent Worker)
 * and manages job lifecycle, CAS registration, and receipt verification.
 */

import {
  ComputeJob,
  ComputePolicy,
  ComputeRequirements,
  ExecutionReceipt,
  DEFAULT_COMPUTE_POLICY,
  ProviderType,
} from "../contracts/ComputeContracts";
import { ComputeRouter, RoutingDecision, type GlideRoutingMode } from "../router/ComputeRouter";
import { GlideWorkerSelectionAdvisor } from "../router/GlideWorkerSelectionAdvisor";
import { GlideDecisionAdapter } from "../../intelligence/decision/GlideDecisionAdapter";
import { LocalComputeProvider } from "../providers/LocalComputeProvider";
import { KaggleComputeProvider } from "../providers/KaggleComputeProvider";
import { LightningComputeProvider } from "../providers/LightningComputeProvider";
import { GitHubActionsComputeProvider } from "../providers/GitHubActionsComputeProvider";
import { PersistentWorkerComputeProvider } from "../providers/PersistentWorkerComputeProvider";
import { AmdComputeProvider } from "../providers/AmdComputeProvider";
import { KaggleNotebookComputeProvider } from "../providers/KaggleNotebookComputeProvider";
import { HostedSandboxComputeProvider } from "../providers/HostedSandboxComputeProvider";
import { DaytonaSandboxAdapter, ModalSandboxAdapter } from "../sandboxes";
import { ComputePool, type ComputeSurface } from "../pool";
import { ContentAddressedStore } from "../cas/ContentAddressedStore";

export class ComputeGateway {
  private static instance: ComputeGateway | null = null;
  private router: ComputeRouter;
  private cas: ContentAddressedStore;
  private pool: ComputePool;

  private constructor(policy: ComputePolicy = DEFAULT_COMPUTE_POLICY) {
    const glideMode = this.parseGlideMode(
      process.env.FASTINO_GLIDE_ROUTING_MODE ?? "OFF",
    );

    const glideWorkerSelectionAdvisor =
      glideMode !== "OFF" && process.env.FASTINO_GLIDE_ENABLED === "true"
        ? new GlideWorkerSelectionAdvisor({
            adapter: new GlideDecisionAdapter({
              timeoutMs: this.parseDecisionTimeoutMs(
                process.env.FASTINO_GLIDE_WORKER_TIMEOUT_MS,
                750,
              ),
            }),
          })
        : undefined;

    this.router = new ComputeRouter(policy, {
      glideWorkerSelectionAdvisor,
      glideRoutingMode: glideMode,
    });
    this.cas = ContentAddressedStore.getInstance();
    this.pool = new ComputePool();

    this.registerPoolProvider(new LocalComputeProvider(), "LOCAL");
    this.registerPoolProvider(new AmdComputeProvider(), "API_GPU");
    this.registerPoolProvider(new KaggleNotebookComputeProvider(), "NOTEBOOK");

    // Hosted sandboxes are real workers only when their render command/output
    // contract is configured. Unconfigured ones fail closed and never become
    // routing candidates.
    this.registerPoolProvider(
      new HostedSandboxComputeProvider({
        adapter: new DaytonaSandboxAdapter(),
      }),
      "SANDBOX",
    );
    this.registerPoolProvider(
      new HostedSandboxComputeProvider({
        adapter: new ModalSandboxAdapter(),
      }),
      "SANDBOX",
    );
  }

  public static getInstance(policy?: ComputePolicy): ComputeGateway {
    if (!ComputeGateway.instance) {
      ComputeGateway.instance = new ComputeGateway(policy);
    }
    return ComputeGateway.instance;
  }

  private parseGlideMode(value: string): GlideRoutingMode {
    const normalized = value.trim().toUpperCase();
    return normalized === "SHADOW" || normalized === "CANARY" ? normalized : "OFF";
  }

  private parseDecisionTimeoutMs(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(250, Math.min(3000, Math.round(parsed)));
  }

  private registerPoolProvider(
    provider: import("../providers/ComputeProvider").IComputeProvider,
    surface: ComputeSurface,
  ): void {
    this.pool.registerProvider(provider, surface);
    this.router.registerProvider(provider);
  }

  public getRouter(): ComputeRouter {
    return this.router;
  }

  public getPool(): ComputePool {
    return this.pool;
  }

  public getCAS(): ContentAddressedStore {
    return this.cas;
  }

  /**
   * Plans compute routing for a job without executing it.
   */
  public async planJob(job: ComputeJob, preferredProviderType?: ProviderType): Promise<RoutingDecision> {
    return this.router.planProvider(job, preferredProviderType);
  }

  /**
   * Submits a compute job for execution with utility routing, CAS tracking, and failover.
   */
  public async submitJob(
    job: ComputeJob,
    onProgress?: (msg: string) => void,
    preferredProviderType?: ProviderType
  ): Promise<{ receipt: ExecutionReceipt; failovers: string[] }> {
    return this.router.dispatchWithFailover(job, onProgress, preferredProviderType);
  }
}
