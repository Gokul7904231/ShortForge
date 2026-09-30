import { describe, it, expect, beforeEach } from "vitest";
import { PythonFloorBridge, SecurityValidationError } from "../core/bridge/PythonFloorBridge";
import { MissionStateMachine, InvalidStateTransitionError } from "../core/orchestration/MissionStateMachine";
import { CapabilityRegistry } from "../core/cognitive/CapabilityRegistry";
import { InstructorSubsystem } from "../core/instructor/InstructorSubsystem";
import { TaskDAGPlanner } from "../core/overseer/TaskDAGPlanner";
import { FactoryProjectionService } from "../core/projection/FactoryProjectionService";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { CaseManager } from "../core/cases/CaseManager";
import { InMemoryWorldStateRepository, InMemoryCaseRepository } from "../core/database/InMemoryDatabase";
import type { FloorHandoffEnvelope } from "../core/contracts/FloorProtocolContracts";

describe("ShortForge / FactoryOS — Architectural Convergence & Production DAG", () => {
  let worldState: WorldStateEngine;
  let eventBus: DurableEventBus;
  let caseManager: CaseManager;
  let bridge: PythonFloorBridge;

  beforeEach(async () => {
    worldState = new WorldStateEngine(new InMemoryWorldStateRepository(), true);
    await worldState.restore();
    eventBus = new DurableEventBus();
    caseManager = new CaseManager(new InMemoryCaseRepository(), eventBus, worldState);
    bridge = new PythonFloorBridge(worldState, eventBus, caseManager);
  });

  describe("1. PythonFloorBridge Security & Replay Prevention", () => {
    it("accepts a valid authenticated floor handoff envelope", async () => {
      const envelope: FloorHandoffEnvelope = {
        handoffId: "hnd_001",
        security: {
          userId: "user_alice",
          jobId: "job_12345",
          missionId: "mis_67890",
          floorId: "floor01_strategy",
          executionId: "exec_001",
          attempt: 1,
          executionToken: "token_secure_cryptographic_random_string_123",
          initiatedBy: "overseer",
        },
        status: "SUCCESS",
        outputArtifact: { topic: "AI Automation" },
        complianceScore: 0.98,
        executionTimeMs: 450,
        timestamp: new Date().toISOString(),
        nonce: "nonce_unique_1001",
        schemaVersion: "1.0.0",
      };

      await expect(bridge.handleFloorHandoff(envelope)).resolves.not.toThrow();

      const floor = worldState.getState().floors["floor01_strategy"];
      expect(floor.status).toBe("ONLINE");
    });

    it("rejects envelope with missing security context fields", async () => {
      const invalidEnvelope: any = {
        handoffId: "hnd_002",
        security: {
          userId: "", // Missing
          jobId: "job_12345",
          missionId: "mis_67890",
          floorId: "floor01_strategy",
          executionId: "exec_002",
          attempt: 1,
          executionToken: "short",
          initiatedBy: "overseer",
        },
        status: "SUCCESS",
        executionTimeMs: 100,
        timestamp: new Date().toISOString(),
        nonce: "nonce_unique_1002",
        schemaVersion: "1.0.0",
      };

      await expect(bridge.handleFloorHandoff(invalidEnvelope)).rejects.toThrow(SecurityValidationError);
    });

    it("rejects replay of identical nonce", async () => {
      const envelope: FloorHandoffEnvelope = {
        handoffId: "hnd_003",
        security: {
          userId: "user_alice",
          jobId: "job_12345",
          missionId: "mis_67890",
          floorId: "floor02_scripting",
          executionId: "exec_003",
          attempt: 1,
          executionToken: "token_secure_cryptographic_random_string_123",
          initiatedBy: "overseer",
        },
        status: "SUCCESS",
        executionTimeMs: 300,
        timestamp: new Date().toISOString(),
        nonce: "nonce_replay_attack_123",
        schemaVersion: "1.0.0",
      };

      await bridge.handleFloorHandoff(envelope);

      // Replay attempt with same nonce
      await expect(bridge.handleFloorHandoff(envelope)).rejects.toThrow(/Replay detected/);
    });

    it("creates a Case when floor reports FAILED status", async () => {
      const failedEnvelope: FloorHandoffEnvelope = {
        handoffId: "hnd_004",
        security: {
          userId: "user_alice",
          jobId: "job_12345",
          missionId: "mis_67890",
          floorId: "floor03_asset_realization",
          executionId: "exec_004",
          attempt: 1,
          executionToken: "token_secure_cryptographic_random_string_123",
          initiatedBy: "overseer",
        },
        status: "FAILED",
        errors: ["Image prompt syntax error on scene 3"],
        executionTimeMs: 120,
        timestamp: new Date().toISOString(),
        nonce: "nonce_unique_1004",
        schemaVersion: "1.0.0",
      };

      await bridge.handleFloorHandoff(failedEnvelope);

      const activeCases = await caseManager.getActiveCases();
      expect(activeCases.length).toBeGreaterThan(0);
      expect(activeCases[0].floorId).toBe("floor03_asset_realization");
    });
  });

  describe("2. MissionStateMachine Invariant Enforcement", () => {
    it("allows legal mission state transitions", () => {
      expect(() => {
        MissionStateMachine.validateMissionTransition("CREATED", "PLANNING");
        MissionStateMachine.validateMissionTransition("PLANNING", "RUNNING");
        MissionStateMachine.validateMissionTransition("RUNNING", "COMPLETED");
      }).not.toThrow();
    });

    it("rejects illegal mission state transitions", () => {
      expect(() => {
        MissionStateMachine.validateMissionTransition("CREATED", "COMPLETED");
      }).toThrow(InvalidStateTransitionError);

      expect(() => {
        MissionStateMachine.validateMissionTransition("COMPLETED", "RUNNING");
      }).toThrow(InvalidStateTransitionError);
    });

    it("enforces legal floor transitions and blocks illegal ones", () => {
      expect(() => {
        MissionStateMachine.validateFloorTransition("PENDING", "STARTING");
        MissionStateMachine.validateFloorTransition("STARTING", "RUNNING");
        MissionStateMachine.validateFloorTransition("RUNNING", "COMPLETED");
      }).not.toThrow();

      expect(() => {
        MissionStateMachine.validateFloorTransition("PENDING", "COMPLETED");
      }).toThrow(InvalidStateTransitionError);
    });
  });

  describe("3. CapabilityRegistry & Dynamic Anomaly Routing", () => {
    it("finds matching capabilities for quality anomalies and executes them", async () => {
      const registry = new CapabilityRegistry();
      const candidates = registry.findCandidates("QUALITY_SCORE_LOW");

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].type).toBe("SLAYER");

      const result = await registry.execute({
        requestExecutionId: "req_001",
        capabilityId: candidates[0].id,
        missionId: "mis_123",
        jobId: "job_123",
        anomalyType: "QUALITY_SCORE_LOW",
        symptoms: ["Hook confidence below 0.7"],
        inputData: { topic: "Space facts" },
        initiatedBy: "overseer",
        timestamp: new Date().toISOString(),
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.repairAction).toBeDefined();
    });

    it("finds matching healers for render transient failures", async () => {
      const registry = new CapabilityRegistry();
      const candidates = registry.findCandidates("RENDER_TIMEOUT");

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].type).toBe("HEALER");
      expect(candidates[0].maxRetries).toBe(3);
    });
  });

  describe("4. Bounded Instructor Subsystem", () => {
    it("validates compliant JSON schemas", async () => {
      const instructor = new InstructorSubsystem();
      const result = await instructor.validateAndRepair({
        schemaName: "SceneBlueprintSchema",
        rawOutput: { title: "Fact 1", duration: 5, prompt: "Galaxy scene" },
        expectedFields: ["title", "duration", "prompt"],
      });

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("repairs markdown-wrapped JSON and trailing commas", async () => {
      const instructor = new InstructorSubsystem();
      const rawMarkdown = `\`\`\`json
      {
        "title": "Fact 2",
        "duration": 6,
        "prompt": "Supernova explosion",
      }
      \`\`\``;

      const result = await instructor.validateAndRepair({
        schemaName: "SceneBlueprintSchema",
        rawOutput: rawMarkdown,
        expectedFields: ["title", "duration", "prompt"],
      });

      expect(result.isValid).toBe(true);
      expect(result.repaired).toBe(true);
      expect((result.validatedData as any).title).toBe("Fact 2");
    });

    it("identifies missing required fields", async () => {
      const instructor = new InstructorSubsystem();
      const result = await instructor.validateAndRepair({
        schemaName: "SceneBlueprintSchema",
        rawOutput: { title: "Fact 3" },
        expectedFields: ["title", "duration", "prompt"],
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("Missing required field: 'duration'"))).toBe(true);
    });
  });

  describe("5. Canonical Eight-Floor Task DAG Planner", () => {
    it("creates the canonical eight-floor DAG with correct dependency chains", () => {
      const planner = new TaskDAGPlanner();
      const dag = planner.createEightFloorProductionDAG("goal_generate_short");

      const nodeKeys = Object.keys(dag.nodes);
      expect(nodeKeys).toHaveLength(8);
      expect(nodeKeys).toEqual([
        "task_floor00_analyst",
        "task_floor01_strategy",
        "task_floor02_scripting",
        "task_floor03_asset_realization",
        "task_floor04_media_synthesis",
        "task_floor05_timeline_composition",
        "task_floor06_rendering",
        "task_floor07_compliance",
      ]);

      expect(dag.nodes["task_floor00_analyst"].dependencies).toEqual([]);
      expect(dag.nodes["task_floor01_strategy"].dependencies).toEqual(["task_floor00_analyst"]);
      expect(dag.nodes["task_floor02_scripting"].dependencies).toEqual(["task_floor01_strategy"]);
      expect(dag.nodes["task_floor03_asset_realization"].dependencies).toEqual(["task_floor02_scripting"]);
      expect(dag.nodes["task_floor04_media_synthesis"].dependencies).toEqual(["task_floor02_scripting"]);
      expect(dag.nodes["task_floor05_timeline_composition"].dependencies).toEqual([
        "task_floor03_asset_realization",
        "task_floor04_media_synthesis",
      ]);
      expect(dag.nodes["task_floor06_rendering"].dependencies).toEqual(["task_floor05_timeline_composition"]);
      expect(dag.nodes["task_floor07_compliance"].dependencies).toEqual(["task_floor06_rendering"]);
    });
  });

  describe("6. FactoryProjectionService", () => {
    it("produces a real state projection from WorldStateEngine and DurableEventBus", async () => {
      worldState.updateFloorStatus("floor01_strategy", "ONLINE", "Topic Strategy");
      worldState.updateFloorStatus("floor06_rendering", "ONLINE", "Azure Render Orchestration");
      worldState.registerWorker({
        workerId: "azure_worker_01",
        role: "WORKER",
        specialization: "RENDERING",
        status: "HEALTHY",
        lastSeen: new Date().toISOString(),
        metrics: { tasksCompleted: 5, tasksFailed: 0, uptimeSeconds: 300, averageLatencyMs: 40 },
      });

      await eventBus.publish("FACTORY_STATE_CHANGED", { floor: "floor01_strategy", status: "ONLINE" });

      const projectionService = new FactoryProjectionService(worldState, eventBus, undefined, caseManager);
      const projection = await projectionService.getProjection();

      expect(projection.factoryStatus).toBe("OPERATIONAL");
      expect(projection.healthyWorkersCount).toBe(1);
      expect(projection.floors["floor01_strategy"].status).toBe("ONLINE");
      expect(projection.floors["floor06_rendering"].status).toBe("ONLINE");
      expect(projection.recentEvents.length).toBeGreaterThan(0);
    });
  });
});
