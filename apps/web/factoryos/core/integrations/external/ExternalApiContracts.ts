/**
 * ShortForge External API Fabric
 *
 * Provider integrations are replaceable resources behind typed capabilities.
 * External providers never become authorities for truth, scheduling, economics,
 * F06 worker control, CAS identity, or F07 release verification.
 */

export type ExternalApiCategory =
  | "RESEARCH"
  | "VISUAL"
  | "VIDEO_RESEARCH"
  | "LLM"
  | "AUDIO"
  | "SAFETY_DOCUMENT"
  | "CONTEXT"
  | "MCP";

export type ExternalApiCapability =
  | "ACADEMIC_RESEARCH"
  | "WEB_RESEARCH"
  | "VIDEO_RESEARCH"
  | "VISUAL_ASSET_SEARCH"
  | "LLM_INFERENCE"
  | "TTS"
  | "AUDIO_ASSET_SEARCH"
  | "DOCUMENT_OCR"
  | "SAFETY_CHECK"
  | "GEO_CONTEXT"
  | "MCP_TOOLS";

export type ExternalApiAuth =
  | "NONE"
  | "API_KEY"
  | "BEARER"
  | "OAUTH2"
  | "EMAIL_PARAMETER";

export type ExternalApiLifecycle =
  | "CATALOGUED"
  | "IMPLEMENTED"
  | "PARTIAL"
  | "UNVERIFIED"
  | "QUALIFIED";

export type ExternalApiCostTier =
  | "FREE"
  | "FREE_TIER"
  | "METERED"
  | "PREMIUM"
  | "UNKNOWN";

export interface ExternalApiProviderDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: ExternalApiCategory;
  readonly capabilities: readonly ExternalApiCapability[];
  readonly baseUrl: string;
  readonly auth: ExternalApiAuth;
  readonly credentialEnv?: string;
  readonly lifecycle: ExternalApiLifecycle;
  readonly costTier: ExternalApiCostTier;
  readonly docsUrl: string;
  readonly notes: string;
}

export interface ExternalApiRequestContext {
  readonly requestId: string;
  readonly missionId?: string;
  readonly runId?: string;
  readonly floorId?: string;
  readonly traceId?: string;
  readonly purpose: string;
}

export interface ExternalApiCallResult<T> {
  readonly providerId: string;
  readonly requestId: string;
  readonly status: number;
  readonly durationMs: number;
  readonly data: T;
}

export class ExternalApiError extends Error {
  readonly providerId: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    providerId: string,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "ExternalApiError";
    this.providerId = providerId;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export interface ExternalApiRegistrySnapshot {
  readonly generatedAt: string;
  readonly providers: readonly ExternalApiProviderDefinition[];
}
