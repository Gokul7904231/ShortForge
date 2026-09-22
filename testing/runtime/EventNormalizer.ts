import type { MissionEvent, MissionActionType, TruthLevel } from "../contracts/execution.contract";

export class EventNormalizer {
  public static normalize(
    rawTopic: string,
    rawPayload: any,
    options?: { runId?: string; missionId?: string; truthLevel?: TruthLevel }
  ): MissionEvent {
    const timestamp = rawPayload?.timestamp || new Date().toISOString();
    const runId = options?.runId || rawPayload?.runId || "run_default";
    const missionId = options?.missionId || rawPayload?.missionId || "mis_default";
    const truthLevel: TruthLevel = options?.truthLevel || "OBSERVED";

    let actionType: MissionActionType = "decision";
    let floor: string | undefined = rawPayload?.floorId || rawPayload?.floor;

    if (rawTopic.includes("MISSION_STARTED") || rawTopic.includes("RUN_STARTED")) {
      actionType = "mission_started";
    } else if (rawTopic.includes("MISSION_COMPLETED") || rawTopic.includes("RUN_COMPLETED")) {
      actionType = "mission_completed";
    } else if (rawTopic.includes("TASK_STARTED") || rawTopic.includes("FLOOR_STARTED")) {
      actionType = "floor_start";
    } else if (rawTopic.includes("TASK_COMPLETED")) {
      actionType = "floor_complete";
    } else if (rawTopic.includes("VERIFICATION")) {
      actionType = "verification";
      floor = "floor07_compliance";
    } else if (rawTopic.includes("DELIVERY")) {
      actionType = "delivery";
    } else if (rawTopic.includes("ANOMALY") || rawTopic.includes("FAILED")) {
      actionType = "failure";
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const durationMs = typeof rawPayload?.executionTimeMs === "number" ? rawPayload.executionTimeMs : undefined;
    const durationTruth = rawPayload?.durationTruth || (typeof durationMs === "number" ? "PHYSICAL" : "ESTIMATED");

    return {
      id: eventId,
      missionId,
      runId,
      timestamp,
      truthLevel,
      actor: {
        type: floor ? "agent" : "system",
        id: rawPayload?.workerId || floor || "overseer",
        floor,
      },
      action: {
        type: actionType,
        name: rawTopic,
      },
      subjectId: rawPayload?.taskId || rawPayload?.jobId || floor || missionId,
      taskNodeId: rawPayload?.taskNodeId || rawPayload?.taskId,
      capabilityId: rawPayload?.capabilityId,
      executionId: rawPayload?.executionId,
      sourceIdentifier: rawPayload?.sourceIdentifier || (floor ? `${floor}:${rawPayload?.workerId || "worker"}` : undefined),
      durationMs,
      durationTruth,
      consumedArtifactIds: rawPayload?.consumedArtifactIds || (Array.isArray(rawPayload?.consumedArtifacts) ? rawPayload.consumedArtifacts.map((a: any) => a.sha256 || a.path) : undefined),
      producedArtifactIds: rawPayload?.producedArtifactIds || (Array.isArray(rawPayload?.producedArtifacts) ? rawPayload.producedArtifacts.map((a: any) => a.sha256 || a.path) : undefined),
      inputs: rawPayload?.inputs ? Object.keys(rawPayload.inputs) : undefined,
      outputs: rawPayload?.output ? Object.keys(rawPayload.output) : undefined,
      metadata: typeof rawPayload === "object" ? { ...rawPayload } : { value: rawPayload },
    };
  }
}
