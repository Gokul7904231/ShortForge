import { createHash } from "node:crypto";
import type { OKFPolicyContext } from "../../governance/OKFPolicyContext";
import type {
  CognitiveRecommendation,
  EpistemicBudget,
  EpistemicContext,
  EpistemicState,
  EpistemicUsage,
} from "./EpistemicContracts";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalize(obj[key]))
      .join(",") +
    "}"
  );
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}
function redactString(value: string): string {
  let sanitized = value;
  sanitized = sanitized.replace(
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
    "Bearer [REDACTED_SECRET]",
  );
  sanitized = sanitized.replace(
    /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret|authorization)\s*[:=]\s*)(["']?)[^\s,"'}]+\2/gi,
    "$1$2[REDACTED_SECRET]$2",
  );
  sanitized = sanitized.replace(
    /((?:postgres|postgresql|mongodb|mysql):\/\/[^:]+:)[^@\s]+(@)/gi,
    "$1[REDACTED_SECRET]$2",
  );
  return sanitized;
}

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const sensitiveKey =
        /^(?:password|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)$/i.test(
          key,
        );
      result[key] = sensitiveKey ? "[REDACTED_SECRET]" : redact(child);
    }
    return result;
  }
  return value;
}

export interface BuildEpistemicContextOptions {
  readonly recommendation: CognitiveRecommendation;
  readonly budget: EpistemicBudget;
  readonly usage?: EpistemicUsage;
  readonly ttlMs?: number;
  readonly tokenEstimator?: (serialized: string) => number;
  readonly okfPolicyContext?: OKFPolicyContext;
}

export class EpistemicContextBuilder {
  public build(
    state: EpistemicState,
    options: BuildEpistemicContextOptions,
  ): EpistemicContext {
    const usage = options.usage ?? state.usage;
    const contextPayload = redact({
      ...state,
      cognitiveRecommendation: options.recommendation,
      budgets: options.budget,
      usage,
      okfPolicyContext: options.okfPolicyContext,
    }) as Omit<EpistemicState, "cognitiveRecommendation" | "budgets" | "usage"> & {
      cognitiveRecommendation: CognitiveRecommendation;
      budgets: EpistemicBudget;
      usage: EpistemicUsage;
    };
    const serialized = JSON.stringify(contextPayload);
    const hasExternalTokenizer = options.tokenEstimator !== undefined;
    const serializedTokenEstimate = Math.max(
      0,
      Math.floor(
        options.tokenEstimator?.(serialized) ??
          Math.ceil(serialized.length / 4),
      ),
    );
    const expiresAt = new Date(Date.now() + (options.ttlMs ?? 300000)).toISOString();

    return {
      ...contextPayload,
      contextFingerprint: hash(contextPayload),
      serializedTokenEstimate,
      tokenEstimateMethod: hasExternalTokenizer
        ? "EXTERNAL_TOKENIZER"
        : "CHARACTER_HEURISTIC",
      expiresAt,
      redactionState: "CLEAN",
    };
  }
}
