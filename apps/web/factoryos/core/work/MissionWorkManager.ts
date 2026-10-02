/**
 * FactoryOS Wave 2 — Durable Mission Work Manager
 *
 * Human-facing work coordination kernel inspired by durable Kanban systems.
 * It manages MissionTask lifecycle metadata and leases while preserving:
 *   Mission/MissionTask = work metadata
 *   TaskDAG/AEF      = execution machinery
 *   FGC               = authorization boundary
 *   F07               = production truth
 */

import { randomUUID } from "node:crypto";
import type {
  MissionTask,
  MissionTaskAttempt,
  MissionTaskWorkEvent,
  MissionTaskWorkState,
} from "../contracts/MissionContracts";
import type { MissionTask as MissionTaskType } from "../contracts/MissionContracts";
import type { MissionManager } from "../missions/MissionManager";
import type { LeaseManager } from "../leases/LeaseManager";
import type { TaskLease } from "../database/DatabaseContracts";

export interface WorkTaskCreateInput {
  readonly taskId?: string;
  readonly name: string;
  readonly executionType?: MissionTaskType["executionType"];
  readonly ownerAgent: string;
  readonly capabilityRequired: string;
  readonly input?: Record<string, unknown>;
  readonly expectedOutputType: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly dependencyTaskIds?: string[];
  readonly requiresReview?: boolean;
  readonly idempotencyKey?: string;
  readonly workerLane?: string;
}

export interface WorkTaskActor {
  readonly actorId: string;
}

export interface WorkTaskCard extends MissionTask {
  readonly resolvedWorkState: MissionTaskWorkState;
  readonly dependencies: Array<{
    taskId: string;
    state: MissionTaskWorkState;
    satisfied: boolean;
  }>;
  readonly ready: boolean;
  readonly lease: TaskLease | null;
}

export interface MissionWorkBoardSnapshot {
  readonly missionId: string;
  readonly missionStatus: string;
  readonly goal: string;
  readonly columns: Record<MissionTaskWorkState, WorkTaskCard[]>;
  readonly tasks: WorkTaskCard[];
  readonly recentActivity: MissionTaskWorkEvent[];
}

const TERMINAL = new Set<MissionTaskWorkState>(["DONE", "FAILED", "ARCHIVED"]);

function legacyStatus(state: MissionTaskWorkState): MissionTask["status"] {
  switch (state) {
    case "RUNNING": return "RUNNING";
    case "DONE": return "COMPLETED";
    case "FAILED":
    case "ARCHIVED": return "FAILED" === state ? "FAILED" : "COMPLETED";
    default: return "PENDING";
  }
}

function normalizedState(task: MissionTask): MissionTaskWorkState {
  if (task.workState) return task.workState;
  switch (task.status) {
    case "RUNNING": return "RUNNING";
    case "COMPLETED": return "DONE";
    case "FAILED": return "FAILED";
    default: return (task.dependencyTaskIds?.length || 0) > 0 ? "TODO" : "READY";
  }
}

export class MissionWorkManager {
  constructor(
    private readonly missions: MissionManager,
    private readonly leases: LeaseManager,
  ) {}

  async createTask(
    missionId: string,
    input: WorkTaskCreateInput,
    actor: WorkTaskActor = { actorId: "operator" },
  ): Promise<MissionTask> {
    const taskId = input.taskId || `work_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const dependencies = [...(input.dependencyTaskIds || [])];

    return this.missions.createMissionTask(
      missionId,
      {
        taskId,
        name: input.name,
        executionType: input.executionType || "HYBRID",
        ownerAgent: input.ownerAgent,
        capabilityRequired: input.capabilityRequired,
        input: input.input || {},
        expectedOutputType: input.expectedOutputType,
        timeoutMs: input.timeoutMs || 300000,
        maxRetries: input.maxRetries ?? 2,
        dependencyTaskIds: dependencies,
        requiresReview: input.requiresReview ?? false,
        idempotencyKey: input.idempotencyKey,
        workState: dependencies.length === 0 ? "READY" : "TODO",
        workerLane: input.workerLane,
      } as any,
      actor.actorId,
    );
  }

  async board(missionId: string): Promise<MissionWorkBoardSnapshot> {
    const mission = await this.missions.getMission(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found.`);

    const tasks = await this.missions.getMissionTasks(missionId);
    const byId = new Map(tasks.map((task) => [task.taskId, task]));

    const cards: WorkTaskCard[] = await Promise.all(
      tasks.map(async (task) => {
        const state = normalizedState(task);
        const dependencies = (task.dependencyTaskIds || []).map((dependencyId) => {
          const dependency = byId.get(dependencyId);
          const dependencyState = dependency ? normalizedState(dependency) : "FAILED";
          return {
            taskId: dependencyId,
            state: dependencyState,
            satisfied: dependencyState === "DONE" || dependencyState === "ARCHIVED",
          };
        });
        const ready = !dependencies.some((dependency) => !dependency.satisfied)
          && !TERMINAL.has(state)
          && task.circuitState !== "OPEN";

        return {
          ...structuredClone(task),
          workState: state,
          status: legacyStatus(state),
          resolvedWorkState: state,
          dependencies,
          ready,
          lease: await this.leases.getLease(task.taskId),
        };
      }),
    );

    const columns: Record<MissionTaskWorkState, WorkTaskCard[]> = {
      TODO: [],
      READY: [],
      RUNNING: [],
      BLOCKED: [],
      REVIEW: [],
      DONE: [],
      FAILED: [],
      ARCHIVED: [],
    };

    for (const card of cards) {
      columns[card.resolvedWorkState].push(card);
    }

    const recentActivity = tasks
      .flatMap((task) => task.workEvents || [])
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 50);

    return {
      missionId,
      missionStatus: mission.status,
      goal: mission.goal,
      columns,
      tasks: cards,
      recentActivity,
    };
  }

  async claimTask(
    missionId: string,
    taskId: string,
    agentId: string,
    ttlMs = 60000,
  ): Promise<MissionTask> {
    const task = await this.missions.getMissionTask(missionId, taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    const state = normalizedState(task);
    if (state !== "READY") {
      throw new Error(`Task ${taskId} is not ready for claim; current state is ${state}.`);
    }

    const board = await this.board(missionId);
    const card = board.tasks.find((item) => item.taskId === taskId);
    if (!card?.ready) {
      throw new Error(`Task ${taskId} is waiting on unresolved dependencies or an open circuit breaker.`);
    }

    const attempt = (task.retryCount || 0) + 1;
    const acquired = await this.leases.acquire(taskId, agentId, ttlMs, attempt);
    if (!acquired) {
      throw new Error(`Task ${taskId} is already leased by another worker.`);
    }

    const now = new Date().toISOString();
    return this.mutate(missionId, taskId, "RUNNING", agentId, (current) => {
      const attempts: MissionTaskAttempt[] = [...(current.attempts || [])];
      attempts.push({
        attempt,
        startedAt: now,
        workerId: agentId,
        outcome: "RUNNING",
      });
      current.workState = "RUNNING";
      current.assignedAt = now;
      current.lastHeartbeatAt = now;
      current.attempts = attempts.slice(-20);
      current.error = undefined;
      current.blockedReason = undefined;
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "STARTED", agentId, now, `Task claimed by ${agentId}`, {
          attempt,
          leaseMs: ttlMs,
        }),
      ].slice(-100);
    });
  }

  async heartbeatTask(
    missionId: string,
    taskId: string,
    agentId: string,
    ttlMs = 60000,
  ): Promise<MissionTask> {
    const renewed = await this.leases.heartbeat(taskId, agentId, ttlMs);
    if (!renewed) throw new Error(`Active lease for task ${taskId} was not found for ${agentId}.`);

    const now = new Date().toISOString();
    return this.mutate(missionId, taskId, "RUNNING", agentId, (current) => {
      current.lastHeartbeatAt = now;
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "HEARTBEAT", agentId, now, `Worker heartbeat from ${agentId}`, { leaseMs: ttlMs }),
      ].slice(-100);
    });
  }

  async requestReview(
    missionId: string,
    taskId: string,
    reviewerId: string | undefined,
    actorId = "worker",
    summary = "Work is ready for review.",
  ): Promise<MissionTask> {
    const now = new Date().toISOString();
    return this.mutate(missionId, taskId, "REVIEW", actorId, (current) => {
      if (normalizedState(current) !== "RUNNING") {
        throw new Error(`Task ${taskId} must be RUNNING before review can be requested.`);
      }
      current.workState = "REVIEW";
      current.review = {
        requestedAt: now,
        requestedBy: actorId,
        reviewerId,
        summary,
      };
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "REVIEW_REQUESTED", actorId, now, summary, { reviewerId }),
      ].slice(-100);
    });
  }

  async requestChanges(
    missionId: string,
    taskId: string,
    actorId: string,
    reason: string,
  ): Promise<MissionTask> {
    const now = new Date().toISOString();
    return this.mutate(missionId, taskId, "READY", actorId, (current) => {
      if (normalizedState(current) !== "REVIEW") {
        throw new Error(`Task ${taskId} must be in REVIEW before changes can be requested.`);
      }
      current.workState = "READY";
      current.review = {
        ...(current.review || {
          requestedAt: now,
          requestedBy: actorId,
        }),
        changesRequested: reason,
        resolvedAt: now,
      };
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "CHANGES_REQUESTED", actorId, now, reason),
      ].slice(-100);
    });
  }

  async completeTask(
    missionId: string,
    taskId: string,
    actorId = "worker",
    summary = "Task completed.",
  ): Promise<MissionTask> {
    const now = new Date().toISOString();
    const result = await this.mutate(missionId, taskId, "DONE", actorId, (current) => {
      const state = normalizedState(current);
      if (state === "DONE" || state === "ARCHIVED") return;
      if (current.requiresReview && state !== "REVIEW") {
        throw new Error(`Task ${taskId} requires review before completion.`);
      }
      if (!["READY", "RUNNING", "REVIEW"].includes(state)) {
        throw new Error(`Task ${taskId} cannot complete from ${state}.`);
      }
      current.workState = "DONE";
      current.completedAt = now;
      current.error = undefined;
      if (current.attempts?.length) {
        const attempts = [...current.attempts];
        const latest = attempts[attempts.length - 1];
        attempts[attempts.length - 1] = {
          ...latest,
          finishedAt: now,
          outcome: "COMPLETED",
        };
        current.attempts = attempts;
      }
      if (current.review) current.review = { ...current.review, resolvedAt: now };
      current.failureStreak = 0;
      current.circuitState = "CLOSED";
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "COMPLETED", actorId, now, summary),
      ].slice(-100);
    });

    await this.releaseLeaseIfOwned(taskId, actorId);
    await this.refreshReadiness(missionId, actorId);
    return result;
  }

  async failTask(
    missionId: string,
    taskId: string,
    actorId: string,
    reason: string,
  ): Promise<MissionTask> {
    const now = new Date().toISOString();
    let exhausted = false;

    const result = await this.mutate(missionId, taskId, "FAILED", actorId, (current) => {
      const nextRetryCount = (current.retryCount || 0) + 1;
      const nextFailureStreak = (current.failureStreak || 0) + 1;
      exhausted =
        nextRetryCount > current.maxRetries ||
        nextFailureStreak >= 3;

      current.retryCount = nextRetryCount;
      current.failureStreak = nextFailureStreak;
      current.error = reason;

      if (current.attempts?.length) {
        const attempts = [...current.attempts];
        const latest = attempts[attempts.length - 1];
        attempts[attempts.length - 1] = {
          ...latest,
          finishedAt: now,
          outcome: "FAILED",
          error: reason,
        };
        current.attempts = attempts;
      }

      if (exhausted) {
        current.workState = "FAILED";
        current.circuitState = nextFailureStreak >= 3 ? "OPEN" : "CLOSED";
        current.blockedReason = reason;
        current.workEvents = [
          ...(current.workEvents || []),
          this.event(current, "FAILED", actorId, now, `Task failed permanently: ${reason}`, {
            retryCount: nextRetryCount,
            failureStreak: nextFailureStreak,
            circuitState: current.circuitState,
          }),
        ].slice(-100);
      } else {
        current.workState = "READY";
        current.workEvents = [
          ...(current.workEvents || []),
          this.event(current, "FAILED", actorId, now, reason, {
            retryCount: nextRetryCount,
            remainingRetries: Math.max(0, current.maxRetries - nextRetryCount + 1),
          }),
          this.event(current, "RETRY_SCHEDULED", actorId, now, "Bounded retry scheduled."),
        ].slice(-100);
      }
    });

    await this.releaseLeaseIfOwned(taskId, actorId);
    return result;
  }

  async blockTask(missionId: string, taskId: string, actorId: string, reason: string): Promise<MissionTask> {
    const now = new Date().toISOString();
    return this.mutate(missionId, taskId, "BLOCKED", actorId, (current) => {
      if (TERMINAL.has(normalizedState(current))) {
        throw new Error(`Task ${taskId} is terminal.`);
      }
      current.workState = "BLOCKED";
      current.blockedReason = reason;
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "BLOCKED", actorId, now, reason),
      ].slice(-100);
    });
  }

  async unblockTask(missionId: string, taskId: string, actorId: string): Promise<MissionTask> {
    const now = new Date().toISOString();
    const board = await this.board(missionId);
    const card = board.tasks.find((item) => item.taskId === taskId);
    if (!card) throw new Error(`Task ${taskId} not found.`);

    const canRun = card.dependencies.every((dependency) => dependency.satisfied);
    const nextState = canRun && card.circuitState !== "OPEN" ? "READY" : "TODO";

    return this.mutate(missionId, taskId, nextState, actorId, (current) => {
      current.workState = nextState;
      current.blockedReason = undefined;
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "UNBLOCKED", actorId, now, `Task unblocked; state=${nextState}`),
      ].slice(-100);
    });
  }

  async archiveTask(missionId: string, taskId: string, actorId = "operator"): Promise<MissionTask> {
    const now = new Date().toISOString();
    return this.mutate(missionId, taskId, "ARCHIVED", actorId, (current) => {
      const state = normalizedState(current);
      if (!["DONE", "FAILED"].includes(state)) {
        throw new Error(`Task ${taskId} can only be archived from DONE or FAILED.`);
      }
      current.workState = "ARCHIVED";
      current.archivedAt = now;
      current.workEvents = [
        ...(current.workEvents || []),
        this.event(current, "ARCHIVED", actorId, now, "Task archived."),
      ].slice(-100);
    });
  }

  async reclaimExpired(missionId: string, actorId = "work-watchdog"): Promise<MissionTask[]> {
    const tasks = await this.missions.getMissionTasks(missionId);
    const reclaimed: MissionTask[] = [];

    for (const task of tasks) {
      if (normalizedState(task) !== "RUNNING") continue;
      const lease = await this.leases.getLease(task.taskId);
      if (!lease) continue;
      if (lease.status === "ACTIVE" && new Date(lease.leaseExpiresAt).getTime() > Date.now()) continue;

      const now = new Date().toISOString();
      let nextTask: MissionTask | null = null;
      const updated = await this.missions.updateMissionTask(missionId, task.taskId, (current) => {
        const nextRetry = (current.retryCount || 0) + 1;
        const nextStreak = (current.failureStreak || 0) + 1;
        const permanent = nextRetry > current.maxRetries || nextStreak >= 3;

        current.retryCount = nextRetry;
        current.failureStreak = nextStreak;
        current.workState = permanent ? "FAILED" : "READY";
        current.circuitState = permanent && nextStreak >= 3 ? "OPEN" : (current.circuitState || "CLOSED");
        current.blockedReason = permanent ? "Worker lease expired without completion." : undefined;
        current.lastHeartbeatAt = now;
        current.workEvents = [
          ...(current.workEvents || []),
          this.event(current, "RECLAIMED", actorId, now, "Expired worker lease reclaimed.", {
            previousOwnerAgentId: lease.ownerAgentId,
            fencingToken: lease.fencingToken,
            retryCount: nextRetry,
          }),
          ...(permanent
            ? [this.event(current, "FAILED", actorId, now, "Circuit breaker exhausted after lease loss.")]
            : [this.event(current, "RETRY_SCHEDULED", actorId, now, "Task returned to READY after lease loss.")]),
        ].slice(-100);
        if (current.attempts?.length) {
          const attempts = [...current.attempts];
          const latest = attempts[attempts.length - 1];
          attempts[attempts.length - 1] = {
            ...latest,
            finishedAt: now,
            outcome: "RECLAIMED",
          };
          current.attempts = attempts;
        }
        nextTask = structuredClone(current);
      });

      await this.releaseLeaseIfOwned(task.taskId, lease.ownerAgentId);
      reclaimed.push(nextTask || updated);
    }

    await this.refreshReadiness(missionId, actorId);
    return reclaimed;
  }

  async refreshReadiness(missionId: string, actorId = "work-kernel"): Promise<MissionTask[]> {
    const tasks = await this.missions.getMissionTasks(missionId);
    const byId = new Map(tasks.map((task) => [task.taskId, task]));
    const changed: MissionTask[] = [];

    for (const task of tasks) {
      if (normalizedState(task) !== "TODO") continue;
      const dependencies = task.dependencyTaskIds || [];
      const satisfied = dependencies.every((dependencyId) => {
        const dependency = byId.get(dependencyId);
        const state = dependency ? normalizedState(dependency) : "FAILED";
        return state === "DONE" || state === "ARCHIVED";
      });
      if (!satisfied) continue;

      const now = new Date().toISOString();
      const updated = await this.missions.updateMissionTask(missionId, task.taskId, (current) => {
        current.workState = "READY";
        current.blockedReason = undefined;
        current.workEvents = [
          ...(current.workEvents || []),
          this.event(current, "READY", actorId, now, "Dependencies satisfied; task promoted to READY.", {
            dependencyTaskIds: current.dependencyTaskIds || [],
          }),
        ].slice(-100);
      });
      changed.push(updated);
    }

    return changed;
  }

  private async mutate(
    missionId: string,
    taskId: string,
    _requestedState: MissionTaskWorkState,
    actorId: string,
    mutate: (task: MissionTask) => void | Promise<void>,
  ): Promise<MissionTask> {
    return this.missions.updateMissionTask(missionId, taskId, async (current) => {
      await mutate(current);
    });
  }

  private event(
    task: MissionTask,
    type: MissionTaskWorkEvent["type"],
    actorId: string,
    timestamp: string,
    summary?: string,
    metadata?: Record<string, unknown>,
  ): MissionTaskWorkEvent {
    return {
      eventId: `workevt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      taskId: task.taskId,
      missionId: task.missionId,
      type,
      actorId,
      timestamp,
      summary,
      metadata,
    };
  }

  private async releaseLeaseIfOwned(taskId: string, ownerAgentId: string): Promise<void> {
    const lease = await this.leases.getLease(taskId);
    if (lease && lease.ownerAgentId === ownerAgentId && lease.status === "ACTIVE") {
      await this.leases.release(taskId, ownerAgentId);
    }
  }
}
