import { describe, expect, it } from "vitest";
import { missionWorkErrorMessage, readMissionWorkSnapshot } from "../../components/overseer/collaboration/mission-work-client";

const board = {
  missionId: "mission-safe-read",
  missionStatus: "RUNNING",
  goal: "Verify the live mission view",
  columns: {},
  tasks: [{ taskId: "task-a", resolvedWorkState: "RUNNING" }],
  recentActivity: [{ eventId: "event-a", timestamp: "2026-10-12T09:00:00.000Z" }],
};

describe("mission work canvas API client", () => {
  it("accepts the documented snapshot envelope", async () => {
    const response = new Response(JSON.stringify({ success: true, data: board }), { status: 200 });
    await expect(readMissionWorkSnapshot(response)).resolves.toMatchObject({
      missionId: "mission-safe-read",
      tasks: [{ taskId: "task-a", resolvedWorkState: "RUNNING" }],
    });
  });

  it("rejects malformed success payloads instead of trusting untyped response data", async () => {
    const response = new Response(JSON.stringify({ success: true, data: { missionId: "m", tasks: "not-an-array" } }), { status: 200 });
    await expect(readMissionWorkSnapshot(response)).rejects.toThrow("invalid response");
  });

  it("maps authorization and missing-resource errors without exposing server exception bodies", async () => {
    const forbidden = new Response(JSON.stringify({ success: false, error: "internal policy detail" }), { status: 403 });
    await expect(readMissionWorkSnapshot(forbidden)).rejects.toThrow("do not have permission");
    expect(missionWorkErrorMessage(500)).toBe("Mission work state could not be refreshed. Retry shortly.");
    expect(missionWorkErrorMessage(404)).toBe("This mission could not be found.");
  });
});
