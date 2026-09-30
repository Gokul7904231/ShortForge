/**
 * FactoryOS v0.1 — Tool Executor
 *
 * Executes registered tools with input validation, reference safety (structuredClone),
 * error normalization, and event telemetry.
 */

import type { ToolRegistry } from "./ToolRegistry";
import type { ToolContext, ToolResult } from "./ToolContracts";
import { toolOk, toolFail } from "./ToolContracts";
import type { RuntimeEventBus } from "../events/RuntimeEvent";
import { RuntimeEventTypes } from "../events/RuntimeEvent";
import {
  ToolNotFoundError,
  ToolValidationError,
  ToolExecutionError,
} from "../errors/Errors";

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly eventBus?: RuntimeEventBus
  ) {}

  /**
   * Execute a tool by ID with input validation and reference safety.
   */
  async execute<TInput = unknown, TOutput = unknown>(
    toolId: string,
    input: TInput,
    context: ToolContext
  ): Promise<ToolResult<TOutput>> {
    const t0 = Date.now();

    // 1. Tool Lookup
    const tool = this.registry.get<TInput, TOutput>(toolId);
    if (!tool) {
      const err = new ToolNotFoundError(toolId);
      this._emitFailed(context, toolId, "TOOL_NOT_FOUND", err.message, Date.now() - t0);
      return toolFail("TOOL_NOT_FOUND", err.message, err, Date.now() - t0);
    }

    // 2. Input Validation
    let validatedInput = input;
    if (tool.validateInput) {
      const vRes = tool.validateInput(input);
      if (!vRes.valid) {
        const errMsg = vRes.error ?? "Validation failed";
        const err = new ToolValidationError(toolId, errMsg);
        this._emitFailed(context, toolId, "TOOL_VALIDATION_ERROR", err.message, Date.now() - t0);
        return toolFail("TOOL_VALIDATION_ERROR", err.message, err, Date.now() - t0);
      }
      if (vRes.parsed !== undefined) {
        validatedInput = vRes.parsed;
      }
    }

    // 3. Input Reference Isolation
    const clonedInput = structuredClone(validatedInput);

    // 4. Telemetry: Tool Started
    this.eventBus?.publish(RuntimeEventTypes.TOOL_STARTED as any, {
      workflowId: context.workflowId,
      runId: context.runId,
      stepId: context.stepId,
      toolId,
      timestamp: new Date().toISOString(),
    });

    // 5. Tool Execution
    try {
      const rawResult = await tool.execute(clonedInput, context);
      const durationMs = Date.now() - t0;

      if (!rawResult.success) {
        const code = rawResult.error?.code ?? "TOOL_EXECUTION_FAILURE";
        const msg = rawResult.error?.message ?? "Tool returned success=false";
        this._emitFailed(context, toolId, code, msg, durationMs);
        return toolFail(code, msg, rawResult.error?.cause, durationMs);
      }

      // Output Reference Isolation
      const clonedOutput = structuredClone(rawResult.output);

      this.eventBus?.publish(RuntimeEventTypes.TOOL_COMPLETED as any, {
        workflowId: context.workflowId,
        runId: context.runId,
        stepId: context.stepId,
        toolId,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      return toolOk(clonedOutput as TOutput, durationMs);
    } catch (thrown) {
      const durationMs = Date.now() - t0;
      const normErr = new ToolExecutionError(toolId, thrown);
      this._emitFailed(context, toolId, "TOOL_EXECUTION_ERROR", normErr.message, durationMs);
      return toolFail("TOOL_EXECUTION_ERROR", normErr.message, thrown, durationMs);
    }
  }

  private _emitFailed(
    context: ToolContext,
    toolId: string,
    errorCode: string,
    errorMessage: string,
    durationMs: number
  ): void {
    this.eventBus?.publish(RuntimeEventTypes.TOOL_FAILED as any, {
      workflowId: context.workflowId,
      runId: context.runId,
      stepId: context.stepId,
      toolId,
      errorCode,
      errorMessage,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }
}
