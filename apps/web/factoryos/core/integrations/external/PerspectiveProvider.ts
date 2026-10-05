import { randomUUID } from "node:crypto";
import {
  SafetyDocumentProviderError,
} from "./SafetyDocumentContracts";

export type PerspectiveAttribute = string;

export interface PerspectiveAnalysisRequest {
  readonly text: string;
  readonly languages?: readonly string[];
  readonly requestedAttributes?: readonly PerspectiveAttribute[];
  readonly doNotStore?: boolean;
  readonly clientToken?: string;
}

export interface PerspectiveAttributeScore {
  readonly value: number;
  readonly spanScores?: readonly {
    readonly begin: number;
    readonly end: number;
    readonly value: number;
  }[];
}

export interface PerspectiveAnalysisResult {
  readonly providerId: "PERSPECTIVE";
  readonly requestId: string;
  readonly retrievedAt: string;
  readonly attributeScores: Readonly<Record<string, PerspectiveAttributeScore>>;
  readonly detected: Readonly<Record<string, boolean>>;
}

function boundedText(text: string): string {
  const value = text.trim();
  if (!value) {
    throw new SafetyDocumentProviderError(
      "PERSPECTIVE",
      "Perspective analysis text cannot be empty.",
    );
  }
  if (value.length > 20_000) {
    throw new SafetyDocumentProviderError(
      "PERSPECTIVE",
      "Perspective analysis text exceeds the 20,000 character safety limit.",
    );
  }
  return value;
}

function score(value: unknown): PerspectiveAttributeScore | null {
  const summary =
    value && typeof value === "object"
      ? (value as Record<string, unknown>).summaryScore
      : undefined;
  const numeric = Number(
    summary && typeof summary === "object"
      ? (summary as Record<string, unknown>).value
      : NaN,
  );

  if (!Number.isFinite(numeric)) return null;

  const spans =
    value && typeof value === "object"
      ? (value as Record<string, unknown>).spanScores
      : undefined;

  const spanScores = Array.isArray(spans)
    ? spans.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const obj = item as Record<string, unknown>;
        const begin = Number(obj.begin);
        const end = Number(obj.end);
        const value = Number(obj.score);
        if (
          !Number.isFinite(begin) ||
          !Number.isFinite(end) ||
          !Number.isFinite(value)
        ) {
          return [];
        }
        return [{ begin, end, value }];
      })
    : undefined;

  return {
    value: numeric,
    ...(spanScores && spanScores.length ? { spanScores } : {}),
  };
}

export class PerspectiveProvider {
  readonly id = "PERSPECTIVE" as const;

  async analyze(
    request: PerspectiveAnalysisRequest,
  ): Promise<PerspectiveAnalysisResult> {
    const apiKey = process.env.PERSPECTIVE_API_KEY?.trim();
    if (!apiKey) {
      throw new SafetyDocumentProviderError(
        this.id,
        "PERSPECTIVE_API_KEY is not configured.",
      );
    }

    const text = boundedText(request.text);
    const endpoint = new URL(
      "https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze",
    );
    endpoint.searchParams.set("key", apiKey);

    const requestedAttributes =
      request.requestedAttributes?.length
        ? request.requestedAttributes
        : ["TOXICITY", "SEVERE_TOXICITY", "IDENTITY_ATTACK", "INSULT", "THREAT"];

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        comment: { text },
        languages: request.languages?.length ? request.languages : ["en"],
        requestedAttributes: Object.fromEntries(
          requestedAttributes.map((attribute) => [attribute, {}]),
        ),
        ...(request.doNotStore === undefined
          ? {}
          : { doNotStore: request.doNotStore }),
        ...(request.clientToken
          ? { clientToken: request.clientToken }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new SafetyDocumentProviderError(
        this.id,
        "Perspective returned HTTP " +
          response.status +
          (body ? ": " + body.slice(0, 400) : ""),
        {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        },
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new SafetyDocumentProviderError(
        this.id,
        "Perspective returned malformed JSON.",
      );
    }

    const rawScores = payload?.attributeScores;
    if (!rawScores || typeof rawScores !== "object") {
      throw new SafetyDocumentProviderError(
        this.id,
        "Perspective response did not contain attributeScores.",
      );
    }

    const attributeScores: Record<string, PerspectiveAttributeScore> = {};
    for (const [attribute, value] of Object.entries(rawScores)) {
      const normalized = score(value);
      if (normalized) attributeScores[attribute] = normalized;
    }

    if (Object.keys(attributeScores).length === 0) {
      throw new SafetyDocumentProviderError(
        this.id,
        "Perspective response contained no usable attribute scores.",
      );
    }

    return {
      providerId: this.id,
      requestId:
        typeof payload?.requestId === "string"
          ? payload.requestId
          : "perspective_" + randomUUID().slice(0, 10),
      retrievedAt: new Date().toISOString(),
      attributeScores,
      detected: Object.fromEntries(
        Object.entries(attributeScores).map(([attribute, value]) => [
          attribute,
          value.value >= 0.5,
        ]),
      ),
    };
  }
}
