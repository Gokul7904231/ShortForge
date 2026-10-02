import { describe, expect, it } from "vitest";
import { MissionCollaborationStore } from "../core/collaboration/MissionCollaborationStore";
import type { CollaborationActor } from "../core/collaboration/MissionCollaborationContracts";
import type { Mission } from "../core/contracts/MissionContracts";

function mission(): Mission {
  return {
    missionId: "mission_wave1",
    goal: "Create a 45s Mars short",
    objective: "Produce and verify a short about Mars",
    constraints: ["MAX_DURATION_45S"],
    priority: 2,
    version: 1,
    status: "RUNNING",
    createdAt: "2026-10-02T05:00:00.000Z",
    updatedAt: "2026-10-02T05:00:00.000Z",
    owner: "operator-1",
    taskIds: ["dag_1"],
    tasks: [
      {
        taskId: "task_research",
        missionId: "mission_wave1",
        name: "Research Mars",
        executionType: "AGENTIC",
        ownerAgent: "research-slayer",
        capabilityRequired: "RESEARCH",
        input: {},
        expectedOutputType: "EVIDENCE",
        status: "COMPLETED",
        timeoutMs: 60000,
        maxRetries: 2,
        retryCount: 0,
        evidenceId: "evidence_1",
      },
    ],
    progress: {
      totalTasks: 1,
      completedTasks: 1,
      failedTasks: 0,
      percentComplete: 100,
      currentPhase: "VERIFYING",
    },
    metrics: { tokensConsumed: 10, costUsd: 0.01, replanCount: 0 },
    successConditions: ["Tasks complete", "Artifact verified"],
    terminationConditions: ["Objective met or cancelled"],
    failurePolicy: "REPLAN",
    budget: {
      maxTokens: 1000,
      maxCostUsd: 1,
      maxDurationMs: 60000,
      maxParallelTasks: 2,
      tokensConsumed: 10,
      costUsd: 0.01,
      durationMs: 1000,
    },
    eventHistory: [],
    definitionOfDone: [
      { id: "dod_1", description: "Research evidence is attached", satisfied: true, evidenceId: "evidence_1" },
    ],
  };
}

const manager: CollaborationActor = {
  actorId: "operator-1",
  displayName: "Gokul",
  type: "HUMAN",
  workspaceRole: "ADMIN",
};

const viewer: CollaborationActor = {
  actorId: "operator-2",
  displayName: "Viewer",
  type: "HUMAN",
  workspaceRole: "VIEWER",
};

describe("Wave 1 Mission Collaboration Fabric", () => {
  it("creates a room with a human manager and bounded agent roster", async () => {
    const store = new MissionCollaborationStore();
    const room = await store.ensureRoom(mission(), manager);

    expect(room.roomId).toMatch(/^room_/);
    expect(room.missionId).toBe("mission_wave1");
    expect(room.participants.some((p) => p.participantId === "overseer" && p.responseMode === "JOINS_CONVERSATION")).toBe(true);
    expect(room.participants.some((p) => p.participantId === "research-slayer" && p.responseMode === "MENTION_ONLY")).toBe(true);
  });

  it("persists shared messages, @mentions, threads, and task links", async () => {
    const store = new MissionCollaborationStore();
    await store.ensureRoom(mission(), manager);

    const root = await store.appendMessage(mission(), manager, {
      body: "@Research-Slayer validate the research evidence",
      taskId: "task_research",
    });
    const reply = await store.appendMessage(mission(), manager, {
      body: "I added the evidence requirement.",
      threadId: root.messageId,
      taskId: "task_research",
    });

    expect(root.mentions).toEqual(["research-slayer"]);
    expect(root.taskId).toBe("task_research");
    expect(reply.threadId).toBe(root.messageId);

    const thread = await store.getThread(mission(), manager, root.messageId);
    expect(thread).toHaveLength(1);
    expect(thread[0].messageId).toBe(reply.messageId);
  });

  it("rejects non-members from a private mission room", async () => {
    const store = new MissionCollaborationStore();
    await store.ensureRoom(mission(), manager);

    await expect(store.getSnapshot(mission(), viewer)).rejects.toThrow("access denied");
  });

  it("updates the mission canvas without changing canonical mission status", async () => {
    const store = new MissionCollaborationStore();
    const room = await store.ensureRoom(mission(), manager);
    const updated = await store.updateCanvas(mission(), manager, {
      workingNotes: "Keep the opening hook factual.",
      decisions: ["Use verified Mars facts only."],
      risks: ["Voice timing may exceed target."],
    });

    expect(updated.version).toBe(room.version + 1);
    expect(updated.canvas.workingNotes).toContain("factual");
    expect(updated.canvas.decisions).toEqual(["Use verified Mars facts only."]);
    expect(updated.canvas.status).toBe("RUNNING");
  });

  it("blocks a new room for a viewer", async () => {
    const store = new MissionCollaborationStore();
    await expect(store.ensureRoom(mission(), viewer)).rejects.toThrow(
      "Mission room creation requires EDITOR, ADMIN, or OWNER access.",
    );
  });
});
