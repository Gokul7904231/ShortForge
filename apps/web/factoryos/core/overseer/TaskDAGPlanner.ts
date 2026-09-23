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
      const taskId = `task_${floor.floorId}`;
      const dependencies = floor.predecessors.map((p) => `task_${p}`);
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
    options?: { maxParallelTasks?: number }
  ): Promise<TaskDAG> {
    dag.status = "RUNNING";
    await this.repository.saveDAG(dag);

    const maxParallel = options?.maxParallelTasks && options.maxParallelTasks > 0 ? options.maxParallelTasks : Infinity;

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

          if (this.leaseManager) {
            await this.leaseManager.acquire(node.taskId, node.assignedAgentId || "dag_worker", 60000, node.attemptCount);
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
            const result = await executor(node);
            node.status = "SUCCEEDED";
            node.result = result;
            node.completedAt = new Date().toISOString();
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (node.attemptCount < node.maxAttempts) {
              node.status = "RETRYING";
            } else {
              node.status = "FAILED";
              node.error = errorMsg;
            }
          } finally {
            if (this.leaseManager) {
              await this.leaseManager.release(node.taskId, node.assignedAgentId || "dag_worker");
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
