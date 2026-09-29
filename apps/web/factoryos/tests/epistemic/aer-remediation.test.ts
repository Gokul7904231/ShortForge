import { describe, expect, it } from "vitest";
import {
  AEREngine,
  AERInvestigationLoop,
  AERMetricsRecorder,
  AERRoutingPolicyLearner,
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
    const metrics = new AERMetricsRecorder();

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
});
