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

    return NextResponse.json({
      success: true,
      data: {
        agents: [
          { agentId: "overseer", name: "Overseer", role: "OVERSEER", specialization: "Factory command and mission orchestration" },
          { agentId: "ascalon", name: "Ascalon", role: "COGNITIVE", specialization: "Cognitive synthesis and bounded decision support" },
          { agentId: "validator", name: "Validator", role: "VALIDATOR", specialization: "Independent verification and proof" },
          ...slayers,
          ...healers,
        ],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch agent roster." }, { status: 500 });
  }
}
