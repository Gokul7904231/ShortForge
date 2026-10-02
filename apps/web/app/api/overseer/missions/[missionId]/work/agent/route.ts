import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

function authenticateWorker(request: NextRequest): string {
  const token = request.headers.get("x-factoryos-agent-token");
  const expected = process.env.FACTORYOS_INTERNAL_AGENT_TOKEN;
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  if (!expected && !isTest) throw new Error("Agent work endpoint is not configured.");

  if (expected && token !== expected) throw new Error("Agent authentication failed.");
  if (!token && !isTest) throw new Error("Agent authentication failed.");

  const agentId = request.headers.get("x-factoryos-agent-id")?.trim();
  if (!agentId) throw new Error("x-factoryos-agent-id is required.");
  return agentId;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const agentId = authenticateWorker(request);
    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);
    if (!mission) return NextResponse.json({ success: false, error: "Mission not found." }, { status: 404 });

    const body = await request.json();
    const taskId = String(body?.taskId || "");
    const action = String(body?.action || "");
    if (!taskId || !action) {
      return NextResponse.json({ success: false, error: "taskId and action are required." }, { status: 400 });
    }

    let result;
    switch (action) {
      case "claim":
        result = await controller.workManager.claimTask(missionId, taskId, agentId, Number(body.ttlMs) || 60000);
        break;
      case "heartbeat":
        result = await controller.workManager.heartbeatTask(missionId, taskId, agentId, Number(body.ttlMs) || 60000);
        break;
      case "request_review":
        result = await controller.workManager.requestReview(
          missionId,
          taskId,
          body.reviewerId ? String(body.reviewerId) : undefined,
          agentId,
          body.summary ? String(body.summary) : "Worker submitted work for review.",
        );
        break;
      case "complete":
        result = await controller.workManager.completeTask(
          missionId,
          taskId,
          agentId,
          body.summary ? String(body.summary) : "Worker completed task.",
        );
        break;
      case "fail":
        result = await controller.workManager.failTask(
          missionId,
          taskId,
          agentId,
          body.reason ? String(body.reason) : "Worker reported task failure.",
        );
        break;
      default:
        return NextResponse.json({ success: false, error: `Unsupported agent work action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    const status =
      error?.message?.includes("authentication") || error?.message?.includes("required") ? 401 : 400;
    return NextResponse.json({ success: false, error: error?.message || "Agent work operation failed." }, { status });
  }
}
