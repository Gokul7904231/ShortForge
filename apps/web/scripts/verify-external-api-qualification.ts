/**
 * Governed live qualification harness for the 28-provider External API Fabric.
 *
 * Safe default:
 *   npm run factoryos:verify:external-apis
 *   -> configuration only; zero network calls.
 *
 * Live mode:
 *   SHORTFORGE_EXTERNAL_API_LIVE=1
 *   SHORTFORGE_EXTERNAL_API_PROVIDER=<registry id>
 *   SHORTFORGE_EXTERNAL_API_ALLOW_METERED=1  # required for metered/destructive
 *   SHORTFORGE_EXTERNAL_API_MATERIALIZE=1     # required for visual assets
 *
 * This harness never changes provider authority or worker eligibility.
 */

import { randomUUID } from "node:crypto";
import {
  ExternalApiRegistry,
} from "../factoryos/core/integrations/external/ExternalApiRegistry";
import {
  canRunLive,
  type ExternalApiQualificationProfile,
  type QualificationResult,
} from "../factoryos/core/integrations/external/ExternalApiQualificationContracts";
import {
  configured,
  executeProfile,
  externalApiQualificationProfiles,
  getExternalApiQualificationProfile,
} from "../factoryos/core/integrations/external/ExternalApiQualificationProbes";

const EXPECTED_PROVIDER_COUNT = 28;

function now(): string {
  return new Date().toISOString();
}

function baseResult(
  profile: ExternalApiQualificationProfile,
  runId: string,
  executionMode: "SAFE_CONFIG" | "LIVE",
  disposition: QualificationResult["disposition"],
  values: Partial<QualificationResult> = {},
): QualificationResult {
  return {
    providerId: profile.providerId,
    runId,
    executionMode,
    disposition,
    configured: values.configured ?? false,
    capabilityVerified: values.capabilityVerified ?? false,
    startedAt: values.startedAt || now(),
    completedAt: values.completedAt || now(),
    normalized: values.normalized || {},
    observation: values.observation,
    errorCode: values.errorCode,
    errorMessage: values.errorMessage,
    evidence: values.evidence || [],
  };
}

function validateRegistry(): void {
  const registry = ExternalApiRegistry.list();
  if (registry.length !== EXPECTED_PROVIDER_COUNT) {
    throw new Error(
      `External API registry contains ${registry.length} providers; expected ${EXPECTED_PROVIDER_COUNT}.`,
    );
  }

  const profileIds = new Set(
    externalApiQualificationProfiles().map((profile) => profile.providerId),
  );
  const registryIds = new Set(registry.map((provider) => provider.id));

  for (const id of registryIds) {
    if (!profileIds.has(id)) {
      throw new Error(`Missing qualification profile for registry provider: ${id}`);
    }
  }

  for (const profile of externalApiQualificationProfiles()) {
    const provider = ExternalApiRegistry.get(profile.providerId);
    if (!provider) throw new Error(`Qualification profile has unknown provider: ${profile.providerId}`);
    if (provider.lifecycle !== "IMPLEMENTED") {
      throw new Error(
        `Provider ${profile.providerId} is ${provider.lifecycle}, not IMPLEMENTED; qualification must not bypass lifecycle truth.`,
      );
    }
  }
}

function printResult(result: QualificationResult): void {
  // Deliberately emit only sanitized, structured evidence.
  console.log(JSON.stringify(result));
}

function mainSafeMode(): void {
  validateRegistry();

  const profiles = externalApiQualificationProfiles();
  const results = profiles.map((profile) => {
    const state = configured(profile);
    return baseResult(
      profile,
      "config_" + randomUUID().slice(0, 12),
      "SAFE_CONFIG",
      "CONFIGURED-BUT-NOT-QUALIFIED",
      {
        configured: state.configured,
        normalized: {
          missingConfiguration: state.missing,
          capabilityVerified: false,
        },
        errorCode: state.configured ? "LIVE_PROBE_REQUIRED" : "MISSING_CONFIGURATION",
        errorMessage: state.configured
          ? "Provider credentials/configuration are present, but no live capability proof was executed."
          : "Provider is not fully configured for a live qualification run.",
        evidence: ["SAFE_CONFIG_ONLY", "LIVE_NETWORK_CALL_NOT_EXECUTED"],
      },
    );
  });

  for (const result of results) printResult(result);
  console.log(JSON.stringify({
    mode: "SAFE_CONFIG",
    providerCount: results.length,
    qualifiedCount: 0,
    note: "Safe mode never performs provider network requests.",
  }));
}

async function mainLive(): Promise<void> {
  validateRegistry();

  const providerId = process.env.SHORTFORGE_EXTERNAL_API_PROVIDER?.trim();
  if (!providerId) {
    throw new Error("SHORTFORGE_EXTERNAL_API_PROVIDER is required in live mode.");
  }

  const profile = getExternalApiQualificationProfile(providerId);
  if (!profile) throw new Error(`Unknown external API provider: ${providerId}`);

  const state = configured(profile);
  const live = process.env.SHORTFORGE_EXTERNAL_API_LIVE === "1";
  const allowMetered = process.env.SHORTFORGE_EXTERNAL_API_ALLOW_METERED === "1";

  if (!state.configured) {
    printResult(baseResult(
      profile,
      "live_" + randomUUID().slice(0, 12),
      "LIVE",
      "CONFIGURED-BUT-NOT-QUALIFIED",
      {
        configured: false,
        errorCode: "MISSING_CONFIGURATION",
        errorMessage: state.missing.join(", "),
        normalized: { missingConfiguration: state.missing },
        evidence: ["LIVE_PROBE_NOT_STARTED", "MISSING_CONFIGURATION"],
      },
    ));
    process.exitCode = 2;
    return;
  }

  if (!canRunLive(profile, { live, allowMetered })) {
    const reason = profile.metered
      ? "Metered provider requires SHORTFORGE_EXTERNAL_API_ALLOW_METERED=1."
      : "Destructive provider requires explicit live authorization.";
    printResult(baseResult(
      profile,
      "guard_" + randomUUID().slice(0, 12),
      "LIVE",
      "CONFIGURED-BUT-NOT-QUALIFIED",
      {
        configured: true,
        errorCode: "EXPLICIT_LIVE_AUTH_REQUIRED",
        errorMessage: reason,
        normalized: { provider: providerId, guarded: true },
        evidence: ["PROBE_GUARD_BLOCKED"],
      },
    ));
    process.exitCode = 3;
    return;
  }

  if (
    (providerId === "pexels" || providerId === "pixabay" || providerId === "pexafy") &&
    process.env.SHORTFORGE_EXTERNAL_API_MATERIALIZE !== "1"
  ) {
    printResult(baseResult(
      profile,
      "guard_" + randomUUID().slice(0, 12),
      "LIVE",
      "CONFIGURED-BUT-NOT-QUALIFIED",
      {
        configured: true,
        errorCode: "MATERIALIZATION_REQUIRED",
        errorMessage: "Visual provider qualification requires explicit representative asset materialization.",
        normalized: {},
        evidence: ["SEARCH_ONLY_NOT_QUALIFIED", "SET_SHORTFORGE_EXTERNAL_API_MATERIALIZE=1"],
      },
    ));
    process.exitCode = 4;
    return;
  }

  const runId =
    process.env.GITHUB_RUN_ID
      ? `gha_${process.env.GITHUB_RUN_ID}`
      : "live_" + randomUUID().slice(0, 12);

  const startedAt = now();
  try {
    const execution = await executeProfile(profile);
    const success =
      Boolean(execution.observation) &&
      execution.observation.status >= 200 &&
      execution.observation.status < 300 &&
      execution.capabilityVerified;

    const result = baseResult(
      profile,
      runId,
      "LIVE",
      success ? "QUALIFIED" : "CONFIGURED-BUT-NOT-QUALIFIED",
      {
        configured: true,
        capabilityVerified: execution.capabilityVerified,
        startedAt,
        completedAt: now(),
        observation: execution.observation,
        normalized: execution.normalized,
        errorCode: success ? undefined : "CAPABILITY_PROOF_FAILED",
        errorMessage: success ? undefined : "Provider request completed, but the representative capability proof did not pass.",
        evidence: success
          ? [
              "LIVE_NETWORK_REQUEST",
              "PROVIDER_CAPABILITY_VERIFIED",
              profile.providerId === "perplexity_mcp"
                ? "MCP_INITIALIZE_AND_TOOLS_LIST"
                : "NORMALIZED_PROVIDER_RESULT",
            ]
          : ["LIVE_NETWORK_REQUEST", "PROVIDER_CAPABILITY_NOT_VERIFIED"],
      },
    );

    printResult(result);
    if (!success) process.exitCode = 1;
  } catch (error) {
    printResult(baseResult(
      profile,
      runId,
      "LIVE",
      "CONFIGURED-BUT-NOT-QUALIFIED",
      {
        configured: true,
        startedAt,
        completedAt: now(),
        normalized: {},
        errorCode: "LIVE_PROBE_ERROR",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        evidence: ["LIVE_NETWORK_REQUEST_FAILED"],
      },
    ));
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const live = process.env.SHORTFORGE_EXTERNAL_API_LIVE === "1";
  if (live) {
    await mainLive();
    return;
  }
  mainSafeMode();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
