import { NextRequest, NextResponse } from "next/server";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import { ComputeGateway } from "@/factoryos/core/compute/gateway/ComputeGateway";
import { ContentAddressedStore } from "@/factoryos/core/cas/ContentAddressedStore";
import { RenderArtifactVerifier } from "@/factoryos/core/fabric/verification/RenderArtifactVerifier";
import { VerificationEngine } from "@/factoryos/core/verification/VerificationEngine";
import type { ComputeJob, ExecutionReceipt } from "@/factoryos/core/compute/contracts/ComputeContracts";
import {
  isAllowedInstaBoxWorkerNode,
  type InstaBoxWorkerNodeId,
} from "@/factoryos/core/compute/instabox/InstaBoxContracts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gateway = ComputeGateway.getInstance();
    const pool = gateway.getPool();
    const snapshot = await pool.snapshot();
    const registry = InstaBoxFleetRegistry.getInstance();

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
    const token = authHeader.replace(/^Bearer\s+/i, "") || customHeader;

    const isInternalValid =
      process.env.INTERNAL_API_SECRET_KEY &&
      token === process.env.INTERNAL_API_SECRET_KEY;
    const isWorkerSecretValid = registry.authenticateWorker(token);

    if (!token || (!isInternalValid && !isWorkerSecretValid)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid control plane dispatch secret." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetNodeId = body.targetNodeId as InstaBoxWorkerNodeId | undefined;

    if (targetNodeId && !isAllowedInstaBoxWorkerNode(targetNodeId)) {
      return NextResponse.json(
        { success: false, error: `Invalid or excluded target node: ${targetNodeId}` },
        { status: 400 },
      );
    }

    const durationSeconds = Math.max(1, Math.min(30, Number(body.duration || 2)));
    const jobId = body.jobId || `instabox-job-${targetNodeId || "fleet"}-${Date.now().toString(36)}`;
    const topic = body.topic || "ShortForge FactoryOS Distributed Render";

    const localRenderIntent = body.localRenderIntent || {
      output: {
        width: 1080,
        height: 1920,
        fps: 30,
        duration_seconds: durationSeconds,
        video_codec: "h264",
        audio_codec: "aac",
      },
      scenes: [
        {
          id: "scene_001",
          duration_seconds: durationSeconds,
          recipe_id: "KINETIC_HEADLINE",
          headline: topic,
          subtext: `FactoryOS InstaBox Node: ${targetNodeId || "Distributed Fleet"}`,
          safe_area: { top: 120, bottom: 160 },
        },
      ],
      audio: {
        tracks: [
          {
            type: "TONE",
            frequency: 440,
            duration_seconds: durationSeconds,
            volume: 0.5,
          },
        ],
      },
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
      timeoutMs: 300_000,
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
    const localPhysicalPath = cas.resolvePath(artifactRef.uri);

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

    // Compute independent SHA-256
    const fileBytes = fs.readFileSync(localPhysicalPath);
    const computedSha256 = crypto.createHash("sha256").update(fileBytes).digest("hex");
    const sha256Match = computedSha256 === artifactRef.sha256;

    // Run RenderArtifactVerifier
    const verifier = new RenderArtifactVerifier();
    const verifierResult = await verifier.verify({
      artifact: artifactRef,
      approvedRoots: [cas.getStorageRoot(), process.cwd()],
      expected: {
        width: 1080,
        height: 1920,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        requireAudio: true,
      },
    });

    // Run F07 VerificationEngine Media Audit
    const f07Audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      videoUrl: artifactRef.uri,
      scriptText: topic,
      sceneCount: 1,
    });

    return NextResponse.json({
      success: true,
      jobId,
      receipt,
      artifact: {
        ...artifactRef,
        localPhysicalPath,
        computedSha256,
        sha256Match,
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
