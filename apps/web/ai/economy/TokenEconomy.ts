/**
 * ShortForge / FactoryOS — Token Economy & Call Gate Architecture
 *
 * Implements Ponytail runtime economy, typed CallGate, taxonomical RetryClassifier,
 * and TokenEconomyEvent telemetry.
 */

import * as crypto from "node:crypto";

export type CallSkipReason =
  | "CACHE_HIT"
  | "DETERMINISTIC_ANSWER_EXISTS"
  | "ARTIFACT_EXISTS"
  | "STATE_UNCHANGED"
  | "DOWNSTREAM_ALREADY_SATISFIED"
  | "PERMANENT_ERROR_NON_RETRYABLE"
  | "BUDGET_EXCEEDED"
  | "POLICY_DISALLOWED";

export interface TokenEconomyEvent {
  readonly eventId: string;
  readonly missionId?: string;
  readonly taskId?: string;
  readonly traceId: string;

  readonly operation: string;
  readonly capability: string;

  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;

  // Exact usage tracking
  readonly estimatedInputTokens: number;
  readonly actualInputTokens?: number;

  readonly estimatedOutputTokens: number;
  readonly actualOutputTokens?: number;

  readonly cachedTokens: number;
  readonly totalTokens: number;

  readonly costUSD: number;
  readonly latencyMs: number;

  readonly retryCount: number;
  readonly callSkipped: boolean;
  readonly skipReason?: CallSkipReason;

  // Strict Fingerprinting
  readonly contextHash: string;
  readonly questionSetHash?: string;
  readonly promptHash: string;

  readonly decisionType?: "NOUL" | "CHOICE" | "SCORE" | "GENERATION";
  readonly decisionProvider?: "DETERMINISTIC" | "JEV" | "LLM" | "LOCAL";

  readonly fallbackUsed: boolean;
  readonly escalated: boolean;
  readonly timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RetryClassifier (10 Taxonomical Types)
// ─────────────────────────────────────────────────────────────────────────────

export type FailureTaxonomyType =
  | "TRANSIENT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "AUTH_FAILURE"
  | "INVALID_INPUT"
  | "SCHEMA_FAILURE"
  | "CONFIGURATION_FAILURE"
  | "PROVIDER_FAILURE"
  | "RESOURCE_EXHAUSTION"
  | "UNKNOWN";

export interface RetryClassification {
  readonly failureType: FailureTaxonomyType;
  readonly isRetryable: boolean;
  readonly maxRetries: number;
  readonly currentAttempt: number;
  readonly shouldRetry: boolean;
  readonly backoffMs: number;
  readonly reason: string;
}

export class RetryClassifier {
  public static classify(error: unknown, currentAttempt: number = 1): RetryClassification {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as any)?.status || (error as any)?.statusCode;

    let failureType: FailureTaxonomyType = "UNKNOWN";
    let isRetryable = false;
    let maxRetries = 0;
    let baseBackoffMs = 1000;

    // Classification Rules
    if (status === 429 || /rate[- ]?limit|too many requests/i.test(message)) {
      failureType = "RATE_LIMITED";
      isRetryable = true;
      maxRetries = 4;
      baseBackoffMs = 2500;
    } else if (status === 401 || status === 403 || /unauthorized|forbidden|invalid api key/i.test(message)) {
      failureType = "AUTH_FAILURE";
      isRetryable = false;
      maxRetries = 0;
    } else if (status === 400 || /bad request|invalid parameter|validation failed/i.test(message)) {
      failureType = "INVALID_INPUT";
      isRetryable = false;
      maxRetries = 0;
    } else if (status === 413 || /context length exceeded|maximum context/i.test(message)) {
      failureType = "RESOURCE_EXHAUSTION";
      isRetryable = true; // Retryable with context compression
      maxRetries = 1;
      baseBackoffMs = 500;
    } else if (/timeout|ETIMEDOUT|timed? out/i.test(message)) {
      failureType = "TIMEOUT";
      isRetryable = true;
      maxRetries = 1;
      baseBackoffMs = 2000;
    } else if (status === 503 || /service unavailable|ECONNRESET|ECONNREFUSED/i.test(message)) {
      failureType = "TRANSIENT";
      isRetryable = true;
      maxRetries = 3;
      baseBackoffMs = 1000;
    } else if (status === 500 || status === 502 || /internal server error|bad gateway/i.test(message)) {
      failureType = "PROVIDER_FAILURE";
      isRetryable = true; // Fallback provider
      maxRetries = 2;
      baseBackoffMs = 1500;
    } else if (/zod|schema mismatch|json parse/i.test(message)) {
      failureType = "SCHEMA_FAILURE";
      isRetryable = true; // Retry with schema repair
      maxRetries = 2;
      baseBackoffMs = 500;
    } else if (/missing required environment|not configured|unsupported provider/i.test(message)) {
      failureType = "CONFIGURATION_FAILURE";
      isRetryable = false;
      maxRetries = 0;
    } else {
      failureType = "UNKNOWN";
      isRetryable = currentAttempt <= 1;
      maxRetries = 1;
      baseBackoffMs = 1000;
    }

    const shouldRetry = isRetryable && currentAttempt <= maxRetries;
    // Exponential backoff with jitter
    const backoffMs = shouldRetry
      ? Math.min(30000, baseBackoffMs * Math.pow(2, currentAttempt - 1) + Math.random() * 500)
      : 0;

    return {
      failureType,
      isRetryable,
      maxRetries,
      currentAttempt,
      shouldRetry,
      backoffMs,
      reason: message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CallGate
// ─────────────────────────────────────────────────────────────────────────────

export interface CallGateEvaluationParams {
  operation: string;
  capability: string;
  prompt: string;
  contextHash?: string;
  stateHash?: string;
  deterministicValue?: unknown;
  existingArtifactUri?: string;
  remainingBudgetUSD?: number;
  estimatedCostUSD?: number;
}

export interface CallGateDecision {
  allowCall: boolean;
  skipReason?: CallSkipReason;
  cachedResponse?: unknown;
  deterministicResponse?: unknown;
  reusedArtifactUri?: string;
  promptHash: string;
}

export class CallGate {
  private static responseCache: Map<
    string,
    { value: unknown; expiresAt: number; promptHash: string }
  > = new Map();

  public static hashPrompt(prompt: string): string {
    return crypto.createHash("sha256").update(prompt.trim()).digest("hex");
  }

  public static evaluate(params: CallGateEvaluationParams): CallGateDecision {
    const promptHash = this.hashPrompt(params.prompt);

    // Rule 1: Deterministic Answer Exists (Highest economy priority)
    if (params.deterministicValue !== undefined) {
      return {
        allowCall: false,
        skipReason: "DETERMINISTIC_ANSWER_EXISTS",
        deterministicResponse: params.deterministicValue,
        promptHash,
      };
    }

    // Rule 2: Artifact Exists (State unchanged)
    if (params.existingArtifactUri) {
      return {
        allowCall: false,
        skipReason: "ARTIFACT_EXISTS",
        reusedArtifactUri: params.existingArtifactUri,
        promptHash,
      };
    }

    // Rule 3: Exact Hash Cache Hit
    const cacheKey = `${params.capability}_${params.contextHash || "none"}_${promptHash}`;
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return {
        allowCall: false,
        skipReason: "CACHE_HIT",
        cachedResponse: cached.value,
        promptHash,
      };
    }

    // Rule 4: Budget Exceeded
    if (
      params.remainingBudgetUSD !== undefined &&
      params.estimatedCostUSD !== undefined &&
      params.estimatedCostUSD > params.remainingBudgetUSD
    ) {
      return {
        allowCall: false,
        skipReason: "BUDGET_EXCEEDED",
        promptHash,
      };
    }

    // Call permitted
    return {
      allowCall: true,
      promptHash,
    };
  }

  public static recordCache(
    capability: string,
    prompt: string,
    value: unknown,
    contextHash?: string,
    ttlMs: number = 300000
  ): void {
    const promptHash = this.hashPrompt(prompt);
    const cacheKey = `${capability}_${contextHash || "none"}_${promptHash}`;
    this.responseCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttlMs,
      promptHash,
    });
  }

  public static clearCache(): void {
    this.responseCache.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TokenEconomy Ledger
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenEconomySummary {
  totalCalls: number;
  skippedCalls: number;
  totalEstimatedTokens: number;
  totalActualTokens: number;
  totalCostUSD: number;
  cacheHitCount: number;
  deterministicHitCount: number;
  averageLatencyMs: number;
}

export class TokenEconomyLedger {
  private static instance: TokenEconomyLedger;
  private events: TokenEconomyEvent[] = [];

  public static getInstance(): TokenEconomyLedger {
    if (!this.instance) {
      this.instance = new TokenEconomyLedger();
    }
    return this.instance;
  }

  public recordEvent(event: TokenEconomyEvent): void {
    this.events.push(event);
  }

  public getEvents(): readonly TokenEconomyEvent[] {
    return this.events;
  }

  public getSummary(): TokenEconomySummary {
    let totalEstimatedTokens = 0;
    let totalActualTokens = 0;
    let totalCostUSD = 0;
    let totalLatencyMs = 0;
    let skippedCalls = 0;
    let cacheHitCount = 0;
    let deterministicHitCount = 0;

    for (const e of this.events) {
      totalEstimatedTokens += e.estimatedInputTokens + e.estimatedOutputTokens;
      totalActualTokens += (e.actualInputTokens || 0) + (e.actualOutputTokens || 0);
      totalCostUSD += e.costUSD;
      totalLatencyMs += e.latencyMs;

      if (e.callSkipped) {
        skippedCalls++;
        if (e.skipReason === "CACHE_HIT") cacheHitCount++;
        if (e.skipReason === "DETERMINISTIC_ANSWER_EXISTS") deterministicHitCount++;
      }
    }

    const executedCalls = this.events.length - skippedCalls;
    const averageLatencyMs = executedCalls > 0 ? totalLatencyMs / executedCalls : 0;

    return {
      totalCalls: this.events.length,
      skippedCalls,
      totalEstimatedTokens,
      totalActualTokens,
      totalCostUSD,
      cacheHitCount,
      deterministicHitCount,
      averageLatencyMs,
    };
  }

  public clear(): void {
    this.events = [];
  }
}
