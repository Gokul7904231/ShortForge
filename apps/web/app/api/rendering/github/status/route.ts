import { NextResponse } from "next/server";
import { RenderQueueManager } from "../../../../../lib/rendering/RenderQueueManager";
import { GitHubActionsRenderManager } from "../../../../../lib/rendering/GitHubActionsRenderManager";
import { BasicRenderingCapacityGuard } from "../../../../../lib/rendering/BasicRenderingCapacityGuard";

export const dynamic = "force-dynamic";

/**
 * POST /api/rendering/github/status
 * Callback endpoint receiving workflow run progress/completion from GitHub Actions runner.
 * Enforces execution token verification and server-side MP4 artifact verification.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { jobId, tenantId, executionToken, status, artifactUri, sizeBytes, headerBytesHex, durationMs, error } = body;

    if (!jobId || !tenantId || !executionToken || !status) {
      return NextResponse.json({ success: false, error: "Missing required callback parameters" }, { status: 400 });
    }

    // Verify Execution Token
    const verified = GitHubActionsRenderManager.verifyExecutionToken(executionToken, jobId, tenantId);
    if (!verified) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED_EXECUTION_TOKEN: Invalid or expired execution token." }, { status: 401 });
    }

    if (status === "COMPLETED") {
      // Fail closed: completion requires real measured values — no defaults, no synthesized URIs.
      if (!artifactUri) {
        return NextResponse.json({ success: false, error: "ARTIFACT_URI_MISSING: completion requires the actual artifact URI." }, { status: 422 });
      }
      if (typeof durationMs !== "number" || durationMs <= 0) {
        return NextResponse.json({ success: false, error: "DURATION_MISSING: completion requires the measured render duration." }, { status: 422 });
      }

      // Server-side independent MP4 artifact verification
      const verifyResult = GitHubActionsRenderManager.verifyArtifactIntegrity(jobId, tenantId, {
        sizeBytes: sizeBytes || 0,
        headerBytesHex,
      });

      if (!verifyResult.valid) {
        RenderQueueManager.failJob(jobId, verifyResult.error || "ARTIFACT_INVALID");
        return NextResponse.json({ success: false, error: verifyResult.error }, { status: 422 });
      }

      // Record capacity usage from the measured duration
      BasicRenderingCapacityGuard.recordRenderUsage("user_default", tenantId, Math.round(durationMs / 1000));

      // Complete job in RenderQueueManager
      const completedJob = RenderQueueManager.completeJob(jobId, {
        uri: artifactUri,
        sizeBytes,
        durationMs,
      });

      if (!completedJob) {
        return NextResponse.json({ success: false, error: "JOB_NOT_ACTIVE: no active render job for this jobId." }, { status: 409 });
      }

      return NextResponse.json({
        success: true,
        message: "Artifact verified and job marked COMPLETED.",
        job: completedJob,
      });
    }

    if (status === "FAILED") {
      RenderQueueManager.failJob(jobId, error || "GitHub Actions workflow run failed");
      return NextResponse.json({ success: true, message: "Job marked FAILED." });
    }

    const callbackResult = GitHubActionsRenderManager.handleWorkflowCallback(jobId, tenantId, executionToken, status, { error });
    if (!callbackResult.success) {
      const code = callbackResult.error?.includes("UNAUTHORIZED_EXECUTION_TOKEN") ? 401 : 404;
      return NextResponse.json({ success: false, error: callbackResult.error }, { status: code });
    }
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
