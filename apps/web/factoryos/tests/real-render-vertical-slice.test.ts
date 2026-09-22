import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { ComputeRouter } from "../core/compute/router/ComputeRouter";
import { LocalComputeProvider } from "../core/compute/providers/LocalComputeProvider";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { RemoteRenderStateMachine } from "../core/rendering/RemoteRenderStateMachine";
import { VerificationEngine } from "../core/verification/VerificationEngine";
import { recordVerificationEvidence } from "../core/verification/VerificationStatusModel";
import { ComputeJob } from "../core/compute/contracts/ComputeContracts";
import { LocalRenderIntent } from "../core/render/LocalRenderAdapter";

describe("Phase 8 — Real Render Vertical Slice Proof", () => {
  const casDir = path.resolve(process.cwd(), "data", "test_cas_storage");
  const cas = ContentAddressedStore.getInstance(casDir);
  const router = new ComputeRouter();
  const localProvider = new LocalComputeProvider();
  router.registerProvider(localProvider);
  const stateMachine = RemoteRenderStateMachine.getInstance();

  it("proves end-to-end vertical slice: Mission -> Job -> Router -> Real Worker -> Real FFmpeg -> Real MP4 -> ffprobe -> SHA-256 CAS -> Callback", async () => {
    const runId = `slice_${Date.now()}`;
    const jobId = `job_${runId}`;
    const outputMp4Path = path.resolve(process.cwd(), "testing", "artifacts", `${jobId}.mp4`);

    // Ensure output directory exists
    const outDir = path.dirname(outputMp4Path);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. Construct physical render intent
    const renderIntent: LocalRenderIntent = {
      project_id: `proj_${runId}`,
      title: "Vertical Slice Proof Short",
      output_path: outputMp4Path,
      output: {
        width: 1080,
        height: 1920,
        fps: 30,
      },
      safe_area: {
        top: 160,
        bottom: 320,
        left: 60,
        right: 120,
      },
      scenes: [
        {
          scene_id: "scene_01",
          template_id: "facts.rapid-facts.v1",
          narration_text: "FactoryOS deterministic execution verified.",
          duration_seconds: 2.0,
          shots: [
            {
              id: "shot_01",
              recipe_id: "KINETIC_HOOK",
              start_seconds: 0.0,
              duration_seconds: 2.0,
              props: {
                headline: "REAL VERTICAL SLICE",
                background_type: "DEEP_INDIGO",
              },
            },
          ],
        },
      ],
    };

    // 2. Register job with state machine (lease duration 60s)
    stateMachine.registerJob({
      jobId,
      attemptId: 1,
      leaseDurationMs: 60000,
    });

    // 3. Assemble ComputeJob
    const computeJob: ComputeJob = {
      jobId,
      factoryExecutionId: `fexec_${runId}`,
      missionId: "mis_vertical_slice",
      workloadType: "RENDER",
      manifest: renderIntent,
      inputArtifacts: {
        bundleId: `bundle_${runId}`,
        artifacts: [],
        createdTimestamp: Date.now(),
      },
      requirements: {
        workloadType: "RENDER",
        estimatedDurationSeconds: 2.5,
        gpuRequired: false,
      },
      priority: "HIGH",
      timeoutMs: 30000,
      createdAt: new Date().toISOString(),
    };

    // 4. Plan and route via ComputeRouter (verifying capability and utility)
    const routingDecision = await router.planProvider(computeJob);
    expect(routingDecision.selectedProvider.id).toBe("provider_local_render");
    expect(routingDecision.selectedCandidate.utilityScore).toBeDefined();

    // 5. Execute Job through Router dispatch
    const dispatchResult = await router.dispatchWithFailover(computeJob);
    const receipt = dispatchResult.receipt;

    expect(receipt.status).toBe("COMPLETED");
    expect(receipt.exitCode).toBe(0);
    expect(receipt.outputArtifacts.length).toBeGreaterThanOrEqual(1);

    const artifactRef = receipt.outputArtifacts[0];
    expect(artifactRef.sha256).toBeDefined();
    expect(artifactRef.sha256.length).toBe(64);
    expect(artifactRef.byteLength).toBeGreaterThan(1000);
    expect(fs.existsSync(artifactRef.uri!)).toBe(true);

    // 6. Verify physical MP4 with ffprobe via VerificationEngine
    const mediaAudit = await VerificationEngine.auditMediaArtifact({
      videoUrl: artifactRef.uri!,
      jobId,
    });

    expect(mediaAudit.verified).toBe(true);
    expect(mediaAudit.hardGates.artifactExists).toBe(true);
    expect(mediaAudit.hardGates.validContainer).toBe(true);
    expect(mediaAudit.hardGates.videoStreamPresent).toBe(true);
    expect(mediaAudit.hardGates.exact9x16Geometry).toBe(true);
    expect(mediaAudit.measurements.width).toBe(1080);
    expect(mediaAudit.measurements.height).toBe(1920);
    expect(mediaAudit.measurements.videoCodec.toLowerCase()).toContain("h264");

    // 7. Verify Content-Addressed Storage (CAS) Indexing and Retrieval
    const casHas = await cas.has(artifactRef.sha256);
    expect(casHas).toBe(true);

    const casIntegrity = await cas.verifyArtifactIntegrity(artifactRef);
    expect(casIntegrity.valid).toBe(true);
    expect(casIntegrity.actualSha256).toBe(artifactRef.sha256);

    // 8. Process Completion Callback to State Machine
    const callbackRes = stateMachine.handleCallback(jobId, 1, {
      status: "completed",
      videoUrl: artifactRef.uri,
      artifactSha256: artifactRef.sha256,
    });

    expect(callbackRes.accepted).toBe(true);
    expect(callbackRes.state).toBe("COMPLETED");

    const finalJobState = stateMachine.getJob(jobId);
    expect(finalJobState?.state).toBe("COMPLETED");
    expect(finalJobState?.videoUrl).toBe(artifactRef.uri);

    // 9. Record Machine-Readable Verification Evidence
    const evidence = recordVerificationEvidence({
      capability: "Real Render Vertical Slice",
      verificationLevel: "E2E_VERIFIED",
      command: "vitest run real-render-vertical-slice.test.ts",
      testName: "Phase 8 — Real Render Vertical Slice Proof",
      runId,
      inputReference: `job:${jobId}`,
      outputReference: artifactRef.uri,
      artifactHash: artifactRef.sha256,
      logs: [
        `Rendered 1080x1920 MP4 via factoryos-render and FFmpeg`,
        `Stored in CAS at ${artifactRef.uri}`,
        `Verified container, streams, and SHA-256`,
      ],
      metrics: {
        durationMs: receipt.metrics.totalTimeMs,
        renderTimeMs: receipt.metrics.executionTimeMs,
        byteLength: artifactRef.byteLength,
        width: 1080,
        height: 1920,
      },
      result: "PASS",
    });

    expect(evidence.verificationLevel).toBe("E2E_VERIFIED");
  }, 45000);
});
