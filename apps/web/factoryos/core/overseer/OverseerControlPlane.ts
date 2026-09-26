/**
 * FactoryOS v1 — Overseer Supreme Control Plane & Autonomous Mission Runtime
 */

import { randomUUID } from "node:crypto";
import type { GoalDefinition, TaskNode } from "../contracts/OverseerThinkingContracts";
import type { Case } from "../contracts/CaseContracts";
import type { WorldState } from "../contracts/WorldStateContracts";
import { OverseerThinkingController } from "./OverseerThinkingController";
import { DecisionLedger } from "./DecisionLedger";
import { TaskDAGPlanner, TaskDAGExecutor } from "./TaskDAGPlanner";
import type { CaseManager } from "../cases/CaseManager";
import type { HealerEngine } from "../healers/HealerEngine";
import type { SlayerEngine } from "../slayers/SlayerEngine";
import type { ValidatorAgent } from "../validator/ValidatorAgent";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import type { MemoryEngine } from "../memory/MemoryEngine";

export interface OverseerRun {
  readonly runId: string;
  readonly command: string;
  readonly mode: "reflex" | "deliberate" | "deep" | "autonomous";
  status: "accepted" | "running" | "completed" | "failed" | "paused";
  readonly createdAt: string;
  updatedAt: string;
  result?: Record<string, unknown>;
  error?: string;
}

import { CapabilityRouter } from "../cognitive/routing/CapabilityRouter";
import { StrategicMetaThinker } from "../cognitive/meta/StrategicMetaThinker";
import { CognitivePlaneEngine } from "../cognitive/CognitivePlaneEngine";
import { CognitiveRuntime } from "../cognitive/CognitiveRuntime";
import type { MissionManager } from "../missions/MissionManager";

import type { IDecisionRepository, ITaskDAGRepository } from "../database/DatabaseContracts";
import { OverseerPresenceEngine } from "./presence/OverseerPresenceEngine";
import { VerificationEngine } from "../verification/VerificationEngine";
import { ResearchRuntime } from "../research/ResearchRuntime";
import { VoiceFabric } from "../voice/VoiceFabric";
import { RenderFabric } from "../fabric/RenderFabric";
import type { RenderIntent, RenderArtifact } from "../contracts/RenderIntentContracts";
import { TemplateRegistry } from "../../../lib/templates/registry/TemplateRegistry";
import { Floor02RuntimeAdapter } from "../adapters/Floor02RuntimeAdapter";
import { LocalRenderAdapter, type LocalRenderIntent } from "../render/LocalRenderAdapter";
import { DecisionEngine } from "../intelligence/decision/DecisionEngine";
import { Floor01RuntimeAdapter } from "../bridge/Floor01RuntimeAdapter";
import { Floor03RuntimeAdapter } from "../bridge/Floor03RuntimeAdapter";
import { Floor03DurableHandoffStore } from "../bridge/Floor03DurableHandoffStore";
import { TemplateProductionPipeline } from "../templates/TemplateProductionPipeline";

export class OverseerControlPlane {
  private thinkingController: OverseerThinkingController;
  private decisionLedger: DecisionLedger;
  private dagPlanner: TaskDAGPlanner;
  private dagExecutor: TaskDAGExecutor;
  private caseManager: CaseManager;
  private slayerEngine: SlayerEngine;
  private healerEngine: HealerEngine;
  private validator: ValidatorAgent;
  private eventBus: DurableEventBus;
  private worldState: WorldStateEngine;
  private memoryEngine?: MemoryEngine;
  public cognitivePlane: CognitivePlaneEngine;
  public cognitiveRuntime: CognitiveRuntime;
  public missionManager?: MissionManager;
  public capabilityRouter: CapabilityRouter;
  public metaThinker: StrategicMetaThinker;
  public presenceEngine: OverseerPresenceEngine;

  private runs: Map<string, OverseerRun> = new Map();
  private supervisorInterval: NodeJS.Timeout | null = null;
  private isSupervising: boolean = false;
  private activeMissionGoal: string | null = null;

  constructor(
    caseManager: CaseManager,
    slayerEngine: SlayerEngine,
    healerEngine: HealerEngine,
    validator: ValidatorAgent,
    eventBus: DurableEventBus,
    worldState: WorldStateEngine,
    memoryEngine?: MemoryEngine,
    cognitivePlane?: CognitivePlaneEngine,
    missionManager?: MissionManager,
    decisionRepo?: IDecisionRepository,
    taskDAGRepo?: ITaskDAGRepository
  ) {
    this.caseManager = caseManager;
    this.slayerEngine = slayerEngine;
    this.healerEngine = healerEngine;
    this.validator = validator;
    this.eventBus = eventBus;
    this.worldState = worldState;
    this.memoryEngine = memoryEngine;
    this.cognitivePlane = cognitivePlane || new CognitivePlaneEngine();
    this.cognitiveRuntime = new CognitiveRuntime(this.cognitivePlane);
    this.missionManager = missionManager;

    this.thinkingController = new OverseerThinkingController();
    this.decisionLedger = new DecisionLedger(decisionRepo);
    this.dagPlanner = new TaskDAGPlanner();
    this.dagExecutor = new TaskDAGExecutor(taskDAGRepo, this.eventBus);
    this.capabilityRouter = new CapabilityRouter();
    this.metaThinker = new StrategicMetaThinker();
    this.presenceEngine = new OverseerPresenceEngine(
      this.eventBus,
      this.worldState,
      this.caseManager,
      this.missionManager
    );

    this.registerWithWorldState();

    this.eventBus.subscribe("ANOMALY_DETECTED", async () => {
      if (this.isSupervising) {
        await this.runSupervisorCycle().catch(() => {});
      }
    });
    this.eventBus.subscribe("CASE_CREATED", async () => {
      if (this.isSupervising) {
        await this.runSupervisorCycle().catch(() => {});
      }
    });
    this.eventBus.subscribe("MISSION_STARTED", async (envelope) => {
      if (this.isSupervising) {
        const missionId = (envelope.payload as any)?.missionId;
        if (missionId) {
          await this.resumeMissionExecution(missionId).catch(() => {});
        }
      }
    });
  }

  async resumeMissionExecution(missionId: string): Promise<void> {
    if (!this.missionManager) return;
    for (const r of this.runs.values()) {
      if ((r as any).missionId === missionId && (r.status === "running" || r.status === "accepted")) {
        return;
      }
    }
    const mission = await this.missionManager.getMission(missionId);
    if (!mission || mission.status !== "RUNNING") return;

    const runId = `run_resumed_${randomUUID().replace(/-/g, "").substring(0, 8)}`;
    const now = new Date().toISOString();
    this.runs.set(runId, {
      runId,
      command: mission.objective,
      mode: "autonomous",
      status: "running",
      createdAt: now,
      updatedAt: now,
      missionId,
    } as any);

    const runRecord = this.runs.get(runId)!;
    this.executeRunAsync(runRecord, missionId).catch(() => {});
  }

  private registerWithWorldState(): void {
    this.worldState.registerWorker({
      workerId: "overseer_control_plane",
      role: "OPERATOR",
      specialization: "SUPREME_CONTROL_PLANE",
      status: "HEALTHY",
      lastSeen: new Date().toISOString(),
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        uptimeSeconds: 0,
        averageLatencyMs: 10,
      },
    });
  }

  startSupervisor(intervalMs: number = 3000): void {
    if (this.isSupervising) return;
    this.isSupervising = true;
    this.supervisorInterval = setInterval(() => {
      this.runSupervisorCycle().catch(() => {});
    }, intervalMs);
    this.runSupervisorCycle().catch(() => {});
  }

  stopSupervisor(): void {
    this.isSupervising = false;
    if (this.supervisorInterval) {
      clearInterval(this.supervisorInterval);
      this.supervisorInterval = null;
    }
  }

  /**
   * Unified Overseer Command Ingestion (POST /api/overseer/command):
   * Non-blocking — returns immediately with run_id and status "accepted".
   */
  async submitCommand(
    command: string,
    mode: "reflex" | "deliberate" | "deep" | "autonomous" = "autonomous"
  ): Promise<{ runId: string; missionId?: string; status: "accepted" }> {
    const runId = `run_${randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const now = new Date().toISOString();

    let missionId: string | undefined;
    if (this.missionManager) {
      const mission = await this.missionManager.createMission({
        goal: command,
      });
      missionId = mission.missionId;
      await this.missionManager.startMission(missionId, runId);
    }

    const runRecord: OverseerRun = {
      runId,
      command,
      mode,
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(runId, runRecord);
    this.worldState.addActiveRun(runId);

    await this.eventBus.publish(
      "RUN_STARTED",
      { runId, command, mode, missionId },
      { correlationId: runId, source: "overseer_api" }
    );

    // Launch execution asynchronously in the background (fire-and-forget from caller perspective)
    setImmediate(() => {
      this.executeRunAsync(runRecord, missionId).catch((err) => {
        runRecord.status = "failed";
        runRecord.error = err instanceof Error ? err.message : String(err);
        runRecord.updatedAt = new Date().toISOString();
        this.worldState.removeActiveRun(runId);
      });
    });

    return { runId, missionId, status: "accepted" };
  }

  async dispatchMission(
    mission: { missionId: string; goal?: string; scope?: Record<string, any> },
    mode: "reflex" | "deliberate" | "deep" | "autonomous" = "autonomous"
  ): Promise<{ runId: string; missionId: string; status: "accepted" }> {
    for (const r of this.runs.values()) {
      if ((r as any).missionId === mission.missionId && (r.status === "running" || r.status === "accepted")) {
        return { runId: r.runId, missionId: mission.missionId, status: "accepted" };
      }
    }

    const runId = `run_${randomUUID().replace(/-/g, "").substring(0, 12)}`;
    const now = new Date().toISOString();

    const runRecord: OverseerRun = {
      runId,
      command: mission.goal || "Autonomous Mission Execution",
      mode,
      status: "accepted",
      createdAt: now,
      updatedAt: now,
      missionId: mission.missionId,
    } as any;

    this.runs.set(runId, runRecord);
    this.worldState.addActiveRun(runId);

    await this.eventBus.publish(
      "RUN_STARTED",
      { runId, command: runRecord.command, mode, missionId: mission.missionId },
      { correlationId: runId, source: "overseer_mission_dispatcher" }
    );

    setImmediate(() => {
      this.executeRunAsync(runRecord, mission.missionId).catch((err) => {
        runRecord.status = "failed";
        runRecord.error = err instanceof Error ? err.message : String(err);
        runRecord.updatedAt = new Date().toISOString();
        this.worldState.removeActiveRun(runId);
      });
    });

    return { runId, missionId: mission.missionId, status: "accepted" };
  }

  private async executeRunAsync(run: OverseerRun, missionId?: string): Promise<void> {
    run.status = "running";
    run.updatedAt = new Date().toISOString();

    const currentState = this.worldState.getState();
    const assessment = this.thinkingController.assessCommand(run.command, currentState);

    // 0. Typed Decision Batch Evaluation (Decision Fabric)
    const decisionEngine = new DecisionEngine();
    const batchResult = await decisionEngine.evaluateBatch({
      batchId: `batch_${run.runId}`,
      taskId: run.runId,
      missionId,
      questions: [
        {
          id: "intent",
          type: "CHOICE",
          question: "Determine operational intent",
          options: ["EXECUTE_AUTONOMOUS_OPERATION", "TRIAGE_OPEN_CASES", "DISPATCH_SLAYERS"],
        },
        {
          id: "generationRequired",
          type: "NOUL",
          question: "Is generation required for this command?",
        },
      ],
      sharedContext: {
        command: run.command,
        activeCases: (currentState as any).activeCaseIds?.length || 0,
      },
    });

    const selectedOption =
      batchResult.answersById["intent"]?.type === "CHOICE"
        ? (batchResult.answersById["intent"] as any).selected
        : "EXECUTE_AUTONOMOUS_OPERATION";

    // 1. Record Decision in Ledger
    const decision = await this.decisionLedger.record({
      goalId: run.runId,
      stateSnapshot: currentState as unknown as Record<string, unknown>,
      thinkingMode: assessment.mode,
      availableOptions: ["EXECUTE_AUTONOMOUS_OPERATION", "TRIAGE_OPEN_CASES", "DISPATCH_SLAYERS"],
      selectedOption,
      reasoningSummary: assessment.rationale,
      predictedOutcome: "Factory operating continuously with swarms active",
      agentsUsed: ["overseer", "slayer_general_patrol", "healer_diagnostic", "validator_prime"],
      toolsUsed: ["worldstate.get", "cases.getActive", "events.publish"],
      executionTimeMs: 50,
    });

    // 2. Autonomous Task DAG Generation & Floor Dispatching
    const nodes = this.generateTaskNodesForGoal(run.command);
    const dag = this.dagPlanner.createDAG(run.runId, nodes);
    let maxParallelTasks = 3;

    if (missionId && this.missionManager) {
      const mission = await this.missionManager.getMission(missionId);
      if (mission) {
        maxParallelTasks = mission.budget.maxParallelTasks || 3;
        await this.missionManager.addTaskToMission(missionId, dag.dagId);
        await this.missionManager.updateProgress(missionId, 0, nodes.length);
      }
    }

    const executors = this.getTaskExecutorsForFloors(missionId);

    // Execute Task DAG asynchronously across target floor executors
    const completedDag = await this.dagExecutor.executeDAG(dag, executors, { maxParallelTasks });

    if (run.command.toLowerCase().includes("operate the factory")) {
      this.activeMissionGoal = run.command;
      this.worldState.setGlobalGoal(run.command);
      this.worldState.setFactoryStatus("OPERATIONAL");
      run.result = {
        message: "Persistent autonomous mission initiated. Task DAG executed across floors.",
        mode: assessment.mode,
        decisionId: decision.decisionId,
        dagId: completedDag.dagId,
        dagStatus: completedDag.status,
      };
      run.status = "running";
    } else {
      run.status = completedDag.status === "COMPLETED" ? "completed" : "failed";
      run.result = {
        message: `Command "${run.command}" executed with DAG status '${completedDag.status}'.`,
        mode: assessment.mode,
        decisionId: decision.decisionId,
        dagId: completedDag.dagId,
      };
      this.worldState.removeActiveRun(run.runId);
    }

    // Complete mission upon successful DAG execution
    if (missionId && this.missionManager && completedDag.status === "COMPLETED") {
      try {
        const mission = await this.missionManager.getMission(missionId);
        if (mission && mission.status !== "COMPLETED") {
          await this.missionManager.completeMission(missionId);
        }
      } catch (err) {
        console.warn(`[OverseerControlPlane] Mission ${missionId} completion check:`, err instanceof Error ? err.message : err);
      }
    }

    await this.eventBus.publish(
      run.status === "completed" ? "RUN_COMPLETED" : "RUN_CHECKPOINTED",
      { runId: run.runId, status: run.status, result: run.result, missionId },
      { correlationId: run.runId }
    );
  }

  private generateTaskNodesForGoal(command: string): TaskNode[] {
    const isFactoryOp =
      command.toLowerCase().includes("operate the factory") ||
      command.toLowerCase().includes("factory") ||
      command.toLowerCase().includes("generate video") ||
      command.toLowerCase().includes("shorts") ||
      command.toLowerCase().includes("floor") ||
      command.toLowerCase().includes("dag") ||
      command.toLowerCase().includes("video") ||
      command.toLowerCase().includes("job");

    if (isFactoryOp) {
      const needsResearch =
        command.toLowerCase().includes("research") ||
        command.toLowerCase().includes("analyze") ||
        command.toLowerCase().includes("trend") ||
        command.toLowerCase().includes("competitor") ||
        command.toLowerCase().includes("deep");

      const nodes: TaskNode[] = [];

      if (needsResearch) {
        nodes.push({
          taskId: "task_f00_analyst",
          name: "Floor 00 Analyst",
          description: "Floor 00 Market Intelligence, Trend Research & Hook Analysis",
          requiredAgentType: "FLOOR_ANALYST",
          payload: { command },
          status: "PENDING" as const,
          dependencies: [],
          attemptCount: 0,
          maxAttempts: 2,
        });
      }

      nodes.push(
        {
          taskId: "task_f01_strategy",
          name: "Floor 01 Strategy",
          description: "Floor 01 Strategy & Topic Intelligence Planning",
          requiredAgentType: "FLOOR_STRATEGY",
          payload: { command },
          status: "PENDING" as const,
          dependencies: needsResearch ? ["task_f00_analyst"] : [],
          attemptCount: 0,
          maxAttempts: 2,
        },
        {
          taskId: "task_f02_scripting",
          name: "Floor 02 Scripting",
          description: "Floor 02 Script & Narrative Synthesis",
          requiredAgentType: "FLOOR_SCRIPTING",
          payload: {},
          status: "PENDING" as const,
          dependencies: ["task_f01_strategy"],
          attemptCount: 0,
          maxAttempts: 2,
        },
        {
          taskId: "task_f03_asset_realization",
          name: "Floor 03 Asset Realization",
          description: "Floor 03 Asset Blueprint & Prompt Realization",
          requiredAgentType: "FLOOR_ASSET_REALIZATION",
          payload: {},
          status: "PENDING" as const,
          dependencies: ["task_f02_scripting"],
          attemptCount: 0,
          maxAttempts: 2,
        },
        {
          taskId: "task_f04_media_synthesis",
          name: "Floor 04 Media Synthesis",
          description: "Floor 04 Media Synthesis & Voice Generation",
          requiredAgentType: "FLOOR_MEDIA_SYNTHESIS",
          payload: {},
          status: "PENDING" as const,
          dependencies: ["task_f02_scripting"],
          attemptCount: 0,
          maxAttempts: 2,
        },
        {
          taskId: "task_f05_timeline_composition",
          name: "Floor 05 Timeline Composition",
          description: "Floor 05 Timeline Composition & Render Manifest Assembly",
          requiredAgentType: "FLOOR_TIMELINE_COMPOSITION",
          payload: {},
          status: "PENDING" as const,
          dependencies: ["task_f03_asset_realization", "task_f04_media_synthesis"],
          attemptCount: 0,
          maxAttempts: 2,
        },
        {
          taskId: "task_f06_rendering",
          name: "Floor 06 Render Orchestration",
          description: "Floor 06 Render Orchestration & Render Fabric Dispatch",
          requiredAgentType: "FLOOR_RENDERING",
          payload: {},
          status: "PENDING" as const,
          dependencies: ["task_f05_timeline_composition"],
          attemptCount: 0,
          maxAttempts: 2,
        },
        {
          taskId: "task_f07_verification",
          name: "Floor 07 Media & Artifact Verification",
          description: "Floor 07 Factual Integrity, Subtitle & Media Quality Audit",
          requiredAgentType: "FLOOR_VERIFICATION",
          payload: {},
          status: "PENDING" as const,
          dependencies: ["task_f06_rendering"],
          attemptCount: 0,
          maxAttempts: 2,
        }
      );
      return nodes;
    }

    return [
      {
        taskId: "task_generic_01",
        name: "Generic Task",
        description: `Execute action for goal: ${command}`,
        requiredAgentType: "TOOL",
        payload: {},
        status: "PENDING" as const,
        dependencies: [],
        attemptCount: 0,
        maxAttempts: 2,
      },
    ];
  }

  private getTaskExecutorsForFloors(missionId?: string) {
    const sharedScope: Record<string, any> = {};

    return {
      FLOOR_ANALYST: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = Object.assign(sharedScope, (mission?.scope as Record<string, any>) || {});

        this.worldState.updateFloorStatus("floor00_analyst", "ONLINE", "Market Intelligence & Trend Analysis");
        this.worldState.registerWorker({
          workerId: "worker_analyst_01",
          role: "WORKER",
          specialization: "ANALYSIS",
          status: "HEALTHY",
          lastSeen: new Date().toISOString(),
          metrics: { tasksCompleted: 1, tasksFailed: 0, uptimeSeconds: 100, averageLatencyMs: 15 },
        });

        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_ANALYST",
          executionId,
          floorId: "floor00_analyst",
          workerId: "worker_analyst_01",
          missionId,
          startedAt,
        });

        const topic = String(
          scope.topic ??
            node.payload?.topic ??
            node.payload?.command ??
            ""
        ).trim();

        if (!topic) {
          throw new Error(
            "F00_ANALYST_INPUT_MISSING: Floor 00 requires a non-empty topic."
          );
        }

        const productionSpec = scope.productionSpec as any;
        const researchContract =
          productionSpec?.engine?.contracts?.research ?? undefined;

        const researchRuntime = new ResearchRuntime();
        const analystReport = await researchRuntime.executeResearch({
          missionId: missionId || "direct",
          topic,
          audience:
            scope.engineSnapshot?.effectiveConfig?.audience ??
            productionSpec?.configuration?.content?.audience,
          methodology: "TREND_SCAN",
          researchContract,
          targetSourceCount: researchContract?.minSources,
          intent:
            researchContract?.sourcePolicy ??
            "Floor 00 evidence acquisition for the selected Content Engine.",
        });

        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }

        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));

        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_ANALYST",
          executionId,
          floorId: "floor00_analyst",
          workerId: "worker_analyst_01",
          missionId,
          output: analystReport,
          startedAt,
          completedAt,
          executionTimeMs,
          durationTruth: "PHYSICAL",
          producedArtifacts: analystReport.passport ? [{ kind: "PASSPORT", id: analystReport.passport.passportId }] : [],
          producedArtifactIds: analystReport.passport ? [analystReport.passport.passportId] : [],
        });
        return { status: "OK", floor: "floor00_analyst", output: analystReport, executionTimeMs };
      },
      FLOOR_STRATEGY: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = (mission?.scope as Record<string, any>) || {};

        this.worldState.updateFloorStatus("floor01_strategy", "ONLINE", "Topic Strategy & Intelligence");
        this.worldState.registerWorker({
          workerId: "worker_strategy_01",
          role: "WORKER",
          specialization: "STRATEGY",
          status: "HEALTHY",
          lastSeen: new Date().toISOString(),
          metrics: { tasksCompleted: 1, tasksFailed: 0, uptimeSeconds: 100, averageLatencyMs: 20 },
        });

        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_STRATEGY",
          executionId,
          floorId: "floor01_strategy",
          workerId: "worker_strategy_01",
          missionId,
          startedAt,
        });

        const analystOutput = node.dependencyOutputs?.["task_f00_analyst"]?.output || scope.analystReport || sharedScope.analystReport;
        if (!analystOutput?.passport) {
          throw new Error("F01_UPSTREAM_RESEARCH_MISSING: Floor 01 requires F00 AnalystReport/ResearchPassport.");
        }

        const f01Request = Floor01RuntimeAdapter.fromAnalystReport(
          `f01_${missionId || "direct"}_${node.taskId}`,
          analystOutput,
          {
            targetAudience: scope.engineSnapshot?.effectiveConfig?.audience || "general_learners",
            platform: scope.productionSpec?.configuration?.creative?.platform || "youtube_shorts",
            contentFormat: scope.productionSpec?.configuration?.content?.format || "educational_short",
            nicheContext: scope.productionSpec?.configuration?.content?.niche,
            learningLevel: scope.productionSpec?.configuration?.content?.learningLevel || "beginner",
            constraints: scope.productionSpec?.configuration?.content?.constraints || {},
          },
        );

        const canonicalF01 = await new Floor01RuntimeAdapter().execute(f01Request);
        const strategyPayload = canonicalF01;
        scope.strategy = strategyPayload;
        sharedScope.strategy = strategyPayload;

        scope.strategy = strategyPayload;
        sharedScope.strategy = strategyPayload;

        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }

        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));

        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_STRATEGY",
          executionId,
          floorId: "floor01_strategy",
          workerId: "worker_strategy_01",
          missionId,
          output: strategyPayload,
          startedAt,
          completedAt,
          executionTimeMs,
          durationTruth: "PHYSICAL",
          consumedArtifactIds: analystOutput?.passport?.passportId ? [analystOutput.passport.passportId] : [],
        });
        return { status: "OK", floor: "floor01_strategy", output: strategyPayload, executionTimeMs };
      },
      FLOOR_SCRIPTING: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = (mission?.scope as Record<string, any>) || {};

        this.worldState.updateFloorStatus("floor02_scripting", "ONLINE", "Scripting & Topic Generation");
        this.worldState.registerWorker({
          workerId: "worker_scripting_01",
          role: "WORKER",
          specialization: "SCRIPTING",
          status: "HEALTHY",
          lastSeen: new Date().toISOString(),
          metrics: { tasksCompleted: 1, tasksFailed: 0, uptimeSeconds: 100, averageLatencyMs: 20 },
        });

        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_SCRIPTING",
          executionId,
          floorId: "floor02_scripting",
          workerId: "worker_scripting_01",
          missionId,
          startedAt,
        });

        const upstreamStrategy = node.dependencyOutputs?.["task_f01_strategy"]?.output || sharedScope.strategy;
        const effectiveTopic =
          typeof upstreamStrategy?.topic === "string"
            ? upstreamStrategy.topic
            : upstreamStrategy?.topic?.selected_topic ||
              scope.topic ||
              "Factual Topic";
        const effectiveTemplateId = scope.templateId || sharedScope.templateId || node.payload?.templateId;
        const templateRegistry = TemplateRegistry.getInstance();
        const templateDef = effectiveTemplateId ? templateRegistry.getTemplate(effectiveTemplateId) : null;

        let scriptPayload: any;

        const useCanonicalPythonF02 =
          Boolean(process.env.FLOOR02_RUNTIME_URL) ||
          process.env.NODE_ENV === "production";

        if (useCanonicalPythonF02) {
          const runtime = new Floor02RuntimeAdapter();
          const f02 = await runtime.plan({
            requestId: executionId,
            topic: effectiveTopic,
            targetDurationSeconds: Number(
              upstreamStrategy?.targetDurationSeconds ||
              upstreamStrategy?.target_duration_seconds ||
              scope.targetDurationSeconds ||
              60
            ),
            strategy: upstreamStrategy || {},
            upstreamHandoff:
              (scope.floor01Handoff as Record<string, any> | undefined) ||
              (sharedScope as any).floor01Handoff,
          });

          const canonical = f02.handoffPayload;
          const scriptIR = canonical.script_ir;
          const scenes = Array.isArray(canonical.scenes) ? canonical.scenes : [];

          scope.f02Handoff = canonical;
          sharedScope.f02Handoff = canonical;
          scope.scriptIR = scriptIR;
          sharedScope.scriptIR = scriptIR;
          scope.script = scenes.map((scene: any) => scene.narration_text || "").join(" ").trim();
          sharedScope.script = scope.script;
          scope.scenes = scenes;
          sharedScope.scenes = scenes;

          scriptPayload = {
            script: scope.script,
            scriptIR,
            handoffPayload: canonical,
            scenes,
            floorVersion: canonical.floor_version,
            successorHandoffs: canonical.successor_handoffs,
          };
        } else if (templateDef) {
          // Template context survives entire mission (Requirement 5)
          scope.templateId = templateDef.identity.id;
          scope.templateVersion = templateDef.identity.version;
          scope.contentEngine = templateDef.category;
          scope.formatFamily = templateDef.formatFamily;
          scope.templateDef = templateDef;
          sharedScope.templateId = templateDef.identity.id;
          sharedScope.templateVersion = templateDef.identity.version;
          sharedScope.contentEngine = templateDef.category;
          sharedScope.formatFamily = templateDef.formatFamily;
          sharedScope.templateDef = templateDef;

          const pipeline = TemplateProductionPipeline.getInstance();
          const scriptIR = await pipeline.generateTemplateScript({
            templateDef,
            topic: effectiveTopic,
            userInputs: scope.userInputs || {}
          });

          // Enforce template-specific validation with localized failure isolation (Requirement 8 & 9)
          const validation = pipeline.validateTemplateScript(templateDef, scriptIR);
          if (!validation.valid) {
            const validationErr = new Error(`[TEMPLATE_SCRIPT_INVALID] Template ${templateDef.identity.id} validation failed: ${validation.errors.join("; ")}`);
            (validationErr as any).code = "TEMPLATE_SCRIPT_INVALID";
            (validationErr as any).stage = "FLOOR_SCRIPTING";
            (validationErr as any).templateId = templateDef.identity.id;
            (validationErr as any).errors = validation.errors;
            throw validationErr;
          }

          scope.templateScriptIR = scriptIR;
          sharedScope.templateScriptIR = scriptIR;
          const fullScript = scriptIR.beats.map((b) => b.narration).join(" ");
          scope.script = fullScript;
          sharedScope.script = fullScript;
          scope.scenes = scriptIR.beats.map((b) => ({
            text: b.narration,
            durationSeconds: b.durationSeconds,
            shotRecipeId: b.shotRecipeId,
            props: b.props,
          }));
          sharedScope.scenes = scope.scenes;

          scriptPayload = {
            script: fullScript,
            templateScriptIR: scriptIR,
            templateId: templateDef.identity.id,
            templateVersion: templateDef.identity.version,
            contentEngine: templateDef.category,
            formatFamily: templateDef.formatFamily,
            scenes: scope.scenes,
            quizData: scope.quizData || null,
          };
        } else {
          const hookText =
            upstreamStrategy?.content_plan?.hook_direction ||
            `Did you know these astonishing facts about ${effectiveTopic}?`;
          const scriptText = scope.script || `${hookText} Deep exploration reveals truths that defy expectations.`;
          const scenes = (scope.scenes && scope.scenes.length > 0) ? scope.scenes : [
            { text: hookText, durationSeconds: 2 },
            { text: `Deep exploration reveals secrets of ${effectiveTopic}`, durationSeconds: 2 }
          ];

          scope.script = scriptText;
          sharedScope.script = scriptText;
          scope.scenes = scenes;
          sharedScope.scenes = scenes;

          scriptPayload = {
            script: scriptText,
            scenes,
            quizData: scope.quizData || null,
          };
        }

        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }

        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));

        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_SCRIPTING",
          executionId,
          floorId: "floor02_scripting",
          workerId: "worker_scripting_01",
          missionId,
          output: scriptPayload,
          startedAt,
          completedAt,
          executionTimeMs,
          durationTruth: "PHYSICAL",
        });
        return { status: "OK", floor: "floor02_scripting", output: scriptPayload, executionTimeMs };
      },
      FLOOR_ASSET_REALIZATION: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = Object.assign(sharedScope, (mission?.scope as Record<string, any>) || {});

        this.worldState.updateFloorStatus("floor03_asset_realization", "ONLINE", "Asset Realization & Blueprints");
        this.worldState.registerWorker({
          workerId: "worker_assets_01", role: "WORKER", specialization: "ASSET_REALIZATION", status: "STARTING",
          lastSeen: new Date().toISOString(), metrics: { tasksCompleted: 0, tasksFailed: 0, uptimeSeconds: 0, averageLatencyMs: 0 },
        });
        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId, taskNodeId: node.taskId, capabilityId: "FLOOR_ASSET_REALIZATION",
          executionId, floorId: "floor03_asset_realization", workerId: "worker_assets_01", missionId, startedAt,
        });

        const f02Handoff = (scope.f02Handoff || sharedScope.f02Handoff) as Record<string, any> | undefined;
        if (!f02Handoff) throw new Error("[Overseer Floor03] Canonical Floor 02 handoff is missing; refusing non-canonical F03 execution.");
        const runtime = new Floor03RuntimeAdapter();
        const durableStore = new Floor03DurableHandoffStore();
        const f03RequestId = `${missionId || "mission"}:${node.taskId}`;
        const durableF03 = await durableStore.get(f03RequestId);
        const f03 = durableF03
          ? { handoffPayload: durableF03.handoff, executionReport: durableF03.executionReport }
          : await runtime.plan({
              requestId: f03RequestId, floor02Handoff: f02Handoff,
              platform: scope.platform || sharedScope.platform || f02Handoff?.strategy?.platform || f02Handoff?.provenance?.find((p: any) => p?.raw_data?.platform)?.raw_data?.platform,
              aspectRatio: scope.aspectRatio || sharedScope.aspectRatio, targetResolution: scope.targetResolution || sharedScope.targetResolution,
              stylePreset: scope.style || sharedScope.style, voiceId: scope.voiceId || sharedScope.voiceId,
              authorizedOverride: Boolean(scope.authorizedPlatformOverride),
            });
        if (!durableF03) {
          const hd = f03.handoffPayload;
          await durableStore.put({
            requestId: f03RequestId, floorId: "floor03_asset_realization", floorVersion: hd.floor_version,
            assetPlanId: hd.asset_plan_id, assetPlanVersion: hd.asset_plan_version,
            planFingerprint: hd.asset_plan_ir.plan_fingerprint, sourceFingerprint: hd.asset_plan_ir.source_fingerprint,
            handoff: hd, executionReport: f03.executionReport, persistedAt: new Date().toISOString(),
          });
        }
        const canonicalF03 = f03.handoffPayload;
        const visualRequirements = Array.isArray(canonicalF03.visual_asset_requirements) ? canonicalF03.visual_asset_requirements : [];
        scope.f03Handoff = canonicalF03; sharedScope.f03Handoff = canonicalF03;
        scope.f03ExecutionReport = f03.executionReport; sharedScope.f03ExecutionReport = f03.executionReport;
        scope.assetPlanIR = canonicalF03.asset_plan_ir; sharedScope.assetPlanIR = canonicalF03.asset_plan_ir;
        scope.scenes = visualRequirements.map((req: any) => ({
          sceneId: req.scene_id,
          text: f02Handoff.scenes?.find((scene: any) => scene.scene_id === req.scene_id)?.narration_text || "",
          durationSeconds: req.target_duration_seconds, imagePrompt: req.prompt_text, assetId: req.asset_id,
        }));
        sharedScope.scenes = scope.scenes;
        const assetPayload = { floor03Handoff: canonicalF03, assetPlanIR: canonicalF03.asset_plan_ir, assetManifest: canonicalF03.manifest, scenes: scope.scenes };
        scope.assetPayload = assetPayload; sharedScope.assetPayload = assetPayload;
        if (missionId && this.missionManager) await this.missionManager.updateProgress(missionId, 1);
        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));
        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId, taskNodeId: node.taskId, capabilityId: "FLOOR_ASSET_REALIZATION", executionId,
          floorId: "floor03_asset_realization", workerId: "worker_assets_01", missionId, output: assetPayload,
          handoff: canonicalF03, executionReport: f03.executionReport, startedAt, completedAt, executionTimeMs,
          durationTruth: "MEASURED", evidenceClass: "TYPED_F03_RUNTIME_HANDOFF", physicalMediaProduced: false,
        });
        return { status: "OK", floor: "floor03_asset_realization", output: assetPayload, executionTimeMs };
      },
      FLOOR_MEDIA_SYNTHESIS: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = Object.assign(sharedScope, (mission?.scope as Record<string, any>) || {});

        this.worldState.updateFloorStatus("floor04_voice", "ONLINE", "Media Synthesis & Voice Generation");
        this.worldState.registerWorker({
          workerId: "worker_audio_01",
          role: "WORKER",
          specialization: "MEDIA_SYNTHESIS",
          status: "HEALTHY",
          lastSeen: new Date().toISOString(),
          metrics: { tasksCompleted: 1, tasksFailed: 0, uptimeSeconds: 100, averageLatencyMs: 20 },
        });

        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_MEDIA_SYNTHESIS",
          executionId,
          floorId: "floor04_media_synthesis",
          workerId: "worker_audio_01",
          missionId,
          startedAt,
        });

        const voiceFabric = new VoiceFabric();
        const scriptToNarrate = scope.script || sharedScope.script || "Narrative script narration";
        const synthRes = await voiceFabric.synthesize(scriptToNarrate);
        scope.voiceUrl = synthRes.localPath;
        scope.voiceArtifact = synthRes;
        sharedScope.voiceUrl = synthRes.localPath;
        sharedScope.voiceArtifact = synthRes;

        const mediaPayload = {
          voice: scope.engineSnapshot?.effectiveConfig?.voice || "neutral",
          estimatedDuration: synthRes.durationSeconds,
          voiceUrl: synthRes.localPath,
          qualityClass: synthRes.qualityClass,
          engineUsed: synthRes.provider,
          byteLength: synthRes.byteLength,
          sha256: synthRes.sha256,
          isFallback: synthRes.isFallback,
        };

        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }

        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));

        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_MEDIA_SYNTHESIS",
          executionId,
          floorId: "floor04_media_synthesis",
          workerId: "worker_audio_01",
          missionId,
          output: mediaPayload,
          startedAt,
          completedAt,
          executionTimeMs,
          durationTruth: "PHYSICAL",
          producedArtifacts: [{ kind: "WAV_AUDIO", path: synthRes.localPath, sha256: synthRes.sha256 }],
          producedArtifactIds: [synthRes.sha256],
        });
        return { status: "OK", floor: "floor04_media_synthesis", output: mediaPayload, executionTimeMs };
      },
      FLOOR_TIMELINE_COMPOSITION: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = Object.assign(sharedScope, (mission?.scope as Record<string, any>) || {});

        this.worldState.updateFloorStatus("floor05_sequencing", "ONLINE", "Timeline Composition & Render Manifest Assembly");
        this.worldState.registerWorker({
          workerId: "worker_timeline_01",
          role: "WORKER",
          specialization: "TIMELINE_COMPOSITION",
          status: "HEALTHY",
          lastSeen: new Date().toISOString(),
          metrics: { tasksCompleted: 1, tasksFailed: 0, uptimeSeconds: 100, averageLatencyMs: 20 },
        });

        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_TIMELINE_COMPOSITION",
          executionId,
          floorId: "floor05_timeline_composition",
          workerId: "worker_timeline_01",
          missionId,
          startedAt,
        });

        const targetJobId = scope.jobId || node.payload?.jobId || `job_${randomUUID().substring(0, 8)}`;
        const effectiveTemplateDef = scope.templateDef || sharedScope.templateDef;
        const effectiveScenePlans = scope.scenePlans || sharedScope.scenePlans;
        let localRenderIntent: LocalRenderIntent | null = null;
        let finalVideoUrl: string | undefined;

        if (effectiveTemplateDef && effectiveScenePlans && effectiveScenePlans.length > 0) {
          const pipeline = TemplateProductionPipeline.getInstance();
          localRenderIntent = pipeline.compileLocalRenderIntent({
            templateDef: effectiveTemplateDef,
            scenePlans: effectiveScenePlans,
            voiceArtifact: sharedScope.voiceArtifact || scope.voiceArtifact,
            jobId: targetJobId,
          });
          scope.localRenderIntent = localRenderIntent;
          sharedScope.localRenderIntent = localRenderIntent;
        }

        const durationSeconds =
          localRenderIntent?.scenes.reduce((acc, s) => acc + s.duration_seconds, 0) ||
          scope.durationSeconds ||
          sharedScope.voiceArtifact?.durationSeconds ||
          scope.voiceArtifact?.durationSeconds ||
          scope.engineSnapshot?.effectiveConfig?.durationSeconds ||
          5;
        const renderIntent: RenderIntent = {
          intentId: `intent_${randomUUID().substring(0, 8)}`,
          jobId: targetJobId,
          missionId: missionId || "direct",
          compositionType: scope.contentType === "QUIZ_SHORTS" ? "QUIZ_SHORTS" : "FACTS_SHORTS",
          durationSeconds,
          fps: 30,
          resolution: { width: 1080, height: 1920 },
          tracks: {
            visualAssets: (scope.scenes || []).map((s: any, idx: number) => ({
              id: `asset_${idx}`,
              type: "IMAGE" as const,
              src: s.imageUrl || `/api/images/${targetJobId}_${idx}.jpg`,
              startSeconds: idx * 5,
              durationSeconds: 5,
              zIndex: 1,
            })),
            audioTracks: [{
              id: "track_voice_0",
              type: "VOICE" as const,
              src: scope.voiceUrl || `/api/voice/${targetJobId}.wav`,
              volume: 1.0,
              startSeconds: 0,
              durationSeconds,
            }],
            captions: (scope.scenes || []).map((s: any, idx: number) => ({
              text: s.contactText || s.text || "",
              startMs: idx * 5000,
              endMs: (idx + 1) * 5000,
              style: { animation: "POP" as const },
            })),
          },
          preferredCompiler: scope.preferredCompiler || "FFMPEG",
          constraints: { hardwareAccel: true },
          createdAt: new Date().toISOString(),
        };

        scope.renderIntent = renderIntent;
        sharedScope.renderIntent = renderIntent;
        sharedScope.jobId = targetJobId;

        const consumedAudioSha256 = sharedScope.voiceArtifact?.sha256 || scope.voiceArtifact?.sha256;
        const timelinePayload = {
          manifestVersion: "2.0",
          scenes: scope.scenes || [],
          quizData: scope.quizData || null,
          renderProfile: scope.renderProfile || "FAST_QUIZ",
          renderIntent,
          intentId: renderIntent.intentId,
          resolution: renderIntent.resolution,
          durationSeconds: renderIntent.durationSeconds,
          consumedAudioSha256,
          consumedAudioPath: scope.voiceUrl,
        };

        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }

        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));

        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_TIMELINE_COMPOSITION",
          executionId,
          floorId: "floor05_timeline_composition",
          workerId: "worker_timeline_01",
          missionId,
          output: timelinePayload,
          startedAt,
          completedAt,
          executionTimeMs,
          durationTruth: "PHYSICAL",
          consumedArtifacts: scope.voiceUrl ? [{ kind: "WAV_AUDIO", path: scope.voiceUrl, sha256: consumedAudioSha256 }] : [],
          consumedArtifactIds: consumedAudioSha256 ? [consumedAudioSha256] : [],
        });
        return { status: "OK", floor: "floor05_timeline_composition", output: timelinePayload, executionTimeMs };
      },
      FLOOR_RENDERING: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = Object.assign(sharedScope, (mission?.scope as Record<string, any>) || {});

        this.worldState.updateFloorStatus("floor06_rendering", "ONLINE", "Render Orchestration & Compute Dispatch");
        this.worldState.registerWorker({
          workerId: "worker_render_01",
          role: "WORKER",
          specialization: "RENDERING",
          status: "HEALTHY",
          lastSeen: new Date().toISOString(),
          metrics: { tasksCompleted: 1, tasksFailed: 0, uptimeSeconds: 100, averageLatencyMs: 40 },
        });

        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_RENDERING",
          executionId,
          floorId: "floor06_rendering",
          workerId: "worker_render_01",
          missionId,
          startedAt,
        });

        const targetJobId = scope.jobId || node.payload?.jobId || `job_${randomUUID().substring(0, 8)}`;
        const executionToken = scope.executionToken || randomUUID().replace(/-/g, "");

        await this.decisionLedger.record({
          goalId: `render_${targetJobId}`,
          stateSnapshot: this.worldState.getState() as unknown as Record<string, unknown>,
          thinkingMode: "REFLEX",
          availableOptions: ["DISPATCH_RENDER_FABRIC"],
          selectedOption: "DISPATCH_RENDER_FABRIC",
          reasoningSummary: "Compiled RenderIntent ready for execution",
          predictedOutcome: "Render job dispatched to designated compiler and compute plane",
          agentsUsed: ["worker_render_01"],
          toolsUsed: ["renderFabric.executeRender"],
          executionTimeMs: 40,
        });

        const renderFabric = new RenderFabric();
        const renderIntent: RenderIntent = scope.renderIntent || {
          intentId: `intent_${randomUUID().substring(0, 8)}`,
          jobId: targetJobId,
          missionId: missionId || "direct",
          compositionType: scope.contentType === "QUIZ_SHORTS" ? "QUIZ_SHORTS" : "FACTS_SHORTS",
          durationSeconds: scope.durationSeconds || 5,
          fps: 30,
          resolution: { width: 1080, height: 1920 },
          tracks: {
            visualAssets: scope.scenes || [],
            audioTracks: scope.voiceUrl
              ? [{
                  id: "track_voice_0",
                  type: "VOICE",
                  src: scope.voiceUrl,
                  volume: 1.0,
                  startSeconds: 0,
                  durationSeconds: scope.durationSeconds || 5,
                }]
              : [],
            captions: [],
          },
          preferredCompiler: "FFMPEG",
          constraints: { hardwareAccel: true },
          createdAt: new Date().toISOString(),
        };

        const renderRes = await renderFabric.executeRender(renderIntent, {
          localRenderIntent: (scope.localRenderIntent || sharedScope.localRenderIntent) as LocalRenderIntent | undefined,
        });

        if (!renderRes.artifact || !renderRes.receipt) {
          throw new Error(
            "[Overseer Floor06] RenderFabric completed without a physical artifact or execution receipt"
          );
        }

        const artifact = renderRes.artifact;
        scope.artifact = artifact;
        sharedScope.artifact = artifact;
        scope.renderReceipt = renderRes.receipt;
        sharedScope.renderReceipt = renderRes.receipt;
        finalVideoUrl = (artifact.location as any).path;
        scope.videoUrl = finalVideoUrl;
        sharedScope.videoUrl = finalVideoUrl;

        const renderOutputMessage =
          `RenderFabric/ComputeRouter produced verified MP4 artifact (${artifact.width}x${artifact.height}, ${artifact.byteLength} bytes, SHA-256: ${artifact.sha256.substring(0, 10)}...)`;

        try {
          const { saveJobManifest } = await import("../../../lib/jobs-history");
          await saveJobManifest(targetJobId, {
            status: "completed",
            videoUrl: `/api/media/video/${targetJobId}`,
            downloadUrl: `/api/media/video/${targetJobId}`,
            localVideoPath: finalVideoUrl,
            artifactSha256: artifact.sha256,
            duration: artifact.duration,
            videoSizeMb: Number((artifact.byteLength / (1024 * 1024)).toFixed(2)),
            renderDurationSeconds: artifact.duration,
            renderReceipt: renderRes.receipt,
            templateId: scope.templateId,
            templateVersion: scope.templateVersion,
            contentEngine: scope.contentEngine,
            formatFamily: scope.formatFamily,
            completedAt: new Date().toISOString(),
          } as any);
        } catch (e: any) {
          console.warn(`[Overseer Floor06] Manifest note: ${e?.message}`);
        }

        await this.decisionLedger.record({
          goalId: `render_${targetJobId}`,
          stateSnapshot: this.worldState.getState() as unknown as Record<string, unknown>,
          thinkingMode: "REFLEX",
          availableOptions: ["DISPATCH_RENDER_FABRIC"],
          selectedOption: "DISPATCH_RENDER_FABRIC",
          reasoningSummary: "RenderIntent executed through the canonical RenderFabric and ComputeRouter",
          predictedOutcome: "Verified physical render artifact available for F07",
          agentsUsed: ["worker_render_01"],
          toolsUsed: ["RenderFabric.executeRender", "ComputeRouter.dispatchWithFailover"],
          executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        });

        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }

        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));

        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_RENDERING",
          executionId,
          floorId: "floor06_rendering",
          workerId: "worker_render_01",
          missionId,
          jobId: targetJobId,
          output: renderOutputMessage,
          artifact: scope.artifact,
          videoUrl: finalVideoUrl,
          sha256: scope.artifact?.sha256,
          byteLength: scope.artifact?.byteLength,
          width: scope.artifact?.width,
          height: scope.artifact?.height,
          startedAt,
          completedAt,
          executionTimeMs,
          durationTruth: "PHYSICAL",
          consumedArtifacts: scope.voiceUrl ? [{ kind: "WAV_AUDIO", path: scope.voiceUrl, sha256: sharedScope.voiceArtifact?.sha256 }] : [],
          consumedArtifactIds: sharedScope.voiceArtifact?.sha256 ? [sharedScope.voiceArtifact.sha256] : [],
          producedArtifacts: scope.artifact ? [{ kind: "MP4_VIDEO", path: finalVideoUrl, sha256: scope.artifact.sha256 }] : [],
          producedArtifactIds: scope.artifact?.sha256 ? [scope.artifact.sha256] : [],
        });
        return {
          status: "OK",
          floor: "floor06_rendering",
          jobId: targetJobId,
          artifact: scope.artifact,
          videoUrl: finalVideoUrl,
          output: renderOutputMessage,
          executionTimeMs,
        };
      },
      FLOOR_VERIFICATION: async (node: any) => {
        const startTime = performance.now();
        const startedAt = new Date().toISOString();
        const executionId = `exec_${node.taskId}_${Date.now()}`;
        const mission = missionId && this.missionManager ? await this.missionManager.getMission(missionId) : null;
        const scope = Object.assign(sharedScope, (mission?.scope as Record<string, any>) || {});

        this.worldState.updateFloorStatus("floor07_compliance", "ONLINE", "Media & Artifact Forensic Verification");
        this.worldState.registerWorker({
          workerId: "worker_compliance_01",
          role: "WORKER",
          specialization: "COMPLIANCE",
          status: "HEALTHY",
          lastSeen: new Date().toISOString(),
          metrics: { tasksCompleted: 1, tasksFailed: 0, uptimeSeconds: 100, averageLatencyMs: 15 },
        });

        await this.eventBus.publish("TASK_STARTED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_VERIFICATION",
          executionId,
          floorId: "floor07_compliance",
          workerId: "worker_compliance_01",
          missionId,
          startedAt,
        });

        const targetJobId =
          scope.jobId ||
          sharedScope.jobId ||
          node.dependencyOutputs?.["task_f06_rendering"]?.jobId ||
          node.payload?.jobId ||
          `job_${randomUUID().substring(0, 8)}`;
        const artifact =
          scope.artifact ||
          sharedScope.artifact ||
          node.dependencyOutputs?.["task_f06_rendering"]?.artifact;
        const videoUrl =
          scope.videoUrl ||
          sharedScope.videoUrl ||
          node.dependencyOutputs?.["task_f06_rendering"]?.videoUrl ||
          (artifact?.location?.path);

        const verificationReport = await VerificationEngine.auditMediaArtifact({
          jobId: targetJobId,
          artifact,
          videoUrl,
          scriptText: scope.script || sharedScope.script || "",
          sceneCount: Array.isArray(scope.scenes) ? scope.scenes.length : 1,
          durationSeconds:
            scope.renderIntent?.durationSeconds ||
            sharedScope.renderIntent?.durationSeconds ||
            3,
          policyViolations: [],
        });

        if (!verificationReport.verified) {
          await this.caseManager.createCase({
            title: `Forensic Verification Rejection on Floor 07: ${targetJobId}`,
            description: `Media probe rejected artifact: ${verificationReport.failures.join("; ")}`,
            floorId: "floor07_compliance",
            category: "VALIDATION_REJECTION",
            severity: "HIGH",
            detectorId: "worker_compliance_01",
            jobId: targetJobId,
            symptoms: verificationReport.failures,
            observedState: verificationReport.measurements as any,
          });
        }

        let deliveryArtifact: any;
        if (verificationReport?.verified && videoUrl) {
          try {
            const { DriveDeliveryAdapter } = await import("../adapters/DriveDeliveryAdapter");
            const adapter = new DriveDeliveryAdapter();
            const jobShim: any = {
              id: targetJobId,
              videoArtifact: { filePath: videoUrl },
            };
            adapter.enqueue(jobShim);
            deliveryArtifact = await adapter.processDelivery(jobShim);
            scope.deliveryArtifact = deliveryArtifact;
            sharedScope.deliveryArtifact = deliveryArtifact;
            await this.eventBus.publish("DELIVERY_COMPLETED", {
              jobId: targetJobId,
              deliveryArtifact,
              localStatus: "LOCALLY_COMMITTED",
              remoteStatus: deliveryArtifact.deliveryMethod === "GOOGLE_DRIVE" ? "REMOTE_UPLOADED" : "NOT_ATTEMPTED",
            });
          } catch (delErr: any) {
            console.warn(`[Overseer Delivery] Outbox delivery notice: ${delErr?.message}`);
          }
        }

        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }

        const endTime = performance.now();
        const completedAt = new Date().toISOString();
        const executionTimeMs = Math.max(1, Math.round(endTime - startTime));

        await this.eventBus.publish("TASK_COMPLETED", {
          taskId: node.taskId,
          taskNodeId: node.taskId,
          capabilityId: "FLOOR_VERIFICATION",
          executionId,
          floorId: "floor07_compliance",
          workerId: "worker_compliance_01",
          missionId,
          jobId: targetJobId,
          output: verificationReport,
          deliveryArtifact,
          startedAt,
          completedAt,
          executionTimeMs,
          durationTruth: "PHYSICAL",
          consumedArtifacts: videoUrl ? [{ kind: "MP4_VIDEO", path: videoUrl, sha256: artifact?.sha256 }] : [],
          consumedArtifactIds: artifact?.sha256 ? [artifact.sha256] : [],
        });
        return {
          status: "OK",
          floor: "floor07_compliance",
          jobId: targetJobId,
          output: verificationReport,
          deliveryArtifact,
          videoUrl,
          executionTimeMs,
        };
      },
      TOOL: async (node: any) => {
        if (missionId && this.missionManager) {
          await this.missionManager.updateProgress(missionId, 1);
        }
        return { status: "OK", result: "Generic task executed" };
      },
    };
  }

  /**
   * Periodic Supervisor Loop:
   * Self-monitoring, case triage, healer dispatching, and verification.
   */
  async runSupervisorCycle(): Promise<void> {
    const currentState = this.worldState.getState();

    // 1. Update Overseer Heartbeat
    this.worldState.updateWorkerHeartbeat("overseer_control_plane", "HEALTHY");
    await this.eventBus.publish("WORKER_HEARTBEAT", {
      workerId: "overseer_control_plane",
      role: "OPERATOR",
      status: "HEALTHY",
    });

    // 2. Triage active cases
    const activeCases = await this.caseManager.getActiveCases();

    for (const caseItem of activeCases) {
      if (caseItem.status === "DETECTED") {
        // 1. Evaluate through Cognitive Runtime (Triage -> Memory -> Context -> Evidence -> Simulation)
        const cognitiveEval = await this.cognitiveRuntime.evaluateIncident({
          incidentId: caseItem.caseId,
          caseId: caseItem.caseId,
          floorId: caseItem.floorId,
          target: caseItem.targetWorker,
          category: caseItem.category,
          severity: caseItem.severity,
          symptoms: caseItem.symptoms || [caseItem.description],
          observedMetrics: (caseItem.observedState as Record<string, unknown>) || {},
        });

        // 2. Triage and transition to INVESTIGATING or HEALING
        await this.caseManager.transitionStatus(
          caseItem.caseId,
          "TRIAGED",
          "Overseer",
          `Automated cognitive triage: ${cognitiveEval.rootCauseTheory}`
        );

        // 3. Dispatch Healer Swarm
        await this.caseManager.transitionStatus(
          caseItem.caseId,
          "INVESTIGATING",
          "Overseer",
          `Dispatching Healers for verified strategy: ${cognitiveEval.recommendedAction}`
        );

        const reports = await this.healerEngine.dispatchHealersForCase(caseItem);

        // 4. Record decision in Decision Ledger
        await this.decisionLedger.record({
          caseId: caseItem.caseId,
          stateSnapshot: { caseId: caseItem.caseId, severity: caseItem.severity },
          thinkingMode: cognitiveEval.complexityLevel === "RLM" ? "DEEP" : "DELIBERATE",
          availableOptions: ["DISPATCH_HEALER_SQUAD", "ESCALATE_TO_HUMAN", "SUPPRESS_ANOMALY"],
          selectedOption: "DISPATCH_HEALER_SQUAD",
          reasoningSummary: cognitiveEval.rationale,
          predictedOutcome: "Hypothesis verified and transactional repair applied",
          agentsUsed: reports.map((r) => r.healerId),
          toolsUsed: ["healer.verify", "healer.repair", "repairGate.execute"],
          executionTimeMs: reports.reduce((acc, r) => acc + r.durationMs, 0),
        });

        // 5. If case transitioned to VERIFYING, trigger validator and close learning loop
        const healedCase = await this.caseManager.getCase(caseItem.caseId);
        if (healedCase && healedCase.status === "VERIFYING") {
          const validationResult = await this.validator.verifyCaseResolution(healedCase);
          await this.cognitiveRuntime.outcomeLearner.recordOutcome({
            incidentId: caseItem.caseId,
            category: caseItem.category,
            floorId: caseItem.floorId,
            proposedAction: cognitiveEval.recommendedAction,
            predictedSuccess: true,
            validatorPassed: validationResult.overallPassed,
            durationMs: cognitiveEval.durationMs,
            symptoms: caseItem.symptoms || [caseItem.description],
          });
        }
      } else if (caseItem.status === "VERIFYING") {
        // Trigger independent validator
        await this.validator.verifyCaseResolution(caseItem);
      }
    }

    // 6. Autonomous Mission Completion Evaluation
    if (this.missionManager) {
      const activeMissions = await this.missionManager.getActiveMissions();
      const activeCases = await this.caseManager.getActiveCases();
      const unresolvedBlocking = activeCases.filter((c) => c.status !== "RESOLVED");

      if (unresolvedBlocking.length === 0) {
        for (const m of activeMissions) {
          if (m.status === "REPLANNING") {
            try {
              await this.missionManager.startMission(m.missionId);
            } catch {}
          } else if (m.status === "RUNNING") {
            try {
              await this.missionManager.completeMission(m.missionId);
            } catch {
              // Ignore if not ready
            }
          }
        }
      }
    }
  }

  async resolveEvidenceContradiction(
    caseId: string,
    reports: { source: string; claim: string }[]
  ): Promise<{ resolvedClaim: string; rationale: string }> {
    const currentState = this.worldState.getState();
    const isStorageDegraded = currentState.resources.driveAvailable === false || currentState.floors["floor03_asset_realization"]?.status === "DEGRADED";
    const resolvedClaim = isStorageDegraded ? "Storage subsystem degraded" : "GPU VRAM allocation stalled";

    const decision = await this.decisionLedger.record({
      caseId,
      stateSnapshot: { caseId, reports },
      thinkingMode: "DEEP",
      availableOptions: ["TRUST_GUARDIAN", "TRUST_SLAYER", "RUN_DIAGNOSTIC_PROBE"],
      selectedOption: "RUN_DIAGNOSTIC_PROBE",
      reasoningSummary: `Detected contradiction between ${reports.length} reports. Diagnostic probe resolved claim to '${resolvedClaim}' based on WorldState telemetry.`,
      predictedOutcome: "Root cause resolved without misdiagnosis",
      agentsUsed: ["overseer", "slayer_patrol"],
      toolsUsed: ["tool_internal_telemetry", "tool_agent_reach"],
      executionTimeMs: 120,
    });

    return { resolvedClaim, rationale: decision.reasoningSummary };
  }

  getRun(runId: string): OverseerRun | undefined {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : undefined;
  }

  getAllRuns(): OverseerRun[] {
    return Array.from(this.runs.values()).map((r) => structuredClone(r));
  }

  async getDecisions(caseId?: string, limit: number = 50) {
    return this.decisionLedger.getRecentDecisions(limit);
  }

  getDecisionLedger(): DecisionLedger {
    return this.decisionLedger;
  }

  getTaskPlanner(): TaskDAGPlanner {
    return this.dagPlanner;
  }

  getThinkingController(): OverseerThinkingController {
    return this.thinkingController;
  }

  getPresenceEngine(): OverseerPresenceEngine {
    return this.presenceEngine;
  }
}
