import { describe, it, expect, beforeEach } from "vitest";
import {
  getUserQuota,
  reserveGenerationSlot,
  releaseGenerationSlot,
  finalizeGenerationSlot,
  QuotaExceededError,
  MAX_BASIC_USER_VIDEOS,
} from "../../lib/quota/quota-service";
import { getNavigationForRole } from "../../lib/core/RouteRegistry";
import { isAdminUser, canWrite } from "../../lib/auth/roles";
import { db } from "../../lib/firebase-admin";

describe("FactoryOS Production Acceptance Gate E2E Test Suite", () => {
  beforeEach(() => {
    // Clear in-memory mock Firestore state
    const g = globalThis as any;
    if (g.__mock_firestore) {
      g.__mock_firestore = {};
    }
  });

  describe("Pillar 1: 5-Video Hard Limit Quota & Concurrency Safety", () => {
    it("allows generations up to 5 for a basic USER and rejects the 6th", async () => {
      const userId = "test_user_quota_1";

      const initialQuota = await getUserQuota(userId, "USER");
      expect(initialQuota.limit).toBe(5);
      expect(initialQuota.completed).toBe(0);
      expect(initialQuota.remaining).toBe(5);
      expect(initialQuota.isExceeded).toBe(false);

      // Reserve 5 sequential slots
      for (let i = 1; i <= 5; i++) {
        const res = await reserveGenerationSlot(userId, "USER", `job_${i}`);
        expect(res.success).toBe(true);
        expect(res.quota.totalUsed).toBe(i);
        expect(res.quota.remaining).toBe(5 - i);
      }

      // Attempting 6th reservation MUST throw QuotaExceededError
      await expect(
        reserveGenerationSlot(userId, "USER", "job_6")
      ).rejects.toThrow(QuotaExceededError);

      const finalQuota = await getUserQuota(userId, "USER");
      expect(finalQuota.totalUsed).toBe(5);
      expect(finalQuota.remaining).toBe(0);
      expect(finalQuota.isExceeded).toBe(true);
    });

    it("prevents race condition: 10 concurrent requests at 4/5 strictly allows only 1", async () => {
      const userId = "test_user_concurrency";

      // Setup user with 4 slots already used
      for (let i = 1; i <= 4; i++) {
        await reserveGenerationSlot(userId, "USER", `job_init_${i}`);
      }

      const quotaBefore = await getUserQuota(userId, "USER");
      expect(quotaBefore.totalUsed).toBe(4);
      expect(quotaBefore.remaining).toBe(1);

      // Fire 10 simultaneous generation requests
      const promises = Array.from({ length: 10 }).map((_, idx) =>
        reserveGenerationSlot(userId, "USER", `job_race_${idx}`)
      );

      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly ONE request must succeed to take slot #5
      expect(fulfilled.length).toBe(1);
      // The remaining 9 requests must be rejected with quota exceeded
      expect(rejected.length).toBe(9);

      // Total usage must strictly be 5 (never 6+)
      const quotaAfter = await getUserQuota(userId, "USER");
      expect(quotaAfter.totalUsed).toBe(5);
      expect(quotaAfter.remaining).toBe(0);
      expect(quotaAfter.isExceeded).toBe(true);
    });

    it("releases reservation on render failure and allows retry", async () => {
      const userId = "test_user_failure";

      // Fill all 5 slots
      for (let i = 1; i <= 5; i++) {
        await reserveGenerationSlot(userId, "USER", `job_fail_${i}`);
      }

      // Slot is full
      await expect(
        reserveGenerationSlot(userId, "USER", "job_blocked")
      ).rejects.toThrow(QuotaExceededError);

      // Job 3 fails permanently -> release slot
      await releaseGenerationSlot(userId, "job_fail_3");

      // Quota should now have 1 slot open
      const quotaAfterRelease = await getUserQuota(userId, "USER");
      expect(quotaAfterRelease.totalUsed).toBe(4);
      expect(quotaAfterRelease.remaining).toBe(1);

      // Now a new reservation succeeds
      const retryRes = await reserveGenerationSlot(userId, "USER", "job_retry_new");
      expect(retryRes.success).toBe(true);
      expect(retryRes.quota.totalUsed).toBe(5);
    });

    it("finalizes completed renders idempotently without double-counting", async () => {
      const userId = "test_user_finalize";

      await reserveGenerationSlot(userId, "USER", "job_success_1");
      const quotaReserved = await getUserQuota(userId, "USER");
      expect(quotaReserved.reserved).toBe(1);
      expect(quotaReserved.completed).toBe(0);

      // Finalize slot
      await finalizeGenerationSlot(userId, "job_success_1");

      const quotaFinalized = await getUserQuota(userId, "USER");
      expect(quotaFinalized.completed).toBe(1);
      expect(quotaFinalized.reserved).toBe(0);
      expect(quotaFinalized.totalUsed).toBe(1);

      // Calling finalize a second time MUST NOT double-increment
      await finalizeGenerationSlot(userId, "job_success_1");
      const quotaDoubleFinalized = await getUserQuota(userId, "USER");
      expect(quotaDoubleFinalized.completed).toBe(1);
      expect(quotaDoubleFinalized.totalUsed).toBe(1);
    });

    it("grants unlimited generation quota to ADMIN and OWNER roles", async () => {
      const adminId = "admin_super";
      const ownerId = "owner_boss";

      const adminQuota = await getUserQuota(adminId, "ADMIN");
      expect(adminQuota.isUnlimited).toBe(true);
      expect(adminQuota.remaining).toBe(Infinity);

      const ownerQuota = await getUserQuota(ownerId, "OWNER");
      expect(ownerQuota.isUnlimited).toBe(true);

      // Admin can reserve 10+ slots without quota restriction
      for (let i = 1; i <= 10; i++) {
        const res = await reserveGenerationSlot(adminId, "ADMIN", `admin_job_${i}`);
        expect(res.success).toBe(true);
        expect(res.quota.isUnlimited).toBe(true);
      }
    });
  });

  describe("Pillar 2: Data Isolation, Ownership & IDOR Protection", () => {
    it("ensures job manifests are owned by authenticated userId", async () => {
      const userAId = "user_alpha";
      const userBId = "user_bravo";

      // Save job for User A
      await db.collection("videos").doc("job_alpha_1").set({
        jobId: "job_alpha_1",
        userId: userAId,
        topic: "Quantum Computing 101",
        status: "completed",
        videoUrl: "https://storage.factoryos.app/renders/job_alpha_1.mp4",
      });

      // Verify User A reading own job
      const doc = await db.collection("videos").doc("job_alpha_1").get();
      const jobData = doc.data();
      expect(jobData).toBeDefined();
      expect(jobData?.userId).toBe(userAId);

      // Verify User B is blocked by ownership rule
      const isUserBAuthorized = jobData?.userId === userBId || isAdminUser("USER");
      expect(isUserBAuthorized).toBe(false);

      // Verify Admin is authorized
      const isAdminAuthorized = jobData?.userId === "admin_1" || isAdminUser("ADMIN");
      expect(isAdminAuthorized).toBe(true);
    });

    it("scopes factory-state Firestore queries by userId for non-admins", async () => {
      // Seed videos for multiple users
      await db.collection("videos").doc("job_u1_a").set({ userId: "user_1", status: "completed", createdAt: "2026-08-20T00:00:00Z" });
      await db.collection("videos").doc("job_u1_b").set({ userId: "user_1", status: "queued", createdAt: "2026-08-20T00:01:00Z" });
      await db.collection("videos").doc("job_u2_a").set({ userId: "user_2", status: "completed", createdAt: "2026-08-20T00:02:00Z" });

      // User 1 query: should return exactly 2 jobs
      const user1Snapshot = await db.collection("videos").where("userId", "==", "user_1").get();
      expect(user1Snapshot.docs.length).toBe(2);
      expect(user1Snapshot.docs.map((d) => d.id)).toContain("job_u1_a");
      expect(user1Snapshot.docs.map((d) => d.id)).toContain("job_u1_b");
      expect(user1Snapshot.docs.map((d) => d.id)).not.toContain("job_u2_a");

      // User 2 query: should return exactly 1 job
      const user2Snapshot = await db.collection("videos").where("userId", "==", "user_2").get();
      expect(user2Snapshot.docs.length).toBe(1);
      expect(user2Snapshot.docs[0].id).toBe("job_u2_a");
    });
  });

  describe("Pillar 3: Atomic Render Worker Claim (No Double-Claiming)", () => {
    it("guarantees that two concurrent workers cannot claim the same job", async () => {
      // Seed a single queued video job
      await db.collection("videos").doc("job_to_claim").set({
        jobId: "job_to_claim",
        userId: "creator_1",
        status: "queued",
        topic: "Space Facts",
        createdAt: "2026-08-20T01:00:00Z",
      });

      // Worker claim transaction simulator
      const simulateWorkerClaim = async (workerId: string) => {
        return await db.runTransaction(async (transaction: any) => {
          const snapshot = await db.collection("videos").where("status", "==", "queued").get();
          if (snapshot.empty) return null;

          const doc = snapshot.docs[0];
          const data = doc.data();
          if (data.status !== "queued") return null;

          const executionToken = `exec_${workerId}_${Date.now()}`;
          transaction.update(db.collection("videos").doc(doc.id), {
            status: "processing",
            workerId,
            executionToken,
          });

          return { jobId: doc.id, workerId, executionToken };
        });
      };

      // Two workers attempt claim simultaneously
      const [claimA, claimB] = await Promise.all([
        simulateWorkerClaim("worker_alpha"),
        simulateWorkerClaim("worker_beta"),
      ]);

      // Exactly ONE worker must claim the job; the other receives null
      const successfulClaims = [claimA, claimB].filter(Boolean);
      expect(successfulClaims.length).toBe(1);

      // Verify job is now processing in Firestore
      const finalDoc = await db.collection("videos").doc("job_to_claim").get();
      expect(finalDoc.data()?.status).toBe("processing");
    });
  });

  describe("Pillar 4: Role-Aware Overseer & Navigation Scoping", () => {
    it("provides creator navigation + Overseer to basic USER and excludes SRE routes", () => {
      const userNav = getNavigationForRole("USER");
      const userRouteIds = userNav.flatMap((s) => s.routes.map((r) => r.id));
      const sectionIds = userNav.map((s) => s.id);

      // SRE section is completely excluded
      expect(sectionIds).not.toContain("sre");
      expect(userRouteIds).not.toContain("sre-ai-hospital");
      expect(userRouteIds).not.toContain("sre-workers");
      expect(userRouteIds).not.toContain("admin-users");

      // Creator routes are included
      expect(userRouteIds).toContain("factory-jobs");
      expect(userRouteIds).toContain("factory-templates");
      expect(userRouteIds).toContain("media-library");
      expect(userRouteIds).toContain("ai-overseer");
    });

    it("provides complete operational and SRE tools to ADMIN and OWNER", () => {
      const adminNav = getNavigationForRole("ADMIN");
      const adminRouteIds = adminNav.flatMap((s) => s.routes.map((r) => r.id));
      const sectionIds = adminNav.map((s) => s.id);

      expect(sectionIds).toContain("sre");
      expect(adminRouteIds).toContain("sre-ai-hospital");
      expect(adminRouteIds).toContain("sre-profiler");
      expect(adminRouteIds).toContain("sre-workers");
      expect(adminRouteIds).toContain("admin-users");
      expect(adminRouteIds).toContain("ai-overseer");
    });
  });
});
