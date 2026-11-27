import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { ControlPlaneCircuitBreaker } from "../core/compute/instabox/ControlPlaneCircuitBreaker";
import { InstaBoxFleetRegistry } from "../core/compute/instabox/InstaBoxFleetRegistry";
import { evaluateFleetCanary, FLEET_GOLDEN_CANARY_SHA256 } from "../core/compute/instabox/CanaryGate";
import { POST as dispatchPost } from "@/app/api/rendering/instabox/dispatch/route";
import { POST as callbackPost } from "@/app/api/rendering/instabox/callback/route";
import { POST as canaryCronPost } from "@/app/api/cron/canary/route";

describe("P5.1 Control-Plane Wiring (Breaker, Canary Drain, DLQ)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p51-cp-"));
    process.env.INSTABOX_CONTROL_PLANE_ADMIN_SECRET = "test-admin-secret-123456";
    process.env.INSTABOX_WORKER_SECRET_BOX2 = "test-worker-secret-box2-123456";
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("opens breaker at >20% failure across 50 jobs and returns 503 intake-paused on dispatch", async () => {
    const dbPath = path.join(tmpDir, "breaker.sqlite3");
    const breaker = ControlPlaneCircuitBreaker.resetInstanceForTesting(dbPath);

    for (let i = 0; i < 39; i++) breaker.recordSuccess();
    for (let i = 0; i < 11; i++) breaker.recordFailure();

    expect(breaker.getSnapshot().state).toBe("OPEN");

    const req = new NextRequest("http://localhost/api/rendering/instabox/dispatch", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-secret-123456",
        "content-type": "application/json",
      },
      body: JSON.stringify({ targetNodeId: "box2", topic: "Test Breaker" }),
    });

    const res = await dispatchPost(req);
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("INTAKE_PAUSED");
  });

  it("drains node when canary hash mismatches fleet golden hash", async () => {
    const stateFile = path.join(tmpDir, "fleet.json");
    const registry = InstaBoxFleetRegistry.resetInstanceForTesting(stateFile);

    const ok = evaluateFleetCanary(registry, "box2", FLEET_GOLDEN_CANARY_SHA256);
    expect(ok.healthy).toBe(true);
    expect(ok.isDraining).toBe(false);

    const bad = evaluateFleetCanary(registry, "box2", "0000deadbeef");
    expect(bad.healthy).toBe(false);
    expect(bad.shouldDrain).toBe(true);
    expect(bad.isDraining).toBe(true);
    expect(registry.getNodeRecord("box2")?.isDraining).toBe(true);

    // Also verify 15-min cron endpoint drains mismatched observations
    const cronReq = new NextRequest("http://localhost/api/cron/canary", {
      method: "POST",
      headers: {
        authorization: "Bearer test-cron-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ observations: { box3: "bad-hash" } }),
    });
    const cronRes = await canaryCronPost(cronReq);
    const cronBody = await cronRes.json();
    expect(cronRes.status).toBe(200);
    expect(cronBody.drainedNodes).toContain("box3");
    expect(registry.getNodeRecord("box3")?.isDraining).toBe(true);
  });

  it("transitions job to DLQ when fenced callback receives status=DLQ with bundle", async () => {
    const stateFile = path.join(tmpDir, "fleet-dlq.json");
    const registry = InstaBoxFleetRegistry.resetInstanceForTesting(stateFile);
    ControlPlaneCircuitBreaker.resetInstanceForTesting(path.join(tmpDir, "breaker-dlq.sqlite3"));

    const record = registry.getNodeRecord("box2")!;
    record.activeLease = {
      jobId: "job-dlq-test-1",
      executionId: "exec-dlq-1",
      executionToken: "tok-dlq-1",
      attemptId: 1,
      workerId: "instabox-box2",
      claimedAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      job: {
        jobId: "job-dlq-test-1",
        factoryExecutionId: "fx-dlq-1",
        missionId: "m-dlq-1",
        workloadType: "RENDER",
        manifest: {},
        inputArtifacts: { bundleId: "b1", artifacts: [], createdTimestamp: Date.now() },
        requirements: { workloadType: "RENDER", gpuRequired: false, minCpuCores: 2, minMemoryMb: 4000 },
        priority: "HIGH",
        timeoutMs: 60_000,
        createdAt: new Date().toISOString(),
      },
      resolveReceipt: () => {},
      rejectReceipt: () => {},
      timeoutHandle: setTimeout(() => {}, 60_000),
    };
    clearTimeout(record.activeLease.timeoutHandle);

    const req = new NextRequest("http://localhost/api/rendering/instabox/callback", {
      method: "POST",
      headers: {
        authorization: "Bearer test-worker-secret-box2-123456",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workerId: "instabox-box2",
        executionToken: "tok-dlq-1",
        executionId: "exec-dlq-1",
        jobId: "job-dlq-test-1",
        status: "DLQ",
        attemptId: 1,
        failureReason: "Global budget exhausted",
        dlqBundle: { jobId: "job-dlq-test-1", globalAttempts: 5 },
      }),
    });

    const res = await callbackPost(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("DLQ");
    expect(body.dlqRecorded).toBe(true);
    expect(registry.getDlqRecord("job-dlq-test-1")?.reason).toBe("Global budget exhausted");
  });
});
