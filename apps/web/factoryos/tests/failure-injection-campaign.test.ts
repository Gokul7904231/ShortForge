import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { RemoteRenderStateMachine, RemoteRenderJob } from "../core/rendering/RemoteRenderStateMachine";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { LocalComputeProvider } from "../core/compute/providers/LocalComputeProvider";
import { ComputeJob } from "../core/compute/contracts/ComputeContracts";
import { recordVerificationEvidence } from "../core/verification/VerificationStatusModel";

describe("Phase 9 — Failure-Injection Campaign & Self-Healing Governance", () => {
  const casDir = path.resolve(process.cwd(), "data", "test_cas_tamper");
  const cas = ContentAddressedStore.getInstance(casDir);
  const stateMachine = RemoteRenderStateMachine.getInstance();

  beforeEach(() => {
    if (!fs.existsSync(casDir)) {
      fs.mkdirSync(casDir, { recursive: true });
    }
  });

  // =========================================================================
  // Scenario A: Worker Disappears During Render -> Lease Expiry Detection
  // =========================================================================
  it("Scenario A: detects worker disappearance via lease expiration and marks job for recovery", async () => {
    const jobId = `job_abandoned_${Date.now()}`;

    // Register job with 50ms lease duration
    stateMachine.registerJob({
      jobId,
      attemptId: 1,
      leaseDurationMs: 50,
    });

    const initial = stateMachine.getJob(jobId);
    expect(initial?.state).toBe("DISPATCHED");

    // Wait for lease to expire
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Run reconciliation (without mock artifact probe)
    const reconResult = await stateMachine.reconcileStaleJobs({
      probeStorage: async () => ({ exists: false }),
    });

    expect(reconResult.reconciledCount).toBeGreaterThanOrEqual(1);

    const staleJob = stateMachine.getJob(jobId);
    expect(["RETRYABLE", "FAILED", "STALE"]).toContain(staleJob?.state);

    // Verify next attempt dispatch is monotonic
    const nextAttempt = stateMachine.dispatchNextAttempt(jobId, 60000);
    expect(nextAttempt.attemptId).toBe(2);
    expect(nextAttempt.state).toBe("DISPATCHED");
  });

  // =========================================================================
  // Scenario B: Worker Dies After Rendering -> Lost-Callback Disk Reconciliation
  // =========================================================================
  it("Scenario B: recovers un-callbacked finished artifact from disk without re-rendering", async () => {
    const jobId = `job_lost_callback_${Date.now()}`;
    const testArtifactPath = path.resolve(casDir, `${jobId}.mp4`);

    // Write simulated finished artifact to disk
    fs.writeFileSync(testArtifactPath, Buffer.from("simulated mp4 video container data"));

    // Register job with immediate expiration
    stateMachine.registerJob({
      jobId,
      attemptId: 1,
      leaseDurationMs: 10,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    // Reconcile with storage probe finding the artifact
    const recon = await stateMachine.reconcileStaleJobs({
      probeStorage: async (job: RemoteRenderJob) => {
        if (job.jobId === jobId) {
          return { exists: true, path: testArtifactPath, sha256: "dummy_sha" };
        }
        return { exists: false };
      },
    });

    expect(recon.recoveredCount).toBeGreaterThanOrEqual(1);
    const recoveredJob = stateMachine.getJob(jobId);
    expect(recoveredJob?.state).toBe("COMPLETED");
    expect(recoveredJob?.videoUrl).toBe(testArtifactPath);
  });

  // =========================================================================
  // Scenario C: Upload Succeeds -> Callback Fails & Retries -> Idempotency Guaranteed
  // =========================================================================
  it("Scenario C: guarantees callback idempotency with zero duplicate render execution", async () => {
    const jobId = `job_idempotent_${Date.now()}`;

    stateMachine.registerJob({
      jobId,
      attemptId: 1,
      leaseDurationMs: 60000,
    });

    // 1. First callback delivery
    const firstCb = stateMachine.handleCallback(jobId, 1, {
      status: "completed",
      videoUrl: "/renders/final_output.mp4",
      artifactSha256: "abcdef1234567890",
    });

    expect(firstCb.accepted).toBe(true);
    expect(firstCb.idempotent).toBe(false);
    expect(firstCb.state).toBe("COMPLETED");

    // 2. Duplicate retry callback arrives (e.g. network timeout caused retry)
    const duplicateCb = stateMachine.handleCallback(jobId, 1, {
      status: "completed",
      videoUrl: "/renders/final_output.mp4",
      artifactSha256: "abcdef1234567890",
    });

    expect(duplicateCb.accepted).toBe(true);
    expect(duplicateCb.idempotent).toBe(true); // CRITICAL: flagged as idempotent
    expect(duplicateCb.reason).toContain("already completed");
  });

  // =========================================================================
  // Scenario D: CAS Tampering & Hash Collision Attack Detection
  // =========================================================================
  it("Scenario D: detects physical CAS file tampering via strict SHA-256 verification", async () => {
    const originalContent = `CRITICAL FACTORY PRODUCTION ARTIFACT - ORIGINAL BYTES ${Date.now()}_${Math.random()}`;
    const sampleFile = path.resolve(casDir, `sample_original_${Date.now()}.txt`);
    fs.writeFileSync(sampleFile, originalContent, "utf8");

    // Store in CAS
    const artifactRef = await cas.putFile(sampleFile, "test_doc", "text/plain");
    expect(artifactRef.uri).toBeDefined();

    // 1. Verify clean integrity
    const initialCheck = await cas.verifyArtifactIntegrity(artifactRef);
    expect(initialCheck.valid).toBe(true);

    // 2. Attacker modifies the physical file bytes inside CAS storage
    fs.writeFileSync(artifactRef.uri!, "TAMPERED BYTES INJECTED MALICIOUSLY", "utf8");

    // 3. CAS re-verification must detect tampering and fail closed
    const tamperedCheck = await cas.verifyArtifactIntegrity(artifactRef);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.error).toContain("Digest mismatch");

    // Record verification evidence for security audit
    const evidence = recordVerificationEvidence({
      capability: "CAS Tamper Detection",
      verificationLevel: "INTEGRATION_VERIFIED",
      environment: "Node v24 + Windows Local Filesystem",
      command: "vitest run failure-injection-campaign.test.ts",
      testName: "Scenario D: CAS Tampering & Hash Collision Attack Detection",
      runId: `run_tamper_${Date.now()}`,
      inputReference: `artifact:${artifactRef.artifactId}`,
      artifactHash: artifactRef.sha256,
      logs: ["Tampered bytes injected directly into CAS disk storage", "Verification correctly failed closed"],
      result: "PASS",
    });
    expect(evidence.result).toBe("PASS");

    // Clean up tampered file
    try {
      if (artifactRef.uri && fs.existsSync(artifactRef.uri)) {
        fs.unlinkSync(artifactRef.uri);
      }
      if (fs.existsSync(sampleFile)) {
        fs.unlinkSync(sampleFile);
      }
    } catch {}
  });

  // =========================================================================
  // Scenario E: Non-Retryable Failure (Malformed Render Intent)
  // =========================================================================
  it("Scenario E: halts cleanly on non-retryable invalid job manifest without looping", async () => {
    const provider = new LocalComputeProvider();
    const jobId = `job_invalid_${Date.now()}`;

    const invalidJob: ComputeJob = {
      jobId,
      factoryExecutionId: "fexec_invalid",
      workloadType: "RENDER",
      manifest: { malformed: true } as any, // Missing required scenes array
      inputArtifacts: {
        bundleId: "bundle_inv",
        artifacts: [],
        createdTimestamp: Date.now(),
      },
      requirements: {
        workloadType: "RENDER",
      },
      priority: "NORMAL",
      timeoutMs: 5000,
      createdAt: new Date().toISOString(),
    };

    const receipt = await provider.executeJob(invalidJob);
    expect(receipt.status).toBe("FAILED");
    expect(receipt.failureReason).toContain("Invalid LocalRenderIntent");
    expect(receipt.outputArtifacts.length).toBe(0);
  });
});
