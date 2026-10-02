/**
 * FactoryOS Wave 5 — Mission Automation + Fleet Activity store.
 *
 * Recipes define intent. Launching materializes canonical MissionTasks through
 * MissionWorkManager. Nothing here grants execution authority or bypasses FGC/AEF/F07.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Db, Collection } from "mongodb";
import type { DurableEventBus, EventHandler } from "../events/DurableEventBus";
import type { EventEnvelope } from "../contracts/EventContracts";
import type { MissionManager } from "../missions/MissionManager";
import type { MissionWorkManager } from "../work/MissionWorkManager";
import type { AgentWorkforceStore } from "../agent/AgentWorkforceStore";
import type {
  AutomationRecipeCreateInput,
  AutomationRecipeStep,
  AutomationRecipeUpdateInput,
  FleetActivityFilter,
  FleetActivityPage,
  FleetActivityRecord,
  MissionAutomationRecipe,
  RecipeLaunchInput,
  RecipeLaunchRecord,
  AutomationRecipeStatus,
  OrchestrationLaunchState,
} from "./MissionAutomationContracts";

interface RecipeRepository {
  getRecipe(workspaceId: string, recipeId: string): Promise<MissionAutomationRecipe | null>;
  listRecipes(workspaceId: string): Promise<MissionAutomationRecipe[]>;
  saveRecipe(recipe: MissionAutomationRecipe, expectedVersion?: number): Promise<MissionAutomationRecipe>;
  getLaunch(workspaceId: string, launchId: string): Promise<RecipeLaunchRecord | null>;
  getLaunchByIdempotency(workspaceId: string, key: string): Promise<RecipeLaunchRecord | null>;
  listLaunches(workspaceId: string): Promise<RecipeLaunchRecord[]>;
  saveLaunch(launch: RecipeLaunchRecord): Promise<RecipeLaunchRecord>;
  listActivity(workspaceId: string): Promise<FleetActivityRecord[]>;
  saveActivity(activity: FleetActivityRecord): Promise<FleetActivityRecord>;
}

class InMemoryRecipeRepository implements RecipeRepository {
  private readonly recipes = new Map<string, MissionAutomationRecipe>();
  private readonly launches = new Map<string, RecipeLaunchRecord>();
  private readonly activity = new Map<string, FleetActivityRecord>();
  async getRecipe(_: string, id: string) { return structuredClone(this.recipes.get(id) || null); }
  async listRecipes(workspaceId: string) { return [...this.recipes.values()].filter((r) => r.workspaceId === workspaceId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map((r) => structuredClone(r)); }
  async saveRecipe(recipe: MissionAutomationRecipe, expectedVersion?: number) {
    const current = this.recipes.get(recipe.recipeId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("AUTOMATION_RECIPE_VERSION_CONFLICT");
    const next = { ...structuredClone(recipe), version: current ? current.version + 1 : recipe.version, updatedAt: new Date().toISOString() };
    this.recipes.set(next.recipeId, next);
    return structuredClone(next);
  }
  async getLaunch(_: string, id: string) { return structuredClone(this.launches.get(id) || null); }
  async getLaunchByIdempotency(workspaceId: string, key: string) {
    const item = [...this.launches.values()].find((l) => l.workspaceId === workspaceId && l.idempotencyKey === key);
    return structuredClone(item || null);
  }
  async listLaunches(workspaceId: string) { return [...this.launches.values()].filter((l) => l.workspaceId === workspaceId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((l) => structuredClone(l)); }
  async saveLaunch(launch: RecipeLaunchRecord) { this.launches.set(launch.launchId, structuredClone(launch)); return structuredClone(launch); }
  async listActivity(workspaceId: string) { return [...this.activity.values()].filter((a) => a.workspaceId === workspaceId).sort((a,b) => a.timestamp.localeCompare(b.timestamp) || a.activityId.localeCompare(b.activityId)).map((a) => structuredClone(a)); }
  async saveActivity(activity: FleetActivityRecord) { this.activity.set(activity.activityId, structuredClone(activity)); return structuredClone(activity); }
}

class DiskRecipeRepository implements RecipeRepository {
  private readonly root: string;
  constructor(root: string) {
    this.root = path.join(root, "orchestration");
    for (const dir of ["recipes","launches","activity"]) fs.mkdirSync(path.join(this.root, dir), { recursive: true });
  }
  private file(kind: string, id: string) { return path.join(this.root, kind, id.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json"); }
  private read<T>(file: string): T | null { if (!fs.existsSync(file)) return null; try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return null; } }
  private write(kind: string, id: string, value: unknown) { const file = this.file(kind, id), tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8"); fs.renameSync(tmp, file); }
  private list<T>(kind: string): T[] { const dir = path.join(this.root, kind); return fs.readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => this.read<T>(path.join(dir, n))).filter((x): x is T => Boolean(x)); }
  async getRecipe(_: string, id: string) { return this.read<MissionAutomationRecipe>(this.file("recipes", id)); }
  async listRecipes(workspaceId: string) { return this.list<MissionAutomationRecipe>("recipes").filter((r) => r.workspaceId === workspaceId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async saveRecipe(recipe: MissionAutomationRecipe, expectedVersion?: number) { const current = await this.getRecipe(recipe.workspaceId, recipe.recipeId); if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("AUTOMATION_RECIPE_VERSION_CONFLICT"); const next = { ...structuredClone(recipe), version: current ? current.version + 1 : recipe.version, updatedAt: new Date().toISOString() }; this.write("recipes", next.recipeId, next); return structuredClone(next); }
  async getLaunch(_: string, id: string) { return this.read<RecipeLaunchRecord>(this.file("launches", id)); }
  async getLaunchByIdempotency(workspaceId: string, key: string) { return this.list<RecipeLaunchRecord>("launches").find((l) => l.workspaceId === workspaceId && l.idempotencyKey === key) || null; }
  async listLaunches(workspaceId: string) { return this.list<RecipeLaunchRecord>("launches").filter((l) => l.workspaceId === workspaceId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  async saveLaunch(launch: RecipeLaunchRecord) { this.write("launches", launch.launchId, launch); return structuredClone(launch); }
  async listActivity(workspaceId: string) { return this.list<FleetActivityRecord>("activity").filter((a) => a.workspaceId === workspaceId).sort((a,b) => a.timestamp.localeCompare(b.timestamp) || a.activityId.localeCompare(b.activityId)); }
  async saveActivity(activity: FleetActivityRecord) { this.write("activity", activity.activityId, activity); return structuredClone(activity); }
}

class MongoRecipeRepository implements RecipeRepository {
  private readonly recipes: Collection<MissionAutomationRecipe & { _id?: unknown }>;
  private readonly launches: Collection<RecipeLaunchRecord & { _id?: unknown }>;
  private readonly activity: Collection<FleetActivityRecord & { _id?: unknown }>;
  constructor(db: Db) {
    this.recipes = db.collection("mission_automation_recipes");
    this.launches = db.collection("mission_automation_launches");
    this.activity = db.collection("fleet_activity");
  }
  async getRecipe(workspaceId: string, recipeId: string) { const d = await this.recipes.findOne({ workspaceId, recipeId }); if (!d) return null; const { _id, ...rest } = d; return rest as MissionAutomationRecipe; }
  async listRecipes(workspaceId: string) { const ds = await this.recipes.find({ workspaceId }).sort({ updatedAt: -1 }).toArray(); return ds.map(({ _id, ...rest }) => rest as MissionAutomationRecipe); }
  async saveRecipe(recipe: MissionAutomationRecipe, expectedVersion?: number) { const current = await this.getRecipe(recipe.workspaceId, recipe.recipeId); if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("AUTOMATION_RECIPE_VERSION_CONFLICT"); const next = { ...structuredClone(recipe), version: current ? current.version + 1 : recipe.version, updatedAt: new Date().toISOString() }; await this.recipes.replaceOne({ workspaceId: next.workspaceId, recipeId: next.recipeId }, next, { upsert: true }); return structuredClone(next); }
  async getLaunch(workspaceId: string, launchId: string) { const d = await this.launches.findOne({ workspaceId, launchId }); if (!d) return null; const { _id, ...rest } = d; return rest as RecipeLaunchRecord; }
  async getLaunchByIdempotency(workspaceId: string, key: string) { const d = await this.launches.findOne({ workspaceId, idempotencyKey: key }); if (!d) return null; const { _id, ...rest } = d; return rest as RecipeLaunchRecord; }
  async listLaunches(workspaceId: string) { const ds = await this.launches.find({ workspaceId }).sort({ createdAt: -1 }).toArray(); return ds.map(({ _id, ...rest }) => rest as RecipeLaunchRecord); }
  async saveLaunch(launch: RecipeLaunchRecord) { await this.launches.replaceOne({ workspaceId: launch.workspaceId, launchId: launch.launchId }, launch, { upsert: true }); return structuredClone(launch); }
  async listActivity(workspaceId: string) { const ds = await this.activity.find({ workspaceId }).sort({ timestamp: 1, activityId: 1 }).toArray(); return ds.map(({ _id, ...rest }) => rest as FleetActivityRecord); }
  async saveActivity(activity: FleetActivityRecord) { await this.activity.replaceOne({ workspaceId: activity.workspaceId, activityId: activity.activityId }, activity, { upsert: true }); return structuredClone(activity); }
}

export interface MissionAutomationStoreOptions {
  readonly workspaceId?: string;
  readonly eventBus?: DurableEventBus;
  readonly mongoDb?: Db;
  readonly diskPath?: string;
  readonly missionManager: MissionManager;
  readonly workManager: MissionWorkManager;
  readonly workforce?: AgentWorkforceStore;
}

export interface OrchestrationActor {
  readonly actorId: string;
  readonly workspaceRole?: "VIEWER" | "EDITOR" | "ADMIN" | "OWNER";
}

function canMutate(actor: OrchestrationActor): boolean { return actor.workspaceRole === "EDITOR" || actor.workspaceRole === "ADMIN" || actor.workspaceRole === "OWNER"; }
function safeInt(value: unknown, fallback: number, min: number, max: number) { const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback; return Math.min(max, Math.max(min, n)); }
function unique(values: readonly string[]) { return [...new Set(values.map((v) => v.trim()).filter(Boolean))]; }

export class MissionAutomationStore {
  private readonly workspaceId: string;
  private readonly repository: RecipeRepository;
  private readonly eventBus?: DurableEventBus;
  private readonly missions: MissionManager;
  private readonly work: MissionWorkManager;
  private readonly workforce?: AgentWorkforceStore;
  private readonly launchLocks = new Set<string>();
  private unsubscribe?: () => void;

  constructor(options: MissionAutomationStoreOptions) {
    this.workspaceId = options.workspaceId || "factoryos";
    this.eventBus = options.eventBus;
    this.missions = options.missionManager;
    this.work = options.workManager;
    this.workforce = options.workforce;
    this.repository = options.mongoDb ? new MongoRecipeRepository(options.mongoDb) : options.diskPath ? new DiskRecipeRepository(options.diskPath) : new InMemoryRecipeRepository();
    if (this.eventBus) { this.unsubscribe = this.eventBus.subscribeWildcard(this.handleEvent.bind(this) as EventHandler); }
  }

  dispose(): void { this.unsubscribe?.(); this.unsubscribe = undefined; }

  async createRecipe(actor: OrchestrationActor, input: AutomationRecipeCreateInput): Promise<MissionAutomationRecipe> {
    if (!canMutate(actor)) throw new Error("AUTOMATION_RECIPE_MUTATION_FORBIDDEN");
    const steps = this.normalizeSteps(input.steps);
    this.validateSteps(steps);
    const now = new Date().toISOString();
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) throw new Error("AUTOMATION_RECIPE_NAME_INVALID");
    const recipe: MissionAutomationRecipe = {
      recipeId: "recipe_" + randomUUID().replace(/-/g, "").slice(0, 14),
      workspaceId: this.workspaceId,
      name: input.name.trim(),
      description: input.description?.trim() || "",
      ownerId: actor.actorId,
      status: "DRAFT",
      version: 1,
      steps,
      missionDefaults: {
        objective: input.missionDefaults?.objective?.trim(),
        constraints: input.missionDefaults?.constraints ? unique(input.missionDefaults.constraints) : [],
        priority: safeInt(input.missionDefaults?.priority, 2, 1, 5),
        failurePolicy: input.missionDefaults?.failurePolicy || "REPLAN",
        maxTokens: safeInt(input.missionDefaults?.maxTokens, 50000, 1000, 10000000),
        maxCostUsd: typeof input.missionDefaults?.maxCostUsd === "number" && Number.isFinite(input.missionDefaults.maxCostUsd) ? Math.max(0, input.missionDefaults.maxCostUsd) : 0.5,
        maxDurationMs: safeInt(input.missionDefaults?.maxDurationMs, 3600000, 10000, 7 * 24 * 60 * 60 * 1000),
        maxParallelTasks: safeInt(input.missionDefaults?.maxParallelTasks, 5, 1, 100),
      },
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.repository.saveRecipe(recipe);
    await this.publish("AUTOMATION_RECIPE_CREATED", { recipeId: saved.recipeId, workspaceId: saved.workspaceId, version: saved.version, actorId: actor.actorId }, saved.recipeId);
    return saved;
  }

  async updateRecipe(actor: OrchestrationActor, recipeId: string, input: AutomationRecipeUpdateInput): Promise<MissionAutomationRecipe> {
    if (!canMutate(actor)) throw new Error("AUTOMATION_RECIPE_MUTATION_FORBIDDEN");
    const current = await this.repository.getRecipe(this.workspaceId, recipeId);
    if (!current) throw new Error("AUTOMATION_RECIPE_NOT_FOUND");
    if (current.ownerId !== actor.actorId && actor.workspaceRole !== "ADMIN" && actor.workspaceRole !== "OWNER") throw new Error("AUTOMATION_RECIPE_OWNER_REQUIRED");
    if (current.status === "ARCHIVED" && input.status && input.status !== "ARCHIVED") throw new Error("AUTOMATION_RECIPE_ARCHIVED_TERMINAL");
    const steps = input.steps ? this.normalizeSteps(input.steps) : current.steps;
    this.validateSteps(steps);
    const status = input.status || current.status;
    if (status === "PUBLISHED") this.validatePublishable(steps);
    const next: MissionAutomationRecipe = {
      ...current,
      name: input.name?.trim() || current.name,
      description: input.description?.trim() ?? current.description,
      status,
      steps,
      missionDefaults: input.missionDefaults ? { ...current.missionDefaults, ...input.missionDefaults } : current.missionDefaults,
    };
    const saved = await this.repository.saveRecipe(next, input.expectedVersion);
    await this.publish("AUTOMATION_RECIPE_UPDATED", { recipeId: saved.recipeId, status: saved.status, version: saved.version, actorId: actor.actorId }, saved.recipeId);
    return saved;
  }

  async getRecipe(recipeId: string): Promise<MissionAutomationRecipe | null> { return this.repository.getRecipe(this.workspaceId, recipeId); }
  async listRecipes(): Promise<MissionAutomationRecipe[]> { return this.repository.listRecipes(this.workspaceId); }
  async listLaunches(): Promise<RecipeLaunchRecord[]> { return this.repository.listLaunches(this.workspaceId); }

  async launchRecipe(actor: OrchestrationActor, input: RecipeLaunchInput): Promise<RecipeLaunchRecord> {
    if (!canMutate(actor)) throw new Error("AUTOMATION_RECIPE_LAUNCH_FORBIDDEN");
    const recipe = await this.repository.getRecipe(this.workspaceId, input.recipeId);
    if (!recipe) throw new Error("AUTOMATION_RECIPE_NOT_FOUND");
    if (recipe.status !== "PUBLISHED") throw new Error("AUTOMATION_RECIPE_NOT_PUBLISHED");
    const goal = input.goal.trim();
    if (!goal) throw new Error("AUTOMATION_RECIPE_GOAL_REQUIRED");
    if (goal.length > 4000) throw new Error("AUTOMATION_RECIPE_GOAL_TOO_LARGE");
    if (input.idempotencyKey) { const existing = await this.repository.getLaunchByIdempotency(this.workspaceId, input.idempotencyKey); if (existing) return structuredClone(existing); }
    const lockKey = input.idempotencyKey ? `${this.workspaceId}:${input.idempotencyKey}` : undefined;
    if (lockKey && this.launchLocks.has(lockKey)) throw new Error("AUTOMATION_RECIPE_LAUNCH_IN_PROGRESS");
    if (lockKey) this.launchLocks.add(lockKey);
    const launchId = "launch_" + randomUUID().replace(/-/g, "").slice(0, 14);
    const correlationId = `recipe:${recipe.recipeId}:launch:${launchId}`;
    try {
      const agentIds = unique(recipe.steps.map((step) => step.ownerAgent).filter((id) => id.startsWith("agent_")));
      for (const agentId of agentIds) {
        const profile = await this.workforce?.getExecutionProfile(agentId);
        if (!profile) throw new Error(`AUTOMATION_AGENT_UNAVAILABLE:${agentId}`);
      }
      for (const step of recipe.steps) {
        if (step.ownerAgent.startsWith("agent_") && step.capabilityRequired) {
          const profile = await this.workforce?.getExecutionProfile(step.ownerAgent);
          if (!profile?.allowedCapabilities.includes(step.capabilityRequired)) throw new Error(`AUTOMATION_CAPABILITY_UNAVAILABLE:${step.ownerAgent}:${step.capabilityRequired}`);
        }
      }
      const mission = await this.missions.createMission({
        goal,
        objective: recipe.missionDefaults.objective || goal,
        constraints: [...(recipe.missionDefaults.constraints || [])],
        priority: recipe.missionDefaults.priority,
        owner: actor.actorId,
        scope: { agentIds },
        failurePolicy: recipe.missionDefaults.failurePolicy,
        budget: {
          maxTokens: recipe.missionDefaults.maxTokens,
          maxCostUsd: recipe.missionDefaults.maxCostUsd,
          maxDurationMs: recipe.missionDefaults.maxDurationMs,
          maxParallelTasks: recipe.missionDefaults.maxParallelTasks,
        },
      });
      const taskIdsByStep = new Map<string, string>();
      for (const step of this.topologicalSteps(recipe.steps)) {
        const taskId = `recipe_${launchId}_${step.stepId}`;
        const dependencyTaskIds = (step.dependencyStepIds || []).map((dep) => taskIdsByStep.get(dep)!).filter(Boolean);
        await this.work.createTask(mission.missionId, {
          taskId,
          name: step.name,
          executionType: step.executionType || "HYBRID",
          ownerAgent: step.ownerAgent,
          capabilityRequired: step.capabilityRequired,
          input: { ...(step.input || {}), _automation: { recipeId: recipe.recipeId, recipeVersion: recipe.version, launchId, stepId: step.stepId, inputs: input.inputs || {} } },
          expectedOutputType: step.expectedOutputType,
          timeoutMs: safeInt(step.timeoutMs, 300000, 1000, 24 * 60 * 60 * 1000),
          maxRetries: safeInt(step.maxRetries, 2, 0, 5),
          dependencyTaskIds,
          requiresReview: Boolean(step.requiresReview),
          idempotencyKey: `recipe:${recipe.recipeId}:launch:${launchId}:step:${step.stepId}` ,
          workerLane: step.workerLane || step.capabilityRequired,
        }, { actorId: actor.actorId });
        taskIdsByStep.set(step.stepId, taskId);
      }
      let state: OrchestrationLaunchState = "MATERIALIZED";
      if ((input.mode || "CREATE_ONLY") === "START_MISSION") {
        await this.missions.startMission(mission.missionId);
        state = "STARTED";
      }
      const launch: RecipeLaunchRecord = {
        launchId, recipeId: recipe.recipeId, recipeVersion: recipe.version, workspaceId: this.workspaceId, ownerId: actor.actorId, missionId: mission.missionId, taskIds: [...taskIdsByStep.values()], state, mode: input.mode || "CREATE_ONLY", idempotencyKey: input.idempotencyKey, correlationId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      const saved = await this.repository.saveLaunch(launch);
      await this.publish("AUTOMATION_RECIPE_LAUNCHED", { recipeId: recipe.recipeId, recipeVersion: recipe.version, launchId, missionId: mission.missionId, taskIds: launch.taskIds, state, mode: launch.mode, actorId: actor.actorId }, correlationId);
      return saved;
    } catch (error) {
      const failure: RecipeLaunchRecord = { launchId, recipeId: recipe.recipeId, recipeVersion: recipe.version, workspaceId: this.workspaceId, ownerId: actor.actorId, missionId: "", taskIds: [], state: "FAILED", mode: input.mode || "CREATE_ONLY", idempotencyKey: input.idempotencyKey, correlationId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
      await this.repository.saveLaunch(failure).catch(() => {});
      await this.publish("AUTOMATION_RECIPE_LAUNCH_FAILED", { recipeId: recipe.recipeId, launchId, actorId: actor.actorId, error: failure.error }, correlationId);
      throw error;
    } finally { if (lockKey) this.launchLocks.delete(lockKey); }
  }

  async activity(filter: FleetActivityFilter = {}): Promise<FleetActivityPage> {
    const limit = safeInt(filter.limit, 100, 1, 200);
    const all = (await this.repository.listActivity(this.workspaceId)).filter((item) => {
      if (filter.missionId && item.missionId !== filter.missionId) return false;
      if (filter.agentId && item.agentId !== filter.agentId) return false;
      if (filter.topics?.length && !filter.topics.includes(item.topic)) return false;
      return true;
    });
    const start = filter.cursor ? all.findIndex((item) => this.cursor(item) === filter.cursor) + 1 : 0;
    const items = all.slice(Math.max(0, start), Math.max(0, start) + limit);
    return { items, nextCursor: items.length === limit && start + items.length < all.length ? this.cursor(items[items.length - 1]) : undefined };
  }

  private async handleEvent(event: EventEnvelope): Promise<void> {
    const payload = (event as any)?.payload || event as any;
    const missionId = typeof payload?.missionId === "string" ? payload.missionId : undefined;
    const taskId = typeof payload?.taskId === "string" ? payload.taskId : undefined;
    const agentId = this.findAgentId(payload);
    const summary = this.summary(event.topic, payload);
    const activity: FleetActivityRecord = {
      activityId: event.eventId, workspaceId: this.workspaceId, missionId, taskId, agentId, source: event.source, topic: event.topic, summary, correlationId: event.correlationId, timestamp: event.timestamp, metadata: this.safeMetadata(payload),
    };
    await this.repository.saveActivity(activity);
  }

  private summary(topic: string, payload: any): string {
    const candidate = [payload?.summary, payload?.message, payload?.reason, payload?.error, payload?.status].find((v) => typeof v === "string" && v.trim());
    return String(candidate || topic).slice(0, 280);
  }

  private findAgentId(payload: any): string | undefined {
    for (const key of ["agentId","assignedAgentId","workerId","ownerAgent","principalId"]) { const value = payload?.[key]; if (typeof value === "string" && value.trim()) return value; }
    return undefined;
  }

  private safeMetadata(payload: any): Record<string, unknown> | undefined {
    const allowed = ["attempt","state","status","phase","capability","capabilityRequired","dagId","recipeId","launchId","stepId","deliveryState","delegationId"];
    const result: Record<string, unknown> = {};
    for (const key of allowed) { const value = payload?.[key]; if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value; }
    return Object.keys(result).length ? result : undefined;
  }

  private cursor(item: FleetActivityRecord): string { return Buffer.from(`${item.timestamp}|${item.activityId}`).toString("base64url"); }

  private normalizeSteps(input: readonly AutomationRecipeStep[]): AutomationRecipeStep[] {
    if (!Array.isArray(input) || input.length === 0 || input.length > 50) throw new Error("AUTOMATION_RECIPE_STEP_COUNT_INVALID");
    return input.map((step) => ({
      ...step, stepId: String(step.stepId || "").trim(), name: String(step.name || "").trim(), ownerAgent: String(step.ownerAgent || "").trim(), capabilityRequired: String(step.capabilityRequired || "").trim(), expectedOutputType: String(step.expectedOutputType || "").trim(), executionType: step.executionType || "HYBRID", dependencyStepIds: unique(step.dependencyStepIds || []), input: step.input ? structuredClone(step.input) : {}, timeoutMs: safeInt(step.timeoutMs, 300000, 1000, 24 * 60 * 60 * 1000), maxRetries: safeInt(step.maxRetries, 2, 0, 5), requiresReview: Boolean(step.requiresReview), workerLane: step.workerLane?.trim() || undefined,
    }));
  }

  private validateSteps(steps: readonly AutomationRecipeStep[]): void {
    if (steps.some((step) => !step.stepId || step.stepId.length > 100 || !step.name || step.name.length > 200 || !step.ownerAgent || !step.capabilityRequired || !step.expectedOutputType)) throw new Error("AUTOMATION_RECIPE_STEP_INVALID");
    const ids = new Set<string>(); for (const step of steps) { if (ids.has(step.stepId)) throw new Error(`AUTOMATION_RECIPE_DUPLICATE_STEP:${step.stepId}`); ids.add(step.stepId); }
    for (const step of steps) for (const dep of step.dependencyStepIds || []) { if (dep === step.stepId) throw new Error(`AUTOMATION_RECIPE_SELF_DEPENDENCY:${dep}`); if (!ids.has(dep)) throw new Error(`AUTOMATION_RECIPE_UNKNOWN_DEPENDENCY:${step.stepId}:${dep}`); }
    this.topologicalSteps(steps);
  }

  private validatePublishable(steps: readonly AutomationRecipeStep[]): void {
    this.validateSteps(steps);
    for (const step of steps) { if (step.ownerAgent.startsWith("agent_")) { if (!this.workforce) throw new Error("AUTOMATION_WORKFORCE_REQUIRED"); } }
  }

  private topologicalSteps(steps: readonly AutomationRecipeStep[]): AutomationRecipeStep[] {
    const byId = new Map(steps.map((step) => [step.stepId, step]));
    const state = new Map<string, 0 | 1 | 2>();
    const result: AutomationRecipeStep[] = [];
    const visit = (id: string) => {
      const current = state.get(id) || 0;
      if (current === 1) throw new Error(`AUTOMATION_RECIPE_CYCLE:${id}`);
      if (current === 2) return;
      state.set(id, 1);
      for (const dep of byId.get(id)?.dependencyStepIds || []) visit(dep);
      state.set(id, 2);
      const item = byId.get(id); if (item) result.push(item);
    };
    for (const step of steps) visit(step.stepId);
    return result;
  }

  private async publish(topic: string, payload: Record<string, unknown>, correlationId: string): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(topic as any, payload, { source: "mission_automation_store", correlationId, idempotencyKey: `${correlationId}:${topic}` });
  }
}