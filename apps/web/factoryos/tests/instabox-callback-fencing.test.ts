import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as callbackHandler } from "../../app/api/rendering/instabox/callback/route";
import { InstaBoxFleetRegistry } from "../core/compute/instabox/InstaBoxFleetRegistry";
import type { ComputeJob } from "../core/compute/contracts/ComputeContracts";

describe("InstaBox Callback Fencing & Lease Expiration Regression Suite", () => {
  const originalEnv = { ...process.env };
  const BOX2_SECRET = "box2-specific-secret-key-32chars";
  const WORKER_ID = "instabox-box2";
  const NODE_ID = "box2";

  let registry: InstaBoxFleetRegistry;

  function makeJob(id = "job-cb-test"): ComputeJob {
    return {
      jobId: id,
      factoryExecutionId: "fx-cb",
      missionId: "mission-cb",
      workloadType: "RENDER",
      manifest: { topic: "Callback Fencing Test", duration: 1 },
      inputArtifacts: { bundleId: "b-1", artifacts: [], createdTimestamp: Date.now() },
      requirements: { workloadType: "RENDER", gpuRequired: false },
      priority: "NORMAL",
      timeoutMs: 30000,
      createdAt: new Date().toISOString(),
    };
  }

  beforeEach(() => {
    process.env[`INSTABOX_WORKER_SECRET_BOX2`] = BOX2_SECRET;
    registry = InstaBoxFleetRegistry.resetInstanceForTesting();

    // Register box2 as healthy
    registry.recordHeartbeat({
      workerId: WORKER_ID,
      nodeId: NODE_ID,
      status: "HEALTHY",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 8000,
        memoryAvailableMb: 6000,
        diskTotalMb: 20000,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function makeRequest(body: Record<string, any>, token = BOX2_SECRET): NextRequest {
    return new NextRequest("http://localhost:3000/api/rendering/instabox/callback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  it("rejects callback with 400 when attemptId is missing or undefined", async () => {
    const job = makeJob("job-missing-attempt");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    const req = makeRequest({
      workerId: WORKER_ID,
      executionToken: claim.executionToken,
      jobId: job.jobId,
      status: "FAILED",
      failureReason: "Test failure",
      // attemptId missing
    });

    const res = await callbackHandler(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/positive integer attemptId/i);
  });

  it("rejects callback with 400 when attemptId is non-numeric or float or zero", async () => {
    const job = makeJob("job-invalid-attempt");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    for (const badAttempt of ["1", 1.5, 0, -1, null, NaN]) {
      const req = makeRequest({
        workerId: WORKER_ID,
        executionToken: claim.executionToken,
        jobId: job.jobId,
        attemptId: badAttempt,
        status: "FAILED",
      });

      const res = await callbackHandler(req);
      expect(res.status).toBe(400);
    }
  });

  it("rejects callback with 409 when attemptId is lower than active lease attemptId (stale attempt)", async () => {
    const job = makeJob("job-lower-attempt");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    // Simulate that the active lease has advanced to attempt 2
    const record = registry.getNodeRecord(NODE_ID)!;
    record.activeLease!.attemptId = 2;

    const req = makeRequest({
      workerId: WORKER_ID,
      executionToken: claim.executionToken,
      jobId: job.jobId,
      attemptId: 1, // lower than lease.attemptId (2)
      status: "FAILED",
    });

    const res = await callbackHandler(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/stale.*exact expected attempt ID is 2/i);
  });

  it("rejects callback with 409 when attemptId is higher than active lease attemptId (superseded/invalid attempt)", async () => {
    const job = makeJob("job-higher-attempt");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    const req = makeRequest({
      workerId: WORKER_ID,
      executionToken: claim.executionToken,
      jobId: job.jobId,
      attemptId: 2, // higher than lease.attemptId (1)
      status: "FAILED",
    });

    const res = await callbackHandler(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/superseded\/invalid.*exact expected attempt ID is 1/i);
  });

  it("rejects callback with 409 when active lease has expired", async () => {
    const job = makeJob("job-expired-lease");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    // Expire the lease in the past
    const record = registry.getNodeRecord(NODE_ID)!;
    record.activeLease!.leaseExpiresAt = new Date(Date.now() - 5000).toISOString();

    const req = makeRequest({
      workerId: WORKER_ID,
      executionToken: claim.executionToken,
      jobId: job.jobId,
      attemptId: 1,
      status: "FAILED",
    });

    const res = await callbackHandler(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/Lease expired at/i);
  });

  it("rejects callback with 409 when executionId does not match lease executionId", async () => {
    const job = makeJob("job-mismatched-execid");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    const req = makeRequest({
      workerId: WORKER_ID,
      executionToken: claim.executionToken,
      executionId: "exec_forged_other_attempt",
      jobId: job.jobId,
      attemptId: 1,
      status: "FAILED",
    });

    const res = await callbackHandler(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/Execution ID mismatch/i);
  });

  it("rejects duplicate callback after job is already settled", async () => {
    const job = makeJob("job-dup-callback");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    const payload = {
      workerId: WORKER_ID,
      executionToken: claim.executionToken,
      executionId: claim.executionId,
      jobId: job.jobId,
      attemptId: 1,
      status: "FAILED",
      failureReason: "Initial failure",
    };

    // First callback succeeds
    const res1 = await callbackHandler(makeRequest(payload));
    expect(res1.status).toBe(200);

    // Duplicate callback rejected with 409 because lease has been cleared
    const res2 = await callbackHandler(makeRequest(payload));
    expect(res2.status).toBe(409);
    const json2 = await res2.json();
    expect(json2.error).toMatch(/Stale, duplicate, or unauthorized/i);
  });

  it("accepts valid callback with exact attemptId and active unexpired lease", async () => {
    const job = makeJob("job-valid-fencing");
    void registry.dispatchJobToNode(NODE_ID, job);
    const claim = registry.claimJob(WORKER_ID);

    const req = makeRequest({
      workerId: WORKER_ID,
      executionToken: claim.executionToken,
      executionId: claim.executionId,
      jobId: job.jobId,
      attemptId: 1,
      status: "FAILED",
      failureReason: "Normal reported failure",
    });

    const res = await callbackHandler(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe("FAILED");
  });
});
