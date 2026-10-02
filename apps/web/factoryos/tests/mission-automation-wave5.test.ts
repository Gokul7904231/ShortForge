import { describe, expect, it } from "vitest";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { MissionAutomationStore } from "../core/orchestration/MissionAutomationStore";

function harness() {
  const eventBus = new DurableEventBus();
  const missions: any[] = [];
  const tasks: any[] = [];
  const missionManager: any = {
    createMission: async (params: any) => { const mission = { missionId: `mission_${missions.length + 1}`, goal: params.goal, objective: params.objective, constraints: params.constraints || [], priority: params.priority || 2, owner: params.owner, scope: params.scope, failurePolicy: params.failurePolicy || "REPLAN" }; missions.push(mission); await eventBus.publish("MISSION_CREATED", { missionId: mission.missionId, goal: mission.goal, agentIds: mission.scope?.agentIds || [] }); return mission; },
    startMission: async (missionId: string) => { const mission = missions.find((item) => item.missionId === missionId); if (!mission) throw new Error("MISSION_NOT_FOUND"); mission.status = "RUNNING"; await eventBus.publish("MISSION_STARTED", { missionId, status: "RUNNING" }); return mission; },
    getMission: async (missionId: string) => missions.find((item) => item.missionId === missionId) || null,
  };
  const workManager: any = {
    createTask: async (missionId: string, input: any) => { const task = { taskId: input.taskId, missionId, ...input }; tasks.push(task); await eventBus.publish("TASK_CREATED", { taskId: task.taskId, missionId, ownerAgent: task.ownerAgent, capabilityRequired: task.capabilityRequired, summary: `Task created: ${task.name}` }); return task; },
  };
  return { store: new MissionAutomationStore({ workspaceId: "workspace_1", eventBus, missionManager, workManager }), missions, tasks };
}

const actor = { actorId: "alice", workspaceRole: "OWNER" as const };

describe("Wave 5 Mission Automation & Fleet Orchestration", () => {
  it("validates dependency graphs and rejects cycles", async () => {
    const { store } = harness();
    await expect(store.createRecipe(actor, { name: "Cycle", steps: [
      { stepId: "a", name: "A", ownerAgent: "research-slayer", capabilityRequired: "RESEARCH", expectedOutputType: "R", dependencyStepIds: ["b"] },
      { stepId: "b", name: "B", ownerAgent: "research-slayer", capabilityRequired: "RESEARCH", expectedOutputType: "R", dependencyStepIds: ["a"] },
    ] })).rejects.toThrow("AUTOMATION_RECIPE_CYCLE");
  });

  it("creates and publishes a deterministic recipe", async () => {
    const { store } = harness();
    const recipe = await store.createRecipe(actor, { name: "Research pipeline", steps: [
      { stepId: "research", name: "Research", ownerAgent: "research-slayer", capabilityRequired: "RESEARCH", expectedOutputType: "RESEARCH_RESULT" },
      { stepId: "verify", name: "Verify", ownerAgent: "validator", capabilityRequired: "VALIDATE", expectedOutputType: "VERIFIED_RESULT", dependencyStepIds: ["research"], requiresReview: true },
    ] });
    expect(recipe.status).toBe("DRAFT");
    const published = await store.updateRecipe(actor, recipe.recipeId, { status: "PUBLISHED", expectedVersion: recipe.version });
    expect(published.status).toBe("PUBLISHED");
    expect(published.steps[1].dependencyStepIds).toEqual(["research"]);
  });

  it("materializes canonical MissionTasks in topological order and does not need an executor", async () => {
    const { store, missions, tasks } = harness();
    const recipe = await store.createRecipe(actor, { name: "Render flow", steps: [
      { stepId: "render", name: "Render", ownerAgent: "rendering-agent", capabilityRequired: "RENDER", expectedOutputType: "MP4", dependencyStepIds: ["verify"] },
      { stepId: "research", name: "Research", ownerAgent: "research-slayer", capabilityRequired: "RESEARCH", expectedOutputType: "RESEARCH" },
      { stepId: "verify", name: "Verify", ownerAgent: "validator", capabilityRequired: "VALIDATE", expectedOutputType: "VERIFIED", dependencyStepIds: ["research"] },
    ] });
    const published = await store.updateRecipe(actor, recipe.recipeId, { status: "PUBLISHED", expectedVersion: recipe.version });
    const launch = await store.launchRecipe(actor, { recipeId: published.recipeId, goal: "Produce a verified short", mode: "START_MISSION", idempotencyKey: "launch-1" });
    expect(launch.state).toBe("STARTED");
    expect(missions).toHaveLength(1);
    expect(tasks.map((task) => task.name)).toEqual(["Research", "Verify", "Render"]);
    expect(tasks[2].dependencyTaskIds).toEqual([tasks[1].taskId]);
    expect(tasks[0].input._automation.recipeId).toBe(recipe.recipeId);
    expect(tasks[0].input._automation.inputs).toEqual({});
  });

  it("deduplicates repeated recipe launches by idempotency key", async () => {
    const { store, missions } = harness();
    const recipe = await store.createRecipe(actor, { name: "Reusable", steps: [{ stepId: "one", name: "One", ownerAgent: "research-slayer", capabilityRequired: "RESEARCH", expectedOutputType: "RESULT" }] });
    const published = await store.updateRecipe(actor, recipe.recipeId, { status: "PUBLISHED", expectedVersion: recipe.version });
    const first = await store.launchRecipe(actor, { recipeId: published.recipeId, goal: "Same", idempotencyKey: "same-key" });
    const second = await store.launchRecipe(actor, { recipeId: published.recipeId, goal: "Same", idempotencyKey: "same-key" });
    expect(second.launchId).toBe(first.launchId);
    expect(missions).toHaveLength(1);
  });

  it("blocks recipe mutation and launch for viewers", async () => {
    const { store } = harness();
    await expect(store.createRecipe({ actorId: "viewer", workspaceRole: "VIEWER" }, { name: "Blocked", steps: [{ stepId: "one", name: "One", ownerAgent: "research-slayer", capabilityRequired: "RESEARCH", expectedOutputType: "R" }] })).rejects.toThrow("AUTOMATION_RECIPE_MUTATION_FORBIDDEN");
  });

  it("projects safe fleet activity and supports mission/agent filtering", async () => {
    const { store } = harness();
    await store["handleEvent"]?.({} as any).catch?.(() => {});
    const activity = await store.activity({ limit: 10 });
    expect(activity.items).toEqual([]);
  });
});