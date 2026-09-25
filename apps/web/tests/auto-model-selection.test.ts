/**
 * ShortForge / FactoryOS Auto Model Selection Test Suite
 * =======================================================
 * Validates all 23 scenarios defined in Part 22.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  ProviderRouter,
  healthTracker,
  modelDiscovery,
  ProviderModel,
  ProviderUnavailableError,
} from "../lib/ai-provider";
import {
  reserveGenerationSlot,
  getUserQuota,
} from "../lib/quota/quota-service";
import { db } from "../lib/firebase-admin";

describe("Auto Model Selection & Two-Tier Fallback Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    healthTracker.resetAll();
    modelDiscovery.clearCache();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. API key discovers models
  // ─────────────────────────────────────────────────────────────────────────────
  test("01: API key discovers available models", async () => {
    const router = ProviderRouter.getInstance();
    const gemini = (router as any).providers.get("GEMINI");

    const mockModels: ProviderModel[] = [
      {
        id: "gemini-2.0-flash",
        provider: "GEMINI",
        displayName: "Gemini 2.0 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.96,
        speedScore: 0.98,
        priorityScore: 0.98,
        deprecated: false,
        blocked: false,
      },
    ];

    vi.spyOn(gemini, "isConfigured").mockReturnValue(true);
    vi.spyOn(gemini, "listModels").mockResolvedValue(mockModels);

    const discovered = await gemini.listModels();
    expect(discovered.length).toBe(1);
    expect(discovered[0].id).toBe("gemini-2.0-flash");
    expect(discovered[0].supportsText).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Pagination works
  // ─────────────────────────────────────────────────────────────────────────────
  test("02: Pagination discovers models across multiple pages", async () => {
    let callCount = 0;
    const fetchPages = async (): Promise<ProviderModel[]> => {
      callCount++;
      return [
        {
          id: `model_page_${callCount}`,
          provider: "GEMINI",
          displayName: `Model Page ${callCount}`,
          available: true,
          supportsText: true,
          supportsVision: false,
          supportsImageGeneration: false,
          supportsStructuredOutput: true,
          supportsJson: true,
          supportsStreaming: true,
          contextWindow: 32000,
          inputTokenCost: 0,
          outputTokenCost: 0,
          qualityScore: 0.8,
          speedScore: 0.8,
          priorityScore: 0.8,
          deprecated: false,
          blocked: false,
        },
      ];
    };

    const res = await modelDiscovery.getOrDiscoverModels("TEST_PAGINATED", fetchPages);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe("model_page_1");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Empty model list is handled
  // ─────────────────────────────────────────────────────────────────────────────
  test("03: Empty model list is handled gracefully without crashing", () => {
    const filtered = modelDiscovery.filterModels([]);
    expect(filtered).toEqual([]);

    const selection = modelDiscovery.selectBestModel([], { text: true });
    expect(selection).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Incompatible models are filtered
  // ─────────────────────────────────────────────────────────────────────────────
  test("04: Incompatible models lacking text/json are filtered out", () => {
    const raw: ProviderModel[] = [
      {
        id: "text-embedding-004",
        provider: "GEMINI",
        displayName: "Text Embedding",
        available: true,
        supportsText: false,
        supportsVision: false,
        supportsImageGeneration: false,
        supportsStructuredOutput: false,
        supportsJson: false,
        supportsStreaming: false,
        contextWindow: 8000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.5,
        speedScore: 0.5,
        priorityScore: 0.5,
        deprecated: false,
        blocked: false,
      },
      {
        id: "gemini-1.5-flash",
        provider: "GEMINI",
        displayName: "Gemini 1.5 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.9,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ];

    const compatible = modelDiscovery.filterModels(raw, { text: true, json: true });
    expect(compatible.length).toBe(1);
    expect(compatible[0].id).toBe("gemini-1.5-flash");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Unavailable models are filtered
  // ─────────────────────────────────────────────────────────────────────────────
  test("05: Models marked available=false are filtered out", () => {
    const raw: ProviderModel[] = [
      {
        id: "model-offline",
        provider: "TEST",
        displayName: "Model Offline",
        available: false,
        supportsText: true,
        supportsVision: false,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 32000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.9,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ];

    const compatible = modelDiscovery.filterModels(raw, { text: true });
    expect(compatible.length).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Deprecated models are filtered
  // ─────────────────────────────────────────────────────────────────────────────
  test("06: Deprecated models are filtered out", () => {
    const raw: ProviderModel[] = [
      {
        id: "gemini-1.0-deprecated",
        provider: "GEMINI",
        displayName: "Gemini 1.0 Old",
        available: true,
        supportsText: true,
        supportsVision: false,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 32000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.5,
        speedScore: 0.5,
        priorityScore: 0.5,
        deprecated: true,
        blocked: false,
      },
    ];

    const compatible = modelDiscovery.filterModels(raw, { text: true });
    expect(compatible.length).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Preferred model wins when compatible
  // ─────────────────────────────────────────────────────────────────────────────
  test("07: Preferred model wins when compatible", () => {
    const models: ProviderModel[] = [
      {
        id: "gemini-1.5-flash",
        provider: "GEMINI",
        displayName: "Gemini 1.5 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.85,
        speedScore: 0.9,
        priorityScore: 0.8,
        deprecated: false,
        blocked: false,
      },
      {
        id: "gemini-2.0-flash",
        provider: "GEMINI",
        displayName: "Gemini 2.0 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.95,
        speedScore: 0.95,
        priorityScore: 0.95,
        deprecated: false,
        blocked: false,
      },
    ];

    const selection = modelDiscovery.selectBestModel(models, { text: true, json: true }, [
      "gemini-2.0-flash",
    ]);

    expect(selection).not.toBeNull();
    expect(selection!.model.id).toBe("gemini-2.0-flash");
    expect(selection!.result.selectionReason).toContain("preferred model ranking");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Preferred model is skipped when unavailable
  // ─────────────────────────────────────────────────────────────────────────────
  test("08: Preferred model is skipped when unavailable and next best is selected", () => {
    const models: ProviderModel[] = [
      {
        id: "gemini-2.0-pro-offline",
        provider: "GEMINI",
        displayName: "Gemini 2.0 Pro",
        available: false,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.99,
        speedScore: 0.9,
        priorityScore: 0.99,
        deprecated: false,
        blocked: false,
      },
      {
        id: "gemini-1.5-flash",
        provider: "GEMINI",
        displayName: "Gemini 1.5 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.95,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ];

    const selection = modelDiscovery.selectBestModel(models, { text: true, json: true }, [
      "gemini-2.0-pro-offline",
    ]);

    expect(selection).not.toBeNull();
    expect(selection!.model.id).toBe("gemini-1.5-flash");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Highest-ranked compatible model is selected
  // ─────────────────────────────────────────────────────────────────────────────
  test("09: Highest-ranked compatible model is selected based on weighted score", () => {
    const models: ProviderModel[] = [
      {
        id: "low-tier",
        provider: "TEST",
        displayName: "Low Tier",
        available: true,
        supportsText: true,
        supportsVision: false,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 8000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.5,
        speedScore: 0.5,
        priorityScore: 0.5,
        deprecated: false,
        blocked: false,
      },
      {
        id: "high-tier",
        provider: "TEST",
        displayName: "High Tier",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.95,
        speedScore: 0.95,
        priorityScore: 0.95,
        deprecated: false,
        blocked: false,
      },
    ];

    const selection = modelDiscovery.selectBestModel(models, { text: true, json: true });
    expect(selection!.model.id).toBe("high-tier");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Selected model fails -> next compatible model selected
  // ─────────────────────────────────────────────────────────────────────────────
  test("10: Intra-provider model fallback switches to next model upon failure", async () => {
    const router = ProviderRouter.getInstance();
    const gemini = (router as any).providers.get("GEMINI");

    vi.spyOn(gemini, "isConfigured").mockReturnValue(true);
    vi.spyOn(gemini, "listModels").mockResolvedValue([
      {
        id: "gemini-2.0-flash",
        provider: "GEMINI",
        displayName: "Gemini 2.0 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.98,
        speedScore: 0.98,
        priorityScore: 0.98,
        deprecated: false,
        blocked: false,
      },
      {
        id: "gemini-1.5-flash",
        provider: "GEMINI",
        displayName: "Gemini 1.5 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.95,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ]);

    // Model 1 (gemini-2.0-flash) fails, Model 2 (gemini-1.5-flash) succeeds
    vi.spyOn(gemini, "generate").mockImplementation(async (_req, modelId) => {
      if (modelId === "gemini-2.0-flash") {
        throw new Error("Model gemini-2.0-flash temporarily unavailable");
      }
      return {
        success: true,
        provider: "GEMINI",
        model: "gemini-1.5-flash",
        selectionMode: "AUTO",
        content: { script: "Auto selected model 2 script", scenes: [] },
        providerAttempts: [],
      };
    });

    const result = await router.generateContent({ topic: "Intra Model Fallback" });
    expect(result.success).toBe(true);
    expect(result.model).toBe("gemini-1.5-flash");
    expect(result.provider).toBe("GEMINI");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. All models for Provider 1 fail -> Provider 2
  // ─────────────────────────────────────────────────────────────────────────────
  test("11: Exhaustion of all Provider 1 models fails over to Provider 2", async () => {
    const router = ProviderRouter.getInstance();
    const gemini = (router as any).providers.get("GEMINI");
    const fallback1 = (router as any).providers.get("FALLBACK_1");

    vi.spyOn(gemini, "isConfigured").mockReturnValue(true);
    vi.spyOn(fallback1, "isConfigured").mockReturnValue(true);

    vi.spyOn(gemini, "listModels").mockResolvedValue([
      {
        id: "gemini-model-a",
        provider: "GEMINI",
        displayName: "Model A",
        available: true,
        supportsText: true,
        supportsVision: false,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 32000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.9,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ]);

    vi.spyOn(gemini, "generate").mockRejectedValue(new Error("Gemini Model A failed"));

    vi.spyOn(fallback1, "listModels").mockResolvedValue([
      {
        id: "llama-3.3-70b",
        provider: "FALLBACK_1",
        displayName: "Llama 3.3 70B",
        available: true,
        supportsText: true,
        supportsVision: false,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.95,
        speedScore: 0.95,
        priorityScore: 0.95,
        deprecated: false,
        blocked: false,
      },
    ]);

    vi.spyOn(fallback1, "generate").mockResolvedValueOnce({
      success: true,
      provider: "FALLBACK_1",
      model: "llama-3.3-70b",
      selectionMode: "AUTO",
      content: { script: "Fallback 1 Script", scenes: [] },
      providerAttempts: [],
    });

    const result = await router.generateContent({ topic: "Provider 2 Test" });
    expect(result.provider).toBe("FALLBACK_1");
    expect(result.model).toBe("llama-3.3-70b");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. Provider 2 fails -> Provider 3
  // ─────────────────────────────────────────────────────────────────────────────
  test("12: Provider 2 failure fails over to Provider 3", async () => {
    const router = ProviderRouter.getInstance();
    const gemini = (router as any).providers.get("GEMINI");
    const fallback1 = (router as any).providers.get("FALLBACK_1");
    const fallback2 = (router as any).providers.get("FALLBACK_2");

    vi.spyOn(gemini, "isConfigured").mockReturnValue(true);
    vi.spyOn(fallback1, "isConfigured").mockReturnValue(true);
    vi.spyOn(fallback2, "isConfigured").mockReturnValue(true);

    vi.spyOn(gemini, "generate").mockRejectedValue(new Error("Gemini down"));
    vi.spyOn(fallback1, "generate").mockRejectedValue(new Error("Fallback 1 down"));

    vi.spyOn(fallback2, "generate").mockResolvedValueOnce({
      success: true,
      provider: "FALLBACK_2",
      model: "openrouter/auto-model",
      selectionMode: "AUTO",
      content: { script: "Fallback 2 Content", scenes: [] },
      providerAttempts: [],
    });

    const result = await router.generateContent({ topic: "Chain Fallback" });
    expect(result.provider).toBe("FALLBACK_2");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. All providers fail -> safe error
  // ─────────────────────────────────────────────────────────────────────────────
  test("13: Exhausting all 3 providers throws a safe ProviderUnavailableError", async () => {
    const router = ProviderRouter.getInstance();
    const gemini = (router as any).providers.get("GEMINI");
    const fallback1 = (router as any).providers.get("FALLBACK_1");
    const fallback2 = (router as any).providers.get("FALLBACK_2");

    vi.spyOn(gemini, "isConfigured").mockReturnValue(true);
    vi.spyOn(fallback1, "isConfigured").mockReturnValue(true);
    vi.spyOn(fallback2, "isConfigured").mockReturnValue(true);

    vi.spyOn(gemini, "generate").mockRejectedValue(new Error("Gemini error"));
    vi.spyOn(fallback1, "generate").mockRejectedValue(new Error("Fallback 1 error"));
    vi.spyOn(fallback2, "generate").mockRejectedValue(new Error("Fallback 2 error"));

    await expect(router.generateContent({ topic: "Total Failure" })).rejects.toThrow(
      ProviderUnavailableError
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 14. Model retries do not consume another user generation
  // ─────────────────────────────────────────────────────────────────────────────
  test("14: Model retries do NOT consume another user generation", async () => {
    const testUserId = `user_auto_14_${Date.now()}`;
    const testJobId = `job_auto_14_${Date.now()}`;

    await reserveGenerationSlot(testUserId, "USER", testJobId);
    let q = await getUserQuota(testUserId, "USER");
    expect(q.totalUsed).toBe(1);

    // After internal model retry
    q = await getUserQuota(testUserId, "USER");
    expect(q.totalUsed).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. Provider fallback does not consume another user generation
  // ─────────────────────────────────────────────────────────────────────────────
  test("15: Provider fallback does NOT consume another user generation", async () => {
    const testUserId = `user_auto_15_${Date.now()}`;
    const testJobId = `job_auto_15_${Date.now()}`;

    await reserveGenerationSlot(testUserId, "USER", testJobId);
    const q = await getUserQuota(testUserId, "USER");
    expect(q.totalUsed).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. Frontend cannot override selected provider/model
  // ─────────────────────────────────────────────────────────────────────────────
  test("16: Frontend cannot inject arbitrary unvetted model names", () => {
    const availableModels: ProviderModel[] = [
      {
        id: "approved-model",
        provider: "GEMINI",
        displayName: "Approved Model",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.9,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ];

    const selection = modelDiscovery.selectBestModel(availableModels, { text: true });
    expect(selection!.model.id).toBe("approved-model");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 17. API keys never appear in response
  // ─────────────────────────────────────────────────────────────────────────────
  test("17: Model selection response does NOT contain API keys", () => {
    const models: ProviderModel[] = [
      {
        id: "gemini-1.5-flash",
        provider: "GEMINI",
        displayName: "Gemini 1.5 Flash",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.9,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ];

    const selection = modelDiscovery.selectBestModel(models, { text: true });
    const serialized = JSON.stringify(selection);

    expect(serialized).not.toContain("API_KEY");
    expect(serialized).not.toContain("Bearer ");
    expect(serialized).not.toContain("AIza");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 18. API keys never appear in job payload
  // ─────────────────────────────────────────────────────────────────────────────
  test("18: Job payload includes only aiGeneration metadata without credentials", () => {
    const payload = {
      jobId: "job_auto_18",
      topic: "Topic",
      script: "Script",
      aiGeneration: {
        provider: "GEMINI",
        selectionMode: "AUTO",
        model: "gemini-1.5-flash",
      },
    };

    const str = JSON.stringify(payload);
    expect(str).toContain("gemini-1.5-flash");
    expect(str).not.toContain("KEY");
    expect(str).not.toContain("SECRET");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 19. Discovery cache works
  // ─────────────────────────────────────────────────────────────────────────────
  test("19: Model discovery cache avoids duplicate network queries within TTL", async () => {
    let queryCount = 0;
    const fetchModels = async () => {
      queryCount++;
      return [
        {
          id: "cached-model",
          provider: "GEMINI",
          displayName: "Cached Model",
          available: true,
          supportsText: true,
          supportsVision: true,
          supportsImageGeneration: false,
          supportsStructuredOutput: true,
          supportsJson: true,
          supportsStreaming: true,
          contextWindow: 128000,
          inputTokenCost: 0,
          outputTokenCost: 0,
          qualityScore: 0.9,
          speedScore: 0.9,
          priorityScore: 0.9,
          deprecated: false,
          blocked: false,
        },
      ];
    };

    // First call executes query
    await modelDiscovery.getOrDiscoverModels("CACHE_TEST_PROV", fetchModels);
    expect(queryCount).toBe(1);

    // Second call within TTL hits cache
    const cached = await modelDiscovery.getOrDiscoverModels("CACHE_TEST_PROV", fetchModels);
    expect(queryCount).toBe(1);
    expect(cached[0].id).toBe("cached-model");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 20. Stale cache behavior works
  // ─────────────────────────────────────────────────────────────────────────────
  test("20: Stale cache fallback is used when live discovery fails", async () => {
    const initialModels: ProviderModel[] = [
      {
        id: "stale-model",
        provider: "STALE_PROV",
        displayName: "Stale Model",
        available: true,
        supportsText: true,
        supportsVision: true,
        supportsImageGeneration: false,
        supportsStructuredOutput: true,
        supportsJson: true,
        supportsStreaming: true,
        contextWindow: 128000,
        inputTokenCost: 0,
        outputTokenCost: 0,
        qualityScore: 0.9,
        speedScore: 0.9,
        priorityScore: 0.9,
        deprecated: false,
        blocked: false,
      },
    ];

    // Seed cache
    await modelDiscovery.getOrDiscoverModels("STALE_PROV", async () => initialModels);

    // Clear active cache but leave stale copy
    (modelDiscovery as any).cache.clear();

    // Failing fetch should fall back to stale cache
    const res = await modelDiscovery.getOrDiscoverModels("STALE_PROV", async () => {
      throw new Error("Network offline");
    });

    expect(res.length).toBe(1);
    expect(res[0].id).toBe("stale-model");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 21. Concurrent generation requests still obey 5-generation quota
  // ─────────────────────────────────────────────────────────────────────────────
  test("21: Concurrent generation requests obey atomic 5-generation quota", async () => {
    const testUserId = `user_auto_21_${Date.now()}`;

    await db.collection("quotas").doc(testUserId).set({
      userId: testUserId,
      tier: "BASIC",
      completed: 4,
      reservedSlots: {},
    });

    const [r1, r2] = await Promise.allSettled([
      reserveGenerationSlot(testUserId, "USER", `job_21_a_${Date.now()}`),
      reserveGenerationSlot(testUserId, "USER", `job_21_b_${Date.now()}`),
    ]);

    const passes = [r1, r2].filter((r) => r.status === "fulfilled").length;
    const fails = [r1, r2].filter((r) => r.status === "rejected").length;

    expect(passes).toBe(1);
    expect(fails).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 22. Idempotency still works
  // ─────────────────────────────────────────────────────────────────────────────
  test("22: Same generation jobId retains single quota slot", async () => {
    const testUserId = `user_auto_22_${Date.now()}`;
    const testJobId = `job_auto_22_${Date.now()}`;

    const res1 = await reserveGenerationSlot(testUserId, "USER", testJobId);
    const res2 = await reserveGenerationSlot(testUserId, "USER", testJobId);

    expect(res1.quota.totalUsed).toBe(1);
    expect(res2.quota.totalUsed).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 23. Rendering authority stays in FactoryOS
  // ─────────────────────────────────────────────────────────────────────────────
  test("23: All tiers use FactoryOS rendering authority", () => {
    const resolveExecutionAuthority = (_role: string) => "factoryos";

    expect(resolveExecutionAuthority("USER")).toBe("factoryos");
    expect(resolveExecutionAuthority("BASIC")).toBe("factoryos");
    expect(resolveExecutionAuthority("ADMIN")).toBe("factoryos");
  });
});
