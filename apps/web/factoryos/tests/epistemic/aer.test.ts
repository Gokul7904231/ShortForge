import { describe, expect, it } from "vitest";
import {
  AEREngine,
  EpistemicBudgetController,
  EpistemicStateEngine,
  ProbePlanner,
  AERMetricsRecorder,
  AscalonInvocationGate,
  type CognitiveProbe,
} from "../../core/intelligence/epistemic";

describe("AER — Ascalon Epistemic Runtime", () => {
  const budget = {
    maxEpistemicTimeMs: 5000,
    maxDeepCalls: 2,
    maxMicroCalls: 5,
    maxProbeCount: 5,
    maxCostUnits: 20,
  } as const;

  it("keeps deterministic / confirmed state out of deep cognition", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "artifact-check",
      known: [
        {
          factId: "f1",
          statement: "artifact SHA matches receipt",
          sourceRefs: ["sha:123"],
          status: "CONFIRMED",
        },
      ],
      evidenceRefs: ["sha:123"],
      budget,
      routing: {
        microAvailable: true,
        deepAvailable: true,
      },
    });

    expect(result.state.state).toBe("CONFIRMED");
    expect(result.state.cognitiveRecommendation.mode).toBe("DETERMINISTIC");
  });

  it("routes material uncertainty to micro cognition when one hypothesis remains", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "timing-mismatch",
      unknown: [
        {
          unknownId: "u1",
          question: "Does the timeline fit measured narration?",
          reason: "audio duration is not aligned with committed timeline",
          material: true,
          evidenceRefs: ["voice:1", "timeline:1"],
        },
      ],
      hypotheses: [
        {
          hypothesisId: "h1",
          statement: "timeline should expand",
          support: 0.8,
          status: "SUPPORTED",
          evidenceRefs: ["voice:1"],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
      ],
      budget,
      routing: {
        microAvailable: true,
        deepAvailable: true,
      },
    });

    expect(result.state.state).toBe("UNCERTAIN");
    expect(result.state.cognitiveRecommendation.mode).toBe("MICRO");
    expect(result.ascalonHandoff.mode).toBe("SHADOW");
    expect(result.ascalonHandoff.modelAuthority).toBe("ADVISORY_ONLY");
  });

  it("routes multiple viable hypotheses to deep cognition when available", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "render-failure",
      hypotheses: [
        {
          hypothesisId: "h1",
          statement: "encoder configuration regressed",
          support: 0.55,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
        {
          hypothesisId: "h2",
          statement: "asset transfer is the bottleneck",
          support: 0.45,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
      ],
      budget,
      routing: {
        microAvailable: true,
        deepAvailable: true,
      },
    });

    expect(result.state.cognitiveRecommendation.mode).toBe("DEEP");
  });

  it("selects a higher-value low-cost probe and rejects unauthorized mutation", () => {
    const probes: CognitiveProbe[] = [
      {
        probeId: "slow",
        type: "FULL_RERENDER",
        target: {},
        requiredCapabilities: [],
        estimatedLatencyMs: 8000,
        estimatedCostUnits: 8,
        expectedInformationGain: 0.9,
        riskClass: "READ_ONLY",
        timeoutMs: 9000,
        cacheable: false,
        parallelizable: false,
      },
      {
        probeId: "fast",
        type: "FFPROBE_TIMING",
        target: {},
        requiredCapabilities: [],
        estimatedLatencyMs: 20,
        estimatedCostUnits: 1,
        expectedInformationGain: 0.6,
        riskClass: "READ_ONLY",
        timeoutMs: 1000,
        cacheable: true,
        parallelizable: true,
      },
      {
        probeId: "mutate",
        type: "CHANGE_TIMELINE",
        target: {},
        requiredCapabilities: ["CAP_TIMELINE_COMPILE"],
        estimatedLatencyMs: 10,
        estimatedCostUnits: 1,
        expectedInformationGain: 0.9,
        riskClass: "MUTATING",
        timeoutMs: 1000,
        cacheable: false,
        parallelizable: false,
      },
    ];

    const planner = new ProbePlanner(budget);
    const planned = planner.plan(probes);
    expect(planned[0].probeId).toBe("fast");
    expect(planned.some((probe) => probe.probeId === "mutate")).toBe(false);
  });

  it("enforces monotonic epistemic budgets", () => {
    const controller = new EpistemicBudgetController(budget);

    expect(
      controller.canUseDeep({
        elapsedMs: 0,
        deepCalls: 0,
        microCalls: 0,
        probesExecuted: 0,
        costUnits: 0,
      }),
    ).toBe(true);

    expect(
      controller.canUseDeep({
        elapsedMs: 0,
        deepCalls: 2,
        microCalls: 0,
        probesExecuted: 0,
        costUnits: 0,
      }),
    ).toBe(false);

    expect(
      controller.canRunProbe(
        {
          elapsedMs: 6000,
          deepCalls: 0,
          microCalls: 0,
          probesExecuted: 0,
          costUnits: 0,
        },
        1,
      ),
    ).toBe(false);
  });

  it("produces a stable logical state fingerprint", () => {
    const engine = new EpistemicStateEngine();
    const input = {
      contextSeed: "stable",
      known: [
        {
          factId: "f1",
          statement: "x is true",
          sourceRefs: ["e1"],
          status: "CONFIRMED" as const,
        },
      ],
    };

    const a = engine.build(input);
    const b = engine.build(input);
    expect(engine.computeFingerprint(a)).toBe(engine.computeFingerprint(b));
  });

  it("binds the Ascalon handoff to the EpistemicContext fingerprint", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "handoff",
      unknown: [
        {
          unknownId: "u1",
          question: "Which diagnostic path is appropriate?",
          reason: "multiple plausible failure modes",
          material: true,
          evidenceRefs: [],
        },
      ],
      budget,
      routing: {
        deepAvailable: true,
      },
    });

    expect(result.ascalonHandoff.contextFingerprint).toBe(
      result.context.contextFingerprint,
    );
    expect(result.ascalonHandoff.mode).toBe("SHADOW");
  });

  it("redacts credential-like values before Ascalon handoff", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "redaction",
      unknown: [
        {
          unknownId: "u1",
          question: "Can this provider be used?",
          reason: "Authorization: Bearer super-secret-token",
          material: true,
          evidenceRefs: ["api_key=top-secret-value"],
        },
      ],
      budget,
      routing: { deepAvailable: true },
    });

    const serialized = JSON.stringify(result.context);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("top-secret-value");
    expect(serialized).toContain("[REDACTED_SECRET]");
    expect(result.context.redactionState).toBe("CLEAN");
  });

  it("never marks model inference as authoritative", () => {
    const engine = new EpistemicStateEngine();
    const state = engine.build({
      contextSeed: "model-only",
      measurements: [
        {
          measurementId: "m1",
          dimension: "temporalRisk",
          value: 0.9,
          measurementType: "MODEL_INFERENCE",
          sourceRef: "ascalon:shadow",
          observedAt: "2026-09-29T00:00:00.000Z",
          evidenceRefs: [],
          calibrationStatus: "UNCALIBRATED",
          authoritative: false,
        },
      ],
    });

    expect(state.authorityClass).toBe("MODEL_ADVISORY");
    expect(state.measurements[0].measurementType).toBe("MODEL_INFERENCE");
    expect(state.measurements[0].authoritative).toBe(false);
  });

  it("fails closed when a model inference attempts authoritative status", () => {
    const engine = new EpistemicStateEngine();
    expect(() =>
      engine.build({
        contextSeed: "forged-authority",
        measurements: [
          {
            measurementId: "m1",
            dimension: "release",
            value: true,
            measurementType: "MODEL_INFERENCE",
            sourceRef: "ascalon:shadow",
            observedAt: "2026-09-29T00:00:00.000Z",
            evidenceRefs: [],
            calibrationStatus: "UNCALIBRATED",
            authoritative: true,
          },
        ],
      }),
    ).toThrow("cannot be authoritative");
  });

  it("makes Ascalon admission explicit and cost-aware", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "deep-admission",
      hypotheses: [
        {
          hypothesisId: "h1",
          statement: "encoder configuration regressed",
          support: 0.55,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
        {
          hypothesisId: "h2",
          statement: "asset transfer is the bottleneck",
          support: 0.45,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
      ],
      budget,
      routing: {
        deepAvailable: true,
        ascalonEstimatedCostUnits: 5,
        minimumAscalonExpectedValue: 0.5,
      },
    });

    expect(result.state.cognitiveRecommendation.mode).toBe("DEEP");
    expect(result.state.cognitiveRecommendation.shouldInvokeAscalon).toBe(true);
    expect(result.state.cognitiveRecommendation.expectedValue).toBeGreaterThanOrEqual(0.5);
    expect(result.state.cognitiveRecommendation.budget.maxCallsRemaining).toBe(2);
    expect(result.ascalonHandoff.shouldInvokeAscalon).toBe(true);
    expect(result.ascalonAdmission.admitted).toBe(true);
  });

  it("keeps low-value uncertainty on the micro path", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "micro-path",
      unknown: [
        {
          unknownId: "u1",
          question: "Does the timeline fit measured narration?",
          reason: "small timing ambiguity",
          material: true,
          evidenceRefs: ["voice:1", "timeline:1"],
        },
      ],
      budget,
      routing: {
        microAvailable: true,
        deepAvailable: true,
        ascalonEstimatedCostUnits: 5,
        minimumAscalonExpectedValue: 0.5,
      },
    });

    expect(result.state.cognitiveRecommendation.mode).toBe("MICRO");
    expect(result.state.cognitiveRecommendation.shouldInvokeAscalon).toBe(false);
    expect(result.state.cognitiveRecommendation.reasonCode).toBe("MICRO_SUFFICIENT");
  });

  it("blocks deep Ascalon escalation when the remaining cost budget cannot afford it", () => {
    const aer = new AEREngine();
    const result = aer.assess({
      contextSeed: "cost-block",
      hypotheses: [
        {
          hypothesisId: "h1",
          statement: "encoder configuration regressed",
          support: 0.55,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
        {
          hypothesisId: "h2",
          statement: "asset transfer is the bottleneck",
          support: 0.45,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
      ],
      budget: {
        ...budget,
        maxCostUnits: 3,
      },
      routing: {
        deepAvailable: true,
        ascalonEstimatedCostUnits: 5,
      },
    });

    expect(result.state.cognitiveRecommendation.shouldInvokeAscalon).toBe(false);
    expect(result.state.cognitiveRecommendation.reasonCode).toBe("ASCALON_BUDGET_EXHAUSTED");
    expect(result.ascalonAdmission.admitted).toBe(false);
  });

  it("applies the deterministic Ascalon pre-call gate", () => {
    const aer = new AEREngine();
    const deep = aer.assess({
      contextSeed: "gate",
      hypotheses: [
        {
          hypothesisId: "h1",
          statement: "encoder configuration regressed",
          support: 0.55,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
        {
          hypothesisId: "h2",
          statement: "asset transfer is the bottleneck",
          support: 0.45,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
      ],
      budget,
      routing: { deepAvailable: true },
    });

    const gate = new AscalonInvocationGate();
    expect(gate.evaluate({ context: deep.context }).admitted).toBe(true);

    const expired = gate.evaluate({
      context: deep.context,
      nowMs: Date.parse(deep.context.expiresAt) + 1,
    });
    expect(expired.admitted).toBe(false);
    expect(expired.reason).toBe("epistemic_context_expired_or_invalid");
  });

  it("tracks cost per resolved uncertainty and routing efficiency", () => {
    const metrics = new AERMetricsRecorder();
    metrics.recordEvent({ episodeId: "skipped", aerInvoked: false });

    const aer = new AEREngine(metrics);
    const deterministic = aer.assess({
      contextSeed: "metric-deterministic",
      known: [
        {
          factId: "f1",
          statement: "hash matches",
          sourceRefs: ["hash:1"],
          status: "CONFIRMED",
        },
      ],
      budget,
    });

    const uncertain = aer.assess({
      contextSeed: "metric-uncertain",
      hypotheses: [
        {
          hypothesisId: "h1",
          statement: "encoder regression",
          support: 0.6,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
        {
          hypothesisId: "h2",
          statement: "transfer bottleneck",
          support: 0.4,
          status: "VIABLE",
          evidenceRefs: [],
          requiredProbeIds: [],
          createdAt: "2026-09-29T00:00:00.000Z",
          updatedAt: "2026-09-29T00:00:00.000Z",
        },
      ],
      budget,
      routing: { deepAvailable: true },
    });

    metrics.recordProbe({
      episodeId: uncertain.context.contextId,
      executed: true,
      useful: true,
      costUnits: 1,
    });
    metrics.recordAscalonInvocation({
      episodeId: uncertain.context.contextId,
      latencyMs: 40,
      costUnits: 3,
    });
    metrics.recordOutcome({
      episodeId: uncertain.context.contextId,
      resolvedUncertainty: true,
      falseReassurance: false,
      ascalonWasNecessary: true,
    });
    metrics.recordOutcome({
      episodeId: deterministic.context.contextId,
      resolvedUncertainty: true,
      falseReassurance: false,
    });

    const snapshot = metrics.snapshot();
    expect(snapshot.episodeCount).toBe(3);
    expect(snapshot.aerInvocationRate).toBeCloseTo(2 / 3);
    expect(snapshot.ascalonEscalationRate).toBeCloseTo(1 / 2);
    expect(snapshot.ascalonInvocationRate).toBeCloseTo(1 / 2);
    expect(snapshot.averageProbesPerUncertainty).toBe(1);
    expect(snapshot.costPerResolvedUncertainty).toBe(4);
    expect(snapshot.probeUsefulnessRate).toBe(1);
    expect(snapshot.unnecessaryEscalationRate).toBe(0);
    expect(snapshot.falseReassuranceRate).toBe(0);
    expect(snapshot.p95AscalonLatencyMs).toBe(40);
  });

});
