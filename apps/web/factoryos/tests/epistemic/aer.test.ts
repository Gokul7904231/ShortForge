import { describe, expect, it } from "vitest";
import {
  AEREngine,
  EpistemicBudgetController,
  EpistemicStateEngine,
  ProbePlanner,
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
});
