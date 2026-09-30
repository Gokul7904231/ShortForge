import type {
  CognitiveProbe,
  EpistemicContext,
  EpistemicContradiction,
  EpistemicFact,
  EpistemicHypothesis,
  EpistemicMeasurement,
  EpistemicUnknown,
} from "./EpistemicContracts";

export type AERProbeOutcomeStatus =
  | "VERIFIED"
  | "OBSERVED"
  | "FAILED"
  | "UNKNOWN";

export interface AERProbeExecutionRequest {
  readonly episodeId: string;
  readonly context: EpistemicContext;
  readonly probe: CognitiveProbe;
  readonly deadlineAtMs: number;
}

/**
 * Evidence returned from the Agent Execution Fabric.
 *
 * AER owns interpretation and re-planning. The injected executor remains the
 * only component allowed to touch tools, capabilities, leases, or side effects.
 */
export interface AERProbeExecutionResult {
  readonly probeId: string;
  readonly status: AERProbeOutcomeStatus;
  readonly executorRunId: string;
  readonly evidenceRefs: readonly string[];
  readonly knownAdded?: readonly EpistemicFact[];
  readonly unknownAdded?: readonly EpistemicUnknown[];
  readonly resolvedUnknownIds?: readonly string[];
  readonly contradictionsAdded?: readonly EpistemicContradiction[];
  readonly resolvedContradictionIds?: readonly string[];
  readonly measurementsAdded?: readonly EpistemicMeasurement[];
  readonly hypothesesAddedOrUpdated?: readonly EpistemicHypothesis[];
  readonly latencyMs: number;
  readonly costUnits: number;
  readonly actualCostUsd?: number;
  readonly error?: string;
}

export interface AERProbeExecutor {
  execute(request: AERProbeExecutionRequest): Promise<AERProbeExecutionResult>;
}

/**
 * Narrow bridge contract for integrating AER with the existing Agent Execution
 * Fabric. Implementations must delegate actual execution to AEF/ScopedToolExecutor
 * and return only measured/evidenced results to AER.
 */
export interface AERExecutionFabricBridge extends AERProbeExecutor {}
