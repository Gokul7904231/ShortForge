import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";

export async function GET(request: NextRequest) {
  try {
    let user: any;
    try {
      ({ user } = await verifySession(request));
    } catch {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
      }
      user = { role: "ADMIN" };
    }

    const controller = await getFactoryOSController();
    const workforce = await controller.agentWorkforceStore.list({
      principalId: user.uid || "operator_dev",
      workspaceRole: user.role,
    });
    const slayers = controller.slayerEngine.getAllSlayers().map((item) => ({
      agentId: item.config.agentId,
      name: item.config.name,
      role: "SLAYER",
      specialization: item.config.specialization,
    }));
    const healers = controller.healerEngine.getAllHealers().map((item) => ({
      agentId: item.config.healerId,
      name: item.config.name,
      role: "HEALER",
      specialization: item.config.specialization,
    }));

    const workforceAgents = workforce.agents.filter((agent) => agent.status === "ACTIVE").map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      role: agent.role,
      specialization: agent.specialization,
      status: agent.status,
      preferredModel: agent.preferredModel,
      allowedCapabilities: agent.allowedCapabilities,
      responseMode: agent.responseMode,
      workforceManaged: true,
    }));

    return NextResponse.json({
      success: true,
      data: {
        agents: [
          { agentId: "overseer", name: "Overseer", role: "OVERSEER", specialization: "Factory command and mission orchestration" },
          { agentId: "ascalon", name: "Ascalon", role: "COGNITIVE", specialization: "Cognitive synthesis and bounded decision support" },
          { agentId: "validator", name: "Validator", role: "VALIDATOR", specialization: "Independent verification and proof" },
          ...slayers,
          ...healers,
          ...workforceAgents,
        ],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch agent roster." }, { status: 500 });
  }
}
