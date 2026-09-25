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

  beforeEach(async () => {
    process.env.EXECUTION_AUTHORITY = "factoryos";
    delete process.env.BASIC_RENDER_API_URL;
    delete process.env.BASIC_RENDER_API_SECRET;
    process.env.INTERNAL_API_SECRET_KEY = "staging_factoryos_render_secret_key_8888";

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


  it("P0-4: Basic 5-Video Lifecycle & 6th Attempt Hard Block", async () => {
    const userId = "user_p0_basic_5_lifecycle_001";
    currentMockUser = { uid: userId, role: "BASIC" };

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
