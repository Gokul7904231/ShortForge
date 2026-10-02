import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";
import { buildMissionIntercomAuth, MISSION_INTERCOM_CAPABILITIES } from "@/lib/overseer/agent-intercom-auth";
import type { CommsPeerHello, CommsPrincipal } from "@/factoryos/core/comms/CommsFabric";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

function statusFor(error: any): number {
  const message = String(error?.message || "");
  if (message === "UNAUTHORIZED") return 401;
  if (message.includes("ACCESS_DENIED") || message.includes("UNAUTHORIZED")) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("CONFLICT")) return 409;
  return 400;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    await buildMissionIntercomAuth(controller, missionId, actor);
    return NextResponse.json({
      success: true,
      data: { sessions: await controller.agentIntercomStore.listSessions(missionId) },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to load intercom sessions." }, { status: statusFor(error) });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const auth = await buildMissionIntercomAuth(controller, missionId, actor);
    const body = await request.json();

    if (body?.action === "heartbeat") {
      const session = await controller.agentIntercomStore.heartbeat(
        String(body.sessionId || ""),
        actor.actorId,
      );
      return NextResponse.json({ success: true, data: session });
    }

    const targetId = String(body?.targetPrincipalId || "");
    if (!auth.allowedTargetPrincipals?.includes(targetId)) {
      throw new Error("INTERCOM_TARGET_NOT_IN_MISSION_ROOM");
    }

    const target: CommsPrincipal = {
      principalId: targetId,
      kind: body.targetKind || "WORKER",
      floorId: body.targetFloorId,
    };

    const remoteHello: CommsPeerHello = {
      protocolVersion: String(body.remoteHello?.protocolVersion || "2.0.0"),
      principal: target,
      sessionId: String(body.remoteHello?.sessionId || `remote_${targetId}`),
      capabilities: Array.isArray(body.remoteHello?.capabilities)
        ? body.remoteHello.capabilities
        : MISSION_INTERCOM_CAPABILITIES,
      supportedSchemaVersions: Array.isArray(body.remoteHello?.supportedSchemaVersions)
        ? body.remoteHello.supportedSchemaVersions
        : ["1.0.0"],
      sentAt: String(body.remoteHello?.sentAt || new Date().toISOString()),
    };

    const session = await controller.agentIntercomStore.openSession(
      missionId,
      auth.principal,
      remoteHello,
      MISSION_INTERCOM_CAPABILITIES,
    );
    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Intercom session operation failed." }, { status: statusFor(error) });
  }
}
