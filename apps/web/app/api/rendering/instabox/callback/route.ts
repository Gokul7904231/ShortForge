import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import { RenderArtifactVerifier } from "@/factoryos/core/fabric/verification/RenderArtifactVerifier";
import { VerificationEngine } from "@/factoryos/core/verification/VerificationEngine";

export async function POST(request: NextRequest) {
  try {
    const registry = InstaBoxFleetRegistry.getInstance();

    const authHeader = request.headers.get("authorization") || "";
    const customHeader = request.headers.get("x-instabox-secret") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || customHeader;

    const body = await request.json().catch(() => ({}));
    const workerId = body.workerId || request.headers.get("x-instabox-worker-id");
    const executionToken = body.executionToken || request.headers.get("x-execution-token");

    // 1. Authenticate worker (supporting per-worker secret)
    if (!token || !registry.authenticateWorker(token, workerId)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid InstaBox worker credentials." },
        { status: 401 },
      );
    }
    const {
      jobId,
      status,
      attemptId,
      exitCode,
      sha256Proof,
      byteLength,
      casUri,
      metrics,
      stdoutSnippet,
      stderrSnippet,
      failureReason,
    } = body;

    if (
      !workerId ||
      !executionToken ||
      !jobId ||
      !status ||
      typeof attemptId !== "number" ||
      !Number.isInteger(attemptId) ||
      attemptId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid required fields: workerId, executionToken, jobId, status, and positive integer attemptId.",
        },
        { status: 400 },
      );
    }

    // 2. Validate active lease, execution token, and identity
    const record = registry.getNodeRecordByWorkerId(workerId);
    const lease = record?.activeLease;
    if (!lease || lease.executionToken !== executionToken) {
      return NextResponse.json(
        { success: false, error: "Stale, duplicate, or unauthorized execution token." },
        { status: 409 },
      );
    }

    if (lease.workerId !== workerId) {
      return NextResponse.json(
        {
          success: false,
          error: `Worker identity mismatch: lease assigned to ${lease.workerId}, received ${workerId}.`,
        },
        { status: 409 },
      );
    }

    if (lease.jobId !== jobId) {
      return NextResponse.json(
        {
          success: false,
          error: `Mismatched jobId: lease is for ${lease.jobId}, received ${jobId}.`,
        },
        { status: 400 },
      );
    }

    // Verify execution identity if provided
    const executionId = body.executionId || request.headers.get("x-execution-id");
    if (executionId && lease.executionId && executionId !== lease.executionId) {
      return NextResponse.json(
        {
          success: false,
          error: `Execution ID mismatch: lease is for ${lease.executionId}, received ${executionId}.`,
        },
        { status: 409 },
      );
    }

    // Check lease expiration
    if (lease.leaseExpiresAt) {
      const expiresAt = new Date(lease.leaseExpiresAt).getTime();
      if (Date.now() > expiresAt) {
        return NextResponse.json(
          {
            success: false,
            error: `Lease expired at ${lease.leaseExpiresAt}. Current time is ${new Date().toISOString()}.`,
          },
          { status: 409 },
        );
      }
    }

    // Require exact attempt ID equality (rejects stale, superseded, or mismatched attempts)
    if (attemptId !== lease.attemptId) {
      const relation = attemptId < lease.attemptId ? "stale" : "superseded/invalid";
      return NextResponse.json(
        {
          success: false,
          error: `Callback attempt ${attemptId} rejected (${relation}); exact expected attempt ID is ${lease.attemptId}.`,
        },
        { status: 409 },
      );
    }

    // 3. Handle FAILED status
    if (status !== "COMPLETED") {
      const reason = failureReason || `Worker reported failure with exit code ${exitCode ?? 1}`;
      const failReceipt = registry.failActiveJob(workerId, executionToken, reason);
      return NextResponse.json({
        success: true,
        jobId,
        status: "FAILED",
        failureReason: reason,
        receiptId: failReceipt.receiptId,
      });
    }

    // 4. Handle COMPLETED status: Authoritative Physical Verification
    if (!casUri || !sha256Proof) {
      const reason = "Completion callback missing physical CAS URI or SHA-256 proof.";
      registry.failActiveJob(workerId, executionToken, reason);
      return NextResponse.json(
        { success: false, status: "FAILED", error: reason },
        { status: 422 },
      );
    }

    if (!fs.existsSync(casUri)) {
      const reason = `Physical artifact not found at staged CAS path: ${casUri}`;
      registry.failActiveJob(workerId, executionToken, reason);
      return NextResponse.json(
        { success: false, status: "FAILED", error: reason },
        { status: 422 },
      );
    }

    // A. Verify with RenderArtifactVerifier
    const verifier = new RenderArtifactVerifier();
    const manifest = lease.job.manifest || {};
    const localIntent = (manifest.localRenderIntent || manifest) as Record<string, any>;
    const output = (localIntent.output || {}) as Record<string, any>;

    const verificationEvidence = await verifier.verify({
      artifact: {
        artifactId: `cas_${sha256Proof.substring(0, 16)}`,
        role: "output_mp4",
        sha256: sha256Proof,
        byteLength: byteLength || fs.statSync(casUri).size,
        mimeType: "video/mp4",
        uri: casUri,
      },
      approvedRoots: [
        process.cwd(),
        path.join(process.cwd(), "data"),
        path.join(process.cwd(), "apps", "web", "data"),
      ],
      expected: {
        width: Number(output.width || manifest.width || 1080),
        height: Number(output.height || manifest.height || 1920),
        fps: Number(output.fps || manifest.fps || 30),
        videoCodec: "h264",
        audioCodec: "aac",
        requireAudio: true,
      },
    });

    if (verificationEvidence.status !== "PASS") {
      const reason = `F06 physical artifact rejected: ${verificationEvidence.failureReason || "Container check failed"}`;
      registry.failActiveJob(workerId, executionToken, reason);
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          error: reason,
          verificationEvidence,
        },
        { status: 422 },
      );
    }

    // B. Audit with VerificationEngine (F07 Gate)
    const f07Audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      videoUrl: casUri,
      scriptText: manifest.topic || "InstaBox Video Render",
      sceneCount: Array.isArray(manifest.scenes) ? manifest.scenes.length : 1,
    });

    if (!f07Audit.passed || f07Audit.overallStatus !== "PASSED") {
      const failureList = f07Audit.failures?.length
        ? f07Audit.failures.join("; ")
        : "F07 media verification gate failed";
      const reason = `F07 media verification failed: ${failureList}`;
      registry.failActiveJob(workerId, executionToken, reason);
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          error: reason,
          f07Audit,
        },
        { status: 422 },
      );
    }

    // 5. Verification Succeeded: Authoritatively Mark COMPLETED
    const receipt = registry.completeActiveJob(workerId, executionToken, {
      exitCode: exitCode ?? 0,
      sha256Proof,
      byteLength: byteLength || fs.statSync(casUri).size,
      casUri,
      metrics,
      stdoutSnippet,
      stderrSnippet,
    });

    return NextResponse.json({
      success: true,
      jobId,
      status: "COMPLETED",
      receiptId: receipt.receiptId,
      casUri,
      sha256: sha256Proof,
    });
  } catch (err: any) {
    console.error("[Callback Error]", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
