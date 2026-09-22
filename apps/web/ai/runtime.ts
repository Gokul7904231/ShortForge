import crypto from "crypto";
import { AICapability } from "./capability-registry";
import { IntelligentRouter, AIProfile } from "./intelligent-router";
import {
  CallGate,
  CallGateDecision,
  RetryClassifier,
  TokenEconomyEvent,
  TokenEconomyLedger,
} from "./economy/TokenEconomy";

export interface RuntimeTrace {
  traceId: string;
  spanId: string;
  task: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  providerId?: string;
  modelId?: string;
  costUSD?: number;
  success: boolean;
  error?: string;
}

export interface RuntimeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  traceId?: string;
  subtask?: string;
  maxCostLimit?: number;
  requireLocal?: boolean;
  contextHash?: string;
  stateHash?: string;
  deterministicValue?: unknown;
  cacheTtlMs?: number;
  maxRetries?: number;
}

class AIRuntimeEngineClass {
  // Feature Flags
  public flags = {
    enableLocalAI: true,
    enableNvidia: true,
    enableBenchmark: true,
    enableAnalytics: true,
    enableMemory: true,
    enableStreaming: false,
    enableCallGate: true,
  };

  /**
   * Executes an AI capability with CallGate gating, RetryClassifier resilience, and TokenEconomy telemetry.
   */
  async execute(
    capability: AICapability,
    version: string,
    params: { prompt: string; system?: string; maxTokens?: number; temperature?: number },
    options: RuntimeOptions = {}
  ): Promise<any> {
    const traceId = options.traceId || `tr_${crypto.randomBytes(8).toString("hex")}`;
    const spanId = `sp_${crypto.randomBytes(6).toString("hex")}`;
    const startTime = Date.now();

    // 1. CallGate Evaluation (Ponytail Economy: Delete Unnecessary Work)
    if (this.flags.enableCallGate) {
      const gateDecision = CallGate.evaluate({
        operation: `${capability}:${version}`,
        capability,
        prompt: params.prompt,
        contextHash: options.contextHash,
        stateHash: options.stateHash,
        deterministicValue: options.deterministicValue,
      });

      if (!gateDecision.allowCall) {
        console.log(
          `[AIRuntime] [${traceId}] CallGate skipped call (${gateDecision.skipReason}). Zero tokens consumed.`
        );

        // Record zero-cost skipped event
        TokenEconomyLedger.getInstance().recordEvent({
          eventId: `ev_${traceId}_skip`,
          traceId,
          operation: `${capability}:${version}`,
          capability,
          provider: "CALL_GATE",
          model: "NONE",
          estimatedInputTokens: Math.ceil(params.prompt.length / 4),
          estimatedOutputTokens: 0,
          cachedTokens: gateDecision.skipReason === "CACHE_HIT" ? Math.ceil(params.prompt.length / 4) : 0,
          totalTokens: 0,
          costUSD: 0.0,
          latencyMs: Date.now() - startTime,
          retryCount: 0,
          callSkipped: true,
          skipReason: gateDecision.skipReason,
          contextHash: options.contextHash || "none",
          promptHash: gateDecision.promptHash,
          decisionType: "GENERATION",
          decisionProvider: gateDecision.skipReason === "DETERMINISTIC_ANSWER_EXISTS" ? "DETERMINISTIC" : "LOCAL",
          fallbackUsed: false,
          escalated: false,
          timestamp: new Date().toISOString(),
        });

        return gateDecision.deterministicResponse ?? gateDecision.cachedResponse;
      }
    }

    const trace: RuntimeTrace = {
      traceId,
      spanId,
      task: `${capability}:${version}`,
      startTime,
      success: false,
    };

    console.log(`[AIRuntime] [${traceId}:${spanId}] Starting execution for ${capability} (${version})`);

    let currentAttempt = 1;
    const maxAttempts = (options.maxRetries ?? 3) + 1;
    let lastError: any = null;

    while (currentAttempt <= maxAttempts) {
      // Setup Timeout & Cancellation guards
      const abortController = new AbortController();

      // Link parent signal if provided
      const parentSignal = options.signal;
      const parentListener = () => {
        console.log(`[AIRuntime] [${traceId}] Parent cancellation requested. Aborting runtime...`);
        abortController.abort();
      };

      if (parentSignal) {
        if (parentSignal.aborted) {
          throw new DOMException("Execution aborted by parent signal", "AbortError");
        }
        parentSignal.addEventListener("abort", parentListener);
      }

      let timeoutId: NodeJS.Timeout | null = null;
      const timeoutMs = options.timeoutMs ?? Number(process.env.AI_EXECUTION_TIMEOUT_MS ?? "30000");

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          console.warn(`[AIRuntime] [${traceId}] Timeout of ${timeoutMs}ms exceeded. Triggering abort...`);
          abortController.abort(new Error("TimeoutExceeded"));
        }, timeoutMs);
      }

      try {
        const executePromise = IntelligentRouter.routeExecute(
          {
            capability,
            subtask: options.subtask,
            maxCostLimit: options.maxCostLimit,
            requireLocal: options.requireLocal || !this.flags.enableLocalAI,
          },
          {
            ...params,
          }
        );

        const abortPromise = new Promise((_, reject) => {
          abortController.signal.addEventListener("abort", () => {
            const reason = abortController.signal.reason;
            if (reason?.message === "TimeoutExceeded") {
              reject(new Error(`[AIRuntime] Execution timed out after ${timeoutMs}ms`));
            } else {
              reject(new DOMException("Execution cancelled by user request", "AbortError"));
            }
          });
        });

        const result = await Promise.race([executePromise, abortPromise]);

        // Complete Trace
        const endTime = Date.now();
        trace.endTime = endTime;
        trace.duration = endTime - startTime;
        trace.success = true;

        // Record in CallGate cache
        CallGate.recordCache(
          capability,
          params.prompt,
          result,
          options.contextHash,
          options.cacheTtlMs ?? 300000
        );

        // Estimate token economy
        const estInput = Math.ceil(params.prompt.length / 4);
        const estOutput = result ? Math.ceil(JSON.stringify(result).length / 4) : 0;
        const totalTokens = estInput + estOutput;
        const estCostUSD = (estInput * 0.0000015) + (estOutput * 0.000002);

        TokenEconomyLedger.getInstance().recordEvent({
          eventId: `ev_${traceId}_${currentAttempt}`,
          traceId,
          operation: `${capability}:${version}`,
          capability,
          provider: "ROUTER_DEFAULT",
          model: "DEFAULT",
          estimatedInputTokens: estInput,
          estimatedOutputTokens: estOutput,
          cachedTokens: 0,
          totalTokens,
          costUSD: estCostUSD,
          latencyMs: trace.duration,
          retryCount: currentAttempt - 1,
          callSkipped: false,
          contextHash: options.contextHash || "none",
          promptHash: CallGate.hashPrompt(params.prompt),
          decisionType: "GENERATION",
          decisionProvider: "LLM",
          fallbackUsed: currentAttempt > 1,
          escalated: false,
          timestamp: new Date().toISOString(),
        });

        console.log(`[AIRuntime] [${traceId}] Completed execution successfully in ${trace.duration}ms`);
        return result;
      } catch (err: any) {
        lastError = err;
        const classification = RetryClassifier.classify(err, currentAttempt);

        console.warn(
          `[AIRuntime] [${traceId}] Attempt ${currentAttempt} failed with ${classification.failureType}. Retryable=${classification.shouldRetry}`
        );

        if (classification.shouldRetry && currentAttempt < maxAttempts) {
          currentAttempt++;
          if (classification.backoffMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, classification.backoffMs));
          }
          continue;
        }

        const endTime = Date.now();
        trace.endTime = endTime;
        trace.duration = endTime - startTime;
        trace.success = false;
        trace.error = err.message || String(err);

        console.error(`[AIRuntime] [${traceId}] Execution permanently failed: ${trace.error}`);
        throw err;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (parentSignal) parentSignal.removeEventListener("abort", parentListener);
        this.logTelemetryTrace(trace);
      }
    }

    throw lastError;
  }

  private logTelemetryTrace(trace: RuntimeTrace) {
    if (!this.flags.enableAnalytics) return;
    console.log(
      `[TELEMETRY TRACE] ${JSON.stringify({
        traceId: trace.traceId,
        spanId: trace.spanId,
        task: trace.task,
        durationMs: trace.duration,
        success: trace.success,
        error: trace.error,
      })}`
    );
  }
}

export const AIRuntime = new AIRuntimeEngineClass();
export type AIRuntimeEngine = typeof AIRuntime;
