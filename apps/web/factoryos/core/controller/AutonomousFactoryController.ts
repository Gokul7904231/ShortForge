/**
 * FactoryOS v1 — Autonomous Factory Controller
 * The master autonomous control loop and orchestrator for FactoryOS.
 */

import { DatabaseFactory, MongoDBClient } from "../database/MongoDBClient";
import type {
  ICaseRepository,
  IDecisionRepository,
  ILeaseRepository,
  IMemoryRepository,
  IReputationRepository,
  ITaskDAGRepository,
  IWorldStateRepository,
} from "../database/DatabaseContracts";
import { WorldStateEngine } from "../worldstate/WorldStateEngine";
import { DurableEventBus } from "../events/DurableEventBus";
import { LeaseManager } from "../leases/LeaseManager";
import { CaseManager } from "../cases/CaseManager";
import { SlayerEngine } from "../slayers/SlayerEngine";
import { HealerEngine } from "../healers/HealerEngine";
import { ValidatorAgent } from "../validator/ValidatorAgent";
import { OverseerControlPlane } from "../overseer/OverseerControlPlane";
import { MemoryEngine } from "../memory/MemoryEngine";
import { FactoryWatchdog } from "../watchdog/FactoryWatchdog";
import { PythonFloorBridge } from "../bridge/PythonFloorBridge";
import { OverseerAPIHandler } from "../overseer/api/OverseerAPIHandler";
import { CognitivePlaneEngine } from "../cognitive/CognitivePlaneEngine";
import { MissionManager } from "../missions/MissionManager";
import { GuardianManager } from "../guardian/GuardianManager";

import { CapabilityRegistry } from "../cognitive/CapabilityRegistry";
import { InstructorSubsystem } from "../instructor/InstructorSubsystem";
import { FactoryProjectionService } from "../projection/FactoryProjectionService";
import { VoiceFabric } from "../voice/VoiceFabric";
import { RenderFabric } from "../fabric/RenderFabric";
import { EvolutionBrainSeam } from "../evolution/EvolutionBrainSeam";
import { ContentGenomeTracker } from "../artifacts/ContentGenome";
import { ResearchRuntime } from "../research/ResearchRuntime";
import { KnowledgeStore } from "../intelligence/knowledge/KnowledgeStore";
import { MemoryWriter } from "../intelligence/writer/MemoryWriter";
import { MemoryFabricBridge } from "../intelligence/memory/MemoryFabricBridge";
import { InMemoryMemoryFabricLedger, MongoMemoryFabricLedger } from "../intelligence/memory/MongoMemoryFabricLedger";

export interface FactoryOSConfig {
  readonly storageType?: "memory" | "disk" | "mongo";
  readonly storagePath?: string;
  readonly mongoUri?: string;
  readonly dbName?: string;
  readonly strictPersistence?: boolean;
  readonly patrolIntervalMs?: number;
  readonly supervisorIntervalMs?: number;
  readonly watchdogIntervalMs?: number;
  readonly autoStartSwarm?: boolean;
  readonly memoryFabricEnabled?: boolean;
  readonly memoryFabricVaultPath?: string;
  readonly memoryFabricReconciliationIntervalMs?: number;
  readonly memoryFabricCollections?: readonly string[];
}

export class AutonomousFactoryController {
  private config: FactoryOSConfig;
  private isBooted: boolean = false;
  private isRunning: boolean = false;
  private mainLoopTimer: NodeJS.Timeout | null = null;

  // Subsystems
  public mongoClient?: MongoDBClient;
  public worldState!: WorldStateEngine;
  public eventBus!: DurableEventBus;
  public leaseManager!: LeaseManager;
  public caseManager!: CaseManager;
  public missionManager!: MissionManager;
  public guardianManager!: GuardianManager;
  public slayerEngine!: SlayerEngine;
  public healerEngine!: HealerEngine;
  public validatorAgent!: ValidatorAgent;
  public overseer!: OverseerControlPlane;
  public memoryEngine!: MemoryEngine;
  public cognitivePlane!: CognitivePlaneEngine;
  public watchdog!: FactoryWatchdog;
  public pythonBridge!: PythonFloorBridge;
  public apiHandler!: OverseerAPIHandler;
  public capabilityRegistry!: CapabilityRegistry;
  public instructorSubsystem!: InstructorSubsystem;
  public projectionService!: FactoryProjectionService;
  public voiceFabric: VoiceFabric = new VoiceFabric();
  public renderFabric: RenderFabric = new RenderFabric();
  public evolutionBrain: EvolutionBrainSeam = new EvolutionBrainSeam();
  public contentGenome: ContentGenomeTracker = new ContentGenomeTracker();
  public researchRuntime: ResearchRuntime = new ResearchRuntime();
  public memoryFabric?: MemoryFabricBridge;

  constructor(config: FactoryOSConfig = {}) {
    this.config = {
      storageType: "memory",
      patrolIntervalMs: 2000,
      supervisorIntervalMs: 3000,
      watchdogIntervalMs: 4000,
      autoStartSwarm: true,
      memoryFabricEnabled:
        process.env.MEMORY_FABRIC_ENABLED === "true" ||
        (process.env.MEMORY_FABRIC_ENABLED !== "false" &&
          (process.env.NODE_ENV !== "production" || Boolean(process.env.MEMORY_FABRIC_VAULT_PATH))),
      memoryFabricVaultPath: process.env.MEMORY_FABRIC_VAULT_PATH,
      memoryFabricReconciliationIntervalMs: Number(process.env.MEMORY_FABRIC_RECONCILIATION_MS || 60000),
      ...config,
    };
  }

  /**
   * Master Boot Sequence:
   * 1. Connect DB / Mount Disk (or fall back to InMemory)
   * 2. Initialize Repositories
   * 3. Load & Restore Persistent World State
   * 4. Initialize Event Bus
   * 5. Initialize Lease & Case Management
   * 6. Initialize Slayers, Healers, Validator, Overseer, Memory
   * 7. Initialize Watchdog & Python Bridge
   * 8. Recover Abandoned Runs / Cases / Missions
   * 9. Start Swarms & Continuous Autonomous Loop
   */
  async boot(): Promise<void> {
    if (this.isBooted) return;

    let repos;
    if (this.config.storageType === "disk") {
      repos = DatabaseFactory.createDiskRepositories(this.config.storagePath);
    } else if (this.config.storageType === "mongo" || this.config.mongoUri) {
      this.mongoClient = new MongoDBClient(this.config.mongoUri || "mongodb://localhost:27017", this.config.dbName || "factoryos");
      const connected = await this.mongoClient.connect();
      if (connected) {
        repos = DatabaseFactory.createRepositories(this.mongoClient.getDb());
      } else {
        if (this.config.strictPersistence) {
          throw new Error(`MongoDB connection failed at ${this.config.mongoUri} under strictPersistence.`);
        }
        repos = DatabaseFactory.createRepositories(null);
      }
    } else {
      repos = DatabaseFactory.createRepositories(null);
    }

    // 3. World State Engine
    this.worldState = new WorldStateEngine(repos.worldState, true);
    await this.worldState.restore();

    // 4. Durable Event Bus
    this.eventBus = new DurableEventBus();

    // 4.1 Live Memory Fabric. It is derived cognitive storage only and never
    // becomes runtime authority. MongoDB remains operational truth; the
    // knowledge vault is an inspectable projection consumed by agents/Ascalon.
    if (this.config.memoryFabricEnabled) {
      const knowledgeStore = new KnowledgeStore(this.config.memoryFabricVaultPath);
      const memoryWriter = new MemoryWriter(knowledgeStore);
      const mongoDb = this.mongoClient?.getDb() || null;
      const ledger = mongoDb
        ? new MongoMemoryFabricLedger(mongoDb)
        : new InMemoryMemoryFabricLedger();

      this.memoryFabric = new MemoryFabricBridge(
        this.eventBus,
        knowledgeStore,
        memoryWriter,
        ledger,
        mongoDb,
        {
          enabled: true,
          vaultPath: this.config.memoryFabricVaultPath,
          reconciliationIntervalMs: this.config.memoryFabricReconciliationIntervalMs,
          watchedCollections: this.config.memoryFabricCollections,
        },
      );
      await this.memoryFabric.start();
    }

    // 5. Leases, Case Manager & Mission Manager
    this.leaseManager = new LeaseManager(repos.leases);
    this.caseManager = new CaseManager(repos.cases, this.eventBus, this.worldState);
    this.missionManager = new MissionManager(repos.missions, this.eventBus, this.worldState, repos.cases, repos.taskDAGs);

    // 6. Memory & Cognitive Engine
    this.memoryEngine = new MemoryEngine(repos.memories);
    this.cognitivePlane = new CognitivePlaneEngine(repos.memories);

    // 7. Swarms, Guardians & Overseer
    this.guardianManager = new GuardianManager(this.eventBus, this.worldState, this.caseManager);

    this.slayerEngine = new SlayerEngine(
      this.caseManager,
      this.eventBus,
      this.worldState,
      repos.reputation,
      this.config.patrolIntervalMs,
      this.leaseManager
    );

    this.healerEngine = new HealerEngine(
      this.caseManager,
      this.eventBus,
      this.worldState,
      this.leaseManager,
      repos.reputation
    );

    this.validatorAgent = new ValidatorAgent(this.caseManager, this.eventBus, this.worldState);

    this.overseer = new OverseerControlPlane(
      this.caseManager,
      this.slayerEngine,
      this.healerEngine,
      this.validatorAgent,
      this.eventBus,
      this.worldState,
      this.memoryEngine,
      this.cognitivePlane,
      this.missionManager,
      repos.decisions,
      repos.taskDAGs
    );

    // 8. Watchdog & Bridges
    this.watchdog = new FactoryWatchdog(
      this.worldState,
      this.eventBus,
      this.caseManager,
      this.leaseManager,
      30000,
      this.missionManager
    );

    this.pythonBridge = new PythonFloorBridge(this.worldState, this.eventBus, this.caseManager);
    this.capabilityRegistry = new CapabilityRegistry();
    this.instructorSubsystem = new InstructorSubsystem();
    this.projectionService = new FactoryProjectionService(
      this.worldState,
      this.eventBus,
      this.missionManager,
      this.caseManager
    );

    this.apiHandler = new OverseerAPIHandler(
      this.overseer,
      this.worldState,
      this.caseManager,
      this.eventBus,
      this.slayerEngine,
      this.healerEngine,
      this.missionManager
    );

    // 9. Recover Abandoned State
    await this.recoverStateOnBoot();

    this.isBooted = true;

    // 10. Start Autonomous Execution
    if (this.config.autoStartSwarm) {
      await this.start();
    }

    await this.eventBus.publish("FACTORY_STARTED", {
      bootedAt: new Date().toISOString(),
      factoryStatus: this.worldState.getState().factoryStatus,
    });
  }

  private async recoverStateOnBoot(): Promise<void> {
    // 1. Recover active cases
    const activeCases = await this.caseManager.getActiveCases();
    const currentWorld = this.worldState.getState();
    for (const c of activeCases) {
      if (c.targetWorker && currentWorld.workers[c.targetWorker]?.status === "HEALTHY") {
        await this.caseManager.resolveCase(c.caseId, {
          diagnosis: `Worker ${c.targetWorker} verified healthy on boot recovery`,
          resolutionPlan: "Auto-resolved during controller boot",
          healerId: "kernel_boot_recovery",
          actionsTaken: ["State verified healthy"],
          verifiedAt: new Date().toISOString(),
        });
      } else {
        this.worldState.addActiveCase(c.caseId);
      }
    }

    // 2. Reclaim expired task leases
    const expiredLeases = await this.leaseManager.getRecoverableTasks();
    for (const lease of expiredLeases) {
      await this.leaseManager.release(lease.taskId, lease.ownerAgentId);
    }

    // 3. Restore in-flight active missions & resume autonomous execution
    if (this.missionManager) {
      await this.missionManager.restoreActiveMissions();
      const activeMissions = await this.missionManager.getActiveMissions();
      for (const m of activeMissions) {
        if (this.config.autoStartSwarm) {
          if (m.status === "REPLANNING") {
            await this.missionManager.startMission(m.missionId);
          } else if (m.status === "RUNNING") {
            this.overseer.resumeMissionExecution(m.missionId).catch(() => {});
          }
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    await this.guardianManager.start();
    await this.slayerEngine.start();
    this.overseer.startSupervisor(this.config.supervisorIntervalMs);
    this.watchdog.start(this.config.watchdogIntervalMs);
    await this.overseer.presenceEngine.start();

    this.mainLoopTimer = setInterval(() => {
      this.runAutonomousCycle().catch(() => {});
    }, 5000);
  }

  async startMission(params: any) {
    const mission = await this.missionManager.createMission(params);
    const started = await this.missionManager.startMission(mission.missionId);
    if (this.overseer) {
      await this.overseer.dispatchMission(started);
    }
    return started;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.mainLoopTimer) {
      clearInterval(this.mainLoopTimer);
      this.mainLoopTimer = null;
    }
    if (this.guardianManager) await this.guardianManager.stop();
    if (this.slayerEngine) await this.slayerEngine.stop();
    if (this.overseer) {
      this.overseer.stopSupervisor();
      await this.overseer.presenceEngine.stop();
    }
    if (this.watchdog) this.watchdog.stop();

    if (this.worldState) await this.worldState.persist();

    if (this.eventBus) {
      await this.eventBus.publish("FACTORY_STOPPED", {
        stoppedAt: new Date().toISOString(),
      });
    }

    if (this.memoryFabric) {
      await this.memoryFabric.drain();
      await this.memoryFabric.stop();
    }
  }

  async shutdown(): Promise<void> {
    await this.stop();
    if (this.mongoClient) {
      await this.mongoClient.disconnect();
    }
    this.isBooted = false;
  }

  /**
   * The Continuous Autonomous Control Loop:
   * Refreshes world state, verifies critical invariants, triggers background sweeps.
   */
  async runAutonomousCycle(): Promise<void> {
    if (!this.isRunning) return;

    // 1. Run Watchdog Health Sweep
    await this.watchdog.runHealthCheck();

    // 2. Run Supervisor Triage
    await this.overseer.runSupervisorCycle();

    // 3. Persist World State Snapshot
    await this.worldState.persist();

    // 4. Drain cognitive memory asynchronously so the runtime control loop is
    // never coupled to filesystem/Obsidian projection latency.
    if (this.memoryFabric) {
      void this.memoryFabric.drain().catch(() => {});
    }
  }
}
