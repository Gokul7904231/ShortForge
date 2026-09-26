import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Floor03RuntimeAdapter } from "../core/bridge/Floor03RuntimeAdapter";
import { Floor03DurableHandoffStore, Floor03DurableRecord } from "../core/bridge/Floor03DurableHandoffStore";
import { CaseManager } from "../core/cases/CaseManager";
import { SlayerEngine } from "../core/slayers/SlayerEngine";
import { HealerEngine } from "../core/healers/HealerEngine";
import { ValidatorAgent } from "../core/validator/ValidatorAgent";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import { OverseerControlPlane } from "../core/overseer/OverseerControlPlane";

describe("Floor 03 Overseer & Durability Integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.FLOOR03_RUNTIME_URL = "http://127.0.0.1:8003";
    process.env.FLOOR03_SERVICE_API_KEY = "test_f03_secret_key";
    const g = globalThis as any;
    if (g.__mock_firestore) {
      delete g.__mock_firestore["factoryos_floor03_handoffs"];
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const createValidF02Handoff = () => ({
    floor_id: "floor02_scripting",
    floor_version: "2.0.0",
    handoff_status: "VALIDATED",
    script_ir: { schema_version: "2.0" },
    scenes: [
      { scene_id: "scene-1", narration_text: "Discover the hidden geometry of ancient monuments." },
      { scene_id: "scene-2", narration_text: "Precision measurements reveal deliberate alignment." },
    ],
  });

  const createValidF03ServiceResponse = () => ({
    handoff_payload: {
      floor_id: "floor03_asset_realization",
      floor_version: "2.3.0",
      handoff_status: "VALIDATED",
      asset_plan_id: "plan-integ-1",
      asset_plan_version: 1,
      visual_asset_requirements: [
        {
          scene_id: "scene-1",
          asset_id: "asset-v1",
          prompt_text: "Photorealistic aerial perspective of stone architecture",
          target_duration_seconds: 5.0,
        },
        {
          scene_id: "scene-2",
          asset_id: "asset-v2",
          prompt_text: "Laser survey lines mapping stone alignments",
          target_duration_seconds: 5.0,
        },
      ],
      audio_asset_requirements: [
        { scene_id: "scene-1", duration_seconds: 5.0 },
        { scene_id: "scene-2", duration_seconds: 5.0 },
      ],
      manifest: {
        total_visual_assets: 2,
        total_audio_assets: 2,
        resolved_platform: "youtube_shorts",
      },
      asset_plan_ir: {
        schema_version: "1.4.0",
        plan_fingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        source_fingerprint: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
        lineage: {
          source_floor_id: "floor02_scripting",
          source_floor_version: "2.0.0",
          source_script_id: "script-101",
          source_script_version: 1,
        },
      },
      provenance: [
        {
          evidence_type: "DETERMINISTIC_RULE",
          source_type: "platform_resolution_engine",
          timestamp: new Date().toISOString(),
        },
      ],
    },
    execution_report: {
      floor_id: "floor03_asset_realization",
      status: "VALIDATED",
      metrics: { execution_time_ms: 42 },
    },
  });

  describe("Floor03DurableHandoffStore", () => {
    it("persists a canonical F03 record and retrieves it accurately", async () => {
      const store = new Floor03DurableHandoffStore();
      const record: Floor03DurableRecord = {
        requestId: "req-durable-01",
        floorId: "floor03_asset_realization",
        floorVersion: "2.3.0",
        assetPlanId: "plan-1",
        assetPlanVersion: 1,
        planFingerprint: "p".repeat(64),
        sourceFingerprint: "s".repeat(64),
        handoff: { test: "data" },
        executionReport: { status: "VALIDATED" },
        persistedAt: new Date().toISOString(),
      };

      await store.put(record);
      const retrieved = await store.get("req-durable-01");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.planFingerprint).toBe("p".repeat(64));
      expect(retrieved?.assetPlanId).toBe("plan-1");
    });

    it("rejects invalid records missing required fields", async () => {
      const store = new Floor03DurableHandoffStore();

      await expect(
        store.put({
          requestId: "   ",
          floorId: "floor03_asset_realization",
          floorVersion: "2.3.0",
          assetPlanId: "plan-1",
          assetPlanVersion: 1,
          planFingerprint: "p".repeat(64),
          sourceFingerprint: "s".repeat(64),
          handoff: {},
          executionReport: {},
          persistedAt: new Date().toISOString(),
        })
      ).rejects.toThrow(/requestId is required/i);

      await expect(
        store.put({
          requestId: "req-err-2",
          floorId: "floor02_scripting" as any,
          floorVersion: "2.0.0",
          assetPlanId: "plan-1",
          assetPlanVersion: 1,
          planFingerprint: "p".repeat(64),
          sourceFingerprint: "s".repeat(64),
          handoff: {},
          executionReport: {},
          persistedAt: new Date().toISOString(),
        })
      ).rejects.toThrow(/refusing foreign floor record/i);

      await expect(
        store.put({
          requestId: "req-err-3",
          floorId: "floor03_asset_realization",
          floorVersion: "2.3.0",
          assetPlanId: "plan-1",
          assetPlanVersion: 1,
          planFingerprint: "",
          sourceFingerprint: "s".repeat(64),
          handoff: {},
          executionReport: {},
          persistedAt: new Date().toISOString(),
        })
      ).rejects.toThrow(/refusing un-fingerprinted F03 handoff/i);
    });

    it("allows idempotent replay with identical fingerprints but rejects conflicting modifications", async () => {
      const store = new Floor03DurableHandoffStore();
      const record: Floor03DurableRecord = {
        requestId: "req-conflict-check",
        floorId: "floor03_asset_realization",
        floorVersion: "2.3.0",
        assetPlanId: "plan-original",
        assetPlanVersion: 1,
        planFingerprint: "1".repeat(64),
        sourceFingerprint: "2".repeat(64),
        handoff: { version: 1 },
        executionReport: { status: "VALIDATED" },
        persistedAt: new Date().toISOString(),
      };

      await store.put(record);

      // Replay identical record -> should succeed idempotently
      await expect(store.put(record)).resolves.not.toThrow();

      // Conflicting record with same requestId but different fingerprint -> MUST be rejected
      const conflictingRecord: Floor03DurableRecord = {
        ...record,
        planFingerprint: "9".repeat(64),
      };
      await expect(store.put(conflictingRecord)).rejects.toThrow(
        /immutable requestId conflict for canonical F03 handoff/i
      );
    });
  });

  describe("OverseerControlPlane F03 Execution Path", () => {
    function setupOverseer() {
      const eventBus = new DurableEventBus();
      const worldState = new WorldStateEngine();
      const caseManager = new CaseManager(undefined, eventBus, worldState);
      const slayerEngine = new SlayerEngine(caseManager, eventBus, worldState);
      const healerEngine = new HealerEngine(caseManager, eventBus, worldState);
      const validator = new ValidatorAgent(caseManager, eventBus, worldState);

      const overseer = new OverseerControlPlane(
        caseManager,
        slayerEngine,
        healerEngine,
        validator,
        eventBus,
        worldState
      );

      return { overseer, eventBus, worldState };
    }

    it("executes the full F02 -> F03 pipeline, persists durably, and makes output available for F05", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(createValidF03ServiceResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const { overseer, eventBus } = setupOverseer();
      const publishedEvents: any[] = [];
      eventBus.subscribe("TASK_COMPLETED", (envelope) => {
        publishedEvents.push(envelope.payload);
      });

      // Access the private getTaskExecutorsForFloors using type assertion
      const executors = (overseer as any).getTaskExecutorsForFloors("mission-test-01");
      const f02Handoff = createValidF02Handoff();

      // Mock F02 output in sharedScope
      // In OverseerControlPlane, executors share scope across floor tasks
      // First run F03 task
      const node = {
        taskId: "task_f03_asset_realization",
        capabilityId: "FLOOR_ASSET_REALIZATION",
      };

      // Set F02 handoff in sharedScope via mission scope or directly
      // Test the F03 executor logic:
      const f03Executor = executors.FLOOR_ASSET_REALIZATION;

      // Without F02 handoff, it must fail closed
      await expect(f03Executor(node)).rejects.toThrow(
        /Canonical Floor 02 handoff is missing; refusing non-canonical F03 execution/i
      );

      // Now inject F02 handoff by running in mission context
      const missionScope = {
        f02Handoff,
        platform: "youtube_shorts",
        aspectRatio: "9:16",
      };

      // Create a mission in missionManager if present, or assign to mission scope
      const missionManager = (overseer as any).missionManager;
      if (missionManager) {
        await missionManager.createMission({
          missionId: "mission-test-01",
          objective: "test objective",
          scope: missionScope,
        });
      }

      // Or recreate executors with mission scope
      const missionExecutors = (overseer as any).getTaskExecutorsForFloors("mission-test-01");
      // We can also pass scope through the node or sharedScope
      // Let's test execution with mock mission scope:
      (overseer as any).missionManager = {
        getMission: vi.fn().mockResolvedValue({
          missionId: "mission-test-01",
          scope: missionScope,
        }),
        updateProgress: vi.fn().mockResolvedValue(true),
      };

      const result = await missionExecutors.FLOOR_ASSET_REALIZATION(node);

      expect(result.status).toBe("OK");
      expect(result.floor).toBe("floor03_asset_realization");
      expect(result.output.floor03Handoff.handoff_status).toBe("VALIDATED");
      expect(result.output.assetPlanIR.schema_version).toBe("1.4.0");
      expect(result.output.scenes).toHaveLength(2);
      expect(result.output.scenes[0].sceneId).toBe("scene-1");
      expect(result.output.scenes[0].text).toBe("Discover the hidden geometry of ancient monuments.");
      expect(result.output.scenes[0].durationSeconds).toBe(5.0);

      // Verify the outbound HTTP call to canonical service
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:8003/v1/assets/execution-report");
      expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("test_f03_secret_key");
      expect((init.headers as Record<string, string>)["X-FactoryOS-Floor"]).toBe("floor03_asset_realization");

      // Verify durable persistence
      const store = new Floor03DurableHandoffStore();
      const durableRecord = await store.get("mission-test-01:task_f03_asset_realization");
      expect(durableRecord).not.toBeNull();
      expect(durableRecord?.planFingerprint).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

      // Verify TASK_COMPLETED event contract
      const f03Event = publishedEvents.find((e) => e.floorId === "floor03_asset_realization");
      expect(f03Event).toBeDefined();
      expect(f03Event.durationTruth).toBe("MEASURED");
      expect(f03Event.evidenceClass).toBe("TYPED_F03_RUNTIME_HANDOFF");
      expect(f03Event.physicalMediaProduced).toBe(false);

      // Replay: run F03 executor again with the same requestId -> should retrieve from durable store without new HTTP call
      const replayResult = await missionExecutors.FLOOR_ASSET_REALIZATION(node);
      expect(replayResult.status).toBe("OK");
      expect(fetchMock).toHaveBeenCalledTimes(1); // No second fetch!
    });

    it("fails closed when canonical F03 service times out or errors", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

      const { overseer } = setupOverseer();
      (overseer as any).missionManager = {
        getMission: vi.fn().mockResolvedValue({
          missionId: "mission-test-timeout",
          scope: { f02Handoff: createValidF02Handoff() },
        }),
      };

      const executors = (overseer as any).getTaskExecutorsForFloors("mission-test-timeout");
      const node = { taskId: "task_f03_asset_realization" };

      await expect(executors.FLOOR_ASSET_REALIZATION(node)).rejects.toThrow(
        /Canonical F03 runtime timed out after/i
      );
    });

    it("fails closed when canonical F03 service returns HTTP 502", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));

      const { overseer } = setupOverseer();
      (overseer as any).missionManager = {
        getMission: vi.fn().mockResolvedValue({
          missionId: "mission-test-502",
          scope: { f02Handoff: createValidF02Handoff() },
        }),
      };

      const executors = (overseer as any).getTaskExecutorsForFloors("mission-test-502");
      const node = { taskId: "task_f03_asset_realization" };

      await expect(executors.FLOOR_ASSET_REALIZATION(node)).rejects.toThrow(
        /Canonical F03 runtime rejected request: HTTP 502/i
      );
    });
  });
});
