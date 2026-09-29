import { describe, expect, it } from "vitest";
import {
  EpistemicCache,
  EpistemicLedger,
  EpistemicTrigger,
  HypothesisManager,
  type EpistemicHypothesis,
} from "../../core/intelligence/epistemic";

describe("AER auxiliary production primitives", () => {
  const hypothesis: EpistemicHypothesis = {
    hypothesisId: "h1",
    statement: "timeline is too short",
    support: 0.4,
    status: "VIABLE",
    evidenceRefs: [],
    requiredProbeIds: [],
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  };

  it("triggers on material contradictions and suppresses duplicate fingerprints", () => {
    const trigger = new EpistemicTrigger();
    expect(trigger.evaluate({
      triggerType: "CONTRADICTION",
      material: true,
    }).shouldTrigger).toBe(true);

    expect(trigger.evaluate({
      triggerType: "STATE_CHANGE",
      material: true,
      repeatedCount: 1,
      stateFingerprint: "same",
      lastTriggerFingerprint: "same",
    }).shouldTrigger).toBe(false);
  });

  it("updates hypotheses without treating support as calibrated probability", () => {
    const manager = new HypothesisManager([hypothesis]);
    const updated = manager.applyEvidenceUpdate({
      hypothesisId: "h1",
      status: "SUPPORTED",
      supportDelta: 0.3,
      evidenceRefs: ["measurement:1"],
    });

    expect(updated.support).toBe(0.7);
    expect(updated.status).toBe("SUPPORTED");
    expect(updated.evidenceRefs).toEqual(["measurement:1"]);
  });

  it("invalidates cache when model or policy identity changes", () => {
    const cache = new EpistemicCache<string>(10, 1000);
    const key = {
      semanticFingerprint: "state:1",
      modelRef: "ascalon-v1",
      modelVersion: "1",
      policyVersion: "p1",
    };

    cache.set(key, "cached", 1000);
    expect(cache.get(key, 1500)).toBe("cached");
    expect(cache.get({...key, policyVersion: "p2"}, 1500)).toBeUndefined();
    expect(cache.get(key, 2501)).toBeUndefined();
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(2);
    expect(cache.stats().hitRate).toBeCloseTo(1 / 3);
  });

  it("maintains a tamper-evident append-only chain", () => {
    const context = {
      schemaVersion: "1.0" as const,
      contextId: "aer_ctx",
      state: "CONFIRMED" as const,
      known: [],
      unknown: [],
      contradictions: [],
      measurements: [],
      hypotheses: [],
      recommendedProbes: [],
      evidenceRefs: [],
      investigationHistory: [],
      impact: {
        affectedFloors: [],
        affectedArtifacts: [],
        severity: "LOW" as const,
        reversible: true,
      },
      cognitiveRecommendation: {
        mode: "DETERMINISTIC" as const,
        reason: "test",
        reasonCode: "NO_MATERIAL_UNCERTAINTY" as const,
        deadlineMs: 10,
        expectedValue: 0,
        shouldInvokeAscalon: false,
        estimatedCostUnits: 0,
        estimatedLatencyMs: 0,
        expectedBenefit: 0,
        expectedCost: 0,
        uncertaintyBurden: 0,
        baselineMode: "DETERMINISTIC" as const,
        expectedValueSource: "UNAVAILABLE" as const,
        budget: {
          maxTimeMs: 100,
          maxCallsRemaining: 0,
          maxCostUnits: 0,
        },
      },
      budgets: {
        maxEpistemicTimeMs: 100,
        maxDeepCalls: 0,
        maxMicroCalls: 0,
        maxProbeCount: 0,
        maxCostUnits: 0,
      },
      usage: {
        elapsedMs: 0,
        deepCalls: 0,
        microCalls: 0,
        probesExecuted: 0,
        costUnits: 0,
      },
      freshness: {},
      authorityClass: "MODEL_ADVISORY" as const,
      contextFingerprint: "fp",
      serializedTokenEstimate: 10,
      expiresAt: "2026-09-29T00:10:00.000Z",
      redactionState: "CLEAN" as const,
    };

    const ledger = new EpistemicLedger();
    ledger.append({
      context,
      eventType: "ASSESSMENT",
      payload: { mode: "DEEP" },
    });
    ledger.append({
      context,
      eventType: "OUTCOME",
      payload: { resolved: true },
    });

    expect(ledger.list()).toHaveLength(2);
    expect(ledger.verifyChain()).toBe(true);
  });
});
