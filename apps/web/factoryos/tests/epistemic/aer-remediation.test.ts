import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentExecutionRouter } from "../../core/agent/execution/AgentExecutionRouter";
import { InMemoryAgentExecutionStateStore } from "../../core/agent/execution/AgentExecutionStateStore";
import { ScopedToolExecutor } from "../../core/agent/execution/ScopedToolExecutor";
import type { ExecutionStepContract, ExecutionState } from "../../core/agent/execution/AgentExecutionContracts";
import { ToolRegistry } from "../../core/tools/ToolRegistry";
import { ToolExecutor } from "../../core/tools/ToolExecutor";
import { describe, expect, it } from "vitest";
import {
  AEREngine,
  AERInvestigationLoop,
  AERMetricsRecorder,
  JsonlAEREpisodeTelemetrySink,
  AERRoutingPolicyLearner,
  AERPolicyPromotionGate,
  AERShadowReplayEvaluator,
  ScopedToolAERExecutionFabricBridge,
  AscalonInvocationCoordinator,
  AscalonInvocationGate,
  EpistemicCache,
  InMemoryEpistemicBudgetReservationStore,
  evaluateAscalonValue,
  type AERValuePolicy,
} from "../../core/intelligence/epistemic";

const budget = {
  maxEpistemicTimeMs: 5000,
  maxDeepCalls: 3,
  maxMicroCalls: 5,
  maxProbeCount: 5,
  maxCostUnits: 20,
} as const;

const calibratedPolicy: AERValuePolicy = {
  baseline: {
    mode: "MICRO",
    resolutionProbability: 0.45,
    costUnits: 1,
    latencyMs: 100,
    source: "OBSERVED_CALIBRATION",
  },
  ascalon: {
    mode: "DEEP",
    resolutionProbability: 0.9,
    costUnits: 5,
    latencyMs: 200,
    source: "OBSERVED_CALIBRATION",
  },
  minimumNetValue: 0.01,
  costWeight: 0.1,
  latencyWeight: 0.01,
};

describe("AER remediation — economics, reservations, execution loop", () => {
  it("uses incremental expected utility and prices latency/cost", () => {
    const assessment = evaluateAscalonValue(
      {
        unknown: [
          {
            unknownId: "u1",
            question: "q",
            reason: "r",
            material: true,
            evidenceRefs: [],
          },
        ],
        contradictions: [],
        hypotheses: [],
        impact: {
          affectedFloors: ["F06"],
          affectedArtifacts: [],
          severity: "HIGH",
          reversible: true,
        },
      },
      calibratedPolicy,
    );

    expect(assessment.source).toBe("OBSERVED_CALIBRATION");
    expect(assessment.expectedValue).toBe(
      assessment.expectedBenefit - assessment.expectedCost,
    );
    expect(assessment.expectedCost).toBeGreaterThan(0);
    expect(assessment.shouldInvokeAscalon).toBe(true);

    const expensive = evaluateAscalonValue(
      {
        unknown: [
          {
            unknownId: "u1",
            question: "q",
            reason: "r",
            material: true,
            evidenceRefs: [],
          },
        ],
        contradictions: [],
        hypotheses: [],
        impact: {
          affectedFloors: ["F06"],
          affectedArtifacts: [],
          severity: "LOW",
          reversible: true,
        },
      },
      {
        ...calibratedPolicy,
        ascalon: {
          ...calibratedPolicy.ascalon,
          costUnits: 100,
        },
      },
    );

    expect(expensive.expectedValue).toBeLessThan(0);
    expect(expensive.shouldInvokeAscalon).toBe(false);
  });

  it("prevents double-spending a shared budget through atomic reservations", () => {
    const reservations = new InMemoryEpistemicBudgetReservationStore();

    const request = {
      scopeKey: "mission-01",
      budget,
      usage: {
        elapsedMs: 0,
        deepCalls: 0,
        microCalls: 0,
        probesExecuted: 0,
        costUnits: 0,
      },
      mode: "DEEP" as const,
      costUnits: 5,
      estimatedTimeMs: 1000,
    };

    const first = reservations.reserve(request, 1000);
    const second = reservations.reserve(request, 1000);

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    reservations.commit(first!.reservationId);
    expect(reservations.reserve(request, 1000)).not.toBeNull();
  });

  it("runs probes through an injected execution-fabric bridge and re-plans on evidence", async () => {
    const metrics = new AERMetricsRecorder();
    const loop = new AERInvestigationLoop(
      new AEREngine(metrics),
    );

    const result = await loop.investigate(
      {
        contextSeed: "probe-loop",
        unknown: [
          {
            unknownId: "u1",
            question: "Does measured duration fit?",
            reason: "duration is not yet verified",
            material: true,
            evidenceRefs: [],
          },
        ],
        probes: [
          {
            probeId: "timing-probe",
            type: "FFPROBE_TIMING",
            target: {},
            requiredCapabilities: ["CAP_FFPROBE"],
            estimatedLatencyMs: 20,
            estimatedCostUnits: 1,
            expectedInformationGain: 0.9,
            riskClass: "READ_ONLY",
            timeoutMs: 1000,
            cacheable: true,
            parallelizable: true,
            evidenceProduced: ["timing:verified"],
          },
        ],
        budget,
        routing: {
          microAvailable: true,
          deepAvailable: true,
        },
        probePlanning: {
          availableCapabilities: new Set(["CAP_FFPROBE"]),
        },
      },
      {
        async execute({ probe }) {
          return {
            probeId: probe.probeId,
            status: "VERIFIED" as const,
            executorRunId: "aef-run-01",
            evidenceRefs: ["timing:verified"],
            measurementsAdded: [
              {
                measurementId: "m1",
                dimension: "duration",
                value: 2,
                measurementType: "REAL_MEASURED" as const,
                sourceRef: "ffprobe",
                observedAt: "2026-09-29T00:00:00.000Z",
                evidenceRefs: ["timing:verified"],
              },
            ],
            resolvedUnknownIds: ["u1"],
            latencyMs: 20,
            costUnits: 1,
          };
        },
      },
      { maxIterations: 2 },
    );

    expect(result.probeResults).toHaveLength(1);
    expect(result.probeResults[0].executorRunId).toBe("aef-run-01");
    expect(result.finalAssessment.state.unknown).toHaveLength(0);
    expect(result.termination).toBe("RESOLVED");
    expect(metrics.snapshot().probeUsefulnessRate).toBe(1);
  });

  it("keeps Ascalon behind the explicit gate and coordinator", () => {
    const aer = new AEREngine();
    const assessment = aer.assess({
      contextSeed: "coordinator",
      hypotheses: [
        {
          hypothesisId: "h1",
          statement: "encoder",
          support: 0.6,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
        {
          hypothesisId: "h2",
          statement: "transfer",
          support: 0.4,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
      ],
      budget,
      routing: {
        ascalonAvailable: true,
        valuePolicy: calibratedPolicy,
      },
    });

    expect(new AscalonInvocationGate().evaluate({ context: assessment.context }).admitted).toBe(true);

    const coordinator = new AscalonInvocationCoordinator();
    const permit = coordinator.prepare({
      context: assessment.context,
      scopeKey: "mission-coordinator",
    });

    expect(permit).not.toBeNull();
    expect(permit!.reservation.mode).toBe("DEEP");
    coordinator.release(permit!);
  });

  it("produces an observed-calibration policy only after enough outcome evidence", () => {
    const metrics = new AERMetricsRecorder(undefined, {
      verifyOutcome: (receipt) =>
        receipt.authoritativeSource === "VERIFIED_SYSTEM" &&
        receipt.verificationRef.startsWith("validator:") &&
        receipt.evidenceRefs.includes(receipt.verificationRef),
    });

    for (let i = 0; i < 30; i += 1) {
      metrics.recordAssessment({
        episodeId: "micro-" + i,
        uncertaintyEncountered: true,
        ascalonEscalationRecommended: false,
        routedMode: "MICRO",
        aerLatencyMs: 5,
      });
      metrics.recordOutcome({
        outcomeId: "micro-outcome-" + i,
        episodeId: "micro-" + i,
        status: i < 24 ? "RESOLVED" : "UNRESOLVED",
        evidenceRefs: i < 24 ? ["validator:" + i] : ["validator:" + i],
        authoritativeSource: "VERIFIED_SYSTEM",
        verificationRef: "validator:" + i,
        observedAt: "2026-09-29T00:00:00.000Z",
      });
    }

    for (let i = 0; i < 30; i += 1) {
      metrics.recordAssessment({
        episodeId: "deep-" + i,
        uncertaintyEncountered: true,
        ascalonEscalationRecommended: true,
        routedMode: "DEEP",
        aerLatencyMs: 10,
      });
      metrics.recordAscalonInvocation({
        episodeId: "deep-" + i,
        latencyMs: 200,
        costUnits: 5,
      });
      metrics.recordOutcome({
        outcomeId: "deep-outcome-" + i,
        episodeId: "deep-" + i,
        status: i < 27 ? "RESOLVED" : "UNRESOLVED",
        evidenceRefs: ["validator:deep:" + i],
        authoritativeSource: "VERIFIED_SYSTEM",
        verificationRef: "validator:deep:" + i,
        observedAt: "2026-09-29T00:00:00.000Z",
      });
    }

    const learner = new AERRoutingPolicyLearner(metrics, 30);
    const candidate = learner.propose({ baselineMode: "MICRO" });

    expect(candidate.eligibleForShadow).toBe(true);
    expect(candidate.valuePolicy.baseline.source).toBe("OBSERVED_CALIBRATION");
    expect(candidate.valuePolicy.ascalon.source).toBe("OBSERVED_CALIBRATION");
    expect(candidate.valuePolicy.ascalon.resolutionProbability).toBeLessThan(
      candidate.valuePolicy.baseline.resolutionProbability + 1,
    );
  });

  it("routes a real probe through ScopedToolExecutor and preserves evidence/cost metadata", async () => {
    const registry = new ToolRegistry();
    registry.register({
      id: "probe.ffprobe",
      name: "FFprobe timing",
      version: "1.0.0",
      description: "Read-only media timing probe",
      capability: "CAP_FFPROBE",
      riskLevel: "LOW",
      sideEffects: "READ_ONLY",
      execute: async () => ({
        success: true,
        output: {
          status: "VERIFIED" as const,
          evidenceRefs: ["measurement:timing:001"],
          costUnits: 2,
        },
        costUsd: 0.004,
        evidenceId: "tool-evidence:timing:001",
      }),
    });

    const step: ExecutionStepContract = {
      stepId: "aer_probe",
      phase: "DIAGNOSIS",
      allowedTools: ["probe.ffprobe"],
      requiredCapabilities: ["CAP_FFPROBE"],
      preconditions: [],
      postconditions: [],
      sideEffect: "NONE",
      idempotency: "NONE",
      retryPolicy: {
        maxAttempts: 1,
        retryOn: [],
        backoffMs: 0,
        sameIdempotencyKey: false,
      },
      evidenceRequirements: [],
      humanApproval: "NONE",
      riskLevel: "LOW",
    };

    const stateStore = new InMemoryAgentExecutionStateStore();
    const router = new AgentExecutionRouter(stateStore);
    router.registerStep(step);

    const ready: ExecutionState = {
      executionId: "aer-aef-exec-001",
      missionId: "mission-aer-001",
      runId: "run-aer-001",
      stepId: "aer_probe",
      stepAttempt: 0,
      stateVersion: 1,
      status: "READY",
      facts: {},
      sideEffectStatus: "NOT_STARTED",
      evidenceRefs: [],
      artifactRefs: [],
      humanApprovalState: "NOT_REQUIRED",
      updatedAt: new Date().toISOString(),
    };

    const scoped = new ScopedToolExecutor(
      router,
      registry,
      new ToolExecutor(registry),
      new Set(["CAP_FFPROBE"]),
    );

    const running = router.start(ready);
    const probe = {
      probeId: "timing-probe",
      type: "FFPROBE_TIMING",
      target: { path: "artifact.mp4" },
      requiredCapabilities: ["CAP_FFPROBE"],
      estimatedLatencyMs: 20,
      estimatedCostUnits: 1,
      expectedInformationGain: 0.9,
      riskClass: "READ_ONLY" as const,
      timeoutMs: 1000,
      cacheable: true,
      parallelizable: true,
      evidenceProduced: ["measurement:timing:001"],
    };

    const bridge = new ScopedToolAERExecutionFabricBridge(
      scoped,
      () => running,
      () => "probe.ffprobe",
    );

    const context = new AEREngine().assess({
      contextSeed: "aef-bridge-context",
      budget,
    }).context;

    const result = await bridge.execute({
      episodeId: "aer-aef-episode-001",
      context,
      probe,
      deadlineAtMs: Date.now() + 1000,
    });

    expect(result.status).toBe("VERIFIED");
    expect(result.executorRunId).toBe("aer-aef-exec-001");
    expect(result.evidenceRefs).toContain("measurement:timing:001");
    expect(result.evidenceRefs).toContain("tool-evidence:timing:001");
    expect(result.costUnits).toBe(2);
    expect(result.actualCostUsd).toBe(0.004);
  });

  it("replays historical necessity evidence without executing anything", () => {
    const engine = new AEREngine();
    const context = engine.assess({
      contextSeed: "replay-context",
      unknown: [
        {
          unknownId: "u1",
          question: "needs deep reasoning",
          reason: "multiple plausible hypotheses",
          material: true,
          evidenceRefs: [],
        },
      ],
      budget,
      routing: { deepAvailable: true },
    }).context;

    const replay = new AERShadowReplayEvaluator({
      verifyOutcome: (receipt) =>
        receipt.verificationRef === "validator:1" &&
        receipt.evidenceRefs.includes("validator:1") &&
        (receipt.necessityAssessment?.evidenceRefs.includes("baseline:1") ?? false),
    });
    const report = replay.evaluate(
      [
        {
          episodeId: "replay-1",
          context,
          actualMode: "DEEP",
          outcome: {
            outcomeId: "outcome-1",
            episodeId: "replay-1",
            status: "RESOLVED",
            evidenceRefs: ["validator:1"],
            authoritativeSource: "VERIFIED_SYSTEM",
            verificationRef: "validator:1",
            observedAt: "2026-09-29T00:00:00.000Z",
            necessityAssessment: {
              verdict: "NECESSARY",
              method: "CONTROLLED_REPLAY",
              evidenceRefs: ["baseline:1"],
            },
          },
        },
      ],
      {
        policyVersion: "candidate-v2",
        decide: () => "MICRO",
      },
    );

    expect(report.replayedCount).toBe(1);
    expect(report.unverifiedEpisodeCount).toBe(0);
    expect(report.controlledNecessityCoverageRate).toBe(1);
    expect(report.wouldMissNecessaryEscalation).toBe(1);
    expect(report.wouldEscalateUnnecessarily).toBe(0);
  });

  it("does not qualify a shadow policy without evidence thresholds", () => {
    const gate = new AERPolicyPromotionGate();
    const baseline = {
      policyVersion: "baseline-v1",
      sampleCount: 100,
      resolvedRateLower95: 0.70,
      resolvedRateUpper95: 0.82,
      falseReassuranceRateUpper95: 0.01,
      costUsdPerResolvedUncertainty: 0.10,
      p95LatencyMs: 1000,
      authorityViolationCount: 0,
      controlledNecessityCoverageRate: 1,
      missedNecessaryEscalationCount: 0,
    };
    const candidate = {
      ...baseline,
      policyVersion: "candidate-v2",
      sampleCount: 20,
      resolvedRateLower95: 0.71,
    };

    const result = gate.evaluate({
      baseline,
      candidate,
      criteria: {
        minSamples: 50,
        maxFalseReassuranceUpper95: 0.02,
        maxLatencyRegressionMs: 100,
        minCostSavingsUsd: 0.001,
        maxResolutionLowerBoundRegression: 0.01,
        minControlledNecessityCoverageRate: 0.95,
        maxMissedNecessaryEscalations: 0,
      },
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("candidate_sample_size_insufficient");
  });


  it("blocks shadow promotion when controlled necessity replay evidence is missing", () => {
    const gate = new AERPolicyPromotionGate();
    const baseline = {
      policyVersion: "baseline-v1",
      sampleCount: 100,
      resolvedRateLower95: 0.70,
      resolvedRateUpper95: 0.82,
      falseReassuranceRateUpper95: 0.01,
      costUsdPerResolvedUncertainty: 0.10,
      p95LatencyMs: 1000,
      authorityViolationCount: 0,
      controlledNecessityCoverageRate: 1,
      missedNecessaryEscalationCount: 0,
    };
    const candidate = {
      ...baseline,
      policyVersion: "candidate-no-replay",
      controlledNecessityCoverageRate: null,
    };
    const result = gate.evaluate({
      baseline,
      candidate,
      criteria: {
        minSamples: 50,
        maxFalseReassuranceUpper95: 0.02,
        maxLatencyRegressionMs: 100,
        minCostSavingsUsd: 0.001,
        maxResolutionLowerBoundRegression: 0.01,
        minControlledNecessityCoverageRate: 0.95,
        maxMissedNecessaryEscalations: 0,
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("candidate_controlled_necessity_evidence_missing");
  });

  it("does not admit outcome claims into calibration without an independent verifier", () => {
    const metrics = new AERMetricsRecorder();
    metrics.recordAssessment({
      episodeId: "unverified-episode",
      uncertaintyEncountered: true,
      ascalonEscalationRecommended: false,
      routedMode: "MICRO",
      aerLatencyMs: 4,
    });
    const result = metrics.recordOutcome({
      outcomeId: "unverified-outcome",
      episodeId: "unverified-episode",
      status: "RESOLVED",
      evidenceRefs: ["receipt:only-a-string"],
      authoritativeSource: "VERIFIED_SYSTEM",
      verificationRef: "receipt:only-a-string",
      observedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(result.admitted).toBe(false);
    expect(metrics.getModeCalibration("MICRO").sampleCount).toBe(0);
    const gateEvidence = AERPolicyPromotionGate.fromSnapshot(metrics.snapshot(), {
      policyVersion: "candidate-without-verified-outcomes",
      resolvedRateLower95: 0,
      resolvedRateUpper95: 0,
      falseReassuranceRateUpper95: 1,
      controlledNecessityCoverageRate: null,
      missedNecessaryEscalationCount: 0,
    });
    expect(gateEvidence.sampleCount).toBe(0);
    expect(metrics.snapshot().uncertaintyEpisodeCount).toBe(1);
    expect(metrics.snapshot().verifiedOutcomeCount).toBe(0);
  });

  it("durably appends metadata-only shadow telemetry and exposes sink health", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aer-telemetry-"));
    const filePath = path.join(directory, "episodes.jsonl");
    try {
      const sink = new JsonlAEREpisodeTelemetrySink(filePath);
      await sink.append({
        eventId: "event-1",
        episodeId: "episode-1",
        eventName: "aer.assessment",
        timestamp: "2026-10-31T00:00:00.000Z",
        policyVersion: "aer-shadow-v1",
        attributes: { route: "MICRO" },
      });
      const health = sink.health();
      expect(health.appendCount).toBe(1);
      expect(health.failureCount).toBe(0);
      const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).episodeId).toBe("episode-1");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

});
