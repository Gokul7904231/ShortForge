import { describe, it, expect, beforeEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { RenderJobStateMachine } from "../core/fabric/state/RenderJobStateMachine";
import { WorkerFleetManager } from "../core/fabric/worker/WorkerFleetManager";
import { PlacementEngine } from "../core/fabric/scheduler/PlacementEngine";
import { FabricEventJournal } from "../core/fabric/events/FabricEventJournal";
import { LocalRenderWorkerAdapter } from "../core/fabric/adapters/LocalRenderWorkerAdapter";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import type { IRenderWorker } from "../core/fabric/worker/RenderWorkerContract";
import type { RenderJob, RenderAttempt, WorkerCapability, WorkerState } from "../core/fabric/contracts/RenderFabricContracts";

class MockWorker implements IRenderWorker {
  constructor(
    public readonly workerId: string,
    private caps: WorkerCapability,
    private state: WorkerState = "READY"
  ) {}

  getState(): WorkerState {
    return this.state;
  }

  async getCapabilities(): Promise<WorkerCapability> {
    return this.caps;
  }

  async execute(job: RenderJob, attempt: RenderAttempt): Promise<{ success: boolean }> {
    return { success: true };
  }

  async cancel(jobId: string): Promise<void> {}
  async drain(): Promise<void> {
    this.state = "DRAINING";
  }
  async shutdown(): Promise<void> {
    this.state = "OFFLINE";
  }
}

describe("Render Fabric Core — Distributed Races, Leases, Fencing & Execution", () => {
  let stateMachine: RenderJobStateMachine;
  let fleet: WorkerFleetManager;
  let eventJournal: FabricEventJournal;
  let placement: PlacementEngine;

  beforeEach(() => {
    eventJournal = new FabricEventJournal();
    stateMachine = new RenderJobStateMachine(eventJournal);
    fleet = new WorkerFleetManager(15000, eventJournal);
    placement = new PlacementEngine(fleet);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Distributed Race & Concurrency: Exactly One Worker Wins Claim
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Distributed Claim Races & Atomic State Transitions", () => {
    it("guarantees that two concurrent workers claiming the same job results in exactly 1 winner", () => {
      const { job } = stateMachine.submitJob({
        jobId: "job_race_001",
        missionId: "mis_test_001",
        idempotencyKey: "idem_race_001",
        requirements: {
          minVramMb: 2048,
          gpuRequired: false,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: {
          topic: "Space Architecture",
          scenes: [{ sceneId: "s1", duration: 5 }],
        },
      });

      expect(job.state).toBe("QUEUED");

      // Worker 1 and Worker 2 both attempt to claim simultaneously
      // Worker 1 claims job
      const claim1 = stateMachine.claimJob({ jobId: "job_race_001", workerId: "worker_node_1", leaseDurationMs: 30000 });
      expect(claim1.attempt.attemptId).toBe(1);
      expect(claim1.fencingToken).toBe(1001);

      // Worker 2 attempts to claim while lease is active -> must be rejected
      expect(() => {
        stateMachine.claimJob({ jobId: "job_race_001", workerId: "worker_node_2", leaseDurationMs: 30000 });
      }).toThrow(/Cannot claim job/);

      // Invariant: Exactly worker_node_1 owns the job
      const updatedJob = stateMachine.getJob("job_race_001")!;
      expect(updatedJob.activeWorkerId).toBe("worker_node_1");
      expect(updatedJob.activeFencingToken).toBe(1001);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Fencing Tokens: Rejection of Stale Worker Callbacks
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Fencing Token Protection against Stale Workers", () => {
    it("strictly rejects callbacks bearing a stale fencing token", async () => {
      const { job } = stateMachine.submitJob({
        jobId: "job_fencing_001",
        missionId: "mis_test_002",
        idempotencyKey: "idem_fencing_001",
        requirements: {
          minVramMb: 2048,
          gpuRequired: false,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: { topic: "Quantum Computing" },
      });

      // Attempt 1 claimed by Worker A
      const claim1 = stateMachine.claimJob({ jobId: job.jobId, workerId: "worker_slow_a", leaseDurationMs: 1 });
      const staleToken = claim1.fencingToken; // 1001
      const staleAttemptId = claim1.attempt.attemptId;

      // Allow Attempt 1 lease to expire
      await new Promise((r) => setTimeout(r, 10));

      // Attempt 2 claimed by Worker B (after lease expiration / recovery)
      const claim2 = stateMachine.claimJob({ jobId: job.jobId, workerId: "worker_fast_b", leaseDurationMs: 30000 });
      const freshToken = claim2.fencingToken; // 1002
      expect(freshToken).toBeGreaterThan(staleToken);

      // Worker A wakes up late and attempts to report callback with stale token
      const staleCallback = stateMachine.handleCallback({
        jobId: job.jobId,
        attemptId: staleAttemptId,
        fencingToken: staleToken,
        workerId: "worker_slow_a",
        status: "succeeded",
        artifact: {
          uri: "file:///data/renders/stale.mp4",
          sha256: "stalesha123",
          byteLength: 5000,
        },
      });

      expect(staleCallback.accepted).toBe(false);
      expect(staleCallback.reason).toMatch(/FENCING_REJECTED/);

      // Worker B reports with fresh token
      const freshCallback = stateMachine.handleCallback({
        jobId: job.jobId,
        attemptId: claim2.attempt.attemptId,
        fencingToken: freshToken,
        workerId: "worker_fast_b",
        status: "succeeded",
        artifact: {
          uri: "file:///data/renders/fresh.mp4",
          sha256: "freshsha456",
          byteLength: 10000,
        },
      });

      expect(freshCallback.accepted).toBe(true);
      expect(stateMachine.getJob(job.jobId)?.state).toBe("SUCCEEDED");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Heartbeats, Leases & Lifetime-Aware Worker Fleet
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Worker Fleet Leases, Heartbeats & Expiry", () => {
    it("extends job lease on valid heartbeat and rejects invalid worker", () => {
      const { job } = stateMachine.submitJob({
        jobId: "job_lease_001",
        missionId: "mis_test_003",
        idempotencyKey: "idem_lease_001",
        requirements: {
          minVramMb: 1024,
          gpuRequired: false,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: { topic: "AI Evolution" },
      });

      const claim = stateMachine.claimJob({ jobId: "job_lease_001", workerId: "worker_active", leaseDurationMs: 5000 });
      const initialLeaseExpiry = claim.attempt.leaseExpiresAt;

      // Heartbeat renews lease
      const renewed = stateMachine.renewLease({
        jobId: "job_lease_001",
        attemptId: claim.attempt.attemptId,
        fencingToken: claim.fencingToken,
        extensionMs: 15000,
      });
      expect(renewed).toBe(true);

      const renewedJob = stateMachine.getJob("job_lease_001")!;
      expect(new Date(renewedJob.leaseExpiresAt!).getTime()).toBeGreaterThan(new Date(initialLeaseExpiry!).getTime());

      // Stale / imposter worker cannot heartbeat
      const staleRenew = stateMachine.renewLease({
        jobId: "job_lease_001",
        attemptId: claim.attempt.attemptId,
        fencingToken: 999, // Stale token
        extensionMs: 15000,
      });
      expect(staleRenew).toBe(false);
    });

    it("fleet manager registers workers and marks them DRAINING when lifetime is insufficient", async () => {
      const healthyWorker = new MockWorker("worker_long_lived", {
        workerId: "worker_long_lived",
        providerType: "LOCAL",
        gpuVendor: "NVIDIA",
        gpuModel: "RTX 3050",
        vramMb: 4096,
        gpuCount: 1,
        ffmpegAvailable: true,
        supportedWorkloads: ["video.render"],
        isEphemeral: false,
        estimatedRemainingLifetimeSeconds: 3600,
      });

      const registeredHealthy = await fleet.registerWorker(healthyWorker);
      expect(registeredHealthy.state).toBe("READY");

      const dyingWorker = new MockWorker("worker_dying_soon", {
        workerId: "worker_dying_soon",
        providerType: "AMD",
        gpuVendor: "AMD",
        gpuModel: "Radeon 780M",
        vramMb: 2048,
        gpuCount: 1,
        ffmpegAvailable: true,
        supportedWorkloads: ["video.render"],
        isEphemeral: true,
        estimatedRemainingLifetimeSeconds: 60, // Only 60s (< 120s threshold)
      });

      await fleet.registerWorker(dyingWorker);
      const heartbeatRes = fleet.processHeartbeat("worker_dying_soon");
      expect(heartbeatRes.state).toBe("DRAINING");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Placement Engine: Hard Eligibility Gates vs Soft Ranking Signals
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Placement Engine Decisions", () => {
    it("enforces hard eligibility (VRAM, GPU, Lifetime) before evaluating soft rank", async () => {
      const worker1 = new MockWorker("worker_nvidia_high", {
        workerId: "worker_nvidia_high",
        providerType: "LOCAL",
        gpuVendor: "NVIDIA",
        gpuModel: "RTX 4090",
        vramMb: 24576,
        gpuCount: 1,
        ffmpegAvailable: true,
        supportedWorkloads: ["video.render"],
        isEphemeral: false,
        estimatedRemainingLifetimeSeconds: 0,
      });

      const worker2 = new MockWorker("worker_cpu_low", {
        workerId: "worker_cpu_low",
        providerType: "LOCAL",
        gpuVendor: "NONE",
        gpuModel: "None",
        vramMb: 0,
        gpuCount: 0,
        ffmpegAvailable: true,
        supportedWorkloads: ["video.render"],
        isEphemeral: false,
        estimatedRemainingLifetimeSeconds: 0,
      });

      await fleet.registerWorker(worker1);
      await fleet.registerWorker(worker2);

      const { job } = stateMachine.submitJob({
        jobId: "job_placement_001",
        missionId: "mis_place_001",
        idempotencyKey: "idem_place_001",
        requirements: {
          minVramMb: 8192,
          gpuRequired: true,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: { topic: "GPU 3D Render" },
      });

      const decision = placement.placeJob(job);
      expect(decision.selectedWorkerId).toBe("worker_nvidia_high");
      expect(decision.selectedProvider).toBe("LOCAL");
      expect(decision.rejectedWorkers["worker_cpu_low"]).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. CloudEvents 1.0 Event Journal: Immutable Audit Log
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. CloudEvents 1.0 Event Journal", () => {
    it("appends and queries immutable execution events with correlation IDs", () => {
      eventJournal.record({
        type: "job.created",
        source: "factoryos/scheduler",
        subject: "job:job_ev_001",
        data: { missionId: "mis_ev_001", priority: "NORMAL" },
      });

      eventJournal.record({
        type: "job.claimed",
        source: "factoryos/worker/worker_alpha",
        subject: "job:job_ev_001:attempt:1",
        data: { workerId: "worker_alpha", attemptNumber: 1 },
      });

      eventJournal.record({
        type: "render.succeeded",
        source: "factoryos/worker/worker_alpha",
        subject: "job:job_ev_001",
        data: { artifactSha256: "abc123sha", durationSec: 15 },
      });

      const history = eventJournal.getEventsBySubject("job:job_ev_001");
      expect(history).toHaveLength(3);
      expect(history.map((e) => e.type)).toEqual(["job.created", "job.claimed", "render.succeeded"]);
      expect(history[0].specversion).toBe("1.0");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Local Render Worker: Real Physical MP4 + CAS Registration
  // ───────────────────────────────────────────────────────────────────────────
  describe("6. Local Worker Execution with Physical Media & CAS", () => {
    it("executes local render, validates MP4, indexes artifact in CAS, and tracks invocation count", async () => {
      const cas = new ContentAddressedStore(path.join(process.cwd(), "data", "test_cas_store"));
      const worker = new LocalRenderWorkerAdapter("local_worker_test_01", cas);

      const caps = await worker.getCapabilities();
      expect(caps.ffmpegAvailable).toBe(true);
      expect(caps.supportedWorkloads).toContain("video.render");

      const initialCount = worker.renderInvocationCount;

      // Ensure test render directory exists
      const renderDir = path.join(process.cwd(), "data", "renders");
      if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });

      const testJob: RenderJob = {
        jobId: `job_local_test_${Date.now()}`,
        missionId: "mis_local_001",
        idempotencyKey: `idem_local_${Date.now()}`,
        state: "CLAIMED",
        activeWorkerId: "local_worker_test_01",
        activeAttemptId: 1,
        activeFencingToken: 1001,
        requirements: {
          minVramMb: 1024,
          gpuRequired: false,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: {
          topic: "German Geography Quiz",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const attempt: RenderAttempt = {
        attemptId: 1,
        jobId: testJob.jobId,
        workerId: "local_worker_test_01",
        fencingToken: 1001,
        state: "CLAIMED",
        startedAt: new Date().toISOString(),
      };

      const result = await worker.execute(testJob, attempt);
      expect(result.success).toBe(true);
      expect(result.artifactReference).toBeDefined();
      expect(result.artifactReference?.sha256).toBeDefined();
      expect(result.artifactReference?.byteLength).toBeGreaterThan(0);
      expect(worker.renderInvocationCount).toBe(initialCount + 1);

      // Verify physical existence in ContentAddressedStore
      const casEntry = await cas.get(result.artifactReference!.sha256);
      expect(casEntry).not.toBeNull();
      expect(casEntry?.byteLength).toBe(result.artifactReference?.byteLength);
    });
  });
});
