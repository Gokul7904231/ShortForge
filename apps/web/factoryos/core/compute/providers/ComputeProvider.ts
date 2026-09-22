/**
 * FactoryOS Distributed Compute Fabric — Provider Interface & Base Class
 */

import {
  ProviderType,
  ProviderExecutionModel,
  ProviderCapability,
  ProviderHealth,
  ComputeJob,
  ExecutionReceipt,
  ProviderConfigValidationResult,
} from "../contracts/ComputeContracts";

export interface IComputeProvider {
  readonly id: string;
  readonly type: ProviderType;
  readonly executionModel: ProviderExecutionModel;

  getCapability(): Promise<ProviderCapability>;
  getHealth(): Promise<ProviderHealth>;
  isAvailable(): Promise<boolean>;
  executeJob(job: ComputeJob, onProgress?: (msg: string) => void): Promise<ExecutionReceipt>;
  cancelJob?(executionId: string): Promise<void>;
  validateConfiguration?(): ProviderConfigValidationResult;
}

export abstract class BaseComputeProvider implements IComputeProvider {
  abstract readonly id: string;
  abstract readonly type: ProviderType;
  abstract readonly executionModel: ProviderExecutionModel;

  abstract getCapability(): Promise<ProviderCapability>;
  abstract getHealth(): Promise<ProviderHealth>;
  abstract isAvailable(): Promise<boolean>;
  abstract executeJob(job: ComputeJob, onProgress?: (msg: string) => void): Promise<ExecutionReceipt>;

  protected recordReceiptProof(receipt: ExecutionReceipt): string {
    return `proof_${receipt.providerId}_${receipt.executionId}_${Date.now()}`;
  }
}
