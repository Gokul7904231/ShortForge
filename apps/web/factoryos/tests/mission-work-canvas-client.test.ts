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

import { projectMissionWorkReplay, projectMissionWorkSignal } from "../core/work/MissionWorkEventSignals";

describe("mission work event projection", () => {
  const envelope = (overrides: Record<string, unknown> = {}) => ({
    eventId: "evt_12345",
    topic: "TASK_COMPLETED",
    timestamp: "2026-10-12T09:00:00.000Z",
    source: "worker-runtime",
    payload: {
      missionId: "mission-safe-read",
      taskId: "task-a",
      output: "SENSITIVE_WORKER_OUTPUT",
      token: "SHOULD_NOT_LEAK",
    },
    ...overrides,
  });

  it("accepts only allow-listed signals for the requested mission and projects no raw payload", () => {
    const signal = projectMissionWorkSignal(envelope(), "mission-safe-read");
    expect(signal).toEqual({
      type: "MISSION_WORK_CHANGED",
      eventId: "evt_12345",
      topic: "TASK_COMPLETED",
      timestamp: "2026-10-12T09:00:00.000Z",
      missionId: "mission-safe-read",
      taskId: "task-a",
    });
    expect(JSON.stringify(signal)).not.toContain("SENSITIVE_WORKER_OUTPUT");
    expect(JSON.stringify(signal)).not.toContain("SHOULD_NOT_LEAK");
  });

  it("replays only allow-listed signals after an existing cursor", () => {
    const history = [
      envelope({ eventId: "evt_cursor", topic: "MISSION_STARTED", payload: { missionId: "mission-safe-read" } }),
      envelope({ eventId: "evt_task1", topic: "TASK_PROGRESS", timestamp: "2026-10-12T09:01:00.000Z" }),
      envelope({
        eventId: "evt_other",
        topic: "TASK_COMPLETED",
        payload: { missionId: "another-mission", taskId: "private-task", secret: "omit" },
      }),
      envelope({
        eventId: "evt_task2",
        topic: "TASK_FAILED",
        timestamp: "2026-10-12T09:02:00.000Z",
        payload: { missionId: "mission-safe-read", taskId: "task-b", workerLog: "do not send" },
      }),
    ];

    const replay = projectMissionWorkReplay(history, "evt_cursor", "mission-safe-read");

    expect(replay.resyncRequired).toBe(false);
    expect(replay.latestEventId).toBe("evt_task2");
    expect(replay.signals.map((item) => item.eventId)).toEqual(["evt_task1", "evt_task2"]);
    expect(JSON.stringify(replay.signals)).not.toContain("workerLog");
    expect(JSON.stringify(replay.signals)).not.toContain("private-task");
  });

  it("requires resync when the reconnect cursor has expired from the bounded history", () => {
    const history = [
      envelope({ eventId: "evt_recent1" }),
      envelope({ eventId: "evt_recent2", topic: "TASK_PROGRESS" }),
    ];

    expect(projectMissionWorkReplay(history, "evt_expired", "mission-safe-read")).toEqual({
      resyncRequired: true,
      latestEventId: "evt_recent2",
      signals: [],
    });
  });

  it("does not replay history for a fresh connection without a Last-Event-ID", () => {
    const history = [envelope({ eventId: "evt_existing" })];
    expect(projectMissionWorkReplay(history, undefined, "mission-safe-read")).toEqual({
      resyncRequired: false,
      latestEventId: "evt_existing",
      signals: [],
    });
  });

  it("rejects events for another mission, non-work topics, invalid cursors, and invalid timestamps", () => {
    expect(projectMissionWorkSignal(envelope(), "other-mission")).toBeNull();
    expect(projectMissionWorkSignal(envelope({ topic: "OVERSEER_PRESENCE_STATE" }), "mission-safe-read")).toBeNull();
    expect(projectMissionWorkSignal(envelope({ eventId: "evt_1\\ndata: forged" }), "mission-safe-read")).toBeNull();
    expect(projectMissionWorkSignal(envelope({ timestamp: "not-a-time" }), "mission-safe-read")).toBeNull();
  });
});

