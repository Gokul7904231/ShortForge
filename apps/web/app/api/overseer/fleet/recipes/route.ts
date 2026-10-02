import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";

export async function GET() {
  try {
    const controller = await getFactoryOSController();
    return NextResponse.json({ success: true, data: { recipes: await controller.missionAutomationStore.listRecipes(), launches: await controller.missionAutomationStore.listLaunches() } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to load automation recipes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveCollaborationActor(request);
    const controller = await getFactoryOSController();
    const body = await request.json();
    if (body?.action !== "create") return NextResponse.json({ success: false, error: "Use action=create." }, { status: 400 });
    const recipe = await controller.missionAutomationStore.createRecipe(actor, {
      name: String(body.name || ""),
      description: body.description ? String(body.description) : undefined,
      steps: Array.isArray(body.steps) ? body.steps : [],
      missionDefaults: body.missionDefaults || undefined,
    });
    return NextResponse.json({ success: true, data: recipe }, { status: 201 });
  } catch (error: any) {
    const status = String(error?.message || "").includes("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ success: false, error: error?.message || "Failed to create automation recipe." }, { status });
  }
}