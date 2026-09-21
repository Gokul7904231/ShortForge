/**
 * ShortForge / FactoryOS — Overseer & Intelligence Integration Test
 * Verifies that the OverseerThinkingController dynamically accesses
 * the IntelligenceGateway to compile bounded, evidence-backed ContextCapsules,
 * and that real WorldState conditions drive governance thinking depth.
 */

import { describe, it, expect } from "vitest";
import { OverseerThinkingController } from "../core/overseer/OverseerThinkingController";
import { IntelligenceGateway } from "../core/intelligence/IntelligenceGateway";
import { WorldState } from "../core/contracts/WorldStateContracts";

describe("FactoryOS — Overseer & Intelligence Gateway Integration", () => {
  const healthyWorldState: WorldState = {
    schemaVersion: "1.0.0",
    updatedAt: new Date().toISOString(),
    sequenceNumber: 1,
    factoryStatus: "OPERATIONAL",
    floors: {
      "floor-05": {
        floorId: "floor-05",
        name: "Rendering & Delivery",
        status: "ONLINE",
        activeWorkers: 2,
        queueDepth: 0,
        activeJobs: [],
        lastHeartbeat: new Date().toISOString(),
        recentAnomalies: [],
      },
    },
    workers: {
      "worker-01": {
        workerId: "worker-01",
        role: "WORKER",
        specialization: "FFMPEG",
        status: "HEALTHY",
        lastSeen: new Date().toISOString(),
        metrics: { tasksCompleted: 10, tasksFailed: 0, uptimeSeconds: 3600, averageLatencyMs: 1200 },
      },
    },
    activeCaseIds: [],
    activeRunIds: [],
    activeRepairs: [],
    resources: {
      cpuPercent: 15,
      memoryUsedMb: 2048,
      memoryTotalMb: 16384,
      vramUsedMb: 1024,
      vramTotalMb: 8192,
      gpuAvailable: true,
      networkOnline: true,
      driveAvailable: true,
    },
    systemConfidence: 0.95,
  };

  it("OverseerThinkingController compiles ContextCapsule bounded by thinking mode budget", async () => {
    const gateway = new IntelligenceGateway();
    const controller = new OverseerThinkingController(gateway);

    // 1. REFLEX mode query
    const reflexAssessment = controller.assessCommand("status of render worker", healthyWorldState);
    expect(reflexAssessment.mode).toBe("REFLEX");
    expect(reflexAssessment.tokenBudget).toBe(500);

    const reflexCapsule = await controller.compileContextForAssessment(
      "task-reflex-01",
      "Where is the basic render worker implemented?",
      reflexAssessment
    );

    expect(reflexCapsule).not.toBeNull();
    expect(reflexCapsule?.budget.maxTokens).toBe(500);
    expect(reflexCapsule?.budget.estimatedTokens).toBeLessThanOrEqual(500);
    expect(reflexCapsule?.evidence.length).toBeGreaterThan(0);

    // 2. DELIBERATE mode query
    const deliberateAssessment = controller.assessCommand("investigate and heal render timeouts", healthyWorldState);
    expect(deliberateAssessment.mode).toBe("DELIBERATE");
    expect(deliberateAssessment.tokenBudget).toBe(4000);

    const deliberateCapsule = await controller.compileContextForAssessment(
      "task-deliberate-01",
      "What lesson did we learn from render worker timeouts and callbacks?",
      deliberateAssessment
    );

    expect(deliberateCapsule).not.toBeNull();
    expect(deliberateCapsule?.budget.maxTokens).toBe(4000);
    const decisionOrLessonCount = (deliberateCapsule?.decisions?.length || 0) + (deliberateCapsule?.lessons?.length || 0);
    expect(decisionOrLessonCount).toBeGreaterThanOrEqual(1);

    // 3. DEEP mode query
    const deepAssessment = controller.assessCommand("autonomous full pipeline recovery from crash", healthyWorldState);
    expect(deepAssessment.mode).toBe("DEEP");
    expect(deepAssessment.tokenBudget).toBe(15000);

    const deepCapsule = await controller.compileContextForAssessment(
      "task-deep-01",
      "Synthesize full context for debugging rendering pipeline timeouts",
      deepAssessment
    );

    expect(deepCapsule).not.toBeNull();
    expect(deepCapsule?.budget.maxTokens).toBe(15000);
    expect(deepCapsule?.budget.estimatedTokens).toBeLessThanOrEqual(15000);
  });

  it("dynamically forces DEEP mode when WorldState detects system failure or degraded resources", () => {
    const gateway = new IntelligenceGateway();
    const controller = new OverseerThinkingController(gateway);

    // Even with a simple "status" query, a HALTED or degraded state forces DEEP governance
    const haltedState: WorldState = {
      ...healthyWorldState,
      factoryStatus: "HALTED",
      activeRepairs: ["repair-cascading-crash"],
    };

    const assessment = controller.assessCommand("status check", haltedState);
    expect(assessment.mode).toBe("DEEP");
    expect(assessment.rationale).toContain("DEEP governance");
    expect(assessment.rationale).toContain("factoryStatus=HALTED");

    // Network offline forces DEEP safety governance
    const offlineState: WorldState = {
      ...healthyWorldState,
      resources: {
        ...healthyWorldState.resources,
        networkOnline: false,
      },
    };

    const offlineAssessment = controller.assessCommand("check queue", offlineState);
    expect(offlineAssessment.mode).toBe("DEEP");
    expect(offlineAssessment.rationale).toContain("resource failure");
  });
});
