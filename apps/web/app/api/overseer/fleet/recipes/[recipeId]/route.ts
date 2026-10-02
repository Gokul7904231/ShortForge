import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";

interface RouteContext { params: Promise<{ recipeId: string }>; }

export async function GET(_: NextRequest, context: RouteContext) {
  try { const { recipeId } = await context.params; const controller = await getFactoryOSController(); const recipe = await controller.missionAutomationStore.getRecipe(recipeId); if (!recipe) return NextResponse.json({ success:false,error:"Automation recipe not found." },{status:404}); return NextResponse.json({success:true,data:recipe}); }
  catch (error:any) { return NextResponse.json({success:false,error:error?.message||"Failed to load recipe."},{status:500}); }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try { const { recipeId } = await context.params; const actor = await resolveCollaborationActor(request); const controller = await getFactoryOSController(); const body = await request.json(); const recipe = await controller.missionAutomationStore.updateRecipe(actor, recipeId, { name: body.name, description: body.description, status: body.status, steps: Array.isArray(body.steps) ? body.steps : undefined, missionDefaults: body.missionDefaults, expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined }); return NextResponse.json({success:true,data:recipe}); }
  catch (error:any) { const m=String(error?.message||""); const status=m.includes("FORBIDDEN")||m.includes("REQUIRED")?403:m.includes("NOT_FOUND")?404:m.includes("CONFLICT")?409:400; return NextResponse.json({success:false,error:m||"Failed to update recipe."},{status}); }
}