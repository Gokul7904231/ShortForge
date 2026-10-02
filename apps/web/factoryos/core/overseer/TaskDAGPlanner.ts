/**
 * FactoryOS v1 — Task DAG Planner & Parallel Asynchronous Executor
 */

import { randomUUID } from "node:crypto";
import type { TaskDAG, TaskNode, TaskStatus } from "../contracts/OverseerThinkingContracts";
import type { ITaskDAGRepository } from "../database/DatabaseContracts";
import { InMemoryTaskDAGRepository } from "../database/InMemoryDatabase";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { LeaseManager } from "../leases/LeaseManager";

import { FloorRegistry } from "../hierarchy/FloorRegistry";

export type TaskExecutorFunction = (node: TaskNode) => Promise<Record<string, unknown>>;

export class TaskDAGPlanner {
  createDAG(goalId: string, nodes: TaskNode[]): TaskDAG {
    const dagId = `dag_${randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const nodeMap: Record<string, TaskNode> = {};
    const rootTaskIds: string[] = [];

    for (const node of nodes) {
      nodeMap[node.taskId] = structuredClone(node);
      if (node.dependencies.length === 0) {
        rootTaskIds.push(node.taskId);
      }
    }

    return {
      dagId,
      goalId,
      nodes: nodeMap,
      rootTaskIds,
      createdAt: new Date().toISOString(),
      status: "PENDING",
    };
  }

  /**
   * Canonical 8-Floor Production DAG Generator
   * Topology: F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07
   * Derives structure directly from authoritative FloorRegistry.
   */
  createEightFloorProductionDAG(goalId: string, initialPayload: Record<string, unknown> = {}): TaskDAG {
    const allFloors = FloorRegistry.getAllFloors();
    const nodes: TaskNode[] = allFloors.map((floor) => {
      // Preserve the executor's canonical task identity while deriving topology
      // from FloorRegistry. This avoids legacy F00 task-id drift without coupling
      // the registry itself to runtime naming.
      const runtimeFloorId = floor.floorId.replace(/^floor/, "f");
      const taskId = `task_${runtimeFloorId}`;
      const dependencies = floor.predecessors.map((p) => `task_${p.replace(/^floor/, "f")}`);
      return {
        taskId,
        name: floor.canonicalName,
        description: `Autonomous execution for ${floor.canonicalName} (${floor.floorId})`,
        requiredAgentType: floor.requiredAgentType,
        payload: floor.number === 0 ? initialPayload : {},
        status: "PENDING",
        dependencies,
        attemptCount: 0,
        maxAttempts: 2,
      };
    });

    return this.createDAG(goalId, nodes);
  }

  /**
   * @deprecated Use createEightFloorProductionDAG instead. Retained for backward compatibility.
   */
  createSixFloorProductionDAG(goalId: string, initialPayload: Record<string, unknown> = {}): TaskDAG {
    return this.createEightFloorProductionDAG(goalId, initialPayload);
  }
}

export class TaskDAGExecutor {
  private repository: ITaskDAGRepository;
  private eventBus?: DurableEventBus;
  private leaseManager?: LeaseManager;

  constructor(
    repository: ITaskDAGRepository = new InMemoryTaskDAGRepository(),
    eventBus?: DurableEventBus,
    leaseManager?: LeaseManager
  ) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.leaseManager = leaseManager;
  }

  async executeDAG(
    dag: TaskDAG,
    executors: Record<string, TaskExecutorFunction>,
    options?: { maxParallelTasks?: number; executionTimeoutMs?: number; missionId?: string }
  ): Promise<TaskDAG> {
    dag.status = "RUNNING";
    await this.repository.saveDAG(dag);

    const maxParallel = options?.maxParallelTasks && options.maxParallelTasks > 0 ? options.maxParallelTasks : Infinity;
    const executionTimeoutMs =
      options?.executionTimeoutMs && options.executionTimeoutMs > 0
        ? Math.min(Math.max(options.executionTimeoutMs, 5_000), 300_000)
        : 60_000;

    while (dag.status === "RUNNING") {
      const readyNodes = this.findReadyNodes(dag);

      if (readyNodes.length === 0) {
        // Check if all nodes are succeeded
        const allNodes = Object.values(dag.nodes);
        const hasFailed = allNodes.some((n) => n.status === "FAILED");
        const allCompleted = allNodes.every((n) => n.status === "SUCCEEDED" || n.status === "CANCELLED");

        if (hasFailed) {
          dag.status = "FAILED";
        } else if (allCompleted) {
          dag.status = "COMPLETED";
        } else {
          // Deadlock or waiting
          dag.status = "FAILED";
        }
        break;
      }

      // Enforce maxParallelTasks limit by batching ready nodes
      const nodesToRun = readyNodes.slice(0, maxParallel);

      // Execute ready nodes in parallel up to limit
      await Promise.all(
        nodesToRun.map(async (node) => {
          node.status = "RUNNING";
          node.startedAt = new Date().toISOString();
          node.attemptCount += 1;
          await this.repository.updateTaskNode(dag.dagId, node);

          const workerId = node.assignedAgentId || "dag_worker";
          let leaseAcquired = true;
          let heartbeatTimer: NodeJS.Timeout | null = null;
          const leaseTtlMs = 60000;

          if (this.leaseManager) {
            leaseAcquired = await this.leaseManager.acquire(
              node.taskId,
              workerId,
              leaseTtlMs,
              node.attemptCount,
            );
            if (!leaseAcquired) {
              throw new Error(`TASK_LEASE_UNAVAILABLE: task ${node.taskId} could not acquire its execution lease.`);
            }

            heartbeatTimer = setInterval(() => {
              this.leaseManager!
                .heartbeat(node.taskId, workerId, leaseTtlMs)
                .then(async (ok) => {
                  if (this.eventBus) {
                    await this.eventBus.publish("TASK_HEARTBEAT", {
                      dagId: dag.dagId,
                      goalId: dag.goalId,
                      missionId: options?.missionId,
                      taskId: node.taskId,
                      workerId,
                      heartbeatAccepted: ok,
                      attempt: node.attemptCount,
                    }, {
                      source: "task_dag_executor",
                      correlationId: dag.dagId,
                      idempotencyKey: `dag:${dag.dagId}:task:${node.taskId}:heartbeat:${Date.now()}`,
                    });
                  }
                })
                .catch(() => {});
            }, 20000);
            (heartbeatTimer as any).unref?.();
          }

          if (this.eventBus) {
            await this.eventBus.publish("TASK_STARTED", {
              dagId: dag.dagId,
              goalId: dag.goalId,
              missionId: options?.missionId,
              taskId: node.taskId,
              assignedAgentId: workerId,
              attempt: node.attemptCount,
              status: node.status,
            }, {
              source: "task_dag_executor",
              correlationId: dag.dagId,
              idempotencyKey: `dag:${dag.dagId}:task:${node.taskId}:started:${node.attemptCount}`,
            });
          }

          // Collect outputs from upstream dependencies
          const dependencyOutputs: Record<string, any> = {};
          for (const depId of node.dependencies) {
            if (dag.nodes[depId]?.result) {
              dependencyOutputs[depId] = dag.nodes[depId].result;
            }
          }
          (node as any).dependencyOutputs = dependencyOutputs;

          const executor = executors[node.requiredAgentType] || executors["TOOL"] || (async () => ({ status: "OK" }));

          try {
            console.log(
              `[TaskDAGExecutor] run=${dag.goalId} task=${node.taskId} phase=execute-start attempt=${node.attemptCount}`,
            );
            const timeoutPromise = new Promise<never>((_, reject) => {
              const timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      `DAG_NODE_TIMEOUT: task ${node.taskId} exceeded ${executionTimeoutMs}ms`,
                    ),
                  ),
                executionTimeoutMs,
              );
              (timer as any).unref?.();
            });
            const result = await Promise.race([executor(node), timeoutPromise]);
            console.log(
              `[TaskDAGExecutor] run=${dag.goalId} task=${node.taskId} phase=execute-complete`,
            );
            node.status = "SUCCEEDED";
            node.result = result;
            node.completedAt = new Date().toISOString();
            if (this.eventBus) {
              await this.eventBus.publish("TASK_COMPLETED", {
                dagId: dag.dagId,
                goalId: dag.goalId,
                missionId: options?.missionId,
                taskId: node.taskId,
                assignedAgentId: node.assignedAgentId || "dag_worker",
                attempt: node.attemptCount,
                status: node.status,
              }, {
                source: "task_dag_executor",
                correlationId: dag.dagId,
                idempotencyKey: `dag:${dag.dagId}:task:${node.taskId}:completed:${node.attemptCount}`,
              });
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (node.attemptCount < node.maxAttempts) {
              node.status = "RETRYING";
              if (this.eventBus) {
                await this.eventBus.publish("TASK_RETRYING", {
                  dagId: dag.dagId,
                  goalId: dag.goalId,
                  missionId: options?.missionId,
                  taskId: node.taskId,
                  attempt: node.attemptCount,
                  maxAttempts: node.maxAttempts,
                  error: errorMsg,
                }, {
                  source: "task_dag_executor",
                  correlationId: dag.dagId,
                  idempotencyKey: `dag:${dag.dagId}:task:${node.taskId}:retry:${node.attemptCount}`,
                });
              }
            } else {
              node.status = "FAILED";
              node.error = errorMsg;
              if (this.eventBus) {
                await this.eventBus.publish("TASK_FAILED", {
                  dagId: dag.dagId,
                  goalId: dag.goalId,
                  missionId: options?.missionId,
                  taskId: node.taskId,
                  attempt: node.attemptCount,
                  maxAttempts: node.maxAttempts,
                  error: errorMsg,
                }, {
                  source: "task_dag_executor",
                  correlationId: dag.dagId,
                  idempotencyKey: `dag:${dag.dagId}:task:${node.taskId}:failed:${node.attemptCount}`,
                });
              }
            }
          } finally {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (this.leaseManager && leaseAcquired) {
              await this.leaseManager.release(node.taskId, workerId);
            }
            await this.repository.updateTaskNode(dag.dagId, node);
          }
        })
      );

      // Save DAG progress
      await this.repository.saveDAG(dag);
    }

    // Persist final terminal status (COMPLETED or FAILED)
    await this.repository.saveDAG(dag);
    return dag;
  }

  private findReadyNodes(dag: TaskDAG): TaskNode[] {
    const ready: TaskNode[] = [];
    for (const node of Object.values(dag.nodes)) {
      if (node.status === "PENDING" || node.status === "RETRYING") {
        const depsSatisfied = node.dependencies.every(
          (depId) => dag.nodes[depId] && dag.nodes[depId].status === "SUCCEEDED"
        );
        if (depsSatisfied) {
          ready.push(node);
        }
      }
    }
    return ready;
  }
}
