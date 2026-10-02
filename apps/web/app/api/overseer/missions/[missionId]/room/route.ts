import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor, assertCanCreateRoom } from "@/lib/overseer/collaboration-auth";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);

    if (!mission) {
      return NextResponse.json({ success: false, error: `Mission ${missionId} not found.` }, { status: 404 });
    }

    const snapshot = await controller.collaborationStore.getSnapshot(mission, actor, 100);
    return NextResponse.json({ success: true, data: snapshot });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : error?.message?.includes("access denied") ? 403 : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch mission room." },
      { status },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    assertCanCreateRoom(actor);

    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);
    if (!mission) {
      return NextResponse.json({ success: false, error: `Mission ${missionId} not found.` }, { status: 404 });
    }

    let body: { name?: string; description?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty POST is valid and uses mission defaults.
    }

    const room = await controller.collaborationStore.ensureRoom(mission, actor, body);
    return NextResponse.json({ success: true, data: room }, { status: 201 });
  } catch (error: any) {
    const status =
      error?.message === "UNAUTHORIZED"
        ? 401
        : error?.message?.includes("permission") || error?.message?.includes("access denied")
          ? 403
          : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create/open mission room." },
      { status },
    );
  }
}
