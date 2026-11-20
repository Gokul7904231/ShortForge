import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { InstaBoxFleetRegistry } from "../core/compute/instabox/InstaBoxFleetRegistry";
import { ComputeGateway } from "../core/compute/gateway/ComputeGateway";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import type { ComputeJob } from "../core/compute/contracts/ComputeContracts";

describe("InstaBox Box2 Pilot Pipeline — Local Integration Simulation", () => {
  const originalSecret = process.env.INSTABOX_WORKER_SECRET_BOX2;
  let registry: InstaBoxFleetRegistry;
  let tempDir: string;

  beforeEach(() => {
    process.env.INSTABOX_WORKER_SECRET_BOX2 = "pilot-box2-secret-2026";
    registry = InstaBoxFleetRegistry.resetInstanceForTesting();
    ComputeGateway.resetInstanceForTesting();
    tempDir = path.join(process.cwd(), "data", "test_pilot_box2_" + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.INSTABOX_WORKER_SECRET_BOX2 = originalSecret;
    } else {
      delete process.env.INSTABOX_WORKER_SECRET_BOX2;
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("Executes end-to-end simulated pilot render using local FFmpeg generation and authoritative F07 audit", async () => {
    // 1. Box2 registers via live heartbeat
    const hb = registry.recordHeartbeat({
      workerId: "instabox-box2",
      nodeId: "box2",
      version: "1.0.0",
      status: "HEALTHY",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 18.2,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6420,
        diskTotalMb: 20480,
        diskAvailableMb: 16200,
        loadAverage1m: 0.35,
        operatingSystem: "Linux 6.8.0-box2-pilot",
        activeJobs: 0,
      },
    });
    expect(hb.acknowledged).toBe(true);

    const box2Health = registry.getNodeHealth("box2");
    expect(box2Health.state).toBe("HEALTHY");

    // 2. Visible in ComputePool snapshot
    const gateway = ComputeGateway.getInstance();
    const pool = gateway.getPool();
    const snapshot = await pool.snapshot();
    const box2Snapshot = snapshot.find((s) => s.workerId === "instabox-box2");

    expect(box2Snapshot).toBeDefined();
    expect(box2Snapshot?.eligible).toBe(true);
    expect(box2Snapshot?.health.state).toBe("HEALTHY");
    expect(box2Snapshot?.capability.cpuCores).toBe(4);
    expect(box2Snapshot?.capability.memoryMb).toBe(7980);
    expect(box2Snapshot?.capability.gpuAvailable).toBe(false);

    // 3. Dispatch a real compute job targeted for Box2
    const pilotJob: ComputeJob = {
      jobId: "pilot-job-box2-001",
      factoryExecutionId: "fx_pilot_box2_001",
      missionId: "mission_box2_pilot",
      workloadType: "RENDER",
      manifest: {
        topic: "InstaBox Box2 Physical Acceptance Pilot",
        duration: 1,
        fps: 30,
        localRenderIntent: {
          output: {
            width: 1080,
            height: 1920,
            fps: 30,
            duration_seconds: 1,
            video_codec: "h264",
            audio_codec: "aac",
          },
        },
      },
      inputArtifacts: {
        bundleId: "bundle_pilot_box2",
        artifacts: [],
        createdTimestamp: Date.now(),
      },
      requirements: {
        workloadType: "RENDER",
        gpuRequired: false,
        minCpuCores: 2,
        minMemoryMb: 4000,
      },
      priority: "HIGH",
      timeoutMs: 30000,
      createdAt: new Date().toISOString(),
    };

    const plan = await gateway.planJob(pilotJob, "INSTABOX").catch((err) => {
      console.error("[PLAN ERROR]", err);
      return null;
    });
    console.log("[PLAN RESULT]", plan ? { selected: plan.selectedProvider.id, rejections: plan.rejectionReasons } : "FAILED");

    const dispatchPromise = gateway.submitJob(pilotJob, (msg) => console.log("[DISPATCH PROGRESS]", msg), "INSTABOX")
      .catch((err) => {
        console.error("[DISPATCH ERROR]", err);
        throw err;
      });

    // 4. Worker Box2 polls for and claims the job
    let claim: any = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 10000) {
      claim = registry.claimJob("instabox-box2");
      if (claim.claimed) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(claim).toBeDefined();
    expect(claim.claimed).toBe(true);
    expect(claim.jobId).toBe("pilot-job-box2-001");
    expect(claim.executionToken).toBeDefined();

    // 5. Worker Box2 executes real FFmpeg render command
    const outputMp4 = path.join(tempDir, "box2_pilot_output.mp4");
    execSync(
      `ffmpeg -y -f lavfi -i color=c=0x0a0f1d:s=1080x1920:d=1:r=30 -f lavfi -i sine=frequency=440:duration=1 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${outputMp4}"`,
      { stdio: "ignore" },
    );

    expect(fs.existsSync(outputMp4)).toBe(true);
    const byteLength = fs.statSync(outputMp4).size;
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(outputMp4)).digest("hex");

    // 6. Stage in CAS
    const cas = ContentAddressedStore.getInstance(path.join(tempDir, "cas_store"));
    const artifactRef = await cas.putFile(outputMp4, "output_mp4", "video/mp4", {
      jobId: pilotJob.jobId,
      workerId: "instabox-box2",
    });

    expect(artifactRef.sha256).toBe(sha256);

    // 7. Worker Box2 submits completion callback
    registry.completeActiveJob("instabox-box2", claim.executionToken!, {
      exitCode: 0,
      sha256Proof: sha256,
      byteLength,
      casUri: artifactRef.uri,
      metrics: {
        startupTimeMs: 120,
        executionTimeMs: 850,
        transferTimeMs: 150,
        totalTimeMs: 1120,
      },
      stdoutSnippet: "Box2 pilot FFmpeg render succeeded",
    });

    // 8. Control plane resolves dispatch and verifies physical artifact
    const { receipt } = await dispatchPromise;

    expect(receipt.status).toBe("COMPLETED");
    expect(receipt.providerId).toBe("instabox-box2");
    expect(receipt.providerType).toBe("INSTABOX");
    expect(receipt.outputArtifacts.length).toBe(1);
    expect(receipt.outputArtifacts[0].sha256).toBe(sha256);
    expect(receipt.artifactVerification?.status).toBe("PASS");
    expect(receipt.artifactVerification?.width).toBe(1080);
    expect(receipt.artifactVerification?.height).toBe(1920);

    // 9. Independent F07 Media Audit
    const f07Report = await VerificationEngine.auditMediaArtifact({
      jobId: pilotJob.jobId,
      videoUrl: receipt.outputArtifacts[0].uri,
      scriptText: "InstaBox Box2 Physical Acceptance Pilot",
      sceneCount: 1,
    });

    expect(f07Report.passed).toBe(true);
    expect(f07Report.overallStatus).toBe("PASSED");
    expect(f07Report.hardGates.artifactExists).toBe(true);
    expect(f07Report.hardGates.validContainer).toBe(true);
    expect(f07Report.hardGates.exact9x16Geometry).toBe(true);
    expect(f07Report.hardGates.compliantCodecs).toBe(true);
    expect(f07Report.hardGates.decodeSmokePassed).toBe(true);

    // 10. Router Telemetry
    const router = gateway.getRouter();
    const tel = router.getProviderTelemetry("instabox-box2");
    expect(tel).toBeDefined();
    expect(tel?.successfulExecutions).toBeGreaterThanOrEqual(1);
    expect(tel?.failedExecutions).toBe(0);
  });
});
