import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";
import type { MissionRoomCanvasUpdate } from "@/factoryos/core/collaboration/MissionCollaborationContracts";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);
    if (!mission) return NextResponse.json({ success: false, error: "Mission not found." }, { status: 404 });

    const update = (await request.json()) as MissionRoomCanvasUpdate;
    const room = await controller.collaborationStore.updateCanvas(mission, actor, {
      workingNotes: update?.workingNotes,
      decisions: update?.decisions,
      risks: update?.risks,
    });

    return NextResponse.json({ success: true, data: room });
  } catch (error: any) {
    const status = error?.message?.includes("permission") ? 403 : 400;
    return NextResponse.json({ success: false, error: error?.message || "Failed to update mission canvas." }, { status });
  }
}
