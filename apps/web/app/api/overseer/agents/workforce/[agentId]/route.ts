import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";

interface RouteContext {
  params: Promise<{ agentId: string }>;
}

function failureStatus(message?: string): number {
  if (message === "UNAUTHORIZED") return 401;
  if (message?.includes("PERMISSION") || message?.includes("MEMBERSHIP")) return 403;
  if (message === "AGENT_NOT_FOUND") return 404;
  if (message?.includes("VERSION_CONFLICT")) return 409;
  return 400;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { agentId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const agent = await controller.agentWorkforceStore.get(agentId, {
      principalId: actor.actorId,
      workspaceRole: actor.workspaceRole,
    });
    if (!agent) return NextResponse.json({ success: false, error: "Agent not found or access denied." }, { status: 404 });
    return NextResponse.json({ success: true, data: agent });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch agent." }, { status: failureStatus(error?.message) });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { agentId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const body = await request.json();
    const agent = await controller.agentWorkforceStore.update(
      agentId,
      {
        name: body.name,
        description: body.description,
        role: body.role,
        specialization: body.specialization,
        status: body.status,
        allowedCapabilities: Array.isArray(body.allowedCapabilities) ? body.allowedCapabilities.map(String) : undefined,
        allowedToolIds: Array.isArray(body.allowedToolIds) ? body.allowedToolIds.map(String) : undefined,
        preferredModel: body.preferredModel
          ? { providerId: String(body.preferredModel.providerId), modelId: String(body.preferredModel.modelId) }
          : undefined,
        systemPrompt: body.systemPrompt,
        responseMode: body.responseMode,
        expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
      },
      actor.actorId,
      actor.workspaceRole,
    );
    return NextResponse.json({ success: true, data: agent });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to update agent." }, { status: failureStatus(error?.message) });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { agentId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const body = await request.json();
    const action = String(body?.action || "");

    switch (action) {
      case "grant": {
        const agent = await controller.agentWorkforceStore.grant(
          agentId,
          {
            principalId: String(body.principalId || ""),
            role: body.role,
          },
          actor.actorId,
          actor.workspaceRole,
        );
        return NextResponse.json({ success: true, data: agent });
      }
      case "revoke": {
        const agent = await controller.agentWorkforceStore.revoke(
          agentId,
          String(body.principalId || ""),
          actor.actorId,
          actor.workspaceRole,
        );
        return NextResponse.json({ success: true, data: agent });
      }
      case "bind_integration": {
        const agent = await controller.agentWorkforceStore.bindIntegration(
          agentId,
          {
            integrationId: String(body.integrationId || ""),
            provider: String(body.provider || ""),
            connectionRef: String(body.connectionRef || ""),
            scope: String(body.scope || ""),
            status: body.status,
          },
          actor.actorId,
          actor.workspaceRole,
        );
        return NextResponse.json({ success: true, data: agent });
      }
      case "remove_integration": {
        const agent = await controller.agentWorkforceStore.removeIntegration(
          agentId,
          String(body.integrationId || ""),
          actor.actorId,
          actor.workspaceRole,
        );
        return NextResponse.json({ success: true, data: agent });
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown agent action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Agent operation failed." }, { status: failureStatus(error?.message) });
  }
}
