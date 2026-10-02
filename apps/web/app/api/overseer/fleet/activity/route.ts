import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";

export async function GET(request: NextRequest) {
  try {
    await resolveCollaborationActor(request);
    const url = new URL(request.url);
    const controller = await getFactoryOSController();
    const topicParam = url.searchParams.get("topics");
    const page = await controller.missionAutomationStore.activity({
      missionId: url.searchParams.get("missionId") || undefined,
      agentId: url.searchParams.get("agentId") || undefined,
      topics: topicParam ? topicParam.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: Number(url.searchParams.get("limit") || 50),
    });
    return NextResponse.json({ success:true,data:page });
  } catch (error:any) {
    return NextResponse.json({success:false,error:error?.message||"Failed to load fleet activity."},{status:500});
  }
}