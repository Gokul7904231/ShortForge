import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import type { CollaborationActor } from "@/factoryos/core/collaboration/MissionCollaborationContracts";

export async function resolveCollaborationActor(
  request: NextRequest,
): Promise<CollaborationActor> {
  try {
    const { user } = await verifySession(request);
    return {
      actorId: user.uid,
      displayName: user.name || user.email?.split("@")[0] || "Operator",
      type: "HUMAN",
      workspaceRole: user.role || "VIEWER",
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("UNAUTHORIZED");
    }
    return {
      actorId: "operator_dev",
      displayName: "Operator",
      type: "HUMAN",
      workspaceRole: "ADMIN",
    };
  }
}

export function assertCanCreateRoom(actor: CollaborationActor): void {
  if (actor.workspaceRole === "VIEWER") {
    throw new Error("Mission room creation requires EDITOR, ADMIN, or OWNER access.");
  }
}
