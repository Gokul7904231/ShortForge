import { describe, expect, it } from "vitest";
import {
  compareRetrievalBenchmarks,
  runHybridRetrievalBenchmark,
  type RetrievalBenchmarkReport,
  type RetrievalBenchmarkProvider,
} from "../core/research/HybridRetrievalBenchmark";

const cases = [
  { caseId: "symbol-lookup", query: "MissionWorkManager.board", relevantDocumentIds: ["mission-work-manager.ts"], category: "EXACT_IDENTIFIER" as const },
  { caseId: "concept-search", query: "durable task state", relevantDocumentIds: ["mission-work-manager.ts", "MissionWorkContracts.ts"], category: "SEMANTIC" as const },
];

describe("hybrid retrieval benchmark", () => {
  it("measures recall, MRR, exact identifier hits, and provenance coverage", async () => {
    const provider: RetrievalBenchmarkProvider = {
      providerId: "fixture-hybrid",
      implementationRevision: "test-rev-1",
      async search(query, limit) {
        const results = query.includes("MissionWorkManager")
          ? [
              { documentId: "mission-work-manager.ts", sourceRef: "repo://apps/web/MissionWorkManager.ts", sourceRevision: "abc123" },
              { documentId: "other.ts", sourceRef: "repo://apps/web/other.ts", sourceRevision: "abc123" },
            ]
          : [
              { documentId: "MissionWorkContracts.ts", sourceRef: "repo://apps/web/MissionWorkContracts.ts", sourceRevision: "abc123" },
              { documentId: "mission-work-manager.ts", sourceRef: "repo://apps/web/MissionWorkManager.ts", sourceRevision: "abc123" },
            ];
        return results.slice(0, limit);
      },
    };

    const report = await runHybridRetrievalBenchmark(provider, cases, { topK: 2 });

    expect(report.schemaVersion).toBe("hybrid-retrieval-benchmark.v1");
    expect(report.metrics.recallAtK).toBe(1);
    expect(report.metrics.meanReciprocalRank).toBe(0.75);
    expect(report.metrics.exactIdentifierHitRate).toBe(1);
    expect(report.metrics.provenanceCoverage).toBe(1);
    expect(report.metrics.providerErrorRate).toBe(0);
    expect(report.cases).toHaveLength(2);
  });

  it("records provider errors as failures instead of treating them as successful retrieval", async () => {
    const provider: RetrievalBenchmarkProvider = {
      providerId: "broken-provider",
      implementationRevision: "broken-rev",
      async search() { throw new Error("sensitive provider detail"); },
    };

    const report = await runHybridRetrievalBenchmark(provider, [cases[0]], { topK: 3 });

    expect(report.cases[0].status).toBe("PROVIDER_ERROR");
    expect(report.metrics.recallAtK).toBe(0);
    expect(report.metrics.providerErrorRate).toBe(1);
    expect(JSON.stringify(report)).not.toContain("sensitive provider detail");
  });

  it("rejects invalid benchmark sizes and duplicate case ids", async () => {
    const provider: RetrievalBenchmarkProvider = {
      providerId: "fixture",
      implementationRevision: "v1",
      async search() { return []; },
    };

    await expect(runHybridRetrievalBenchmark(provider, cases, { topK: 0 })).rejects.toThrow("RETRIEVAL_BENCHMARK_INVALID_TOP_K");
    await expect(runHybridRetrievalBenchmark(provider, [cases[0], cases[0]])).rejects.toThrow("RETRIEVAL_BENCHMARK_INVALID_CASE_ID");
  });

  it("keeps a candidate blocked if ranking, provenance, latency, or provider health misses its gate", () => {
    const report = (providerId: string, metrics: RetrievalBenchmarkReport["metrics"]): RetrievalBenchmarkReport => ({
      schemaVersion: "hybrid-retrieval-benchmark.v1",
      providerId,
      implementationRevision: "rev",
      measuredAt: "2026-10-12T00:00:00.000Z",
      caseCount: 2,
      topK: 5,
      metrics,
      cases: [],
    });
    const baseMetrics: RetrievalBenchmarkReport["metrics"] = {
      recallAtK: 0.8,
      meanReciprocalRank: 0.7,
      exactIdentifierHitRate: 1,
      provenanceCoverage: 1,
      p50LatencyMs: 10,
      p95LatencyMs: 20,
      providerErrorRate: 0,
    };
    const candidateMetrics: RetrievalBenchmarkReport["metrics"] = {
      recallAtK: 0.75,
      meanReciprocalRank: 0.65,
      exactIdentifierHitRate: 0.5,
      provenanceCoverage: 0.7,
      p50LatencyMs: 40,
      p95LatencyMs: 40,
      providerErrorRate: 0.1,
    };

    const comparison = compareRetrievalBenchmarks(
      report("baseline", baseMetrics),
      report("candidate", candidateMetrics),
    );

    expect(comparison.eligible).toBe(false);
    expect(comparison.failures).toEqual(expect.arrayContaining([
      "RECALL_REGRESSION",
      "MRR_REGRESSION",
      "EXACT_IDENTIFIER_REGRESSION",
      "P95_LATENCY_REGRESSION",
      "PROVENANCE_COVERAGE_BELOW_THRESHOLD",
      "PROVIDER_ERROR_RATE_ABOVE_THRESHOLD",
    ]));
  });
});
