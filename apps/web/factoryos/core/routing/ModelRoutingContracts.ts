/**
 * FactoryOS v3 — Capability-First Model Routing Contracts
 * Eliminates hardcoded model strings in agent code.
 * Routes based on required capabilities, context window, cost, latency, and circuit breaker state.
 */

export type ModelCapability =
  | "TEXT_REASONING"
  | "STRUCTURED_JSON"
  | "FAST_CLASSIFICATION"
  | "VISION_ANALYSIS"
  | "AUDIO_TTS"
  | "EMBEDDING"
  | "RERANKING"
  | "TOOL_CALLING";

export type CircuitBreakerState = "CLOSED" | "HALF_OPEN" | "OPEN" | "RATE_LIMITED";

export interface ModelProviderInfo {
  readonly providerId: string;
  readonly name: string;
  readonly isLocal: boolean;
  readonly isPaid: boolean;
}

export interface RegisteredModel {
  readonly modelId: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly capabilities: readonly ModelCapability[];
  readonly maxContextTokens: number;
  readonly costPer1kTokensUsd: number;
  readonly baselineLatencyMs: number;
  readonly requiresGpu: boolean;
  readonly supportsStructuredJson: boolean;
}

export interface ModelRouteRequest {
  readonly requiredCapability: ModelCapability;
  readonly estimatedTokens?: number;
  readonly maxLatencyMs?: number;
  readonly maxCostUsd?: number;
  readonly preferLocal?: boolean;
  readonly requireStructuredJson?: boolean;
}

export interface ModelRouteSelection {
  readonly selectedModelId: string;
  readonly selectedProviderId: string;
  readonly isLocal: boolean;
  readonly estimatedCostUsd: number;
  readonly estimatedLatencyMs: number;
  readonly fallbackChain: Array<{ modelId: string; providerId: string }>;
  readonly circuitState: CircuitBreakerState;
  readonly selectionRationale: string;
}
