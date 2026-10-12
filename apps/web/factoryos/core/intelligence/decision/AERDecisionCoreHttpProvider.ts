/**
 * ShortForge / FactoryOS — HTTP AER-Core provider.
 *
 * This is a provider transport only. It does not change DecisionEngine
 * authority rules. The serving endpoint must expose a trained checkpoint
 * through the AERDecisionCoreProvider contract.
 */

import type {
  AERDecisionCoreInput,
  AERDecisionCoreMode,
  AERDecisionCoreOutput,
  AERDecisionCoreProvider,
} from "./AERDecisionCoreContract";

export interface AERDecisionCoreHttpProviderConfig {
  readonly endpoint: string;
  readonly modelRef: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly allowedOrigins: readonly string[];
}

function assertHttpEndpoint(
  endpoint: string,
  allowedOrigins: readonly string[],
): URL {
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("AER-Core endpoint must use HTTP(S)");
  }
  const allowed = allowedOrigins.map(
    (origin) => new URL(origin).origin,
  );
  if (allowed.length === 0 || !allowed.includes(url.origin)) {
    throw new Error("AER-Core endpoint origin is not allowlisted");
  }
  return url;
}

export class AERDecisionCoreHttpProvider
  implements AERDecisionCoreProvider
{
  public readonly providerName = "AER_CORE_HTTP";
  public readonly supportedModes: readonly AERDecisionCoreMode[] = [
    "NOUL",
    "CHOICE",
    "SCORE",
  ];

  private readonly endpoint: URL;
  private readonly modelRef: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  public constructor(
    config: AERDecisionCoreHttpProviderConfig,
  ) {
    this.endpoint = assertHttpEndpoint(
      config.endpoint,
      config.allowedOrigins,
    );
    this.modelRef = config.modelRef;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  public async evaluate(
    input: AERDecisionCoreInput,
  ): Promise<AERDecisionCoreOutput> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = "Bearer " + this.apiKey;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          modelRef: this.modelRef,
          request: input.request,
          epistemicContext: input.epistemicContext,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          "AER-Core provider HTTP " + response.status,
        );
      }

      const payload = (await response.json()) as Partial<AERDecisionCoreOutput>;
      if (!payload || typeof payload !== "object") {
        throw new Error("AER-Core provider returned a non-object response");
      }
      if (!payload.batchId || payload.batchId !== input.request.batchId) {
        throw new Error("AER-Core provider returned the wrong batchId");
      }
      if (
        !Array.isArray(payload.answers) ||
        typeof payload.modelRef !== "string" ||
        typeof payload.modelVersion !== "string"
      ) {
        throw new Error("AER-Core provider returned an invalid response contract");
      }

      return {
        batchId: payload.batchId,
        answers: payload.answers,
        modelRef: payload.modelRef,
        modelVersion: payload.modelVersion,
        inferenceLatencyMs:
          typeof payload.inferenceLatencyMs === "number"
            ? payload.inferenceLatencyMs
            : Date.now() - startedAt,
        calibrationStatus:
          payload.calibrationStatus ?? "UNKNOWN",
        probabilitySemantics:
          payload.probabilitySemantics ?? "UNKNOWN",
        trainingEligible: false,
        productionAuthority: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
