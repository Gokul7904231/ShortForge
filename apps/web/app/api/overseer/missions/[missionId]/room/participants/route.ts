import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";
import type { MissionRoomParticipantInput } from "@/factoryos/core/collaboration/MissionCollaborationContracts";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);
    if (!mission) return NextResponse.json({ success: false, error: "Mission not found." }, { status: 404 });
    const room = await controller.collaborationStore.getRoom(missionId);
    if (!room) return NextResponse.json({ success: true, data: { participants: [] } });
    if (!controller.collaborationStore.canReadRoom(room, actor)) {
      return NextResponse.json({ success: false, error: "Mission room access denied." }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: { participants: room.participants } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch participants." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const input = (await request.json()) as Partial<MissionRoomParticipantInput>;

    if (!input?.participantId || !input.displayName || !input.type) {
      return NextResponse.json({ success: false, error: "participantId, displayName, and type are required." }, { status: 400 });
    }

    if (input.type === "AGENT" && String(input.participantId).startsWith("agent_")) {
      const workforceAgent = await controller.agentWorkforceStore.getExecutionProfile(String(input.participantId));
      if (!workforceAgent) {
        return NextResponse.json({
          success: false,
          error: "Workspace-managed agent not found or not active.",
        }, { status: 400 });
      }
    }

    const room = await controller.collaborationStore.addParticipant(missionId, {
      participantId: input.participantId,
      displayName: input.displayName,
      type: input.type,
      responseMode: input.responseMode,
      specialization: input.specialization,
    }, actor);

    return NextResponse.json({ success: true, data: room }, { status: 201 });
  } catch (error: any) {
    const status = error?.message?.includes("permission") ? 403 : 400;
    return NextResponse.json({ success: false, error: error?.message || "Failed to add participant." }, { status });
  }
}
