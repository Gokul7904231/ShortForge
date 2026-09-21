/**
 * FactoryOS Render Fabric — Render Worker Contract
 * Semantic interface implemented by local, AMD, and ephemeral remote workers.
 */

import {
  WorkerCapability,
  WorkerState,
  RenderJob,
  RenderAttempt,
  CallbackResponse,
} from "../contracts/RenderFabricContracts";

export interface IRenderWorker {
  readonly workerId: string;
  getState(): WorkerState;
  getCapabilities(): Promise<WorkerCapability>;
  heartbeat(): Promise<{ acknowledged: boolean; state: WorkerState }>;
  claim(job: RenderJob): Promise<{ attempt: RenderAttempt; fencingToken: number }>;
  execute(job: RenderJob, attempt: RenderAttempt): Promise<{ success: boolean; error?: string }>;
  drain(): Promise<void>;
  shutdown(): Promise<void>;
}
