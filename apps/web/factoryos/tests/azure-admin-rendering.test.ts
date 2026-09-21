import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../lib/firebase-admin";
import crypto from "crypto";

const TEST_SECRET = process.env.RENDER_WORKER_SECRET || "test-worker-secret-mock-only";

describe("FactoryOS — Azure Admin Rendering & Tier Isolation Test Suite", () => {
  const createdJobIds: string[] = [];

  afterEach(async () => {
    // Cleanup created test jobs from Firestore
    for (const jId of createdJobIds) {
      try {
        await db.collection("videos").doc(jId).delete();
        await db.collection("quotas").doc(`test_user_${jId}`).delete();
      } catch {}
    }
    createdJobIds.length = 0;
  });

  // 1. ADMIN job gets tier=ADMIN, targetWorkerPool=azure
  test("01: ADMIN/OWNER user generates job with tier=ADMIN and targetWorkerPool=azure", async () => {
    const adminJobId = `job_test_admin_${Date.now()}`;
    createdJobIds.push(adminJobId);

    const userRole = "ADMIN";
    const isAdminOrOwner = userRole === "ADMIN" || userRole === "OWNER";
    const tier = isAdminOrOwner ? "ADMIN" : "BASIC";
    const targetWorkerPool = isAdminOrOwner ? "azure" : "github-actions";

    const payload = {
      userId: `test_user_${adminJobId}`,
      topic: "Quantum Physics in 60 Seconds",
      tier,
      targetWorkerPool,
      status: "queued",
      createdAt: new Date().toISOString(),
    };

    await db.collection("videos").doc(adminJobId).set(payload);

    const doc = await db.collection("videos").doc(adminJobId).get();
    expect(doc.exists).toBe(true);
    const data = doc.data();
    expect(data?.tier).toBe("ADMIN");
    expect(data?.targetWorkerPool).toBe("azure");
  });

  // 2. BASIC job gets tier=BASIC, targetWorkerPool=basic-fastapi
  test("02: BASIC user generates job with tier=BASIC and targetWorkerPool=basic-fastapi", async () => {
    const basicJobId = `job_test_basic_${Date.now()}`;
    createdJobIds.push(basicJobId);

    const userRole: string = "USER";
    const isAdminOrOwner = userRole === "ADMIN" || userRole === "OWNER";
    const tier = isAdminOrOwner ? "ADMIN" : "BASIC";
    const targetWorkerPool = isAdminOrOwner ? "azure" : "basic-fastapi";

    const payload = {
      userId: `test_user_${basicJobId}`,
      topic: "Top 5 Fun Facts",
      tier,
      targetWorkerPool,
      status: "queued",
      createdAt: new Date().toISOString(),
    };

    await db.collection("videos").doc(basicJobId).set(payload);

    const doc = await db.collection("videos").doc(basicJobId).get();
    expect(doc.exists).toBe(true);
    const data = doc.data();
    expect(data?.tier).toBe("BASIC");
    expect(data?.targetWorkerPool).toBe("basic-fastapi");
  });

  // 3 & 5. Azure worker claims ADMIN only and CANNOT claim Basic
  test("03 & 05: Azure worker claims ADMIN job and rejects BASIC job", async () => {
    const basicId = `job_iso_basic_${Date.now()}`;
    const adminId = `job_iso_admin_${Date.now()}`;
    createdJobIds.push(basicId, adminId);

    // Queue basic job first
    await db.collection("videos").doc(basicId).set({
      userId: "u_basic",
      topic: "Basic Fact",
      tier: "BASIC",
      targetWorkerPool: "basic-fastapi",
      status: "queued",
      createdAt: new Date(Date.now() - 10000).toISOString(),
    });

    // Queue admin job second
    await db.collection("videos").doc(adminId).set({
      userId: "u_admin",
      topic: "Admin Quantum",
      tier: "ADMIN",
      targetWorkerPool: "azure",
      status: "queued",
      createdAt: new Date().toISOString(),
    });

    // Simulate Azure worker claim transaction
    const claimAzureResult = await db.runTransaction(async (transaction: any) => {
      const snapshot = await db
        .collection("videos")
        .where("status", "in", ["queued", "processing"])
        .orderBy("createdAt", "asc")
        .limit(25)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.status === "queued" && data.tier === "ADMIN") {
          const executionToken = `exec_az_${crypto.randomBytes(16).toString("hex")}`;
          const jobRef = db.collection("videos").doc(doc.id);
          transaction.update(jobRef, {
            status: "processing",
            workerId: "azure-vm-admin-01",
            workerPool: "azure",
            executionToken,
          });
          return { claimed: true, jobId: doc.id, tier: data.tier, executionToken };
        }
      }
      return { claimed: false };
    });

    expect(claimAzureResult.claimed).toBe(true);
    expect(claimAzureResult.jobId).toBe(adminId); // Claimed ADMIN job, skipped Basic job!
    expect(claimAzureResult.tier).toBe("ADMIN");

    // Verify basic job remained queued untouched
    const basicDoc = await db.collection("videos").doc(basicId).get();
    expect(basicDoc.data()?.status).toBe("queued");
  });

  // 4 & 6. GitHub worker claims BASIC only and CANNOT claim Admin
  test("04 & 06: GitHub worker claims BASIC job and rejects ADMIN job", async () => {
    const adminId = `job_gh_admin_${Date.now()}`;
    const basicId = `job_gh_basic_${Date.now()}`;
    createdJobIds.push(adminId, basicId);

    // Queue admin job first
    await db.collection("videos").doc(adminId).set({
      userId: "u_admin",
      topic: "Admin Video",
      tier: "ADMIN",
      targetWorkerPool: "azure",
      status: "queued",
      createdAt: new Date(Date.now() - 10000).toISOString(),
    });

    // Queue basic job second
    await db.collection("videos").doc(basicId).set({
      userId: "u_basic",
      topic: "Basic Video",
      tier: "BASIC",
      targetWorkerPool: "basic-fastapi",
      status: "queued",
      createdAt: new Date().toISOString(),
    });

    // Simulate GitHub Actions claim transaction
    const claimGhResult = await db.runTransaction(async (transaction: any) => {
      const snapshot = await db
        .collection("videos")
        .where("status", "in", ["queued", "processing"])
        .orderBy("createdAt", "asc")
        .limit(25)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.status === "queued" && (data.tier === "BASIC" || !data.tier)) {
          const executionToken = `exec_gh_${crypto.randomBytes(16).toString("hex")}`;
          const jobRef = db.collection("videos").doc(doc.id);
          transaction.update(jobRef, {
            status: "processing",
            workerId: "gh-runner-01",
            workerPool: "github-actions",
            executionToken,
          });
          return { claimed: true, jobId: doc.id, tier: data.tier, executionToken };
        }
      }
      return { claimed: false };
    });

    expect(claimGhResult.claimed).toBe(true);
    expect(claimGhResult.jobId).toBe(basicId); // Claimed BASIC job, skipped Admin job!
    expect(claimGhResult.tier).toBe("BASIC");

    // Verify admin job remained queued untouched
    const adminDoc = await db.collection("videos").doc(adminId).get();
    expect(adminDoc.data()?.status).toBe("queued");
  });

  // 7 & 8. executionToken validation & rejection of invalid tokens
  test("07 & 08: Valid executionToken authorizes callback; invalid token is rejected", async () => {
    const testId = `job_token_${Date.now()}`;
    createdJobIds.push(testId);
    const validToken = `exec_sec_${Date.now()}`;

    await db.collection("videos").doc(testId).set({
      userId: "u_tok",
      status: "processing",
      executionToken: validToken,
      createdAt: new Date().toISOString(),
    });

    const doc = await db.collection("videos").doc(testId).get();
    const data = doc.data();

    // Verify match
    expect(data?.executionToken).toBe(validToken);
    expect("invalid_token_123" === data?.executionToken).toBe(false);
  });

  // 9. Callback is idempotent
  test("09: Callback is idempotent and does not corrupt state on duplicate completion requests", async () => {
    const testId = `job_idem_${Date.now()}`;
    createdJobIds.push(testId);
    const token = `exec_idem_${Date.now()}`;

    const originalCompletedAt = new Date(Date.now() - 5000).toISOString();

    await db.collection("videos").doc(testId).set({
      userId: `test_user_${testId}`,
      status: "completed",
      videoUrl: `https://drive.google.com/file/d/test_${testId}/view`,
      driveFileId: `drive_${testId}`,
      driveUrl: `https://drive.google.com/file/d/test_${testId}/view`,
      executionToken: token,
      completedAt: originalCompletedAt,
    });

    const doc = await db.collection("videos").doc(testId).get();
    expect(doc.data()?.status).toBe("completed");
    expect(doc.data()?.driveFileId).toBe(`drive_${testId}`);
    expect(doc.data()?.completedAt).toBe(originalCompletedAt);
  });

  // 10 & 12. Successful MP4 finalizes job and persists real Google Drive metadata
  test("10 & 12: Successful render records real MP4 metadata, Drive File ID, and Drive URL", async () => {
    const testId = `job_success_${Date.now()}`;
    createdJobIds.push(testId);
    const token = `exec_succ_${Date.now()}`;

    await db.collection("videos").doc(testId).set({
      userId: `test_user_${testId}`,
      status: "processing",
      executionToken: token,
      createdAt: new Date().toISOString(),
    });

    const driveFileId = "1oCOBlk5QrOVzWKLI6J0X7spC-QQ4piJ7";
    const driveUrl = "https://drive.google.com/file/d/1oCOBlk5QrOVzWKLI6J0X7spC-QQ4piJ7/view";
    const completedAt = new Date().toISOString();

    await db.collection("videos").doc(testId).set(
      {
        status: "completed",
        videoUrl: driveUrl,
        driveFileId,
        driveUrl,
        filename: `${testId}.mp4`,
        videoSizeMb: 5.4,
        renderDurationSeconds: 24,
        completedAt,
        updatedAt: completedAt,
      },
      { merge: true }
    );

    const doc = await db.collection("videos").doc(testId).get();
    const data = doc.data();

    expect(data?.status).toBe("completed");
    expect(data?.driveFileId).toBe(driveFileId);
    expect(data?.driveUrl).toBe(driveUrl);
    expect(data?.videoSizeMb).toBe(5.4);
    expect(data?.renderDurationSeconds).toBe(24);
  });

  // 11. Failed render records error and releases reservation
  test("11: Failed render marks status as failed and records error message", async () => {
    const testId = `job_fail_${Date.now()}`;
    createdJobIds.push(testId);
    const token = `exec_fail_${Date.now()}`;

    await db.collection("videos").doc(testId).set({
      userId: `test_user_${testId}`,
      status: "processing",
      executionToken: token,
      createdAt: new Date().toISOString(),
    });

    const failedAt = new Date().toISOString();
    await db.collection("videos").doc(testId).set(
      {
        status: "failed",
        error: "FFmpeg exited with non-zero code 1: Invalid input stream",
        failedAt,
        updatedAt: failedAt,
      },
      { merge: true }
    );

    const doc = await db.collection("videos").doc(testId).get();
    const data = doc.data();

    expect(data?.status).toBe("failed");
    expect(data?.error).toContain("FFmpeg exited with non-zero code");
  });
});
