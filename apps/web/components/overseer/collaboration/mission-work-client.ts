import type { MissionWorkBoardSnapshot } from "@/factoryos/core/work/MissionWorkManager";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWorkBoardSnapshot(value: unknown): value is MissionWorkBoardSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.missionId !== "string" || typeof value.missionStatus !== "string" || typeof value.goal !== "string") {
    return false;
  }
  if (!isRecord(value.columns) || !Array.isArray(value.tasks) || !Array.isArray(value.recentActivity)) {
    return false;
  }
  return value.tasks.every((task) =>
    isRecord(task) &&
    typeof task.taskId === "string" &&
    typeof task.resolvedWorkState === "string",
  ) && value.recentActivity.every((event) =>
    isRecord(event) &&
    typeof event.eventId === "string" &&
    typeof event.timestamp === "string",
  );
}

export function missionWorkErrorMessage(status: number): string {
  if (status === 401) return "Your session may have expired. Sign in and try again.";
  if (status === 403) return "You do not have permission to view this mission work board.";
  if (status === 404) return "This mission could not be found.";
  return "Mission work state could not be refreshed. Retry shortly.";
}

/**
 * Parse only the documented read API shape and never surface raw server exception
 * text to a user-facing canvas.
 */
export async function readMissionWorkSnapshot(response: Response): Promise<MissionWorkBoardSnapshot> {
  if (!response.ok) throw new Error(missionWorkErrorMessage(response.status));

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Mission work state could not be refreshed. Retry shortly.");
  }

  if (!isRecord(payload) || payload.success !== true || !isWorkBoardSnapshot(payload.data)) {
    throw new Error("Mission work state returned an invalid response. Retry or report the issue.");
  }
  return payload.data;
}
