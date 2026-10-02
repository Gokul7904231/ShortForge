import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";
import type { MissionRoomMessageInput } from "@/factoryos/core/collaboration/MissionCollaborationContracts";

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
    if (!room) return NextResponse.json({ success: true, data: { messages: [] } });

    if (!controller.collaborationStore.canReadRoom(room, actor)) {
      return NextResponse.json({ success: false, error: "Mission room access denied." }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const threadId = url.searchParams.get("threadId") || undefined;
    const snapshot = await controller.collaborationStore.getSnapshot(mission, actor, limit);
    const snapshotMessages = threadId
      ? snapshot.messages.filter((message) => message.threadId === threadId)
      : snapshot.messages;

    return NextResponse.json({
      success: true,
      data: { messages: snapshotMessages },
    });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch messages." }, { status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const mission = await controller.missionManager.getMission(missionId);
    if (!mission) return NextResponse.json({ success: false, error: "Mission not found." }, { status: 404 });

    const input = (await request.json()) as Partial<MissionRoomMessageInput>;
    if (!input || typeof input.body !== "string") {
      return NextResponse.json({ success: false, error: "Message body is required." }, { status: 400 });
    }

    const message = await controller.collaborationStore.appendMessage(mission, actor, {
      body: input.body,
      threadId: input.threadId,
      taskId: input.taskId,
      kind: input.kind || "MESSAGE",
    });

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (error: any) {
    const status =
      error?.message === "UNAUTHORIZED"
        ? 401
        : error?.message?.includes("access denied")
          ? 403
          : 400;
    return NextResponse.json({ success: false, error: error?.message || "Failed to add message." }, { status });
  }
}
