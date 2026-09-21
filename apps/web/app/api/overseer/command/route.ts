import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";

export async function POST(request: NextRequest) {
  try {
    const controller = await getFactoryOSController();
    const body = await request.json();
    const { action, command, target, payload, mode = "OPERATE" } = body;

    if (!action && !command) {
      return NextResponse.json(
        { success: false, error: "Missing required field: action or command" },
        { status: 400 }
      );
    }

    const commandText = command || action;
    const lower = String(commandText).toLowerCase();

    // 1. Submit command to Overseer Control Plane
    const result = await controller.overseer.submitCommand(
      commandText,
      mode === "AUTOPILOT" ? "autonomous" : "deliberate"
    );

    // 2. Specific Action Handling
    if (lower.includes("quiz") || action === "CREATE_QUIZ_SHORT") {
      const topic = payload?.topic || "Science & Technology Trivia";
      const mission = await controller.missionManager.createMission({
        goal: `Produce 30s Quiz Short: "${topic}"`,
        objective: `Execute 7-Floor FactoryOS pipeline for topic: ${topic}`,
        constraints: ["MAX_DURATION_30S", "VALIDATE_QUIZ_FACTS"],
        scope: {
          topic,
          floorIds: [
            "floor01_strategy",
            "floor02_scripting",
            "floor03_asset_realization",
            "floor04_media_synthesis",
            "floor05_timeline_composition",
            "floor06_rendering",
            "floor07_compliance",
          ],
        },
      });
      await controller.missionManager.startMission(mission.missionId);
      await controller.overseer.dispatchMission(mission);

      return NextResponse.json({
        success: true,
        data: {
          commandId: result.runId,
          missionId: mission.missionId,
          status: "DISPATCHED",
          action: "CREATE_QUIZ_SHORT",
          topic,
          message: `Created and dispatched 7-Floor quiz production mission ${mission.missionId} for "${topic}".`,
        },
      });
    }

    if (action === "INSPECT_FLOOR" || lower.includes("inspect floor")) {
      const floorId = target || "floor03_asset_realization";
      controller.overseer.getPresenceEngine().attentionController.setAttention(
        floorId,
        `Inspecting ${floorId}`,
        "HIGH"
      );
      const floorState = controller.worldState.getState().floors[floorId];

      return NextResponse.json({
        success: true,
        data: {
          commandId: result.runId,
          target: floorId,
          status: floorState?.status || "ONLINE",
          activeWorkers: floorState?.activeWorkers || 0,
          message: `Attention focused on ${floorId}. Status: ${floorState?.status || "ONLINE"}.`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        commandId: result.runId,
        missionId: result.missionId,
        status: result.status,
        message: `Command executed: "${commandText}" (Status: ${result.status}).`,
      },
    });
  } catch (err: any) {
    console.error("[API /overseer/command POST] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute Overseer command" },
      { status: 500 }
    );
  }
}
