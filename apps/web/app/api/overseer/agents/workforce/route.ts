import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";

function canCreate(role?: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "EDITOR";
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const data = await controller.agentWorkforceStore.list({
      principalId: actor.actorId,
      workspaceRole: actor.workspaceRole,
    });
    return NextResponse.json({
      success: true,
      data,
      permissions: {
        canCreate: canCreate(actor.workspaceRole),
      },
    });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch agent workforce." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "create") {
      if (!canCreate(actor.workspaceRole)) {
        return NextResponse.json({ success: false, error: "Agent creation requires EDITOR, ADMIN, or OWNER access." }, { status: 403 });
      }
      const agent = await controller.agentWorkforceStore.create({
        name: String(body.name || ""),
        description: body.description,
        role: String(body.role || "SPECIALIST"),
        specialization: body.specialization,
        allowedCapabilities: Array.isArray(body.allowedCapabilities) ? body.allowedCapabilities.map(String) : undefined,
        allowedToolIds: Array.isArray(body.allowedToolIds) ? body.allowedToolIds.map(String) : undefined,
        preferredModel: body.preferredModel
          ? { providerId: String(body.preferredModel.providerId), modelId: String(body.preferredModel.modelId) }
          : undefined,
        systemPrompt: body.systemPrompt,
        responseMode: body.responseMode,
      }, actor.actorId);
      return NextResponse.json({ success: true, data: agent });
    }

    return NextResponse.json({ success: false, error: `Unknown workforce action: ${action}` }, { status: 400 });
  } catch (error: any) {
    const status = error?.message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ success: false, error: error?.message || "Agent workforce operation failed." }, { status });
  }
}
