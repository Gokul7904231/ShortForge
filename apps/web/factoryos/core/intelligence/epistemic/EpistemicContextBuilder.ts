import { createHash } from "node:crypto";
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

export interface BuildEpistemicContextOptions {
  readonly recommendation: CognitiveRecommendation;
  readonly budget: EpistemicBudget;
  readonly usage?: EpistemicUsage;
  readonly ttlMs?: number;
}

export class EpistemicContextBuilder {
  public build(
    state: EpistemicState,
    options: BuildEpistemicContextOptions,
  ): EpistemicContext {
    const usage = options.usage ?? state.usage;
    const contextPayload = {
      ...state,
      cognitiveRecommendation: options.recommendation,
      budgets: options.budget,
      usage,
    };
    const serialized = JSON.stringify(contextPayload);
    const expiresAt = new Date(Date.now() + (options.ttlMs ?? 300000)).toISOString();

    return {
      ...contextPayload,
      contextFingerprint: hash(contextPayload),
      serializedTokenEstimate: Math.ceil(serialized.length / 4),
      expiresAt,
      redactionState: "CLEAN",
    };
  }
}
