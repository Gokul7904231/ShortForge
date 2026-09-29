import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AutonomousFactoryController } from "../core/controller/AutonomousFactoryController";

const CANONICAL_FLOORS = [
  "floor00_analyst",
  "floor01_strategy",
  "floor02_scripting",
  "floor03_asset_realization",
  "floor04_media_synthesis",
  "floor05_timeline_composition",
  "floor06_rendering",
  "floor07_compliance",
] as const;

type CapturedEvent = {
  topic: string;
  timestamp: string;
  payload: Record<string, any>;
};

function waitFor<T>(promiseFactory: () => Promise<T>, timeoutMs = 180_000, pollMs = 100): Promise<T> {
  const started = Date.now();
  return new Promise<T>((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await promiseFactory();
        resolve(value);
        return;
      } catch (error) {
        if (Date.now() - started >= timeoutMs) {
          reject(error);
          return;
        }
        setTimeout(tick, pollMs);
      }
    };
    void tick();
  });
}

async function startSearchFixture(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if (!req.url?.startsWith("/search")) {
      res.writeHead(404).end();
      return;
    }

    const result = {
      results: [
        {
          url: "https://docs.python.org/3/glossary.html#term-decorator",
          title: "Python Glossary — decorator",
          publisher: "Python Documentation",
          snippet: "A decorator is a callable that returns another callable and is used to extend or modify behavior. Python decorators are applied to functions and classes.",
          score: 0.92,
        },
        {
          url: "https://realpython.com/primer-on-python-decorators/",
          title: "Primer on Python Decorators",
          publisher: "Real Python",
          snippet: "Python decorators extend or modify callable behavior. Decorators are commonly applied to functions and classes and can wrap an existing callable.",
          score: 0.88,
        },
      ],
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve local research fixture address");
  }
  return { server, url: `http://127.0.0.1:${address.port}/search` };
}

describe("True eight-floor single-mission production trajectory", () => {
  let controller: AutonomousFactoryController | null = null;
  let searchFixture: Server | null = null;
  let workDir = "";

  beforeEach(() => {
    workDir = join(tmpdir(), `shortforge-eight-floor-${randomUUID()}`);
    mkdirSync(workDir, { recursive: true });
  });

  afterEach(async () => {
    if (controller) {
      await controller.shutdown().catch(() => {});
      controller = null;
    }
    if (searchFixture) {
      await new Promise<void>((resolve) => searchFixture!.close(() => resolve()));
      searchFixture = null;
    }
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it(
    "preserves one mission/run identity through F00-F07, produces a physical F06 artifact, independently verifies it in F07, and emits one Ascalon learning signal",
    async () => {
      const fixture = await startSearchFixture();
      searchFixture = fixture.server;
      process.env.SEARCH_API_URL = fixture.url;

      console.log("[E2E] phase=construct-controller");
      controller = new AutonomousFactoryController({
        storageType: "disk",
        storagePath: workDir,
        strictPersistence: true,
        autoStartSwarm: false,
        memoryFabricEnabled: false,
      });
      console.log("[E2E] phase=boot-start");
      await controller.boot();
      console.log("[E2E] phase=boot-complete");

      let terminalFailure: string | null = null;
      const captured: CapturedEvent[] = [];
      controller.eventBus.subscribe("TASK_COMPLETED", async (event: any) => {
        captured.push({
          topic: event.topic,
          timestamp: event.timestamp,
          payload: event.payload ?? event,
        });
      });

      const trajectoryEvents: CapturedEvent[] = [];
      const learningEvents: CapturedEvent[] = [];
      controller.eventBus.subscribeWildcard(async (event: any) => {
        const payload = event.payload ?? event;
        if (
          payload?.missionId === mission?.missionId &&
          (event.topic === "RUN_CHECKPOINTED" ||
            event.topic === "MISSION_FAILED" ||
            event.topic === "MISSION_REPLANNING")
        ) {
          terminalFailure = `${event.topic}: ${JSON.stringify(payload)}`;
        }
        if (payload?.missionId === mission?.missionId && event.topic?.startsWith("TASK_")) {
          console.log(
            `[E2E] event=${event.topic} floor=${payload.floorId || "n/a"} runId=${payload.runId || "n/a"}`,
          );
        }
      });
      controller.eventBus.subscribe("TRAJECTORY_EVALUATED", async (event: any) => {
        trajectoryEvents.push({
          topic: event.topic,
          timestamp: event.timestamp,
          payload: event.payload ?? event,
        });
      });
      controller.eventBus.subscribe("ASCALON_LEARNING_SIGNAL_RECORDED", async (event: any) => {
        learningEvents.push({
          topic: event.topic,
          timestamp: event.timestamp,
          payload: event.payload ?? event,
        });
      });

      console.log("[E2E] phase=mission-create-start");
      const mission = await controller.missionManager.createMission({
        goal: "Research and generate an evidence-backed educational YouTube Short about Python decorators.",
        scope: {
          topic: "Python decorators",
          jobId: `job_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          durationSeconds: 5,
          productionSpec: {
            configuration: {
              creative: { platform: "youtube_shorts" },
              content: {
                format: "educational_short",
                learningLevel: "beginner",
                audience: "beginner_programmers",
              },
            },
            engine: {
              contracts: {
                research: {
                  minSources: 2,
                  citationRequired: true,
                  sourcePolicy: "local verified research fixture",
                  freshness: "any",
                },
              },
            },
          },
          engineSnapshot: {
            effectiveConfig: {
              audience: "beginner_programmers",
            },
          },
        },
      });
      console.log(`[E2E] phase=mission-created missionId=${mission.missionId}`);

      const startedMission = await controller.missionManager.startMission(mission.missionId);
      expect(startedMission.missionId).toBe(mission.missionId);
      console.log(`[E2E] phase=mission-started status=${startedMission.status}`);

      controller.overseer.recordTrajectoryPrediction(mission.missionId, true);

      console.log("[E2E] phase=dispatch-start");
      const dispatch = await controller.overseer.dispatchMission(startedMission, "autonomous");
      expect(dispatch.missionId).toBe(mission.missionId);
      console.log(`[E2E] phase=dispatch-accepted runId=${dispatch.runId}`);

      const trajectory = await waitFor(() => {
        if (terminalFailure) throw new Error(`Production trajectory terminated: ${terminalFailure}`);
        const event = trajectoryEvents.find(
          (item) => item.payload.missionId === mission.missionId,
        );
        if (!event) throw new Error("Eight-floor trajectory evaluation has not completed yet.");
        if (event.payload.verificationStatus !== "VERIFIED") {
          throw new Error(
            `Trajectory was not verified: ${JSON.stringify(event.payload)}`,
          );
        }
        return event.payload;
      });

      const floorEvents = captured.filter(
        (event) =>
          event.payload.missionId === mission.missionId &&
          CANONICAL_FLOORS.includes(event.payload.floorId),
      );

      const observedFloors = new Set(floorEvents.map((event) => event.payload.floorId));
      expect([...observedFloors].sort()).toEqual([...CANONICAL_FLOORS].sort());

      const runIds = new Set(
        floorEvents.map((event) => event.payload.runId).filter((value): value is string => typeof value === "string"),
      );
      expect(runIds.size).toBe(1);
      expect([...runIds][0]).toBe(dispatch.runId);

      for (const floorId of CANONICAL_FLOORS) {
        const event = floorEvents.find((item) => item.payload.floorId === floorId)!;
        expect(event.payload.missionId).toBe(mission.missionId);
        expect(event.payload.runId).toBe(dispatch.runId);
        expect(event.payload.loopReceipt).toBeDefined();
        expect(event.payload.loopReceipt.verified).toBe(true);
        expect(event.payload.loopReceipt.evidenceRefs.length).toBeGreaterThan(0);
      }

      const f03 = floorEvents.find((event) => event.payload.floorId === "floor03_asset_realization")!;
      const f04 = floorEvents.find((event) => event.payload.floorId === "floor04_media_synthesis")!;
      const f05 = floorEvents.find((event) => event.payload.floorId === "floor05_timeline_composition")!;
      const f06 = floorEvents.find((event) => event.payload.floorId === "floor06_rendering")!;
      const f07 = floorEvents.find((event) => event.payload.floorId === "floor07_compliance")!;

      expect(f03.payload.loopReceipt.proofSource).toBe("RUNTIME");
      expect(f04.payload.loopReceipt.proofSource).toBe("RUNTIME");
      expect(f05.payload.loopReceipt.proofSource).toBe("RUNTIME");

      expect(f06.payload.loopReceipt.proofSource).toBe("PHYSICAL_VERIFIER");
      expect(f06.payload.artifact).toBeDefined();
      expect(f06.payload.artifact.sha256).toMatch(/^[a-f0-9]{64}$/i);
      expect(Number(f06.payload.byteLength)).toBeGreaterThan(0);
      expect(Number(f06.payload.width)).toBe(1080);
      expect(Number(f06.payload.height)).toBe(1920);
      expect(existsSync(String(f06.payload.videoUrl))).toBe(true);

      expect(f07.payload.loopReceipt.proofSource).toBe("PHYSICAL_VERIFIER");
      expect(f07.payload.loopReceipt.verified).toBe(true);
      expect(f07.payload.output.verified).toBe(true);
      expect(f07.payload.consumedArtifactIds).toContain(f06.payload.artifact.sha256);

      expect(trajectory.trajectoryId).toMatch(/^traj_[a-f0-9]{20}$/);
      expect(trajectory.missionId).toBe(mission.missionId);
      expect(trajectory.runId).toBe(dispatch.runId);
      expect(trajectory.verifiedFloorCount).toBe(8);
      expect(trajectory.canonicalFloorCount).toBe(8);
      expect(trajectory.verificationStatus).toBe("VERIFIED");
      expect(trajectory.finalOutcome).toBe("SUCCESS");
      expect(trajectory.trainingEligible).toBe(true);
      expect(Array.isArray(trajectory.evidenceRefs)).toBe(true);
      expect(trajectory.evidenceRefs.length).toBeGreaterThanOrEqual(8);

      expect(learningEvents).toHaveLength(1);
      expect(learningEvents[0].payload.missionId).toBe(mission.missionId);
      expect(learningEvents[0].payload.runId).toBe(dispatch.runId);
      expect(learningEvents[0].payload.trajectoryId).toBe(trajectory.trajectoryId);
      expect(learningEvents[0].payload.verificationStatus).toBe("VERIFIED");
      expect(learningEvents[0].payload.validatorPassed).toBe(true);
      expect(learningEvents[0].payload.trainingEligible).toBe(true);

      const proofArtifact = join(
        process.cwd(),
        "..",
        "..",
        "artifacts",
        "eight-floor-production-trajectory-proof.json",
      );
      mkdirSync(join(process.cwd(), "..", "..", "artifacts"), { recursive: true });

      const report = {
        proofVersion: "1.0.0",
        status: "VERIFIED",
        missionId: mission.missionId,
        runId: dispatch.runId,
        trajectoryId: trajectory.trajectoryId,
        canonicalFloors: [...CANONICAL_FLOORS],
        observedFloors: floorEvents.map((event) => ({
          floorId: event.payload.floorId,
          missionId: event.payload.missionId,
          runId: event.payload.runId,
          executionId: event.payload.executionId,
          proofSource: event.payload.loopReceipt?.proofSource,
          verified: event.payload.loopReceipt?.verified,
          evidenceRefs: event.payload.loopReceipt?.evidenceRefs ?? [],
        })),
        physicalArtifact: {
          sha256: f06.payload.artifact.sha256,
          byteLength: f06.payload.byteLength,
          width: f06.payload.width,
          height: f06.payload.height,
          path: f06.payload.videoUrl,
        },
        f07: {
          verified: f07.payload.output.verified,
          measurements: f07.payload.output.measurements,
          evidenceRefs: f07.payload.loopReceipt.evidenceRefs,
        },
        trajectory,
        ascalonLearningSignal: learningEvents[0].payload,
      };
      writeFileSync(proofArtifact, JSON.stringify(report, null, 2), "utf8");

      expect(readFileSync(proofArtifact, "utf8")).toContain(mission.missionId);
    },
    // Rendering is physical work; allow the proof lane enough wall-clock budget
    // without changing the workflow's independent 10-minute job ceiling.
    300_000,
  );
});
