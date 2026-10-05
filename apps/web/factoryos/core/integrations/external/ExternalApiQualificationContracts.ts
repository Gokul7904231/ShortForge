/**
 * External API Qualification Contracts
 *
 * IMPLEMENTED means the adapter exists.
 * QUALIFIED is evidence-backed provider capability, never inferred from mocks.
 *
 * This layer is deliberately advisory/control-plane only:
 * providers never gain F00, Treasury, ComputeRouter, F06, CAS or F07 authority.
 */

export type QualificationDisposition =
  | "QUALIFIED"
  | "CONFIGURED-BUT-NOT-QUALIFIED"
  | "NOT-APPLICABLE";

export type QualificationExecutionMode =
  | "SAFE_CONFIG"
  | "LIVE";

export type QualificationProbeKind =
  | "JSON_GET"
  | "JSON_POST"
  | "BINARY_POST"
  | "MCP";

export interface ExternalApiQualificationProfile {
  readonly providerId: string;
  readonly probeKind: QualificationProbeKind;
  readonly credentialEnvs: readonly string[];
  readonly metered: boolean;
  readonly destructive: boolean;
  readonly defaultEnabled: boolean;
  readonly capability: string;
  readonly endpointDescription: string;
  readonly notes: string;
}

export interface QualificationHttpObservation {
  readonly status: number;
  readonly durationMs: number;
  readonly contentType?: string;
  readonly contentLengthBytes?: number;
  readonly retryAfterSeconds?: number;
  readonly rateLimitLimit?: number;
  readonly rateLimitRemaining?: number;
  readonly rateLimitResetEpochSeconds?: number;
  readonly requestId?: string;
}

export interface QualificationResult {
  readonly providerId: string;
  readonly runId: string;
  readonly executionMode: QualificationExecutionMode;
  readonly disposition: QualificationDisposition;
  readonly configured: boolean;
  readonly capabilityVerified: boolean;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly observation?: QualificationHttpObservation;
  readonly normalized: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly evidence: readonly string[];
}

export function isMeteredOrDestructive(
  profile: ExternalApiQualificationProfile,
): boolean {
  return profile.metered || profile.destructive;
}

export function canRunLive(
  profile: ExternalApiQualificationProfile,
  options: {
    readonly live: boolean;
    readonly allowMetered: boolean;
  },
): boolean {
  if (!options.live) return false;
  if (isMeteredOrDestructive(profile) && !options.allowMetered) return false;
  return true;
}

export function redactSecretBearingUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of [
      "key",
      "token",
      "api_key",
      "apikey",
      "access_token",
      "client_secret",
    ]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[REDACTED]");
    }
    return url.toString();
  } catch {
    return "[UNPARSEABLE_URL]";
  }
}

export type QualificationEvidenceKind =
  | "NETWORK_REQUEST"
  | "CAPABILITY_OUTPUT"
  | "NORMALIZED_RESULT"
  | "VISUAL_MATERIALIZATION"
  | "PHYSICAL_AUDIO"
  | "MCP_TOOL_EXECUTION";

export interface QualificationLedgerEntry {
  readonly providerId: string;
  readonly disposition: QualificationDisposition | "PENDING";
  readonly evidenceKinds: readonly QualificationEvidenceKind[];
  readonly runId?: string;
  readonly lastQualifiedAt?: string;
  readonly evidenceRefs: readonly string[];
}

export function qualificationEvidenceIsSufficient(
  profile: ExternalApiQualificationProfile,
  result: Pick<QualificationResult, "capabilityVerified" | "evidence">
): boolean {
  if (!result.capabilityVerified) return false;
  const evidence = new Set(result.evidence);
  if (!evidence.has("LIVE_NETWORK_REQUEST")) return false;
  if (profile.probeKind === "MCP" && !evidence.has("MCP_TOOL_EXECUTION")) return false;
  if (profile.capability.includes("VISUAL_ASSET_SEARCH") && !evidence.has("VISUAL_MATERIALIZATION")) return false;
  if (profile.capability === "TTS" && !evidence.has("PHYSICAL_AUDIO")) return false;
  return true;
}
