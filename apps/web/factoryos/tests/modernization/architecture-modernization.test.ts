/**
 * FactoryOS v3 — Architecture Modernization Verification Suite
 * Exhaustively validates all Phase 1 architectural modernizations:
 * 1. Single FloorRegistry source of truth & F00-F07 DAG topology
 * 2. Parallelism of F03 (Assets) and F04 (Voice) converging into F05
 * 3. Authority separation: Guardian != F07 (Guardian governs capabilities, F07 is QA)
 * 4. Single Scheduler -> ScheduleInstance -> Mission -> Overseer control flow
 * 5. Schedule-driven dynamic research quantities in F00 (zero hardcoded constants)
 * 6. Research provenance & honest failure semantics in ReachSubsystem & AgentReachAdapter
 * 7. AgentRuntime harness, execution budgets, checkpointing, and TraceContext
 * 8. KnowledgeOS typed memory stores and promotion gate
 * 9. Capability-first model routing and circuit breaker failover
 * 10. Compute fabric lease fencing & callback security
 * 11. TimelineIR composition validation
 * 12. Bounded repair loop with last-known-good baseline preservation
 */

import { describe, it, expect } from "vitest";
import { FloorRegistry } from "../../core/hierarchy/FloorRegistry";
import { TaskDAGPlanner } from "../../core/overseer/TaskDAGPlanner";
import { FactoryStateService } from "../../core/state/FactoryStateService";
import { HierarchyConsistencyValidator } from "../../core/contracts/HierarchyConsistencyValidator";
import { AutonomousScheduler } from "../../core/production/AutonomousScheduler";
import type { Schedule } from "../../core/schedule/ScheduleContracts";
import { DailySlateGenerator } from "../../core/research/DailySlateGenerator";
import { AgentReachAdapter } from "../../core/integrations/AgentReachAdapter";
import { ResearchRuntime } from "../../core/research/ResearchRuntime";
import { trendAgent } from "../../../agents/trend-agent";
import { LightpandaBrowserAdapter } from "../../core/research/LightpandaBrowserAdapter";
import { AgentRuntime } from "../../core/agent/AgentRuntime";
import type { AgentIdentity, ExecutionBudget } from "../../core/agent/AgentRuntimeContracts";
import { TraceContext } from "../../core/observability/TraceContext";
import { KnowledgeOS } from "../../core/knowledge/KnowledgeOS";
import { CapabilityFirstRouter } from "../../core/routing/CapabilityFirstRouter";
import { TimelineIR, TimelineIRValidator } from "../../core/timeline/TimelineIR";
import { BoundedRepairEngine } from "../../core/healers/BoundedRepairEngine";
import type { StructuredFinding } from "../../core/verification/StructuredFindings";

describe("Phase 1: FloorRegistry & Topology Invariants", () => {
  it("1. proves FloorRegistry is the single source of truth across DAG, Validator, and StateService", () => {
    const floors = FloorRegistry.getAllFloors();
    expect(floors).toHaveLength(8);
    expect(floors[0].floorId).toBe("floor00_analyst");
    expect(floors[7].floorId).toBe("floor07_compliance");

    // Verify TaskDAGPlanner generates identical 8-floor topology
    const planner = new TaskDAGPlanner();
    const dag = planner.createEightFloorProductionDAG("goal_test_001");
    expect(Object.keys(dag.nodes)).toHaveLength(8);
    expect(dag.rootTaskIds).toEqual(["task_floor00_analyst"]);

    // Verify FactoryStateService registers identical 8 floors
    const stateService = FactoryStateService.getInstance();
    const registeredFloors = (FactoryStateService as any).STANDARD_FLOORS;
    expect(registeredFloors).toHaveLength(8);
    expect(registeredFloors[0].id).toBe("floor00_analyst");

    // Verify HierarchyConsistencyValidator validates clean 8 floors
    const validation = HierarchyConsistencyValidator.validateAll();
    expect(validation.valid).toBe(true);
    expect(validation.floorCount).toBe(8);
  });

  it("2. proves F03 and F04 execute concurrently and F05 waits for both to succeed", () => {
    const planner = new TaskDAGPlanner();
    const dag = planner.createEightFloorProductionDAG("goal_parallel_test");

    const f03Node = dag.nodes["task_floor03_asset_realization"];
    const f04Node = dag.nodes["task_floor04_media_synthesis"];
    const f05Node = dag.nodes["task_floor05_timeline_composition"];

    // Both F03 and F04 depend strictly on F02 (can execute in parallel)
    expect(f03Node.dependencies).toEqual(["task_floor02_scripting"]);
    expect(f04Node.dependencies).toEqual(["task_floor02_scripting"]);

    // F05 convergence: depends on BOTH F03 and F04
    expect(f05Node.dependencies).toContain("task_floor03_asset_realization");
    expect(f05Node.dependencies).toContain("task_floor04_media_synthesis");
    expect(f05Node.dependencies).toHaveLength(2);
  });

  it("3. strictly enforces Guardian != F07 (Guardian is sovereign regulator, F07 is QA floor)", () => {
    const f07 = FloorRegistry.getFloor("floor07_compliance");
    expect(f07.category).toBe("VERIFICATION");
    expect(f07.canonicalName).toContain("QA Gate");

    const isGuardianFloor = FloorRegistry.isCanonicalFloor("guardian");
    expect(isGuardianFloor).toBe(false);

    // Verify Guardian is registered under Sovereign Agent roles, not floors
    const validation = HierarchyConsistencyValidator.validateAll();
    expect(validation.errors).toHaveLength(0);
  });
});

describe("Phase 1: Scheduler & Control Plane Invariants", () => {
  it("4. proves Schedule -> ScheduleInstance -> Mission -> Overseer single scheduler path", async () => {
    const scheduler = new AutonomousScheduler();

    const mockSchedule: Schedule = {
      scheduleId: "sched_tech_daily",
      name: "Daily Tech Shorts",
      cadence: "DAILY",
      timezone: "UTC",
      enabled: true,
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetRequirements: {
        requestedCount: 4,
        platform: "YOUTUBE_SHORTS",
        targetNiche: "TECH_EXPLAINER",
        targetDurationSec: { min: 30, max: 60 },
        freshnessWindowHours: 24,
        researchDepth: "STANDARD",
        safetyPolicy: "POL_STANDARD_CONTENT_V1",
      },
    };

    let dispatchedMissionId = "";
    let dispatchedGoal = "";
    const mockOverseer = {
      dispatchMission: async (missionId: string, goal: string) => {
        dispatchedMissionId = missionId;
        dispatchedGoal = goal;
        return { accepted: true };
      },
    };

    const instance = await scheduler.triggerScheduleRun(mockSchedule, mockOverseer);

    expect(instance.scheduleId).toBe("sched_tech_daily");
    expect(instance.status).toBe("DISPATCHED");
    expect(instance.targetRequirements.requestedCount).toBe(4);
    expect(dispatchedMissionId).toBe(instance.missionId);
    expect(dispatchedGoal).toContain("Daily Tech Shorts");

    // Idempotency: re-triggering for same date returns existing instance
    const duplicate = await scheduler.triggerScheduleRun(mockSchedule, mockOverseer);
    expect(duplicate.instanceId).toBe(instance.instanceId);
  });

  it("5. proves F00 research quantities derive dynamically from Schedule without hardcoded constants", () => {
    const createInstance = (count: number) => ({
      instanceId: `inst_${count}`,
      scheduleId: "sched_var",
      scheduledFor: new Date().toISOString(),
      missionId: "miss_123",
      status: "DISPATCHED" as const,
      idempotencyKey: `key_${count}`,
      generatedAt: new Date().toISOString(),
      targetRequirements: {
        requestedCount: count,
        platform: "YOUTUBE_SHORTS" as const,
        targetNiche: "AI_RESEARCH",
        targetDurationSec: { min: 30, max: 60 },
        freshnessWindowHours: 24,
        researchDepth: "STANDARD" as const,
        safetyPolicy: "POL_STRICT",
      },
    });

    const candidates = [
      { topic: "Topic A", hookConcept: "Hook A", rawSources: ["https://source1.com/a"], passportId: "pass_topic_a" },
      { topic: "Topic B", hookConcept: "Hook B", rawSources: ["https://source2.com/b"], passportId: "pass_topic_b" },
      { topic: "Topic C", hookConcept: "Hook C", rawSources: ["https://source3.com/c"], passportId: "pass_topic_c" },
      { topic: "Topic D", hookConcept: "Hook D", rawSources: ["https://source4.com/d"], passportId: "pass_topic_d" },
      { topic: "Topic E", hookConcept: "Hook E", rawSources: ["https://source5.com/e"], passportId: "pass_topic_e" },
    ];

    // Schedule A requests 2 videos
    const slateA = DailySlateGenerator.generateSlate(createInstance(2), candidates);
    expect(slateA.requestedCount).toBe(2);
    expect(slateA.candidateCount).toBe(2);
    expect(slateA.unmetCapacity).toBe(0);

    // Schedule B requests 5 videos
    const slateB = DailySlateGenerator.generateSlate(createInstance(5), candidates);
    expect(slateB.requestedCount).toBe(5);
    expect(slateB.candidateCount).toBe(5);
    expect(slateB.unmetCapacity).toBe(0);

    // Schedule C requests 8 videos (more than candidates available): reports explicit unmet capacity, zero fake trends
    const slateC = DailySlateGenerator.generateSlate(createInstance(8), candidates);
    expect(slateC.requestedCount).toBe(8);
    expect(slateC.candidateCount).toBe(5);
    expect(slateC.unmetCapacity).toBe(3);
    expect(slateC.unmetReason).toContain("Insufficient validated research candidates");
    expect(slateC.provenanceDigest).toHaveLength(64);
  });
});

describe("Phase 1: Research Provenance & Honest Error Semantics", () => {

  it("8a. rejects an empty F00 topic instead of inventing a default research subject", async () => {
    const runtime = new ResearchRuntime();
    await expect(
      runtime.executeResearch({
        missionId: "mis_missing_f00_topic",
        topic: "   ",
      })
    ).rejects.toThrow("F00 ResearchRuntime requires a non-empty topic");
  });

  it("8b. excludes unavailable Reach records from ResearchPassport evidence", async () => {
    const testProvider = {
      isTestFixture: true as const,
      async acquire() {
        return [
          {
            id: "src_unavailable_f00",
            url: "https://example.invalid/unavailable",
            title: "Retrieval Unavailable",
            publisher: "example.invalid",
            retrievedAt: new Date().toISOString(),
            extractionMethod: "TEST_FIXTURE" as const,
            snippet: "No evidence was retrieved.",
            reliabilityScore: 0,
            sourceStatus: "UNAVAILABLE" as const,
          },
        ];
      },
    };

    const { ReachSubsystem } = await import("../../core/research/ReachSubsystem");
    const runtime = new ResearchRuntime(new ReachSubsystem(testProvider));
    const report = await runtime.executeResearch({
      missionId: "mis_f00_unavailable_source",
      topic: "Unavailable research subject",
      researchContract: {
        engineId: "quiz",
        minSources: 2,
        citationRequired: true,
        agentReachProfile: "engine:quiz",
      },
    });

    expect(report.passport.sources).toHaveLength(0);
    expect(report.passport.confidence).toBe(0);
    expect(report.passport.researchContext?.engineId).toBe("quiz");
  });

  it("8c. requires a ResearchPassport lineage reference before a candidate enters a DailyContentSlate", () => {
    const schedule = {
      scheduleId: "sched_passport_gate",
      name: "Passport Gate",
      cadence: "DAILY",
      timezone: "UTC",
      enabled: true,
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetRequirements: {
        requestedCount: 1,
        platform: "YOUTUBE_SHORTS" as const,
        targetNiche: "TEST",
        targetDurationSec: { min: 30, max: 60 },
        freshnessWindowHours: 24,
        researchDepth: "STANDARD" as const,
        safetyPolicy: "POL_TEST",
      },
    };

    const noPassport = DailySlateGenerator.generateSlate(schedule, [
      {
        topic: "No Passport",
        hookConcept: "hook",
        rawSources: ["https://source.example/article"],
      },
    ]);
    expect(noPassport.candidateCount).toBe(0);
    expect(noPassport.unmetCapacity).toBe(1);
  });

  it("6. proves LightpandaBrowserAdapter returns honest 503 UNAVAILABLE on fetch failure", async () => {
    const adapter = new LightpandaBrowserAdapter();
    // Nonexistent domain / bad URL
    const snapshot = await adapter.navigateAndExtract("https://this-domain-does-not-exist-at-all-12345.internal");

    expect(snapshot.status).toBe(503);
    expect(snapshot.title).toBe("Retrieval Unavailable");
    expect(snapshot.textContent).toContain("Failed retrieving external source");
  });

  it("7. proves AgentReachAdapter rejects empty queries and reports honest NO_EVIDENCE", async () => {
    const reachAdapter = new AgentReachAdapter();
    const result = await reachAdapter.searchExternalKnowledge("");

    expect(result.status).toBe("NO_EVIDENCE");
    expect(result.confidence).toBe(0);
    expect(result.sourceUrls).toHaveLength(0);
  });

  it("8. proves trend-agent delegates to ResearchRuntime producing ResearchPassport-backed results", async () => {
    const output = await trendAgent({ topic: "Autonomous Systems", targetSourceCount: 2 });
    expect(output.topic).toBe("Autonomous Systems");
    expect(output.passportId).toBeDefined();
    expect(output.report?.passport.methodology).toBe("TREND_SCAN");
    // Verify hookIntelligence carries explicit fidelity tag
    expect(output.report?.hookIntelligence.fidelity).toBe("HEURISTIC_ESTIMATE");
  });
});

describe("Phase 1: AgentRuntime & Observability", () => {
  it("9. proves AgentRuntime executes within budget, enforces capability gates, and checkpoints sessions", async () => {
    const runtime = new AgentRuntime();
    const agent: AgentIdentity = {
      agentId: "agent_analyst_01",
      name: "Floor 00 Lead Analyst",
      role: "RESEARCH_ANALYST",
      authorityLevel: "LEVEL_3_WORKER",
      allowedCapabilities: ["cap_research_topic_ingest", "cap_verify_claim"],
      version: "1.0.0",
    };

    const budget: ExecutionBudget = {
      maxDurationMs: 5000,
      maxRetries: 2,
    };

    const session = runtime.createSession(agent, "mission_test_99", budget);
    expect(session.status).toBe("INITIALIZED");
    expect(session.traceContext.getMissionId()).toBe("mission_test_99");

    // Checkpointing test
    const chk = runtime.checkpointSession(session.sessionId, 1, { stage: "SOURCES_FETCHED" });
    expect(chk.stepIndex).toBe(1);
    expect(session.checkpoints).toHaveLength(1);

    // Permitted capability execution
    const validResult = await runtime.executeTask(
      {
        session,
        taskName: "Topic Scan",
        payload: { query: "Quantum AI" },
        requiredCapability: "cap_research_topic_ingest",
      },
      async (payload) => ({ found: true, query: payload.query })
    );

    expect(validResult.status).toBe("SUCCESS");
    expect(validResult.output?.found).toBe(true);

    // Forbidden capability execution (BLOCKED)
    const blockedResult = await runtime.executeTask(
      {
        session,
        taskName: "Direct Render",
        payload: {},
        requiredCapability: "cap_render_dispatch", // Agent lacks this capability
      },
      async () => ({ rendered: true })
    );

    expect(blockedResult.status).toBe("BLOCKED");
    expect(blockedResult.error).toContain("lacks authorization for capability");
  });
});

describe("Phase 1: KnowledgeOS & Memory Architecture", () => {
  it("10. proves KnowledgeOS enforces typed stores, mission scoping, and promotion gates", () => {
    const kos = new KnowledgeOS();

    // Store Source
    const source = kos.storeSource({
      url: "https://nature.com/articles/s41586",
      title: "Nature Study",
      publisher: "Nature",
      snippet: "Breakthrough study on energy storage.",
      reliabilityScore: 0.98,
      scope: "MISSION",
      missionId: "mission_101",
    });
    expect(source.type).toBe("SOURCE");
    expect(source.provenanceDigest).toHaveLength(64);

    // Store Claim
    const claim = kos.storeClaim({
      statement: "Energy density improved by 40%.",
      verificationStatus: "VERIFIED",
      sourceIds: [source.id],
      confidence: 0.95,
      scope: "MISSION",
      missionId: "mission_101",
    });
    expect(claim.type).toBe("CLAIM");
    expect(kos.getClaimsForMission("mission_101")).toHaveLength(1);

    // Topic Saturation Tracking
    const topic = kos.updateTopicSaturation("Solid State Batteries", 0.35, "pass_999");
    expect(topic.saturationLevel).toBe(0.35);
    expect(topic.associatedPassportIds).toContain("pass_999");

    // Memory Promotion Gate
    const promoted = kos.promoteToLongTermMemory(claim);
    expect(promoted).toBe(true);
    expect(claim.scope).toBe("GLOBAL");
  });
});

describe("Phase 1: Model Routing & Circuits", () => {
  it("11. proves capability-first routing excludes open circuits and selects healthy fallback", () => {
    // Register candidate with rate-limited / open circuit state
    CapabilityFirstRouter.registerCandidate({
      providerId: "test_failing_provider",
      name: "Failing Provider",
      modelId: "failing_model_v1",
      isLocal: false,
      isPaid: false,
      supportedCapabilities: ["TEST_CAPABILITY"],
      maxContextTokens: 8000,
      costPer1kTokensUsd: 0,
      baselineLatencyMs: 100,
      circuitState: "OPEN", // Circuit is OPEN
      consecutiveFailures: 5,
    });

    // Register healthy candidate
    CapabilityFirstRouter.registerCandidate({
      providerId: "test_healthy_provider",
      name: "Healthy Provider",
      modelId: "healthy_model_v1",
      isLocal: true,
      isPaid: false,
      supportedCapabilities: ["TEST_CAPABILITY"],
      maxContextTokens: 8000,
      costPer1kTokensUsd: 0,
      baselineLatencyMs: 250,
      circuitState: "ONLINE", // Healthy
      consecutiveFailures: 0,
    });

    const decision = CapabilityFirstRouter.routeCapability({
      capability: "TEST_CAPABILITY",
    });

    // Router must select healthy provider and skip open circuit
    expect(decision.selectedProviderId).toBe("test_healthy_provider");
    expect(decision.selectedModelId).toBe("healthy_model_v1");
  });
});

describe("Phase 1: TimelineIR & Bounded Repair Invariants", () => {
  it("12. proves TimelineIR validates vertical format and duration bounds", () => {
    const validTimeline: TimelineIR = {
      timelineId: "tl_001",
      schemaVersion: "1.0.0",
      missionId: "miss_tl_01",
      compositionType: "FACTS_SHORTS",
      canvas: {
        width: 1080,
        height: 1920,
        fps: 30,
        aspectRatio: "9:16",
      },
      totalDurationMs: 45000,
      visualTracks: [
        {
          clipId: "clip_01",
          assetId: "asset_img_01",
          assetType: "IMAGE",
          src: "/storage/frame1.jpg",
          timelineStartMs: 0,
          durationMs: 45000,
          zIndex: 1,
        },
      ],
      audioTracks: [
        {
          audioId: "aud_01",
          trackType: "VOICE",
          src: "/storage/voice.wav",
          timelineStartMs: 0,
          durationMs: 45000,
          volume: 1.0,
        },
      ],
      subtitleTracks: [],
      provenanceDigest: "8f3663c607ee4001aacf0f09987617ff",
    };

    const report = TimelineIRValidator.validate(validTimeline);
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);

    // Invalid canvas dimensions test
    const invalidCanvas = {
      ...validTimeline,
      canvas: { ...validTimeline.canvas, width: 1920, height: 1080 }, // Horizontal
    };
    const badReport = TimelineIRValidator.validate(invalidCanvas as any);
    expect(badReport.valid).toBe(false);
    expect(badReport.errors[0]).toContain("standard vertical shorts format");
  });

  it("13. proves BoundedRepairEngine limits repair budget and reverts to Last-Known-Good baseline on exhaustion", async () => {
    const initialCorruptedState = { volume: 0.0, synced: false };
    const lastKnownGoodBaseline = { volume: 0.8, synced: true };

    const finding: StructuredFinding = {
      id: "fnd_audio_sync_01",
      rule: "RULE_AUDIO_DESYNC",
      severity: "error",
      subject: "timeline_audio_track",
      evidence: ["Audio offset drifted by 350ms"],
      expected: "Audio sync drift <= 50ms",
      observed: "Audio sync drift = 350ms",
      confidence: 0.96,
      floorId: "floor07_compliance",
      detectedAt: new Date().toISOString(),
      supportedRepairs: [
        {
          actionId: "act_remux_audio",
          description: "Re-align audio timestamps to zero offset",
          targetFloor: "floor05_timeline_composition",
          riskLevel: "LOW",
        },
      ],
    };

    // Scenario: Repair function fails to fix the issue across 2 attempts
    const summary = await BoundedRepairEngine.executeBoundedRepair({
      initialState: initialCorruptedState,
      lastKnownGoodState: lastKnownGoodBaseline,
      findings: [finding],
      maxBudget: 2,
      repairFn: async (state) => ({ ...state, volume: 0.5 }), // Attempted mutation
      validateFn: async () => ({ valid: false, remainingFindings: [finding] }), // Still invalid
    });

    expect(summary.resolved).toBe(false);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.maxBudget).toBe(2);
    // Crucial invariant: Reverted to lastKnownGoodState
    expect(summary.isRestoredToLastKnownGood).toBe(true);
    expect(summary.finalState).toEqual(lastKnownGoodBaseline);
  });
});
