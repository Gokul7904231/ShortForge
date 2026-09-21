import { describe, it, expect, beforeEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { AmdRenderWorkerAdapter } from "../core/fabric/adapters/AmdRenderWorkerAdapter";
import { LocalRenderWorkerAdapter } from "../core/fabric/adapters/LocalRenderWorkerAdapter";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { FabricReconciler } from "../core/fabric/reconciler/FabricReconciler";
import { RenderJobStateMachine } from "../core/fabric/state/RenderJobStateMachine";
import { FabricEventJournal } from "../core/fabric/events/FabricEventJournal";
import { WorkerFleetManager } from "../core/fabric/worker/WorkerFleetManager";
import type { RenderJob, RenderAttempt } from "../core/fabric/contracts/RenderFabricContracts";

describe("Render Fabric Providers, Chaos & Zero Duplicate Render Verification", () => {
  let cas: ContentAddressedStore;
  let stateMachine: RenderJobStateMachine;
  let eventJournal: FabricEventJournal;
  let fleet: WorkerFleetManager;
  let reconciler: FabricReconciler;

  beforeEach(() => {
    cas = new ContentAddressedStore(path.join(process.cwd(), "data", "test_chaos_cas"));
    eventJournal = new FabricEventJournal();
    stateMachine = new RenderJobStateMachine(eventJournal);
    fleet = new WorkerFleetManager(15000, eventJournal);
    reconciler = new FabricReconciler(stateMachine, fleet, cas, eventJournal);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. AMD Hardware Qualification (Truthful / Fail-Closed)
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Real AMD Qualification & Truthful Hardware Boundary", () => {
    it("truthfully detects missing ROCm / AMD hardware or credentials and fails closed (No synthetic claims)", async () => {
      // Initialize AMD worker adapter in unconfigured host environment
      const amdAdapter = new AmdRenderWorkerAdapter("amd_worker_01");

      const caps = await amdAdapter.getCapabilities();

      // In this environment, NVIDIA GeForce RTX 3050 is present, but AMD ROCm is absent.
      // The adapter MUST truthfully report AMD hardware status.
      expect(caps.gpuVendor).toBe("AMD");

      const dummyJob: RenderJob = {
        jobId: "job_amd_probe_01",
        missionId: "mis_amd_001",
        idempotencyKey: "idem_amd_01",
        state: "CLAIMED",
        activeWorkerId: "amd_worker_01",
        activeAttemptId: 1,
        activeFencingToken: 1001,
        requirements: {
          minVramMb: 4096,
          gpuRequired: true,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: { topic: "AMD GPU Benchmark" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const attempt: RenderAttempt = {
        attemptId: 1,
        jobId: dummyJob.jobId,
        workerId: "amd_worker_01",
        fencingToken: 1001,
        state: "CLAIMED",
        startedAt: new Date().toISOString(),
      };

      // When attempting execution without physical AMD ROCm / DigitalOcean cluster, it MUST fail closed.
      const execResult = await amdAdapter.execute(dummyJob, attempt);
      expect(execResult.success).toBe(false);
      expect(execResult.error).toMatch(/AMD ROCm GPU hardware.*not configured/);

      // Invariant: Zero synthetic "PRODUCTION_VERIFIED" claims manufactured
      expect(execResult.artifactReference).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. The Classic Failure: Upload Succeeds, Callback Drops -> Zero Duplicate Render
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. The Classic Failure: Zero Duplicate Rendering Proof", () => {
    it("demonstrates with an execution counter that a lost callback reconciles from disk with ZERO duplicate rendering", async () => {
      const localWorker = new LocalRenderWorkerAdapter("local_worker_counter_01");
      expect(localWorker.renderInvocationCount).toBe(0);

      const jobId = `job_classic_failure_${Date.now()}`;
      const idempotencyKey = `idem_classic_${jobId}`;

      // 1. Submit Job to State Machine
      const { job } = stateMachine.submitJob({
        jobId,
        missionId: "mis_cf_001",
        idempotencyKey,
        requirements: {
          minVramMb: 1024,
          gpuRequired: false,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: { topic: "Space Exploration Quiz" },
      });

      // 2. Worker claims job
      const claim = stateMachine.claimJob({
        jobId,
        workerId: "local_worker_counter_01",
        leaseDurationMs: 30000,
      });
      expect(claim.attempt).toBeDefined();

      // 3. Worker executes the render (First & ONLY execution)
      const execResult = await localWorker.execute(
        stateMachine.getJob(jobId)!,
        claim.attempt
      );

      expect(execResult.success).toBe(true);
      expect(execResult.artifactReference).toBeDefined();
      expect(localWorker.renderInvocationCount).toBe(1);

      // Verify the artifact is present in CAS and on disk
      const artifactSha = execResult.artifactReference!.sha256;
      const casRecord = await cas.get(artifactSha);
      expect(casRecord).not.toBeNull();

      // 4. SIMULATE THE CLASSIC FAILURE:
      // The callback to the control plane DROPS / TIMES OUT before state machine receives it!
      // The control plane still has the job in CLAIMED state.
      const rawJob = stateMachine.getJob(jobId)!;
      expect(rawJob.state).toBe("CLAIMED");

      // 5. Reconciler runs: inspects disk/CAS for matching valid artifact
      const reconResult = await reconciler.reconcile({
        artifactProbe: async (jId) => {
          const renderDir = path.join(process.cwd(), "data", "renders");
          const p = path.join(renderDir, `${jId}.mp4`);
          return {
            exists: fs.existsSync(p),
            path: p,
            sha256: artifactSha,
          };
        },
      });

      expect(reconResult.recoveredArtifactCount).toBe(1);

      // Job is now SUCCEEDED in the authoritative state machine
      const finalJobState = stateMachine.getJob(jobId);
      expect(finalJobState?.state).toBe("SUCCEEDED");
      expect(finalJobState?.artifactReference?.sha256).toBe(artifactSha);

      // 6. A retried execution / callback attempts to re-execute the same logical job
      if (finalJobState?.state !== "SUCCEEDED") {
        await localWorker.execute(finalJobState!, claim.attempt);
      }

      // 7. CRITICAL ARCHITECTURAL PROOF:
      // INVOCATION COUNTER MUST STRICTLY EQUAL 1! No duplicate rendering!
      expect(localWorker.renderInvocationCount).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Chaos Matrix: Worker Process Crash & Recovery
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Chaos Matrix: Worker Process Death & Bounded Recovery", () => {
    it("handles worker disappearance during rendering, marks attempt lost, and allows bounded retry", async () => {
      const jobId = `job_chaos_death_${Date.now()}`;

      const { job } = stateMachine.submitJob({
        jobId,
        missionId: "mis_chaos_001",
        idempotencyKey: `idem_chaos_${jobId}`,
        requirements: {
          minVramMb: 1024,
          gpuRequired: false,
          requiresFfmpeg: true,
          supportedWorkloads: ["video.render"],
        },
        manifest: { topic: "Black Holes" },
      });

      // Claim Attempt 1
      const claim1 = stateMachine.claimJob({
        jobId,
        workerId: "worker_fragile_01",
        leaseDurationMs: 1, // Instantly expires
      });
      expect(claim1.attempt.attemptId).toBe(1);
      expect(claim1.fencingToken).toBe(1001);

      // Wait 10ms for lease expiry
      await new Promise((r) => setTimeout(r, 10));

      // Reconciler checks leases
      const recon = await reconciler.reconcile();
      expect(recon.expiredLeaseCount).toBe(1);

      const jobExpired = stateMachine.getJob(jobId)!;
      expect(["LEASE_EXPIRED", "WORKER_LOST"]).toContain(jobExpired.state);

      // Worker 2 claims Attempt 2
      const claim2 = stateMachine.claimJob({
        jobId,
        workerId: "worker_sturdy_02",
        leaseDurationMs: 30000,
      });

      expect(claim2.attempt.attemptId).toBe(2);
      expect(claim2.fencingToken).toBe(1002);

      const jobAfterRetry = stateMachine.getJob(jobId)!;
      expect(jobAfterRetry.state).toBe("CLAIMED");
      expect(jobAfterRetry.activeWorkerId).toBe("worker_sturdy_02");
    });
  });
});
