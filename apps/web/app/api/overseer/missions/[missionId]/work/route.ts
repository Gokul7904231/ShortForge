import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

function requireMutationRole(role?: string): void {
  if (!["EDITOR", "ADMIN", "OWNER"].includes(role || "")) {
    throw new Error("Work board mutation requires EDITOR, ADMIN, or OWNER access.");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);
    if (!mission) return NextResponse.json({ success: false, error: "Mission not found." }, { status: 404 });

    const room = await controller.collaborationStore.getRoom(missionId);
    if (room) {
      if (!controller.collaborationStore.canReadRoom(room, actor)) {
        return NextResponse.json({ success: false, error: "Mission work board access denied." }, { status: 403 });
      }
    } else if (actor.workspaceRole === "VIEWER") {
      return NextResponse.json({ success: false, error: "Open membership is required to view a mission work board." }, { status: 403 });
    }

    const board = await controller.workManager.board(missionId);
    return NextResponse.json({ success: true, data: board });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message?.includes("access") ? 403 : 500;
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch mission work board." }, { status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    requireMutationRole(actor.workspaceRole);

    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);
    if (!mission) return NextResponse.json({ success: false, error: "Mission not found." }, { status: 404 });

    const body = await request.json();
    const action = String(body?.action || "");

    let result;
    switch (action) {
      case "create":
        if (!body?.name || !body?.ownerAgent || !body?.capabilityRequired || !body?.expectedOutputType) {
          return NextResponse.json({
            success: false,
            error: "name, ownerAgent, capabilityRequired, and expectedOutputType are required for task creation.",
          }, { status: 400 });
        }
        result = await controller.workManager.createTask(missionId, {
          name: body.name,
          ownerAgent: body.ownerAgent,
          capabilityRequired: body.capabilityRequired,
          expectedOutputType: body.expectedOutputType,
          executionType: body.executionType,
          input: body.input,
          timeoutMs: body.timeoutMs,
          maxRetries: body.maxRetries,
          dependencyTaskIds: body.dependencyTaskIds,
          requiresReview: body.requiresReview,
          idempotencyKey: body.idempotencyKey,
          workerLane: body.workerLane,
        }, { actorId: actor.actorId });
        break;

      case "request_review":
        result = await controller.workManager.requestReview(
          missionId,
          body.taskId,
          body.reviewerId,
          actor.actorId,
          body.summary || "Work is ready for review.",
        );
        break;

      case "request_changes":
        result = await controller.workManager.requestChanges(
          missionId,
          body.taskId,
          actor.actorId,
          body.reason || "Changes requested by reviewer.",
        );
        break;

      case "complete":
        result = await controller.workManager.completeTask(
          missionId,
          body.taskId,
          actor.actorId,
          body.summary || "Task completed by operator.",
        );
        break;

      case "block":
        result = await controller.workManager.blockTask(
          missionId,
          body.taskId,
          actor.actorId,
          body.reason || "Blocked by operator.",
        );
        break;

      case "unblock":
        result = await controller.workManager.unblockTask(
          missionId,
          body.taskId,
          actor.actorId,
        );
        break;

      case "archive":
        result = await controller.workManager.archiveTask(
          missionId,
          body.taskId,
          actor.actorId,
        );
        break;

      case "reclaim_expired":
        result = await controller.workManager.reclaimExpired(missionId, actor.actorId);
        break;

      default:
        return NextResponse.json({ success: false, error: `Unknown work action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    const status =
      error?.message === "UNAUTHORIZED"
        ? 401
        : error?.message?.includes("access") || error?.message?.includes("permission")
          ? 403
          : 400;
    return NextResponse.json({ success: false, error: error?.message || "Work operation failed." }, { status });
  }
}
