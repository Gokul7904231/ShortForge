/**
 * FactoryOS Distributed Compute Fabric — Dedicated InstaBox Compute Provider
 *
 * Implements IComputeProvider for an individual InstaBox worker node (e.g. instabox-box2).
 * Integrates directly with ComputePool and ComputeRouter.
 */

import { BaseComputeProvider } from "../providers/ComputeProvider";
import type {
  ProviderType,
  ProviderExecutionModel,
  ProviderCapability,
  ProviderHealth,
  ComputeJob,
  ExecutionReceipt,
  ProviderConfigValidationResult,
} from "../contracts/ComputeContracts";
import type { InstaBoxFleetRegistry } from "./InstaBoxFleetRegistry";
import type { InstaBoxWorkerNodeId } from "./InstaBoxContracts";

export class InstaBoxComputeProvider extends BaseComputeProvider {
  readonly id: string;
  readonly type: ProviderType = "INSTABOX";
  readonly executionModel: ProviderExecutionModel = "PERSISTENT_WORKER";

  constructor(
    private readonly registry: InstaBoxFleetRegistry,
    readonly nodeId: InstaBoxWorkerNodeId,
    workerId: string,
  ) {
    super();
    this.id = workerId;
  }

  public validateConfiguration(): ProviderConfigValidationResult {
    const isConfigured = this.registry.isCredentialConfigured(this.nodeId);
    const requiredKeys = [
      `INSTABOX_WORKER_SECRET_${this.nodeId.toUpperCase()}`,
      "INSTABOX_WORKER_SECRET",
    ];
    const missingKeys = isConfigured ? [] : requiredKeys;

    return {
      isConfigured,
      requiredKeys,
      missingKeys,
      errors: isConfigured
        ? []
        : ["Missing required environment variable: INSTABOX_WORKER_SECRET (or RENDER_WORKER_SECRET)"],
    };
  }

  public async getCapability(): Promise<ProviderCapability> {
    return this.registry.getNodeCapability(this.nodeId);
  }

  public async getHealth(): Promise<ProviderHealth> {
    return this.registry.getNodeHealth(this.nodeId);
  }

  public async isAvailable(): Promise<boolean> {
    return this.registry.isNodeAvailable(this.nodeId);
  }

  public async executeJob(
    job: ComputeJob,
    onProgress?: (msg: string) => void,
  ): Promise<ExecutionReceipt> {
    return this.registry.dispatchJobToNode(this.nodeId, job, onProgress);
  }
}
