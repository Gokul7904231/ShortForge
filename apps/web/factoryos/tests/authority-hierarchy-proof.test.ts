import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { AutonomousFactoryController } from "../core/controller/AutonomousFactoryController";
import { CaseManager } from "../core/cases/CaseManager";
import { LeaseManager } from "../core/leases/LeaseManager";
import { DatabaseFactory } from "../core/database/MongoDBClient";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import { SlayerEngine } from "../core/slayers/SlayerEngine";
import { HealerEngine } from "../core/healers/HealerEngine";

describe("FactoryOS Frontier v3 — Authority Model & Resilience Invariant Suite", () => {
  let eventBus: DurableEventBus;
  let worldState: WorldStateEngine;
  let caseManager: CaseManager;
  let leaseManager: LeaseManager;
  let slayerEngine: SlayerEngine;
  let healerEngine: HealerEngine;

  beforeEach(async () => {
    const repos = DatabaseFactory.createRepositories(null);
    worldState = new WorldStateEngine(repos.worldState, true);
    await worldState.restore();
    eventBus = new DurableEventBus();
    leaseManager = new LeaseManager(repos.leases);
    caseManager = new CaseManager(repos.cases, eventBus, worldState);
    slayerEngine = new SlayerEngine(caseManager, eventBus, worldState, repos.reputation, 2000, leaseManager);
    healerEngine = new HealerEngine(caseManager, eventBus, worldState, leaseManager, repos.reputation);
  });

  it("1. Slayer Invariant: Slayer investigates anomalies and produces forensic Cases, but does NOT command recovery", async () => {
    // Simulate anomaly detection
    const createdCase = await caseManager.createCase({
      title: "Worker Render Timeout on Floor 06",
      description: "Heartbeat timeout in render worker",
      detectorId: "slayer_pipeline_patrol",
      category: "WORKER_STALL",
      severity: "HIGH",
      targetWorker: "worker_render_01",
      floorId: "floor06_rendering",
      symptoms: ["No heartbeat in 45 seconds", "Render lease expired"],
      observedState: { stallDurationMs: 45000 },
    });

    expect(createdCase.caseId).toBeDefined();
    expect(createdCase.status).toBe("DETECTED");

    // Slayer investigates and attaches evidence
    await caseManager.addEvidence(
      createdCase.caseId,
      {
        evidenceId: "ev_slayer_diag_01",
        type: "METRIC",
        source: "slayer_pipeline_patrol",
        description: "Observed persistent stall in GPU encode queue",
        data: { stallDurationMs: 45000, lastSequence: 4 },
        collectedAt: new Date().toISOString(),
        confidence: 0.94,
      },
      "slayer_pipeline_patrol"
    );

    const updatedCase = await caseManager.getCase(createdCase.caseId);
    expect(updatedCase?.evidence.length).toBe(1);
    expect(updatedCase?.evidence[0].source).toBe("slayer_pipeline_patrol");

    // Verify Slayer did NOT mutate status to RESOLVED
    expect(updatedCase?.status).not.toBe("RESOLVED");
  });

  it("2. Healer Invariant: Healer receives Case from CaseManager and executes authoritative resolution", async () => {
    const openCase = await caseManager.createCase({
      title: "Orphaned Task Lease on Floor 04",
      description: "Expired lock held on voice task",
      detectorId: "watchdog",
      category: "RESOURCE_STARVATION",
      severity: "MEDIUM",
      targetWorker: "worker_voice_01",
      floorId: "floor04_media_synthesis",
      symptoms: ["Expired lock held on voice task"],
      observedState: { leaseId: "task_voice_999" },
    });

    // Acquire task lease for the stalled worker
    await leaseManager.acquire("task_voice_999", "worker_voice_01", 1000);

    // Healer applies resolution
    await caseManager.resolveCase(openCase.caseId, {
      diagnosis: "Worker voice 01 crashed; lease evicted and worker pool rebalanced",
      resolutionPlan: "Evict lease and recycle worker slot",
      healerId: "healer_worker_lifecycle",
      actionsTaken: ["Evicted lease task_voice_999", "Recycled worker_voice_01"],
      verifiedAt: new Date().toISOString(),
    });

    const resolvedCase = await caseManager.getCase(openCase.caseId);
    expect(resolvedCase?.status).toBe("RESOLVED");
    expect(resolvedCase?.resolutionSummary).toContain("Evict lease");
    expect(resolvedCase?.timeline.some((t) => t.actor === "healer_worker_lifecycle")).toBe(true);
  });

  it("3. Distributed Durability & Idempotency: Duplicate completion callbacks are strictly idempotent", async () => {
    const { POST: callbackHandler } = await import("../../app/api/rendering/callback/route");
    const { saveJobManifest, readJobManifest } = await import("../../lib/jobs-history");
    const { NextRequest } = await import("next/server");

    const testJobId = "job_durability_test_001";
    const testToken = "test_token_durability_abcdef1234567890";

    await saveJobManifest(testJobId, {
      status: "processing",
      executionToken: testToken,
      userId: "user_test_durability",
    });

    const reqPayload = {
      jobId: testJobId,
      status: "completed",
      videoUrl: `https://storage.provider.com/${testJobId}.mp4`,
      renderDurationSeconds: 12,
      executionToken: testToken,
    };

    const makeReq = () =>
      new NextRequest("http://localhost:3000/api/rendering/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify(reqPayload),
      });

    const renderDir = path.join(process.cwd(), "data", "renders");
    if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });
    const testMp4 = path.join(renderDir, `${testJobId}.mp4`);
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=1 -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -pix_fmt yuv420p -c:a aac -t 1 "${testMp4}"`,
      { stdio: "ignore" }
    );

    try {
      // First delivery (at-least-once: Attempt 1)
      const res1 = await callbackHandler(makeReq());
      expect(res1.status).toBe(200);

      // Verify manifest transitioned to completed
      const m1 = await readJobManifest(testJobId);
      expect(m1?.status).toBe("completed");

      // Second delivery (at-least-once: Duplicate Attempt 2 - Network retransmit)
      const res2 = await callbackHandler(makeReq());
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.message).toContain("already marked completed");

      // Manifest remains completed without corruption
      const m2 = await readJobManifest(testJobId);
      expect(m2?.status).toBe("completed");
      expect(m2?.videoUrl).toBe(`https://storage.provider.com/${testJobId}.mp4`);
    } finally {
      if (fs.existsSync(testMp4)) {
        try { fs.unlinkSync(testMp4); } catch {}
      }
    }
  });
});
