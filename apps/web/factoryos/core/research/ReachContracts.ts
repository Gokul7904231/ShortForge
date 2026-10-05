import type { EngineResearchContract } from "../../../lib/core/EngineConfigurationContracts";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";

export type ReachResearchMode = "NORMAL" | "PRECISION" | "DEEP" | "CORROBORATION";
export type ReachProviderId =
  | "SEARXNG"
  | "DECODO_FAST_SEARCH"
  | "DECODO_WEB_SCRAPE"
  | "OPENALEX"
  | "ARXIV"
  | "SEMANTIC_SCHOLAR"
  | "CROSSREF"
  | "UNPAYWALL"
  | "PERPLEXITY_MCP"
  | string;
export type ReachProviderCapability = "SEARCH" | "WEB_RETRIEVE";

export interface ReachFetchRequest {
  readonly engineId: string;
  readonly queryKind: string;
  readonly topic: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly researchContract: EngineResearchContract;
  readonly maxSources?: number;
  readonly callerFloor?: string;
  readonly intent?: string;
  readonly mode?: ReachResearchMode;
}

export interface ReachProviderRequest {
  readonly request: ReachFetchRequest;
  readonly renderedQuery: string;
  readonly sourceUrl?: string;
}

export interface ReachProviderResponse {
  readonly provider: ReachProviderId;
  readonly capability: ReachProviderCapability;
  readonly sources: readonly EvidenceSource[];
  readonly requestId: string;
  readonly durationMs: number;
}

export interface ReachProviderHealthSnapshot {
  readonly provider: ReachProviderId;
  readonly state: "HEALTHY" | "DEGRADED" | "OPEN";
  readonly healthScore: number;
  readonly consecutiveFailures: number;
  readonly lastLatencyMs?: number;
  readonly lastError?: string;
  readonly openedUntil?: string;
}

export interface ReachEvent {
  readonly type:
    | "CACHE_HIT"
    | "CACHE_MISS"
    | "PROVIDER_SELECTED"
    | "PROVIDER_SUCCESS"
    | "PROVIDER_FAILURE"
    | "PROVIDER_SKIPPED"
    | "BUDGET_RESERVED"
    | "BUDGET_COMMITTED"
    | "BUDGET_RELEASED"
    | "FALLBACK"
    | "EVIDENCE_DEDUPED";
  readonly at: string;
  readonly provider?: ReachProviderId;
  readonly capability?: ReachProviderCapability;
  readonly requestId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ReachTelemetrySink {
  record(event: ReachEvent): void;
}

export interface ReachProvider {
  readonly id: ReachProviderId;
  readonly capabilities: readonly ReachProviderCapability[];
  search?(input: ReachProviderRequest): Promise<ReachProviderResponse>;
  retrieve?(input: ReachProviderRequest): Promise<ReachProviderResponse>;
}

export class ReachProviderError extends Error {
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ReachProviderError";
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export function inferReachResearchMode(request: ReachFetchRequest): ReachResearchMode {
  if (request.mode) return request.mode;

  switch (request.queryKind) {
    case "FACT_CHECK":
    case "TREND_SCAN":
    case "COMPETITOR_SCAN":
      return "PRECISION";
    default:
      return "NORMAL";
  }
}
