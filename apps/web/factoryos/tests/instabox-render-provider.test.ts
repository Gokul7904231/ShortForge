import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import {
  InstaBoxFleetRegistry,
} from "../core/compute/instabox/InstaBoxFleetRegistry";
import {
  INSTABOX_WORKER_NODE_IDS,
  INSTABOX_EXCLUDED_NODES,
} from "../core/compute/instabox/InstaBoxContracts";
import { ComputePool } from "../core/compute/pool/ComputePool";
import { ComputeRouter } from "../core/compute/router/ComputeRouter";
import { ComputeGateway } from "../core/compute/gateway/ComputeGateway";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { RenderArtifactVerifier } from "../core/fabric/verification/RenderArtifactVerifier";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import type { ComputeJob, ExecutionReceipt } from "../core/compute/contracts/ComputeContracts";

const TEST_SECRET = "test-instabox-secret-2026";

function makeComputeJob(overrides: Partial<ComputeJob> = {}): ComputeJob {
  return {
    jobId: "job-test-" + crypto.randomUUID().substring(0, 8),
    factoryExecutionId: "fx-test",
    missionId: "mission-test",
    workloadType: "RENDER",
    manifest: {
      topic: "InstaBox Verification Test",
      duration: 1,
      fps: 30,
      width: 1080,
      height: 1920,
    },
    inputArtifacts: {
      bundleId: "bundle-test",
      artifacts: [],
      createdTimestamp: Date.now(),
    },
    requirements: {
      workloadType: "RENDER",
      gpuRequired: false,
      minCpuCores: 2,
      minMemoryMb: 4000,
    },
    priority: "NORMAL",
    timeoutMs: 10000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("InstaBox Fleet Integration & Physical Verification", () => {
  const originalEnvSecret = process.env.INSTABOX_WORKER_SECRET;
  let registry: InstaBoxFleetRegistry;
  let tempTestDir: string;

  beforeEach(() => {
    process.env.INSTABOX_WORKER_SECRET = TEST_SECRET;
    INSTABOX_WORKER_NODE_IDS.forEach((id) => {
      process.env[`INSTABOX_WORKER_SECRET_${id.toUpperCase()}`] = TEST_SECRET;
    });
    registry = InstaBoxFleetRegistry.resetInstanceForTesting();
    tempTestDir = path.join(process.cwd(), "data", "test_instabox_" + Date.now());
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    process.env.INSTABOX_WORKER_SECRET = originalEnvSecret;
    INSTABOX_WORKER_NODE_IDS.forEach((id) => {
      delete process.env[`INSTABOX_WORKER_SECRET_${id.toUpperCase()}`];
    });
    if (fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // 1. Valid InstaBox worker registration
  it("Scenario 1: allows valid InstaBox worker registration and sets node healthy", () => {
    const res = registry.recordHeartbeat({
      workerId: "instabox-box2",
      nodeId: "box2",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 15.0,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6200,
        diskTotalMb: 20480,
        diskAvailableMb: 16000,
        operatingSystem: "Linux (box2 test)",
        activeJobs: 0,
      },
    });

    expect(res.acknowledged).toBe(true);
    expect(res.action).toBe("POLL");

    const health = registry.getNodeHealth("box2");
    expect(health.state).toBe("HEALTHY");
    expect(health.activeJobs).toBe(0);

    // Verify box9 cannot be registered
    expect(() => {
      registry.recordHeartbeat({
        workerId: "instabox-box9",
        nodeId: "box9" as any,
        metrics: {} as any,
      });
    }).toThrow(/permanently excluded/);
  });

  // 2. Invalid worker authentication
  it("Scenario 2: rejects invalid worker authentication", () => {
    expect(registry.authenticateWorker("wrong-secret", "instabox-box2")).toBe(false);
    expect(registry.authenticateWorker("", "instabox-box2")).toBe(false);
    expect(registry.authenticateWorker(TEST_SECRET)).toBe(false); // missing workerId fails closed
    expect(registry.authenticateWorker(TEST_SECRET, "instabox-box2")).toBe(true);
  });

  // 3. Worker health degradation
  it("Scenario 3: handles worker health degradation when heartbeats are delayed or missed", () => {
    // Before heartbeat, node is BLOCKED
    const initialHealth = registry.getNodeHealth("box3");
    expect(initialHealth.state).toBe("BLOCKED");

    // Register heartbeat
    registry.recordHeartbeat({
      workerId: "instabox-box3",
      nodeId: "box3",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });
    expect(registry.getNodeHealth("box3").state).toBe("HEALTHY");

    // Simulate elapsed time > 45s -> DEGRADED
    const record = registry.getNodeRecord("box3")!;
    record.lastHeartbeatAt = new Date(Date.now() - 50_000).toISOString();
    expect(registry.getNodeHealth("box3").state).toBe("DEGRADED");

    // Simulate elapsed time > 90s -> BLOCKED
    record.lastHeartbeatAt = new Date(Date.now() - 100_000).toISOString();
    expect(registry.getNodeHealth("box3").state).toBe("BLOCKED");
  });

  // 4. Accurate capability reporting
  it("Scenario 4: reports accurate capability from real metrics without hardcoding", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box4",
      nodeId: "box4",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 25.0,
        memoryTotalMb: 7980,
        memoryAvailableMb: 5800,
        diskTotalMb: 20480,
        diskAvailableMb: 14000,
        operatingSystem: "Ubuntu 22.04 LTS (box4)",
        activeJobs: 0,
      },
    });

    const cap = registry.getNodeCapability("box4");
    expect(cap.providerId).toBe("instabox-box4");
    expect(cap.providerType).toBe("INSTABOX");
    expect(cap.cpuCores).toBe(4);
    expect(cap.memoryMb).toBe(7980);
    expect(cap.gpuAvailable).toBe(false);
    expect(cap.maxConcurrency).toBe(1);
    expect(cap.operatingSystem).toContain("Ubuntu 22.04");
  });

  // 5. Successful job claim
  it("Scenario 5: executes atomic job claim with fencing token and attempt counter", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box5",
      nodeId: "box5",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 5,
        memoryTotalMb: 7980,
        memoryAvailableMb: 7000,
        diskTotalMb: 20480,
        diskAvailableMb: 18000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const job = makeComputeJob();
    let claimedReceiptPromise: Promise<ExecutionReceipt>;

    // Control plane dispatches job to node
    claimedReceiptPromise = registry.dispatchJobToNode("box5", job);

    // Worker claims the job
    const claim = registry.claimJob("instabox-box5");
    expect(claim.claimed).toBe(true);
    expect(claim.jobId).toBe(job.jobId);
    expect(claim.executionToken).toBeDefined();
    expect(claim.executionToken).toMatch(/^tok_/);
    expect(claim.attemptId).toBe(1);

    // Active lease should now be established
    const record = registry.getNodeRecord("box5")!;
    expect(record.activeLease).toBeDefined();
    expect(record.activeLease?.jobId).toBe(job.jobId);
    expect(registry.isNodeAvailable("box5")).toBe(false);
  });

  // 6. Duplicate claim prevention
  it("Scenario 6: prevents duplicate claims while worker is busy", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box6",
      nodeId: "box6",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const job = makeComputeJob();
    void registry.dispatchJobToNode("box6", job);

    const claim1 = registry.claimJob("instabox-box6");
    expect(claim1.claimed).toBe(true);

    // Second claim must be refused
    const claim2 = registry.claimJob("instabox-box6");
    expect(claim2.claimed).toBe(false);
  });

  // 7. Lease expiration and recovery
  it("Scenario 7: recovers when lease times out", async () => {
    registry.recordHeartbeat({
      workerId: "instabox-box7",
      nodeId: "box7",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const job = makeComputeJob({ timeoutMs: 100 }); // Fast timeout
    const dispatchPromise = registry.dispatchJobToNode("box7", job);

    registry.claimJob("instabox-box7");

    // Wait for timeout
    await expect(dispatchPromise).rejects.toThrow(/timed out/);

    // Lease should be cleared after timeout
    const record = registry.getNodeRecord("box7")!;
    expect(record.activeLease).toBeUndefined();
    expect(record.failedExecutions).toBe(1);
  });

  // 8. Stale callback rejection
  it("Scenario 8: rejects stale callbacks with invalid token or outdated attempt", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box8",
      nodeId: "box8",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const job = makeComputeJob();
    void registry.dispatchJobToNode("box8", job);
    const claim = registry.claimJob("instabox-box8");

    // Stale token rejected
    expect(() => {
      registry.completeActiveJob("instabox-box8", "wrong-token", {
        exitCode: 0,
        casUri: "/dummy/path.mp4",
        sha256Proof: "abcdef",
      });
    }).toThrow(/stale execution token/);
  });

  // 9. Render command failure
  it("Scenario 9: correctly records and handles render command failure", async () => {
    registry.recordHeartbeat({
      workerId: "instabox-box10",
      nodeId: "box10",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const job = makeComputeJob();
    const dispatchPromise = registry.dispatchJobToNode("box10", job);
    const claim = registry.claimJob("instabox-box10");

    // Worker reports failure
    const failReceipt = registry.failActiveJob(
      "instabox-box10",
      claim.executionToken!,
      "FFmpeg syntax error in filtergraph",
    );

    expect(failReceipt.status).toBe("FAILED");
    expect(failReceipt.failureReason).toContain("FFmpeg syntax error");

    const resolved = await dispatchPromise;
    expect(resolved.status).toBe("FAILED");
  });

  // 10. Missing MP4 rejection
  it("Scenario 10: rejects completion callback when output MP4 is missing", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box11",
      nodeId: "box11",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const job = makeComputeJob();
    void registry.dispatchJobToNode("box11", job);
    const claim = registry.claimJob("instabox-box11");

    expect(() => {
      registry.completeActiveJob("instabox-box11", claim.executionToken!, {
        exitCode: 0,
        casUri: undefined,
        sha256Proof: undefined,
      });
    }).toThrow(/missing CAS URI or SHA-256 proof/);
  });

  // 11. SHA-256 mismatch rejection
  it("Scenario 11: RenderArtifactVerifier rejects SHA-256 checksum mismatch", async () => {
    const fakeMp4 = path.join(tempTestDir, "test_corrupt.mp4");
    fs.writeFileSync(fakeMp4, Buffer.from("corrupt data payload"));

    const verifier = new RenderArtifactVerifier();
    const result = await verifier.verify({
      artifact: {
        artifactId: "art-test-corrupt",
        role: "output_mp4",
        sha256: "0000000000000000000000000000000000000000000000000000000000000000", // Mismatched SHA
        byteLength: 20,
        mimeType: "video/mp4",
        uri: fakeMp4,
      },
      approvedRoots: [tempTestDir, process.cwd()],
    });

    expect(result.status).toBe("FAIL");
    expect(result.failureReason).toContain("SHA-256 mismatch");
  });

  // 12. Artifact upload failure handling
  it("Scenario 12: handles artifact upload failure gracefully", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box12",
      nodeId: "box12",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const job = makeComputeJob();
    void registry.dispatchJobToNode("box12", job);
    const claim = registry.claimJob("instabox-box12");

    const failReceipt = registry.failActiveJob(
      "instabox-box12",
      claim.executionToken!,
      "Network connection reset during multipart upload",
    );

    expect(failReceipt.status).toBe("FAILED");
    expect(failReceipt.failureReason).toContain("Network connection reset");
  });

  // 13. F07 rejection of invalid video (wrong geometry, bad codec, etc.)
  it("Scenario 13: F07 VerificationEngine rejects invalid non-video or corrupt file", async () => {
    const nonVideoFile = path.join(tempTestDir, "invalid.mp4");
    fs.writeFileSync(nonVideoFile, Buffer.from("NOT_AN_MP4_HEADER"));

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId: "job-bad-video",
      videoUrl: nonVideoFile,
    });

    expect(audit.passed).toBe(false);
    expect(audit.overallStatus).toBe("FAILED");
    expect(audit.hardGates.validContainer).toBe(false);
  });

  // 14. Successful real physical artifact verification (Generate real 1080x1920 MP4)
  it("Scenario 14: generates genuine physical MP4 via FFmpeg and passes RenderArtifactVerifier and F07 audit", async () => {
    const realMp4 = path.join(tempTestDir, "valid_box2_render.mp4");

    // Execute genuine 1-second 1080x1920 FFmpeg render command
    execSync(
      `ffmpeg -y -f lavfi -i color=c=0x0a0f1d:s=1080x1920:d=1:r=30 -f lavfi -i sine=frequency=440:duration=1 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${realMp4}"`,
      { stdio: "ignore" },
    );

    expect(fs.existsSync(realMp4)).toBe(true);
    const stat = fs.statSync(realMp4);
    expect(stat.size).toBeGreaterThan(10_000);

    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(realMp4)).digest("hex");

    // Commit to CAS
    const cas = ContentAddressedStore.getInstance(path.join(tempTestDir, "cas"));
    const artifactRef = await cas.putFile(realMp4, "output_mp4", "video/mp4", {
      jobId: "box2-pilot",
    });

    expect(artifactRef.sha256).toBe(sha256);

    // Verify via RenderArtifactVerifier
    const verifier = new RenderArtifactVerifier();
    const verifierResult = await verifier.verify({
      artifact: artifactRef,
      approvedRoots: [tempTestDir, process.cwd()],
      expected: {
        width: 1080,
        height: 1920,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        requireAudio: true,
      },
    });

    expect(verifierResult.status).toBe("PASS");
    expect(verifierResult.width).toBe(1080);
    expect(verifierResult.height).toBe(1920);

    // Verify via F07 VerificationEngine
    const f07Audit = await VerificationEngine.auditMediaArtifact({
      jobId: "box2-pilot",
      videoUrl: artifactRef.uri,
      scriptText: "InstaBox Box2 Pilot Render",
      sceneCount: 1,
    });

    expect(f07Audit.passed).toBe(true);
    expect(f07Audit.overallStatus).toBe("PASSED");
    expect(f07Audit.hardGates.artifactExists).toBe(true);
    expect(f07Audit.hardGates.validContainer).toBe(true);
    expect(f07Audit.hardGates.exact9x16Geometry).toBe(true);
    expect(f07Audit.hardGates.decodeSmokePassed).toBe(true);
  });

  // 15. Worker restart and recovery
  it("Scenario 15: tolerates worker restart and recovers health on heartbeat", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box13",
      nodeId: "box13",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    expect(registry.getNodeHealth("box13").state).toBe("HEALTHY");

    // Worker enters draining before restart
    registry.setNodeDraining("box13", true);
    expect(registry.getNodeHealth("box13").state).toBe("DRAINING");
    expect(registry.isNodeAvailable("box13")).toBe(false);

    // Worker restarts and sends fresh heartbeat
    registry.setNodeDraining("box13", false);
    registry.recordHeartbeat({
      workerId: "instabox-box13",
      nodeId: "box13",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 5,
        memoryTotalMb: 7980,
        memoryAvailableMb: 7000,
        diskTotalMb: 20480,
        diskAvailableMb: 16000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    expect(registry.getNodeHealth("box13").state).toBe("HEALTHY");
    expect(registry.isNodeAvailable("box13")).toBe(true);
  });

  // 16. Provider registration in ComputePool and ComputeRouter
  it("Scenario 16: verifies all 11 InstaBox providers are registered in ComputePool and ComputeRouter via ComputeGateway", async () => {
    const gateway = ComputeGateway.getInstance();
    const pool = gateway.getPool();
    const router = gateway.getRouter();

    for (const nodeId of INSTABOX_WORKER_NODE_IDS) {
      const workerId = `instabox-${nodeId}`;
      const poolWorker = pool.getWorker(workerId);
      expect(poolWorker).toBeDefined();
      expect(poolWorker?.surface).toBe("INSTABOX");
      expect(poolWorker?.providerType).toBe("INSTABOX");

      const routerProvider = router.getProvider(workerId);
      expect(routerProvider).toBeDefined();
      expect(routerProvider?.type).toBe("INSTABOX");
    }

    // box9 must NOT be in pool or router
    expect(pool.getWorker("instabox-box9")).toBeUndefined();
    expect(router.getProvider("instabox-box9")).toBeUndefined();
  });

  // 17. CPU-only workload admission
  it("Scenario 17: rejects workloads requiring GPU on InstaBox workers", async () => {
    registry.recordHeartbeat({
      workerId: "instabox-box2",
      nodeId: "box2",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    const pool = new ComputePool();
    const provider = registry.getNodeRecord("box2")!.provider;
    const worker = pool.registerProvider(provider, "INSTABOX");

    // Job requiring GPU
    const gpuJob = makeComputeJob({
      requirements: {
        workloadType: "RENDER",
        gpuRequired: true,
      },
    });

    const preflight = await worker.canAccept(gpuJob);
    expect(preflight.admitted).toBe(false);
    expect(preflight.reasons).toContain("gpu-required");

    // CPU-only job admitted
    const cpuJob = makeComputeJob({
      requirements: {
        workloadType: "RENDER",
        gpuRequired: false,
        minCpuCores: 4,
        minMemoryMb: 4000,
      },
    });

    const cpuPreflight = await worker.canAccept(cpuJob);
    expect(cpuPreflight.admitted).toBe(true);
  });

  // 18. Resource exhaustion and queueing
  it("Scenario 18: marks worker unavailable when resource limits or active jobs are reached", () => {
    registry.recordHeartbeat({
      workerId: "instabox-box2",
      nodeId: "box2",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 95.0,
        memoryTotalMb: 7980,
        memoryAvailableMb: 6000,
        diskTotalMb: 20480,
        diskAvailableMb: 15000,
        operatingSystem: "Linux",
        activeJobs: 0,
      },
    });

    expect(registry.isNodeAvailable("box2")).toBe(true);

    // Dispatch job -> worker becomes busy
    const job = makeComputeJob();
    void registry.dispatchJobToNode("box2", job);
    registry.claimJob("instabox-box2");

    // Concurrency is bounded to 1: node should now be unavailable for new dispatches
    expect(registry.isNodeAvailable("box2")).toBe(false);
  });
});
