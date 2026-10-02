import { describe, expect, it } from "vitest";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { InMemoryMissionRepository } from "../core/database/InMemoryDatabase";
import { LeaseManager } from "../core/leases/LeaseManager";
import { MissionManager } from "../core/missions/MissionManager";
import { MissionWorkManager } from "../core/work/MissionWorkManager";

async function setup() {
  const eventBus = new DurableEventBus();
  const missions = new MissionManager(new InMemoryMissionRepository(), eventBus);
  const leases = new LeaseManager(undefined, 100);
  const work = new MissionWorkManager(missions, leases, eventBus);
  const mission = await missions.createMission({
    missionId: "mission_work_test",
    goal: "Wave 2 test mission",
    objective: "Exercise durable work lifecycle",
  });
  await missions.startMission(mission.missionId);
  return { eventBus, missions, leases, work, missionId: mission.missionId };
}

describe("Wave 2 Durable Mission Work Manager", () => {
  it("promotes dependency-gated tasks only after the parent is done", async () => {
    const { work, missionId } = await setup();

    await work.createTask(missionId, {
      taskId: "task_parent",
      name: "Parent",
      ownerAgent: "agent-a",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
    });
    await work.createTask(missionId, {
      taskId: "task_child",
      name: "Child",
      ownerAgent: "agent-b",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
      dependencyTaskIds: ["task_parent"],
    });

    let board = await work.board(missionId);
    expect(board.columns.READY.map((task) => task.taskId)).toContain("task_parent");
    expect(board.columns.TODO.map((task) => task.taskId)).toContain("task_child");

    await work.completeTask(missionId, "task_parent", "agent-a");
    board = await work.board(missionId);
    expect(board.columns.READY.map((task) => task.taskId)).toContain("task_child");
  });

  it("claims a task with a lease and renews its heartbeat", async () => {
    const { work, leases, missionId } = await setup();

    await work.createTask(missionId, {
      taskId: "task_claim",
      name: "Claimable",
      ownerAgent: "agent-a",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
    });

    const claimed = await work.claimTask(missionId, "task_claim", "agent-a", 1000);
    expect(claimed.workState).toBe("RUNNING");
    expect((await leases.getLease("task_claim"))?.ownerAgentId).toBe("agent-a");

    const heartbeat = await work.heartbeatTask(missionId, "task_claim", "agent-a", 1000);
    expect(heartbeat.lastHeartbeatAt).toBeDefined();

    await expect(work.claimTask(missionId, "task_claim", "agent-b", 1000)).rejects.toThrow("not ready");
  });

  it("requires review before completing review-gated work and supports rework", async () => {
    const { work, leases, missionId } = await setup();

    await work.createTask(missionId, {
      taskId: "task_review",
      name: "Review me",
      ownerAgent: "agent-a",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
      requiresReview: true,
    });

    await work.claimTask(missionId, "task_review", "agent-a");
    await expect(work.completeTask(missionId, "task_review", "agent-a")).rejects.toThrow("requires review");

    await work.requestReview(missionId, "task_review", "operator", "agent-a", "Ready for review");
    expect((await work.board(missionId)).columns.REVIEW.map((task) => task.taskId)).toContain("task_review");
    // requestReview releases the agent lease before handing the task to review.
    expect((await leases.getLease("task_review"))?.status).not.toBe("ACTIVE");

    await work.requestChanges(missionId, "task_review", "operator", "Fix the hook");
    expect((await work.board(missionId)).columns.READY.map((task) => task.taskId)).toContain("task_review");
  });

  it("opens a circuit after repeated failures and bounds retries", async () => {
    const { work, missionId } = await setup();

    await work.createTask(missionId, {
      taskId: "task_retry",
      name: "Retrying",
      ownerAgent: "agent-a",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
      maxRetries: 5,
    });

    await work.claimTask(missionId, "task_retry", "agent-a");
    await work.failTask(missionId, "task_retry", "agent-a", "failure one");
    await work.claimTask(missionId, "task_retry", "agent-a");
    await work.failTask(missionId, "task_retry", "agent-a", "failure two");
    await work.claimTask(missionId, "task_retry", "agent-a");
    const failed = await work.failTask(missionId, "task_retry", "agent-a", "failure three");

    expect(failed.workState).toBe("FAILED");
    expect(failed.circuitState).toBe("OPEN");
    expect(failed.failureStreak).toBe(3);
  });

  it("reclaims an expired worker lease back to READY within the retry budget", async () => {
    const { work, missionId } = await setup();

    await work.createTask(missionId, {
      taskId: "task_reclaim",
      name: "Lease expiry",
      ownerAgent: "agent-a",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
      maxRetries: 2,
    });

    await work.claimTask(missionId, "task_reclaim", "agent-a", 1);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const recovered = await work.reclaimExpired(missionId);
    expect(recovered[0]?.taskId).toBe("task_reclaim");
    expect(recovered[0]?.workState).toBe("READY");
    expect(recovered[0]?.retryCount).toBe(1);
  });

  it("projects execution lifecycle events into the durable MissionTask state", async () => {
    const { work, eventBus, missionId } = await setup();

    await work.createTask(missionId, {
      taskId: "task_project",
      name: "Projected execution",
      ownerAgent: "agent-a",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
    });

    await eventBus.publish("TASK_STARTED", {
      missionId,
      taskId: "task_project",
      attempt: 1,
      assignedAgentId: "agent-a",
    }, { source: "task_dag_executor", correlationId: "dag_test" });

    expect((await work.board(missionId)).columns.RUNNING.map((task) => task.taskId)).toContain("task_project");

    await eventBus.publish("TASK_COMPLETED", {
      missionId,
      taskId: "task_project",
      attempt: 1,
      assignedAgentId: "agent-a",
    }, { source: "task_dag_executor", correlationId: "dag_test" });

    expect((await work.board(missionId)).columns.DONE.map((task) => task.taskId)).toContain("task_project");
  });

  it("records durable lifecycle events on the mission work item", async () => {
    const { work, eventBus, missionId } = await setup();

    await work.createTask(missionId, {
      taskId: "task_events",
      name: "Eventful",
      ownerAgent: "agent-a",
      capabilityRequired: "TEST",
      expectedOutputType: "RESULT",
    });
    await work.claimTask(missionId, "task_events", "agent-a");
    await work.requestReview(missionId, "task_events", "operator", "agent-a");
    await work.completeTask(missionId, "task_events", "operator");

    const task = (await work.board(missionId)).tasks.find((item) => item.taskId === "task_events");
    expect(task?.workEvents?.map((item) => item.type)).toEqual(
      expect.arrayContaining(["CREATED", "STARTED", "REVIEW_REQUESTED", "COMPLETED"]),
    );

    const events = await eventBus.replay();
    expect(events.some((event) => event.topic === "TASK_REVIEW_REQUESTED")).toBe(true);
    expect(events.some((event) => event.topic === "TASK_COMPLETED")).toBe(true);
  });
});
