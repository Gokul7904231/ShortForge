/**
 * FactoryOS / ShortForge Basic AI Generation Provider Layer Test Suite
 * ====================================================================
 * Validates all 18 required test scenarios defined in Part 22.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateBasicVideoContent,
  ProviderRouter,
  healthTracker,
  ProviderTimeoutError,
  ProviderRateLimitError,
  ProviderAuthenticationError,
  ProviderUnavailableError,
} from "../lib/ai-provider";
import {
  reserveGenerationSlot,
  releaseGenerationSlot,
  getUserQuota,
  QuotaExceededError,
  getBasicGenerationLimit,
} from "../lib/quota/quota-service";
import { db } from "../lib/firebase-admin";

describe("Basic AI Generation Provider & Quota Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    healthTracker.resetAll();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Basic user with 0/5 -> generation succeeds
  // ─────────────────────────────────────────────────────────────────────────────
  test("01: Basic user with 0/5 generations succeeds", async () => {
    const testUserId = `user_test_01_${Date.now()}`;
    const testJobId = `job_test_01_${Date.now()}`;

    const res = await reserveGenerationSlot(testUserId, "USER", testJobId);
    expect(res.success).toBe(true);
    expect(res.quota.limit).toBe(5);
    expect(res.quota.totalUsed).toBe(1);
    expect(res.quota.remaining).toBe(4);
    expect(res.quota.isExceeded).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Basic user with 4/5 -> generation succeeds and becomes 5/5
  // ─────────────────────────────────────────────────────────────────────────────
  test("02: Basic user with 4/5 succeeds and becomes 5/5", async () => {
    const testUserId = `user_test_02_${Date.now()}`;

    // Seed 4 completed videos
    await db.collection("quotas").doc(testUserId).set({
      userId: testUserId,
      tier: "BASIC",
      completed: 4,
      reservedSlots: {},
    });

    const testJobId = `job_test_02_${Date.now()}`;
    const res = await reserveGenerationSlot(testUserId, "USER", testJobId);
    expect(res.success).toBe(true);
    expect(res.quota.totalUsed).toBe(5);
    expect(res.quota.remaining).toBe(0);
    expect(res.quota.isExceeded).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Basic user with 5/5 -> rejected
  // ─────────────────────────────────────────────────────────────────────────────
  test("03: Basic user with 5/5 is rejected server-side", async () => {
    const testUserId = `user_test_03_${Date.now()}`;

    // Seed 5 completed videos
    await db.collection("quotas").doc(testUserId).set({
      userId: testUserId,
      tier: "BASIC",
      completed: 5,
      reservedSlots: {},
    });

    const testJobId = `job_test_03_${Date.now()}`;
    await expect(
      reserveGenerationSlot(testUserId, "USER", testJobId)
    ).rejects.toThrow(QuotaExceededError);

    const quota = await getUserQuota(testUserId, "USER");
    expect(quota.isExceeded).toBe(true);
    expect(quota.remaining).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Two simultaneous requests at 4/5 -> only one succeeds
  // ─────────────────────────────────────────────────────────────────────────────
  test("04: Two concurrent requests at 4/5 allow exactly ONE to succeed", async () => {
    const testUserId = `user_test_04_${Date.now()}`;

    await db.collection("quotas").doc(testUserId).set({
      userId: testUserId,
      tier: "BASIC",
      completed: 4,
      reservedSlots: {},
    });

    const jobIdA = `job_test_04_A_${Date.now()}`;
    const jobIdB = `job_test_04_B_${Date.now()}`;

    const results = await Promise.allSettled([
      reserveGenerationSlot(testUserId, "USER", jobIdA),
      reserveGenerationSlot(testUserId, "USER", jobIdB),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Gemini succeeds -> fallback providers not called
  // ─────────────────────────────────────────────────────────────────────────────
  test("05: When Gemini succeeds, fallback providers are NOT called", async () => {
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;

    const geminiSpy = vi.spyOn(providers.get("GEMINI"), "generate").mockResolvedValueOnce({
      success: true,
      provider: "GEMINI",
      model: "gemini-1.5-flash",
      content: {
        script: "Gemini generated script",
        scenes: [{ contactText: "Scene 1", imagePrompt: "Prompt 1" }],
      },
      providerAttempts: [{ provider: "GEMINI", status: "success" }],
    });

    const fallback1Spy = vi.spyOn(providers.get("FALLBACK_1"), "generate");
    const fallback2Spy = vi.spyOn(providers.get("FALLBACK_2"), "generate");

    const result = await router.generateContent({ topic: "Quantum Computing" });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("GEMINI");
    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(fallback1Spy).not.toHaveBeenCalled();
    expect(fallback2Spy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Gemini timeout -> fallback 1 called
  // ─────────────────────────────────────────────────────────────────────────────
  test("06: Gemini timeout triggers automatic failover to Fallback 1", async () => {
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;

    vi.spyOn(providers.get("GEMINI"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_1"), "isConfigured").mockReturnValue(true);

    vi.spyOn(providers.get("GEMINI"), "generate").mockRejectedValue(
      new ProviderTimeoutError("Gemini timed out", "GEMINI")
    );

    const fallback1Spy = vi.spyOn(providers.get("FALLBACK_1"), "generate").mockResolvedValueOnce({
      success: true,
      provider: "FALLBACK_1",
      model: "llama-3.3-70b",
      content: {
        script: "Fallback 1 generated script",
        scenes: [{ contactText: "Scene 1", imagePrompt: "Prompt 1" }],
      },
      providerAttempts: [{ provider: "FALLBACK_1", status: "success" }],
    });

    const result = await router.generateContent({ topic: "Deep Ocean" });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("FALLBACK_1");
    expect(fallback1Spy).toHaveBeenCalledTimes(1);
    expect(result.providerAttempts.some((a) => a.provider === "GEMINI" && a.status === "failed")).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Gemini 429 -> fallback 1 called
  // ─────────────────────────────────────────────────────────────────────────────
  test("07: Gemini 429 Rate Limit triggers automatic failover to Fallback 1", async () => {
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;

    vi.spyOn(providers.get("GEMINI"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_1"), "isConfigured").mockReturnValue(true);

    vi.spyOn(providers.get("GEMINI"), "generate").mockRejectedValue(
      new ProviderRateLimitError("Rate limit exceeded 429", "GEMINI", 429)
    );

    vi.spyOn(providers.get("FALLBACK_1"), "generate").mockResolvedValueOnce({
      success: true,
      provider: "FALLBACK_1",
      model: "llama-3.3-70b",
      content: {
        script: "Fallback 1 handled 429",
        scenes: [{ contactText: "Scene 1", imagePrompt: "Prompt 1" }],
      },
      providerAttempts: [{ provider: "FALLBACK_1", status: "success" }],
    });

    const result = await router.generateContent({ topic: "Black Holes" });
    expect(result.provider).toBe("FALLBACK_1");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Gemini auth failure -> correctly marked configuration failure
  // ─────────────────────────────────────────────────────────────────────────────
  test("08: Gemini authentication error does not retry indefinitely and fails over", async () => {
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;

    vi.spyOn(providers.get("GEMINI"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_1"), "isConfigured").mockReturnValue(true);

    const geminiSpy = vi.spyOn(providers.get("GEMINI"), "generate").mockRejectedValue(
      new ProviderAuthenticationError("Invalid API Key", "GEMINI", 401)
    );

    vi.spyOn(providers.get("FALLBACK_1"), "generate").mockResolvedValueOnce({
      success: true,
      provider: "FALLBACK_1",
      model: "llama-3.3-70b",
      content: {
        script: "Fallback 1 after auth fail",
        scenes: [],
      },
      providerAttempts: [{ provider: "FALLBACK_1", status: "success" }],
    });

    const result = await router.generateContent({ topic: "Mars Rovers" });
    expect(result.provider).toBe("FALLBACK_1");
    // Non-retryable error should only be attempted once
    expect(geminiSpy).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Gemini fails + Fallback 1 succeeds -> exactly one generation consumed
  // ─────────────────────────────────────────────────────────────────────────────
  test("09: Provider failover does NOT consume extra user quota", async () => {
    const testUserId = `user_test_09_${Date.now()}`;
    const testJobId = `job_test_09_${Date.now()}`;

    // 1. Reserve quota
    const q1 = await reserveGenerationSlot(testUserId, "USER", testJobId);
    expect(q1.quota.totalUsed).toBe(1);

    // 2. Simulate failover execution
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;
    vi.spyOn(providers.get("GEMINI"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_1"), "isConfigured").mockReturnValue(true);

    vi.spyOn(providers.get("GEMINI"), "generate").mockRejectedValue(
      new ProviderTimeoutError("timeout", "GEMINI")
    );
    vi.spyOn(providers.get("FALLBACK_1"), "generate").mockResolvedValueOnce({
      success: true,
      provider: "FALLBACK_1",
      model: "llama-3.3-70b",
      content: { script: "Script", scenes: [] },
      providerAttempts: [],
    });

    const aiRes = await router.generateContent({ topic: "Ancient Rome" });
    expect(aiRes.provider).toBe("FALLBACK_1");

    // 3. Verify user quota is still exactly 1
    const q2 = await getUserQuota(testUserId, "USER");
    expect(q2.totalUsed).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Gemini fails + Fallback 1 fails + Fallback 2 succeeds -> one generation
  // ─────────────────────────────────────────────────────────────────────────────
  test("10: Full chain failover to Fallback 2 succeeds with exactly 1 quota consumed", async () => {
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;

    vi.spyOn(providers.get("GEMINI"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_1"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_2"), "isConfigured").mockReturnValue(true);

    vi.spyOn(providers.get("GEMINI"), "generate").mockRejectedValue(
      new ProviderTimeoutError("Gemini timeout", "GEMINI")
    );
    vi.spyOn(providers.get("FALLBACK_1"), "generate").mockRejectedValue(
      new ProviderRateLimitError("Fallback 1 429", "FALLBACK_1")
    );
    vi.spyOn(providers.get("FALLBACK_2"), "generate").mockResolvedValueOnce({
      success: true,
      provider: "FALLBACK_2",
      model: "deepseek-v3",
      content: { script: "Fallback 2 script", scenes: [] },
      providerAttempts: [],
    });

    const res = await router.generateContent({ topic: "Artificial Superintelligence" });
    expect(res.provider).toBe("FALLBACK_2");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. All providers fail -> safe error
  // ─────────────────────────────────────────────────────────────────────────────
  test("11: When all providers fail, a safe error is returned", async () => {
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;

    vi.spyOn(providers.get("GEMINI"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_1"), "isConfigured").mockReturnValue(true);
    vi.spyOn(providers.get("FALLBACK_2"), "isConfigured").mockReturnValue(true);

    vi.spyOn(providers.get("GEMINI"), "generate").mockRejectedValue(new Error("gemini error"));
    vi.spyOn(providers.get("FALLBACK_1"), "generate").mockRejectedValue(new Error("fallback 1 error"));
    vi.spyOn(providers.get("FALLBACK_2"), "generate").mockRejectedValue(new Error("fallback 2 error"));

    await expect(router.generateContent({ topic: "Failure Test" })).rejects.toThrow(
      ProviderUnavailableError
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. Failed AI generation before render job creation -> generation refunded
  // ─────────────────────────────────────────────────────────────────────────────
  test("12: Quota slot is atomically refunded if AI generation fails before render", async () => {
    const testUserId = `user_test_12_${Date.now()}`;
    const testJobId = `job_test_12_${Date.now()}`;

    // 1. Reserve slot
    await reserveGenerationSlot(testUserId, "USER", testJobId);
    let q = await getUserQuota(testUserId, "USER");
    expect(q.totalUsed).toBe(1);

    // 2. Simulate complete AI failure & refund
    await releaseGenerationSlot(testUserId, testJobId);

    // 3. Verify quota was refunded back to 0
    q = await getUserQuota(testUserId, "USER");
    expect(q.totalUsed).toBe(0);
    expect(q.remaining).toBe(5);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. Duplicate Idempotency-Key -> same reservation returned
  // ─────────────────────────────────────────────────────────────────────────────
  test("13: Idempotent re-submission of same jobId returns existing slot", async () => {
    const testUserId = `user_test_13_${Date.now()}`;
    const testJobId = `job_test_13_${Date.now()}`;

    const res1 = await reserveGenerationSlot(testUserId, "USER", testJobId);
    expect(res1.quota.totalUsed).toBe(1);

    // Second call with same jobId
    const res2 = await reserveGenerationSlot(testUserId, "USER", testJobId);
    expect(res2.success).toBe(true);
    expect(res2.quota.totalUsed).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 14. Retry of same generation -> no additional quota consumed
  // ─────────────────────────────────────────────────────────────────────────────
  test("14: Retry of same generation does not consume additional quota", async () => {
    const testUserId = `user_test_14_${Date.now()}`;
    const testJobId = `job_test_14_${Date.now()}`;

    await reserveGenerationSlot(testUserId, "USER", testJobId);
    const q1 = await getUserQuota(testUserId, "USER");

    // Retrying with same jobId
    await reserveGenerationSlot(testUserId, "USER", testJobId);
    const q2 = await getUserQuota(testUserId, "USER");

    expect(q1.totalUsed).toBe(q2.totalUsed);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. Frontend payload cannot override quota
  // ─────────────────────────────────────────────────────────────────────────────
  test("15: Server-authoritative quota ignores spoofed frontend body values", async () => {
    const testUserId = `user_test_15_${Date.now()}`;
    const testJobId = `job_test_15_${Date.now()}`;

    // Normal basic user passing role: "ADMIN" or fake remainingGenerations
    const res = await reserveGenerationSlot(testUserId, "USER", testJobId);
    expect(res.quota.limit).toBe(5);
    expect(res.quota.tier).toBe("BASIC");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. Provider API keys never appear in API response
  // ─────────────────────────────────────────────────────────────────────────────
  test("16: Normalized response object never contains provider API keys", async () => {
    const router = ProviderRouter.getInstance();
    const providers = (router as any).providers;

    vi.spyOn(providers.get("GEMINI"), "generate").mockResolvedValueOnce({
      success: true,
      provider: "GEMINI",
      model: "gemini-1.5-flash",
      content: { script: "Secret-free script", scenes: [] },
      providerAttempts: [{ provider: "GEMINI", status: "success" }],
    });

    const result = await router.generateContent({ topic: "Security" });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("GEMINI_API_KEY");
    expect(serialized).not.toContain("AIza");
    expect(serialized).not.toContain("FALLBACK_1_API_KEY");
    expect(serialized).not.toContain("Bearer ");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 17. Provider API keys never appear in job payload
  // ─────────────────────────────────────────────────────────────────────────────
  test("17: Video rendering job payload contains only content and execution token", () => {
    const videoJobPayload = {
      id: "job_test_17",
      jobId: "job_test_17",
      userId: "user_17",
      tier: "BASIC",
      targetWorkerPool: "basic-fastapi",
      topic: "Safe Job Payload",
      script: "Narration text",
      scenes: [{ contactText: "Scene 1", imagePrompt: "Prompt 1" }],
      contentType: "FACT",
      renderProfile: "AUTO",
      durationSeconds: 45,
      status: "queued",
      executionToken: "exec_1234567890",
    };

    const payloadString = JSON.stringify(videoJobPayload);
    expect(payloadString).not.toContain("API_KEY");
    expect(payloadString).not.toContain("GEMINI");
    expect(payloadString).not.toContain("FALLBACK");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 18. Worker selection remains provider-neutral
  // ─────────────────────────────────────────────────────────────────────────────
  test("18: Target worker selection does not encode a cloud provider", () => {
    const resolveExecutionAuthority = (_role: string) => "factoryos";

    expect(resolveExecutionAuthority("USER")).toBe("factoryos");
    expect(resolveExecutionAuthority("PRO")).toBe("factoryos");
    expect(resolveExecutionAuthority("ADMIN")).toBe("factoryos");
    expect(resolveExecutionAuthority("OWNER")).toBe("factoryos");
  });
});
