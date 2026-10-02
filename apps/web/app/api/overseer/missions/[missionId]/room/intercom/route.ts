import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";
import { buildMissionIntercomAuth } from "@/lib/overseer/agent-intercom-auth";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

function statusFor(error: any): number {
  const message = String(error?.message || "");
  if (message === "UNAUTHORIZED") return 401;
  if (message.includes("ACCESS_DENIED") || message.includes("UNAUTHORIZED") || message.includes("PERMISSION")) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("CONFLICT") || message.includes("BACKPRESSURE")) return 409;
  return 400;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    await buildMissionIntercomAuth(controller, missionId, actor);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Number(url.searchParams.get("limit") || 50);
    const page = await controller.agentIntercomStore.replay(missionId, cursor, limit);
    return NextResponse.json({ success: true, data: page });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to load intercom." }, { status: statusFor(error) });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const auth = await buildMissionIntercomAuth(controller, missionId, actor);
    const body = await request.json();
    const action = String(body?.action || "message");

    if (action === "message") {
      const target = String(body?.targetPrincipalId || "");
      if (!auth.allowedTargetPrincipals?.includes(target)) {
        throw new Error("INTERCOM_TARGET_NOT_IN_MISSION_ROOM");
      }
      const message = await controller.agentIntercomStore.send(auth, {
        missionId,
        floorId: body.floorId,
        target: {
          principalId: target,
          kind: body.targetKind || "WORKER",
          floorId: body.targetFloorId,
        },
        text: String(body.text || ""),
        taskId: body.taskId,
        correlationId: body.correlationId,
        causationId: body.causationId,
        idempotencyKey: body.idempotencyKey,
        delivery: body.delivery,
        priority: body.priority,
        ttlMs: body.ttlMs,
        maxAttempts: body.maxAttempts,
      });
      return NextResponse.json({ success: true, data: message }, { status: 201 });
    }

    if (action === "delegate") {
      const target = String(body?.targetPrincipalId || "");
      if (!auth.allowedTargetPrincipals?.includes(target)) {
        throw new Error("DELEGATION_TARGET_NOT_IN_MISSION_ROOM");
      }
      const delegation = await controller.agentIntercomStore.createDelegation(auth, {
        missionId,
        floorId: body.floorId,
        target: {
          principalId: target,
          kind: body.targetKind || "WORKER",
          floorId: body.targetFloorId,
        },
        objective: String(body.objective || ""),
        requiredCapability: body.requiredCapability,
        taskId: body.taskId,
        context: body.context,
        ttlMs: body.ttlMs,
        correlationId: body.correlationId,
        causationId: body.causationId,
      });
      return NextResponse.json({ success: true, data: delegation }, { status: 201 });
    }

    if (action === "cancel_delegation") {
      const delegation = await controller.agentIntercomStore.cancelDelegation(auth, String(body.delegationId || ""));
      return NextResponse.json({ success: true, data: delegation });
    }

    return NextResponse.json({ success: false, error: `Unknown intercom action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Intercom operation failed." }, { status: statusFor(error) });
  }
}
