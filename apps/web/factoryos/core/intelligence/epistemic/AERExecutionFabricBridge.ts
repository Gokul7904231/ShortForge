import type { ExecutionState } from "../../agent/execution/AgentExecutionContracts";
import type { ScopedToolExecutor } from "../../agent/execution/ScopedToolExecutor";
import type { ToolContext, ToolResult } from "../../tools/ToolContracts";
import type {
  AERProbeExecutionRequest,
  AERProbeExecutionResult,
  AERProbeExecutor,
} from "./AERProbeExecution";

export interface AERProbeEvidenceEnvelope {
  readonly status?: AERProbeExecutionResult["status"];
  readonly evidenceRefs?: readonly string[];
  readonly knownAdded?: AERProbeExecutionResult["knownAdded"];
  readonly unknownAdded?: AERProbeExecutionResult["unknownAdded"];
  readonly resolvedUnknownIds?: AERProbeExecutionResult["resolvedUnknownIds"];
  readonly contradictionsAdded?: AERProbeExecutionResult["contradictionsAdded"];
  readonly resolvedContradictionIds?: AERProbeExecutionResult["resolvedContradictionIds"];
  readonly measurementsAdded?: AERProbeExecutionResult["measurementsAdded"];
  readonly hypothesesAddedOrUpdated?: AERProbeExecutionResult["hypothesesAddedOrUpdated"];
  readonly costUnits?: number;
}

/**
 * Concrete AER -> FactoryOS Agent Execution Fabric adapter.
 *
 * AER supplies the epistemic request; the existing ScopedToolExecutor remains
 * the only path that can reach the ToolExecutor/registry/capability boundary.
 * The adapter only translates the measured/evidenced tool result back into AER.
 */
export class ScopedToolAERExecutionFabricBridge implements AERProbeExecutor {
  public constructor(
    private readonly scopedExecutor: ScopedToolExecutor,
    private readonly stateFactory: (
      request: AERProbeExecutionRequest,
    ) => Promise<ExecutionState> | ExecutionState,
    private readonly toolResolver: (
      request: AERProbeExecutionRequest,
    ) => string | undefined,
    private readonly costUnitEstimator: (
      result: ToolResult<unknown>,
      request: AERProbeExecutionRequest,
    ) => number = () => 0,
  ) {}

  public async execute(
    request: AERProbeExecutionRequest,
  ): Promise<AERProbeExecutionResult> {
    const startedAt = Date.now();
    const toolId = this.toolResolver(request);

    if (!toolId) {
      return {
        probeId: request.probe.probeId,
        status: "FAILED",
        executorRunId: "aef-unresolved-tool",
        evidenceRefs: [],
        latencyMs: Date.now() - startedAt,
        costUnits: 0,
        error: "probe_tool_mapping_not_found",
      };
    }

    if (Date.now() >= request.deadlineAtMs) {
      return {
        probeId: request.probe.probeId,
        status: "FAILED",
        executorRunId: "aef-deadline-expired",
        evidenceRefs: [],
        latencyMs: Date.now() - startedAt,
        costUnits: 0,
        error: "probe_deadline_expired_before_execution",
      };
    }

    const state = await this.stateFactory(request);

    if (state.status !== "RUNNING") {
      return {
        probeId: request.probe.probeId,
        status: "FAILED",
        executorRunId: state.executionId,
        evidenceRefs: [],
        latencyMs: Date.now() - startedAt,
        costUnits: 0,
        error: "aef_execution_state_not_running:" + state.status,
      };
    }

    const context: ToolContext = {
      workflowId: state.missionId,
      runId: state.runId,
      stepId: state.stepId,
      toolId,
      missionId: state.missionId,
      idempotencyKey: state.idempotencyKey,
    };

    const result = await this.scopedExecutor.execute(
      state,
      toolId,
      request.probe.target,
      context,
    );

    const latencyMs = Math.max(
      0,
      result.durationMs ?? Date.now() - startedAt,
    );
    const output = (result.output ?? {}) as unknown;
    const envelope = isEvidenceEnvelope(output) ? output : undefined;
    const evidenceRefs = [
      ...(envelope?.evidenceRefs ?? []),
      ...(result.evidenceId ? [result.evidenceId] : []),
    ].filter((value, index, values) => values.indexOf(value) === index);

    if (!result.success) {
      return {
        probeId: request.probe.probeId,
        status: "FAILED",
        executorRunId: state.executionId,
        evidenceRefs,
        latencyMs,
        costUnits: Math.max(
          0,
          this.costUnitEstimator(result, request),
        ),
        error: result.error?.message ?? "aef_tool_execution_failed",
      };
    }

    const status =
      envelope?.status ??
      (evidenceRefs.length > 0 ? "VERIFIED" : "UNKNOWN");

    return {
      probeId: request.probe.probeId,
      status,
      executorRunId: state.executionId,
      evidenceRefs,
      knownAdded: envelope?.knownAdded,
      unknownAdded: envelope?.unknownAdded,
      resolvedUnknownIds: envelope?.resolvedUnknownIds,
      contradictionsAdded: envelope?.contradictionsAdded,
      resolvedContradictionIds: envelope?.resolvedContradictionIds,
      measurementsAdded: envelope?.measurementsAdded,
      hypothesesAddedOrUpdated: envelope?.hypothesesAddedOrUpdated,
      latencyMs,
      costUnits: Math.max(
        0,
        envelope?.costUnits ?? this.costUnitEstimator(result, request),
      ),
    };
  }
}

function isEvidenceEnvelope(value: unknown): value is AERProbeEvidenceEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (
        "evidenceRefs" in value ||
        "status" in value ||
        "measurementsAdded" in value ||
        "knownAdded" in value
      ),
  );
}
