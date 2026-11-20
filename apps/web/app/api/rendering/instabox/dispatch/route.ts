import { NextRequest, NextResponse } from "next/server";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import { ComputeGateway } from "@/factoryos/core/compute/gateway/ComputeGateway";
import { ContentAddressedStore } from "@/factoryos/core/compute/cas/ContentAddressedStore";
import { RenderArtifactVerifier } from "@/factoryos/core/fabric/verification/RenderArtifactVerifier";
import { VerificationEngine } from "@/factoryos/core/verification/VerificationEngine";
import type { ComputeJob, ExecutionReceipt } from "@/factoryos/core/compute/contracts/ComputeContracts";
import {
  isAllowedInstaBoxWorkerNode,
  type InstaBoxWorkerNodeId,
} from "@/factoryos/core/compute/instabox/InstaBoxContracts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const registry = InstaBoxFleetRegistry.getInstance();

    const authHeader = request.headers.get("authorization") || "";
    const customHeader = request.headers.get("x-instabox-secret") || "";
    const token = (authHeader.replace(/^Bearer\s+/i, "") || customHeader).trim();

    // Strict control plane admin authentication to protect sensitive fleet metadata
    if (!token || !registry.authenticateControlPlaneAdmin(token)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Control plane admin secret required to inspect fleet metadata.",
        },
        { status: 401 },
      );
    }

    const gateway = ComputeGateway.getInstance();
    const pool = gateway.getPool();
    const snapshot = await pool.snapshot();

    const instaboxNodes = registry.getAllNodeIds().map((nodeId) => {
      const record = registry.getNodeRecord(nodeId);
      const health = registry.getNodeHealth(nodeId);
      const poolEntry = snapshot.find((s) => s.workerId === `instabox-${nodeId}`);

      return {
        nodeId,
        workerId: `instabox-${nodeId}`,
        health,
        isDraining: record?.isDraining ?? false,
        eligibleInPool: poolEntry?.eligible ?? false,
        metrics: record?.metrics,
        lastHeartbeatAt: record?.lastHeartbeatAt,
        executions: {
          total: record?.totalAttempts ?? 0,
          successful: record?.successfulExecutions ?? 0,
          failed: record?.failedExecutions ?? 0,
        },
      };
    });

    return NextResponse.json({
      status: "active",
      timestamp: new Date().toISOString(),
      nodes: instaboxNodes,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve fleet status" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const registry = InstaBoxFleetRegistry.getInstance();

    const authHeader = request.headers.get("authorization") || "";
    const customHeader = request.headers.get("x-instabox-secret") || "";
    const token = (authHeader.replace(/^Bearer\s+/i, "") || customHeader).trim();

    const body = await request.json().catch(() => ({}));
    const targetNodeId = body.targetNodeId as InstaBoxWorkerNodeId | undefined;

    // Strict control plane admin authentication
    const isAdminValid = registry.authenticateControlPlaneAdmin(token);
    if (!token || !isAdminValid) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid control plane admin dispatch secret." },
        { status: 401 },
      );
    }

    if (targetNodeId && !isAllowedInstaBoxWorkerNode(targetNodeId)) {
      return NextResponse.json(
        { success: false, error: `Invalid or excluded target node: ${targetNodeId}` },
        { status: 400 },
      );
    }

    if (body.action === "drain" || body.action === "undrain") {
      if (!targetNodeId) {
        return NextResponse.json(
          { success: false, error: "targetNodeId required for drain/undrain action." },
          { status: 400 },
        );
      }
      const draining = body.action === "drain";
      registry.setNodeDraining(targetNodeId, draining);
      return NextResponse.json({
        success: true,
        action: body.action,
        nodeId: targetNodeId,
        isDraining: draining,
        health: registry.getNodeHealth(targetNodeId),
      });
    }

    const durationSeconds = Math.max(1, Math.min(30, Number(body.duration || 2)));
    const jobId = body.jobId || `instabox-job-${targetNodeId || "fleet"}-${Date.now().toString(36)}`;
    const topic = body.topic || "ShortForge FactoryOS Distributed Render";

    const nodeIndex = targetNodeId ? parseInt(targetNodeId.replace(/\D/g, "") || "1", 10) : 1;
    const audioFreq = 220 + ((nodeIndex * 55) % 880);

    const localRenderIntent = body.localRenderIntent || {
      project_id: `proj_${jobId}`,
      title: topic,
      output: {
        width: 1080,
        height: 1920,
        fps: 30,
        duration_seconds: durationSeconds,
        video_codec: "libx264",
        audio_codec: "aac",
      },
      safe_area: { top: 160, bottom: 320, left: 60, right: 120 },
      scenes: [
        {
          scene_id: "scene_01",
          template_id: "facts.rapid-facts.v1",
          narration_text: topic,
          duration_seconds: durationSeconds,
          shots: [
            {
              id: "shot_01",
              recipe_id: "KINETIC_HOOK",
              start_seconds: 0.0,
              duration_seconds: durationSeconds,
              props: {
                headline: topic,
                subtext: `Verified on ${targetNodeId || "InstaBox Fleet"}`,
                background_type: nodeIndex % 2 === 0 ? "DEEP_INDIGO" : "AMBER_HISTORY",
              },
            },
          ],
          audio_tracks: [
            {
              track_id: `audio_tone_${nodeIndex}`,
              frequency: audioFreq,
              duration_seconds: durationSeconds,
              volume: 0.8,
              is_narration: true,
            },
          ],
        },
      ],
    };

    const computeJob: ComputeJob = {
      jobId,
      factoryExecutionId: `fx_${jobId}`,
      missionId: body.missionId || `mission_${jobId}`,
      workloadType: "RENDER",
      manifest: {
        topic,
        duration: durationSeconds,
        fps: 30,
        localRenderIntent,
        targetNodeId,
      },
      inputArtifacts: {
        bundleId: `bundle_${jobId}`,
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
      timeoutMs: 300_000,
      createdAt: new Date().toISOString(),
    };

    const gateway = ComputeGateway.getInstance();
    const progressLog: string[] = [];

    const dispatchResult = await gateway.submitJob(
      computeJob,
      (msg) => progressLog.push(`[${new Date().toISOString()}] ${msg}`),
      "INSTABOX",
    );

    const receipt = dispatchResult.receipt;
    if (receipt.status !== "COMPLETED") {
      return NextResponse.json(
        {
          success: false,
          receipt,
          failovers: dispatchResult.failovers,
          progressLog,
          error: receipt.failureReason || "Render execution failed.",
        },
        { status: 502 },
      );
    }

    const artifactRef = receipt.outputArtifacts[0];
    if (!artifactRef || !artifactRef.uri) {
      return NextResponse.json(
        {
          success: false,
          receipt,
          progressLog,
          error: "Receipt COMPLETED but no physical outputArtifact was returned.",
        },
        { status: 500 },
      );
    }

    // Resolve local physical CAS file path
    const cas = ContentAddressedStore.getInstance();
    const localPhysicalPath = artifactRef.uri;

    if (!fs.existsSync(localPhysicalPath)) {
      return NextResponse.json(
        {
          success: false,
          receipt,
          artifactRef,
          localPhysicalPath,
          error: `Physical CAS file missing on disk: ${localPhysicalPath}`,
        },
        { status: 500 },
      );
    }

    // Compute independent SHA-256 via streaming to avoid loading large files into RAM
    const computedSha256 = await new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(localPhysicalPath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
    const sha256Match = computedSha256 === artifactRef.sha256;
    if (!sha256Match) {
      return NextResponse.json(
        {
          success: false,
          receipt,
          error: `Physical CAS SHA-256 digest mismatch: expected ${artifactRef.sha256}, got ${computedSha256}`,
          computedSha256,
          expectedSha256: artifactRef.sha256,
        },
        { status: 422 },
      );
    }

    // Run RenderArtifactVerifier (F06)
    const verifier = new RenderArtifactVerifier();
    const verifierResult = await verifier.verify({
      artifact: artifactRef,
      approvedRoots: [cas.getStorageDir(), process.cwd()],
      expected: {
        width: 1080,
        height: 1920,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        requireAudio: true,
      },
    });

    if (verifierResult.status !== "PASS") {
      return NextResponse.json(
        {
          success: false,
          receipt,
          verifierResult,
          error: `F06 physical container verification rejected: ${verifierResult.failureReason || "Container check failed"}`,
        },
        { status: 422 },
      );
    }

    // Run F07 VerificationEngine Media Audit
    const sceneCount = Array.isArray(localRenderIntent.scenes) ? localRenderIntent.scenes.length : 1;
    const f07Audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      videoUrl: artifactRef.uri,
      scriptText: topic,
      sceneCount,
    });

    if (!f07Audit.passed || f07Audit.overallStatus !== "PASSED") {
      return NextResponse.json(
        {
          success: false,
          receipt,
          f07Audit,
          error: `F07 media verification gate failed: ${f07Audit.failures?.join("; ") || "Hard gate check failed"}`,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      receipt,
      artifact: {
        ...artifactRef,
        localPhysicalPath,
        computedSha256,
        sha256Match: true,
      },
      verifierResult,
      f07Audit: {
        passed: f07Audit.passed,
        overallStatus: f07Audit.overallStatus,
        hardGates: f07Audit.hardGates,
        overallScore: f07Audit.overallScore,
      },
      failovers: dispatchResult.failovers,
      progressLog,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error during dispatch" },
      { status: 500 },
    );
  }
}
