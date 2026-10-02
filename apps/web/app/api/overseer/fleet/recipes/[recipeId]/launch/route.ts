import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";

interface RouteContext { params: Promise<{ recipeId: string }>; }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { recipeId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const body = await request.json();
    const launch = await controller.missionAutomationStore.launchRecipe(actor, { recipeId, goal: String(body.goal || ""), inputs: body.inputs || undefined, mode: body.mode === "START_MISSION" ? "START_MISSION" : "CREATE_ONLY", idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined });
    return NextResponse.json({ success: true, data: launch }, { status: 201 });
  } catch (error: any) {
    const m=String(error?.message||""); const status=m.includes("FORBIDDEN")||m.includes("CAPABILITY")||m.includes("AGENT_UNAVAILABLE")?403:m.includes("NOT_FOUND")?404:m.includes("IN_PROGRESS")?409:400;
    return NextResponse.json({ success:false,error:m||"Failed to launch recipe."},{status});
  }
}