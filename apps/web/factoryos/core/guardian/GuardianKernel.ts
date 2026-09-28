/**
 * FactoryOS Frontier v2 — Floor Guardian Operating Mind (Kernel)
 * Autonomous local owner and operating mind for a single production floor.
 */

import { randomUUID } from "node:crypto";
import type {
  GuardianConfig,
  GuardianAuditReport,
  GuardianDecision,
  GuardianEscalation,
  GuardianState,
} from "./GuardianContracts";
import { GuardianStateMachine } from "./GuardianStateMachine";
import { GuardianPolicy } from "./GuardianPolicy";
import { GuardianMemory } from "./GuardianMemory";
import { GuardianWorkerManager } from "./GuardianWorkerManager";
import { GuardianLoadBalancer } from "./GuardianLoadBalancer";
import { GuardianAuditEngine } from "./GuardianAuditEngine";
import { GuardianReportEngine } from "./GuardianReportEngine";
import { GuardianDecisionEngine } from "./GuardianDecisionEngine";
import { GuardianLocalWorldModel } from "./GuardianLocalWorldModel";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { CaseManager } from "../cases/CaseManager";
import type { FloorGovernanceCell } from "../governance/FloorGovernanceCell";
import { GuardianGovernanceAdapter } from "../governance/GuardianGovernanceAdapter";

export class GuardianKernel {
  readonly floorId: string;
  readonly name: string;
  public readonly config: GuardianConfig;

  public readonly stateMachine: GuardianStateMachine;
  public readonly policy: GuardianPolicy;
  public readonly memory: GuardianMemory;
  public readonly workerManager: GuardianWorkerManager;
  public readonly loadBalancer: GuardianLoadBalancer;
  public readonly auditEngine: GuardianAuditEngine;
  public readonly reportEngine: GuardianReportEngine;
  public readonly decisionEngine: GuardianDecisionEngine;
  public readonly localWorldModel: GuardianLocalWorldModel;

  // Alias for backward compatibility
  public get localModel(): GuardianLocalWorldModel {
    return this.localWorldModel;
  }

  private worldState: WorldStateEngine;
  private eventBus: DurableEventBus;
  private caseManager?: CaseManager;
  private governanceCell?: FloorGovernanceCell;
  private governanceAdapter?: GuardianGovernanceAdapter;

  private auditIntervalMs: number;
  private heartbeatIntervalMs: number;
  private auditTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isAuditing: boolean = false;

  constructor(
    config: GuardianConfig | { guardianId?: string; floorId: string; auditIntervalMs?: number; name?: string },
    worldState: WorldStateEngine,
    eventBus: DurableEventBus,
    caseManager?: CaseManager
  ) {
    this.floorId = config.floorId;
    this.name = config.name || `Floor Guardian (${config.floorId})`;
    this.config = {
      floorId: config.floorId,
      name: this.name,
      auditIntervalMs: config.auditIntervalMs ?? 3000,
    };
    this.worldState = worldState;
    this.eventBus = eventBus;
    this.caseManager = caseManager;

    this.auditIntervalMs = this.config.auditIntervalMs ?? 3000;
    this.heartbeatIntervalMs = this.config.heartbeatIntervalMs ?? 4000;

    this.stateMachine = new GuardianStateMachine("BOOT");
    this.policy = new GuardianPolicy(this.floorId);
    this.memory = new GuardianMemory(this.floorId);
    this.workerManager = new GuardianWorkerManager(this.floorId, this.worldState, this.memory);
    this.loadBalancer = new GuardianLoadBalancer(this.floorId, this.config.concurrencyLimit ?? 10);
    this.auditEngine = new GuardianAuditEngine(this.floorId);
    this.reportEngine = new GuardianReportEngine(this.floorId);
    this.decisionEngine = new GuardianDecisionEngine(this.floorId, this.policy, this.memory);
    this.localWorldModel = new GuardianLocalWorldModel(this.floorId);

    this.subscribeToEvents();
  }

  attachGovernanceCell(cell: FloorGovernanceCell): void {
    if (cell.floorId !== this.floorId) {
      throw new Error(`Governance cell floor mismatch: ${cell.floorId} != ${this.floorId}`);
    }
    this.governanceCell = cell;
    this.governanceAdapter = new GuardianGovernanceAdapter(cell);
  }

  getGovernanceCell(): FloorGovernanceCell | undefined {
    return this.governanceCell;
  }

  getState(): GuardianState {
    return this.stateMachine.getState();
  }

  getStatus(): string {
    return "ONLINE";
  }

  async boot(): Promise<void> {
    await this.start();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.stateMachine.transition("BOOT", "Guardian starting");
    await this.restoreState();

    this.stateMachine.transition("IDLE", "Ready for autonomous audit cycles");

    // Start background autonomous loops
    this.auditTimer = setInterval(() => {
      this.runAuditCycle().catch(() => {});
    }, this.auditIntervalMs);

    this.heartbeatTimer = setInterval(() => {
      this.emitHeartbeat().catch(() => {});
    }, this.heartbeatIntervalMs);

    await this.emitHeartbeat();
    await this.runAuditCycle();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.auditTimer) {
      clearInterval(this.auditTimer);
      this.auditTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.stateMachine.transition("IDLE", "Guardian stopped");
  }

  /**
   * Restores state and registers with WorldState upon boot.
   */
  async restoreState(): Promise<void> {
    this.stateMachine.transition("RESTORE", "Restoring floor state");
    const world = this.worldState.getState();
    const floor = world.floors[this.floorId];

    if (floor) {
      this.localWorldModel.updateHealth(floor.status === "ONLINE" ? "HEALTHY" : "DEGRADED");
    }

    // Register Guardian as special agent in WorldState
    this.worldState.registerWorker({
      workerId: `guardian_${this.floorId}`,
      role: "GUARDIAN" as any,
      specialization: this.floorId,
      status: "HEALTHY",
      lastSeen: new Date().toISOString(),
      assignedFloor: this.floorId,
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        uptimeSeconds: 0,
        averageLatencyMs: 25,
      },
    });
  }

  /**
   * The Complete Autonomous Floor Guardian Loop:
   * OBSERVE -> AUDIT -> CLASSIFY -> PLAN -> DISPATCH -> EXECUTE -> VERIFY -> REPORT -> IDLE
   */
  async runAuditCycle(): Promise<GuardianAuditReport> {
    if (this.isAuditing) {
      return this.reportEngine.createEscalation("LOW", "Audit in progress", []) as any;
    }
    this.isAuditing = true;

    try {
      // 1. OBSERVE
      this.stateMachine.transition("OBSERVE", "Gathering floor telemetry");
      const world = this.worldState.getState();
      const floor = world.floors[this.floorId];
      const floorWorkers = this.workerManager.getFloorWorkers();
      const activeCases = this.caseManager ? await this.caseManager.getActiveCases() : [];
      const queueDepth = floor?.queueDepth || 0;

      // Check local world model for failing workers / rebalancing
      this.auditLocalModelWorkers();

      // 2. AUDIT
      this.stateMachine.transition("AUDIT", "Inspecting workers and queues");
      const audit = this.auditEngine.auditFloor(floor, floorWorkers, activeCases, queueDepth);

      // 3. CLASSIFY
      this.stateMachine.transition("CLASSIFY", `Floor classified as ${audit.health}`);
      this.localWorldModel.updateHealth(audit.health);

      // 4. PLAN
      this.stateMachine.transition("PLAN", "Planning autonomous local actions");
      const loadBalance = this.loadBalancer.evaluateLoad(floorWorkers, queueDepth);
      const decisions = this.decisionEngine.planActions(audit, floorWorkers, loadBalance);
      audit.recommendedActions = decisions;

      // 5. DISPATCH & EXECUTE
      if (decisions.length > 0) {
        this.stateMachine.transition("DISPATCH", `Dispatching ${decisions.length} actions`);
        for (const decision of decisions) {
          await this.executeDecision(decision, audit);
        }
      }

      // 6. VERIFY & REPORT
      this.stateMachine.transition("REPORT", "Publishing audit report");
      this.memory.recordAudit(audit);

      await this.eventBus.publish("GUARDIAN_REPORT", {
        floorId: this.floorId,
        report: audit,
        timestamp: new Date().toISOString(),
      });

      this.stateMachine.transition("IDLE", "Audit cycle complete");
      return audit;
    } finally {
      this.isAuditing = false;
    }
  }

  private auditLocalModelWorkers(): void {
    const localWorkers = this.localWorldModel.getWorkers();

    let overloadedWorker: string | null = null;
    let idleWorker: string | null = null;

    for (const [wId, w] of localWorkers.entries()) {
      if (w.utilizationPercent > 80) overloadedWorker = wId;
      if (w.utilizationPercent < 30) idleWorker = wId;

      // Check tasks failed
      if (w.tasksFailed >= 3 && !w.isQuarantined) {
        this.localWorldModel.quarantineWorker(wId);
        this.eventBus.publish("WORKER_QUARANTINED", {
          floorId: this.floorId,
          workerId: wId,
          reason: "Excessive task failures (>2) in local model",
        }).catch(() => {});
      }
    }

    if (overloadedWorker && idleWorker) {
      this.localWorldModel.updateWorkerHeartbeat(overloadedWorker, true, 50);
      this.localWorldModel.updateWorkerHeartbeat(idleWorker, true, 50);
      this.eventBus.publish("WORKLOAD_REBALANCED", {
        floorId: this.floorId,
        fromWorkerId: overloadedWorker,
        toWorkerId: idleWorker,
      }).catch(() => {});
    }
  }

  /**
   * Executes an autonomous decision locally or escalates to Overseer.
   */
  /** 
   * Every legacy Guardian mutation now crosses the Floor Governance Cell.
   * Guardian remains the authority; the governance cell supplies the typed
   * action contract, capability/scope checks and immutable decision evidence.
   */
  private async executeDecision(decision: GuardianDecision, audit: GuardianAuditReport): Promise<void> {
    if (!this.governanceCell) {
      await this.executeDecisionLegacy(decision, audit);
      return;
    }

    const world = this.worldState.getState();
    const activeCases = this.caseManager ? await this.caseManager.getActiveCases() : [];
    const snapshot = this.governanceCell.createSnapshot({
      jobs: Object.values((world as any).jobs || {}),
      workers: Object.values(world.workers || {}),
      resources: [world.resources],
      activeIncidents: activeCases.map((item) => item.caseId),
      constraints: [
        ...(audit.health === "CRITICAL" ? ["critical_floor_state"] : []),
        ...(decision.requiresOverseerApproval ? ["overseer_approval_required"] : []),
      ],
    });

    const result = this.governanceAdapter
      ? await this.governanceAdapter.executeDecision(
          decision,
          snapshot,
          async () => this.executeDecisionLegacy(decision, audit)
        )
      : await this.governanceCell.executeGuardianDecision(
          decision,
          snapshot,
          () => this.executeDecisionLegacy(decision, audit)
        );

    if (!result.success) {
      await this.escalateToOverseer(
        "HIGH",
        `Floor governance denied Guardian action ${decision.action}: ${result.reason}`,
        [decision, result]
      );
    }
  }

  private async executeDecisionLegacy(decision: GuardianDecision, audit: GuardianAuditReport): Promise<void> {
    this.stateMachine.transition("EXECUTE", `Executing ${decision.action} on ${decision.targetId}`);
    this.memory.recordDecision(decision);

    switch (decision.action) {
      case "RECOVER_WORKER": {
        const res = await this.workerManager.recoverWorker(decision.targetId);
        if (res.quarantined) {
          await this.escalateToOverseer("HIGH", `Worker ${decision.targetId} quarantined after repeated failures`, [decision]);
        }
        break;
      }

      case "QUARANTINE_WORKER": {
        this.workerManager.quarantineWorker(decision.targetId);
        break;
      }

      case "REBALANCE": {
        await this.eventBus.publish("QUEUE_CONGESTION", {
          floorId: this.floorId,
          action: "REBALANCE_EXECUTED",
          parameters: decision.parameters,
        });
        break;
      }

      case "THROTTLE_CONCURRENCY": {
        this.worldState.updateFloorStatus(this.floorId, "ONLINE", "Throttled for congestion relief");
        break;
      }

      case "ESCALATE": {
        await this.escalateToOverseer(
          audit.health === "CRITICAL" ? "CRITICAL" : "HIGH",
          decision.reason,
          audit.findings
        );
        break;
      }
    }
  }

  /**
   * Formal Escalation to the Overseer Control Plane.
   */
  async escalateToOverseer(
    severity: GuardianEscalation["severity"],
    reason: string,
    evidence: unknown[],
    caseId?: string
  ): Promise<GuardianEscalation> {
    const escalation = this.reportEngine.createEscalation(severity, reason, evidence);
    this.memory.recordEscalation(escalation);

    await this.eventBus.publish("GUARDIAN_ESCALATION", {
      escalation,
      floorId: this.floorId,
      caseId,
      reason,
      timestamp: new Date().toISOString(),
    });

    return escalation;
  }

  generateReport(action: string, reason: string): { reportId: string; floorId: string; recommendedAction: string; rationale: string; requiresOverseer: boolean; timestamp: string } {
    return {
      reportId: `rep_${randomUUID().substring(0, 8)}`,
      floorId: this.floorId,
      recommendedAction: action,
      rationale: reason,
      requiresOverseer: action === "ESCALATE",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Emits regular Guardian Heartbeat.
   */
  async emitHeartbeat(): Promise<void> {
    this.worldState.updateWorkerHeartbeat(`guardian_${this.floorId}`, "HEALTHY");
    await this.eventBus.publish("GUARDIAN_HEARTBEAT", {
      floorId: this.floorId,
      guardianId: `guardian_${this.floorId}`,
      state: this.stateMachine.getState(),
      health: this.localWorldModel.getHealth(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Subscribes to real FactoryOS events.
   */
  private subscribeToEvents(): void {
    // 1. Worker Failure Event
    this.eventBus.subscribe("WORKER_FAILED", async (event: any) => {
      const payload = event?.payload || event;
      const workerId = payload?.workerId || payload?.agentId;
      if (workerId && (payload?.floorId === this.floorId || workerId.includes(this.floorId))) {
        this.memory.recordWorkerFailure(workerId);
        if (this.isRunning) {
          await this.runAuditCycle().catch(() => {});
        }
      }
    });

    // 2. Anomaly Detected (Slayer Ingestion)
    this.eventBus.subscribe("ANOMALY_DETECTED", async (event: any) => {
      const payload = event?.payload || event;
      if (payload?.floorId === this.floorId) {
        this.localWorldModel.registerWorker(`worker_${this.floorId}_01`);
        if (payload?.severity === "CRITICAL") {
          await this.escalateToOverseer("CRITICAL", `Critical Slayer anomaly: ${payload.description}`, [payload]);
        } else if (this.isRunning) {
          await this.runAuditCycle().catch(() => {});
        }
      }
    });

    // 3. Case Created
    this.eventBus.subscribe("CASE_CREATED", async (event: any) => {
      const payload = event?.payload || event;
      const caseItem = payload?.caseItem || payload;
      if (caseItem?.floorId === this.floorId) {
        if (caseItem?.severity === "CRITICAL" || caseItem?.category === "CROSS_FLOOR_DEPENDENCY") {
          await this.escalateToOverseer(
            "CRITICAL",
            caseItem?.title || "Critical cross-floor incident",
            [caseItem],
            caseItem?.caseId
          );
        } else if (this.isRunning) {
          await this.runAuditCycle().catch(() => {});
        }
      }
    });

    // 4. Floor Status Changed
    this.eventBus.subscribe("FLOOR_STATUS_CHANGED", async (event: any) => {
      const payload = event?.payload || event;
      if (payload?.floorId === this.floorId && this.isRunning) {
        await this.runAuditCycle().catch(() => {});
      }
    });
  }
}
