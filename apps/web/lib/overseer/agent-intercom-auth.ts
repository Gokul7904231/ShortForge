import type { AgentIntercomAuth } from "@/factoryos/core/comms/AgentIntercomContracts";
import type { CollaborationActor } from "@/factoryos/core/collaboration/MissionCollaborationContracts";
import type { AutonomousFactoryController } from "@/factoryos/core/controller/AutonomousFactoryController";
import type { CommsCapability, CommsPrincipal } from "@/factoryos/core/comms/CommsFabric";

export const MISSION_INTERCOM_CAPABILITIES: readonly CommsCapability[] = [
  { name: "SITUATION_RECORD", version: "1.0.0", enabled: true, lanes: ["EVENT"], maxPayloadBytes: 32768, maxInflight: 32 },
  { name: "COMMAND", version: "1.0.0", enabled: true, lanes: ["CONTROL"], maxPayloadBytes: 32768, maxInflight: 16 },
  { name: "REQUEST_RESPONSE", version: "1.0.0", enabled: true, lanes: ["CONTROL"], maxPayloadBytes: 32768, maxInflight: 16 },
];

function actorPrincipal(actor: CollaborationActor): CommsPrincipal {
  return {
    principalId: actor.actorId,
    kind: "HUMAN",
  };
}

export async function buildMissionIntercomAuth(
  controller: AutonomousFactoryController,
  missionId: string,
  actor: CollaborationActor,
): Promise<AgentIntercomAuth> {
  const room = await controller.collaborationStore.getRoom(missionId);
  if (!room) throw new Error("MISSION_ROOM_NOT_FOUND");
  if (!controller.collaborationStore.canReadRoom(room, actor)) throw new Error("MISSION_ROOM_ACCESS_DENIED");

  const allowedTargets = room.participants
    .filter((participant) => participant.active && participant.participantId !== actor.actorId)
    .map((participant) => participant.participantId);

  return {
    principal: actorPrincipal(actor),
    allowedMissionIds: [missionId],
    allowedLanes: ["CONTROL", "EVENT"],
    allowedKinds: ["MESSAGE", "DELEGATION_REQUEST", "DELEGATION_RESPONSE"],
    allowedCapabilities: MISSION_INTERCOM_CAPABILITIES,
    allowedTargetPrincipals: allowedTargets,
    allowBroadcast: false,
  };
}
