import type { ToolResult } from "../../tools/ToolContracts";
import type { ToolExecutor } from "../../tools/ToolExecutor";
import type { ExecutionState } from "./AgentExecutionContracts";
import { AgentExecutionRouter } from "./AgentExecutionRouter";

export class ScopedToolExecutor {
  constructor(
    private readonly router: AgentExecutionRouter,
    private readonly executor: ToolExecutor,
  ) {}

  async execute<TInput = unknown, TOutput = unknown>(
    state: ExecutionState,
    toolId: string,
    input: TInput,
    context: Parameters<ToolExecutor["execute"]>[2],
  ): Promise<ToolResult<TOutput>> {
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

    if (step.idempotency === "REQUIRED" && !context.idempotencyKey) {
      return {
        success: false,
        error: {
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message:
            "Execution step " +
            state.stepId +
            " requires an idempotency key",
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
