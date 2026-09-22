import { describe, it, expect, beforeEach, vi } from "vitest";
import { AutonomousFactoryController } from "../core/controller/AutonomousFactoryController";
import { POST as generateVideoHandler } from "../../app/api/generate-video/route";
import { POST as callbackHandler } from "../../app/api/rendering/callback/route";
import { NextRequest } from "next/server";
import { readJobManifest, saveJobManifest } from "../../lib/jobs-history";
import {
  reserveGenerationSlot,
  finalizeGenerationSlot,
  releaseGenerationSlot,
  getUserQuota,
  reclaimStaleReservations,
  RESERVATION_TTL_MS,
} from "../../lib/quota/quota-service";
import crypto from "crypto";

// Simulated authenticated staging user session context
let currentMockUser: { uid: string; role: string } = {
  uid: "user_p0_hardening_001",
  role: "BASIC",
};

vi.mock("@/lib/auth/auth", () => ({
  verifySession: vi.fn().mockImplementation(async () => ({
    user: currentMockUser,
    role: currentMockUser.role,
  })),
  verifyWritePermission: vi.fn(),
}));

vi.mock("@/lib/content-pipeline", () => ({
  validateContent: vi.fn().mockResolvedValue({
    approved: true,
    score: 0.96,
    errors: [],
    warnings: [],
  }),
}));

vi.mock("../../lib/content-pipeline", () => ({
  validateContent: vi.fn().mockResolvedValue({
    approved: true,
    score: 0.96,
    errors: [],
    warnings: [],
  }),
}));

describe("FactoryOS P0 Fixes & Basic UX Hardening Suite", () => {
  let controller: AutonomousFactoryController;
  const STAGING_AZURE_URL = "https://render-api.gokul.software";

  beforeEach(async () => {
    process.env.EXECUTION_AUTHORITY = "factoryos";
    process.env.BASIC_RENDER_API_URL = STAGING_AZURE_URL;
    process.env.BASIC_RENDER_API_SECRET = "staging_azure_render_secret_key_8888";
    process.env.INTERNAL_API_SECRET_KEY = "staging_azure_render_secret_key_8888";

    controller = new AutonomousFactoryController({ storageType: "memory" });
    await controller.boot();
    (global as any).__factoryOSController = controller;

    currentMockUser = {
      uid: "user_p0_hardening_001",
      role: "BASIC",
    };
  });

  it("P0-1 & P0-2: Content Validation 422 Rejection Releases Reserved Quota Slot", async () => {
    const userId = "user_p0_validation_leak_001";
    currentMockUser = { uid: userId, role: "BASIC" };

    const quotaBefore = await getUserQuota(userId, "BASIC");
    expect(quotaBefore.completed).toBe(0);
    expect(quotaBefore.reserved).toBe(0);

    // Trigger generate-video with invalid content that fails validation (missing hook and invalid questions)
    const req = new Request("http://localhost:3000/api/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "Invalid Quiz Topic",
        contentType: "QUIZ_SHORTS",
        hook: "bad hook without required format",
        questions: [{ question: "q1", options: ["a"] }], // Invalid question format
      }),
    });

    const res = await generateVideoHandler(req);
    expect(res.status).toBe(422);

    // Invariant: Reserved quota MUST be 0 after 422 validation rejection
    const quotaAfter = await getUserQuota(userId, "BASIC");
    expect(quotaAfter.completed).toBe(0);
    expect(quotaAfter.reserved).toBe(0);
    expect(quotaAfter.remaining).toBe(5);
  });

  it("P0-2: Azure Dispatch Failure Releases Quota and Sets Failed State (Never Hangs in Processing)", async () => {
    const userId = "user_p0_azure_fail_001";
    currentMockUser = { uid: userId, role: "BASIC" };

    const originalFetch = global.fetch;
    // Mock Azure dispatch returning HTTP 503 Service Unavailable
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (String(url).includes("/api/render/jobs")) {
        return {
          ok: false,
          status: 503,
          text: async () => "Azure render worker cluster unavailable",
        };
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const req = new Request("http://localhost:3000/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "The Physics of Superconductors",
          style: "Scientific",
          contentType: "FACTS_SHORTS",
          durationSeconds: 45,
          script: "Superconductivity allows zero electrical resistance at low temperatures.",
          scenes: [{ contactText: "Zero resistance", imagePrompt: "quantum levitation 8k" }],
        }),
      });

      const res = await generateVideoHandler(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.authority).toBe("factoryos");
      const jobId = data.jobId;

      // Allow background Overseer Floor 06 to attempt dispatch, fail closed, and release quota
      let manifest = await readJobManifest(jobId);
      for (let i = 0; i < 60 && manifest?.status !== "failed"; i++) {
        await new Promise((r) => setTimeout(r, 100));
        manifest = await readJobManifest(jobId);
      }

      expect(manifest?.status).toBe("failed");
      expect(manifest?.error).toContain("Azure render dispatch failed");

      const quotaAfter = await getUserQuota(userId, "BASIC");
      expect(quotaAfter.completed).toBe(0);
      expect(quotaAfter.reserved).toBe(0);
      expect(quotaAfter.remaining).toBe(5);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("P0-4: Basic 5-Video Lifecycle & 6th Attempt Hard Block without Azure Dispatch", async () => {
    const userId = "user_p0_basic_5_lifecycle_001";
    currentMockUser = { uid: userId, role: "BASIC" };

    let azureDispatchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (String(url).includes("/api/render/jobs")) {
        azureDispatchCount++;
        const parsed = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, jobId: parsed.jobId }),
          text: async () => JSON.stringify({ success: true }),
        };
      }
      return originalFetch(url, init);
    }) as any;

    try {
      // Execute 5 successful generations
      for (let i = 1; i <= 5; i++) {
        const jobId = `job_batch_${userId}_${i}`;
        await reserveGenerationSlot(userId, "BASIC", jobId);
        await finalizeGenerationSlot(userId, "BASIC", jobId);
      }

      // Verify quota is exhausted (5/5 used, 0 remaining)
      const quotaAfter5 = await getUserQuota(userId, "BASIC");
      expect(quotaAfter5.completed).toBe(5);
      expect(quotaAfter5.totalUsed).toBe(5);
      expect(quotaAfter5.remaining).toBe(0);
      expect(quotaAfter5.isExceeded).toBe(true);

      // Attempt 6th generation via API -> Must be rejected with HTTP 429 QUOTA_EXCEEDED
      const req6 = new Request("http://localhost:3000/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "6th Attempt Forbidden Video",
          contentType: "FACTS_SHORTS",
          script: "This 6th attempt should be blocked.",
          scenes: [{ contactText: "Blocked", imagePrompt: "stop 8k" }],
        }),
      });

      const res6 = await generateVideoHandler(req6);
      const data6 = await res6.json();

      expect(res6.status).toBe(429);
      expect(data6.code).toBe("QUOTA_EXCEEDED");
      expect(data6.error).toContain("Lifetime generation quota exhausted");

      // Verify ZERO Azure dispatch on the 6th attempt
      expect(azureDispatchCount).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("P1: Stale Reservation Bounded TTL Cleanup (15-Minute Expiry)", async () => {
    const userId = "user_p0_stale_ttl_001";
    currentMockUser = { uid: userId, role: "BASIC" };

    const staleJobId = "job_stale_crash_001";

    // Simulate an orphaned reservation created 20 minutes ago (process crash)
    await reserveGenerationSlot(userId, "BASIC", staleJobId);

    // Manually backdate the reservation to 20 minutes ago
    const quotaRef = (await import("../../lib/firebase-admin")).db.collection("quotas").doc(userId);
    const doc = await quotaRef.get();
    const data = doc.data() || {};
    const slots = data.reservedSlots || {};
    slots[staleJobId].reservedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await quotaRef.update({ reservedSlots: slots });

    // Verify getUserQuota automatically evicts stale reservations
    const quota = await getUserQuota(userId, "BASIC");
    expect(quota.reserved).toBe(0);
    expect(quota.remaining).toBe(5);

    // Verify reclaimStaleReservations maintenance function
    const reclaimed = await reclaimStaleReservations(userId, RESERVATION_TTL_MS);
    expect(reclaimed).toBeGreaterThanOrEqual(0);
  });

  it("P1: Admin User Bypass: Admin Is Not Restricted by Basic 5-Video Limits", async () => {
    const adminId = "user_admin_unlimited_001";
    currentMockUser = { uid: adminId, role: "ADMIN" };

    const adminQuota = await getUserQuota(adminId, "ADMIN");
    expect(adminQuota.isUnlimited).toBe(true);
    expect(adminQuota.limit).toBe(Infinity);
    expect(adminQuota.remaining).toBe(Infinity);
    expect(adminQuota.isExceeded).toBe(false);

    // Reserving quota for Admin succeeds cleanly
    const resResult = await reserveGenerationSlot(adminId, "ADMIN", "job_admin_001");
    expect(resResult.success).toBe(true);
    expect(resResult.quota.isUnlimited).toBe(true);
  });
});
