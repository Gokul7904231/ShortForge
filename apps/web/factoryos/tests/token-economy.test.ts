/**
 * Token Economy & CallGate — Unit Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CallGate,
  RetryClassifier,
  TokenEconomyLedger,
  TokenEconomyEvent,
} from "../../ai/economy/TokenEconomy";

describe("Token Economy & Ponytail Resilience Suite", () => {
  beforeEach(() => {
    CallGate.clearCache();
    TokenEconomyLedger.getInstance().clear();
  });

  describe("1. CallGate (Delete Unnecessary Work)", () => {
    it("skips call when deterministic answer is provided", () => {
      const decision = CallGate.evaluate({
        operation: "script_generation",
        capability: "SCRIPT_GENERATION",
        prompt: "Generate a quiz on geography",
        deterministicValue: { title: "Precalculated World Quiz", questions: [] },
      });

      expect(decision.allowCall).toBe(false);
      expect(decision.skipReason).toBe("DETERMINISTIC_ANSWER_EXISTS");
      expect(decision.deterministicResponse).toEqual({ title: "Precalculated World Quiz", questions: [] });
    });

    it("skips call when valid output artifact already exists", () => {
      const decision = CallGate.evaluate({
        operation: "render_manifest",
        capability: "RENDER",
        prompt: "Render scene 1",
        existingArtifactUri: "cas://artifacts/scene1_manifest.json",
      });

      expect(decision.allowCall).toBe(false);
      expect(decision.skipReason).toBe("ARTIFACT_EXISTS");
      expect(decision.reusedArtifactUri).toBe("cas://artifacts/scene1_manifest.json");
    });

    it("skips call on exact prompt + context cache hit", () => {
      CallGate.recordCache("SCRIPT_GENERATION", "Hello world", { text: "Cached result" }, "ctx_123");

      const decision = CallGate.evaluate({
        operation: "script_generation",
        capability: "SCRIPT_GENERATION",
        prompt: "Hello world",
        contextHash: "ctx_123",
      });

      expect(decision.allowCall).toBe(false);
      expect(decision.skipReason).toBe("CACHE_HIT");
      expect(decision.cachedResponse).toEqual({ text: "Cached result" });
    });

    it("blocks call when estimated cost exceeds remaining budget", () => {
      const decision = CallGate.evaluate({
        operation: "heavy_inference",
        capability: "IMAGE_GENERATION",
        prompt: "A photorealistic nebula",
        remainingBudgetUSD: 0.01,
        estimatedCostUSD: 0.05,
      });

      expect(decision.allowCall).toBe(false);
      expect(decision.skipReason).toBe("BUDGET_EXCEEDED");
    });

    it("allows call for novel, budgeted query", () => {
      const decision = CallGate.evaluate({
        operation: "script_generation",
        capability: "SCRIPT_GENERATION",
        prompt: "A totally unique prompt that hasn't been cached",
        remainingBudgetUSD: 1.0,
        estimatedCostUSD: 0.002,
      });

      expect(decision.allowCall).toBe(true);
      expect(decision.skipReason).toBeUndefined();
    });
  });

  describe("2. RetryClassifier (10 Taxonomical Types)", () => {
    it("classifies 429 as RATE_LIMITED (Retryable)", () => {
      const err = new Error("Rate limit reached for requests per minute");
      (err as any).status = 429;
      const res = RetryClassifier.classify(err, 1);

      expect(res.failureType).toBe("RATE_LIMITED");
      expect(res.isRetryable).toBe(true);
      expect(res.shouldRetry).toBe(true);
      expect(res.maxRetries).toBe(4);
      expect(res.backoffMs).toBeGreaterThan(0);
    });

    it("classifies 401 as AUTH_FAILURE (Fatal, Non-retryable)", () => {
      const err = new Error("Invalid API key provided");
      (err as any).status = 401;
      const res = RetryClassifier.classify(err, 1);

      expect(res.failureType).toBe("AUTH_FAILURE");
      expect(res.isRetryable).toBe(false);
      expect(res.shouldRetry).toBe(false);
      expect(res.maxRetries).toBe(0);
    });

    it("classifies 400 as INVALID_INPUT (Fatal, Non-retryable)", () => {
      const err = new Error("Invalid parameter: temperature must be between 0 and 2");
      (err as any).status = 400;
      const res = RetryClassifier.classify(err, 1);

      expect(res.failureType).toBe("INVALID_INPUT");
      expect(res.isRetryable).toBe(false);
      expect(res.shouldRetry).toBe(false);
    });

    it("classifies 413 as RESOURCE_EXHAUSTION (Retryable with compression)", () => {
      const err = new Error("maximum context length exceeded");
      (err as any).status = 413;
      const res = RetryClassifier.classify(err, 1);

      expect(res.failureType).toBe("RESOURCE_EXHAUSTION");
      expect(res.isRetryable).toBe(true);
      expect(res.shouldRetry).toBe(true);
      expect(res.maxRetries).toBe(1);
    });

    it("classifies 503 as TRANSIENT (Retryable)", () => {
      const err = new Error("Service Unavailable");
      (err as any).status = 503;
      const res = RetryClassifier.classify(err, 2);

      expect(res.failureType).toBe("TRANSIENT");
      expect(res.isRetryable).toBe(true);
      expect(res.shouldRetry).toBe(true);
    });

    it("classifies zod validation failure as SCHEMA_FAILURE (Retryable with repair)", () => {
      const err = new Error("zod error: Expected string, received number");
      const res = RetryClassifier.classify(err, 1);

      expect(res.failureType).toBe("SCHEMA_FAILURE");
      expect(res.isRetryable).toBe(true);
      expect(res.shouldRetry).toBe(true);
      expect(res.maxRetries).toBe(2);
    });

    it("classifies missing credentials as CONFIGURATION_FAILURE (Fatal)", () => {
      const err = new Error("Missing required environment variable: GEMINI_API_KEY");
      const res = RetryClassifier.classify(err, 1);

      expect(res.failureType).toBe("CONFIGURATION_FAILURE");
      expect(res.isRetryable).toBe(false);
      expect(res.shouldRetry).toBe(false);
    });
  });

  describe("3. TokenEconomyLedger", () => {
    it("correctly records events and summarizes token economy metrics", () => {
      const ledger = TokenEconomyLedger.getInstance();

      const event1: TokenEconomyEvent = {
        eventId: "ev_1",
        traceId: "tr_1",
        operation: "script_gen",
        capability: "SCRIPT_GENERATION",
        provider: "GEMINI",
        model: "gemini-2.0-flash",
        estimatedInputTokens: 100,
        actualInputTokens: 102,
        estimatedOutputTokens: 200,
        actualOutputTokens: 195,
        cachedTokens: 0,
        totalTokens: 297,
        costUSD: 0.0004,
        latencyMs: 800,
        retryCount: 0,
        callSkipped: false,
        contextHash: "ctx_hash_1",
        promptHash: "prompt_hash_1",
        fallbackUsed: false,
        escalated: false,
        timestamp: new Date().toISOString(),
      };

      const event2: TokenEconomyEvent = {
        eventId: "ev_2",
        traceId: "tr_2",
        operation: "script_gen",
        capability: "SCRIPT_GENERATION",
        provider: "CALL_GATE",
        model: "NONE",
        estimatedInputTokens: 100,
        estimatedOutputTokens: 0,
        cachedTokens: 100,
        totalTokens: 0,
        costUSD: 0.0,
        latencyMs: 2,
        retryCount: 0,
        callSkipped: true,
        skipReason: "CACHE_HIT",
        contextHash: "ctx_hash_1",
        promptHash: "prompt_hash_1",
        fallbackUsed: false,
        escalated: false,
        timestamp: new Date().toISOString(),
      };

      ledger.recordEvent(event1);
      ledger.recordEvent(event2);

      const summary = ledger.getSummary();
      expect(summary.totalCalls).toBe(2);
      expect(summary.skippedCalls).toBe(1);
      expect(summary.cacheHitCount).toBe(1);
      expect(summary.totalCostUSD).toBe(0.0004);
      expect(summary.totalActualTokens).toBe(297);
    });
  });
});
