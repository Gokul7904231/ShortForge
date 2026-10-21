import { NextResponse } from "next/server";
import { RenderQueueManager } from "../../../../../lib/rendering/RenderQueueManager";
import { GitHubActionsRenderManager } from "../../../../../lib/rendering/GitHubActionsRenderManager";
import { BasicRenderingCapacityGuard } from "../../../../../lib/rendering/BasicRenderingCapacityGuard";
import { verifySession } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * POST /api/rendering/github/dispatch
 * Triggers workflow_dispatch for a queued Basic/Free RenderJob.
 * Authenticated and owner-authorized: dispatch is a mutation.
 */
export async function POST(req: Request) {
  try {
    const { user } = await verifySession(req);

    const body = await req.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ success: false, error: "Missing jobId parameter" }, { status: 400 });
    }

    const queue = RenderQueueManager.getQueue();
    const job = queue.find((j) => j.id === jobId || j.jobId === jobId);

    if (!job) {
      return NextResponse.json({ success: false, error: "RenderJob not found in queue" }, { status: 404 });
    }

    // 🔒 Ownership barrier: only the job owner or an admin may dispatch it.
    if (job.userId !== user.uid && !isAdminUser(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden: You do not have permission to dispatch this job." }, { status: 403 });
    }

    // Azure is ADMIN-ONLY server-side check
    if (job.tier === "ADMIN") {
      return NextResponse.json({ success: false, error: "Admin jobs are processed via Azure compute, not GitHub Actions." }, { status: 400 });
    }

    const result = await GitHubActionsRenderManager.dispatchWorkflowRun(job);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "GitHub Actions workflow_dispatch triggered successfully.",
      runRecord: result.runRecord,
    });
  } catch (err: any) {
    const status = err.status || (err.message?.includes("Unauthorized") ? 401 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
