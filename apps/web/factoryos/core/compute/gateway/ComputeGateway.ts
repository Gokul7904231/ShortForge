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
import { ComputeRouter, RoutingDecision } from "../router/ComputeRouter";
import { LocalComputeProvider } from "../providers/LocalComputeProvider";
import { KaggleComputeProvider } from "../providers/KaggleComputeProvider";
import { LightningComputeProvider } from "../providers/LightningComputeProvider";
import { GitHubActionsComputeProvider } from "../providers/GitHubActionsComputeProvider";
import { PersistentWorkerComputeProvider } from "../providers/PersistentWorkerComputeProvider";
import { ContentAddressedStore } from "../cas/ContentAddressedStore";

export class ComputeGateway {
  private static instance: ComputeGateway | null = null;
  private router: ComputeRouter;
  private cas: ContentAddressedStore;

  private constructor(policy: ComputePolicy = DEFAULT_COMPUTE_POLICY) {
    this.router = new ComputeRouter(policy);
    this.cas = ContentAddressedStore.getInstance();

    // Register canonical providers
    this.router.registerProvider(new LocalComputeProvider());
    this.router.registerProvider(new PersistentWorkerComputeProvider());
    this.router.registerProvider(new LightningComputeProvider());
    this.router.registerProvider(new KaggleComputeProvider());
    this.router.registerProvider(new GitHubActionsComputeProvider());
  }

  public static getInstance(policy?: ComputePolicy): ComputeGateway {
    if (!ComputeGateway.instance) {
      ComputeGateway.instance = new ComputeGateway(policy);
    }
    return ComputeGateway.instance;
  }

  public getRouter(): ComputeRouter {
    return this.router;
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
