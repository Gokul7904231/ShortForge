import type { ToolRegistry } from "../../tools/ToolRegistry";
import type { ToolResult } from "../../tools/ToolContracts";
import type { ToolExecutor } from "../../tools/ToolExecutor";
import type { ExecutionState } from "./AgentExecutionContracts";
import { AgentExecutionRouter } from "./AgentExecutionRouter";

export class ScopedToolExecutor {
  constructor(
    private readonly router: AgentExecutionRouter,
    private readonly registry: ToolRegistry,
    private readonly executor: ToolExecutor,
    private readonly grantedCapabilities: ReadonlySet<string>,
  ) {}

  async execute<TInput = unknown, TOutput = unknown>(
    state: ExecutionState,
    toolId: string,
    input: TInput,
    context: Parameters<ToolExecutor["execute"]>[2],
  ): Promise<ToolResult<TOutput>> {
    if (state.status !== "RUNNING") {
      return {
        success: false,
        error: {
          code: "EXECUTION_STEP_NOT_RUNNING",
          message:
            "Tool execution requires RUNNING state; current state is " +
            state.status,
          retryable: false,
        },
      };
    }

    const step = this.router.getStep(state.stepId);

    if (!step) {
      return {
        success: false,
        error: {
          code: "EXECUTION_STEP_NOT_REGISTERED",
          message: "No registered execution step for " + state.stepId,
        },
      };
    }

    if (!step.allowedTools.includes(toolId)) {
      return {
        success: false,
        error: {
          code: "STEP_TOOL_NOT_ALLOWED",
          message:
            "Tool " +
            toolId +
            " is not exposed in execution step " +
            state.stepId,
          retryable: false,
        },
      };
    }

    const missingCapabilities = step.requiredCapabilities.filter(
      (capability) => !this.grantedCapabilities.has(capability),
    );

    if (missingCapabilities.length > 0) {
      return {
        success: false,
        error: {
          code: "STEP_CAPABILITY_NOT_GRANTED",
          message:
            "Execution step " +
            state.stepId +
            " requires capabilities: " +
            missingCapabilities.join(","),
          retryable: false,
        },
      };
    }

    const tool = this.registry.get(toolId);

    if (!tool) {
      return {
        success: false,
        error: {
          code: "TOOL_NOT_REGISTERED",
          message: "Tool " + toolId + " is not registered",
          retryable: false,
        },
      };
    }

    if (
      step.idempotency === "REQUIRED" &&
      (!context.idempotencyKey || tool.supportsIdempotency !== true)
    ) {
      return {
        success: false,
        error: {
          code: "IDEMPOTENCY_CONTRACT_NOT_SATISFIED",
          message:
            "Execution step " +
            state.stepId +
            " requires a provider/tool that supports idempotency",
          retryable: false,
        },
      };
    }

    const enrichedContext = {
      ...context,
      stepId: state.stepId,
      runId: state.runId,
      idempotencyKey:
        context.idempotencyKey || state.idempotencyKey,
    };

    return this.executor.execute<TInput, TOutput>(
      toolId,
      input,
      enrichedContext,
    );
  }
}
