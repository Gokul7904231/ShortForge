import { performance } from "node:perf_hooks";

export type RetrievalCaseCategory = "EXACT_IDENTIFIER" | "LEXICAL" | "SEMANTIC";

export interface RetrievalBenchmarkCase {
  readonly caseId: string;
  readonly query: string;
  readonly relevantDocumentIds: readonly string[];
  readonly category: RetrievalCaseCategory;
}

export interface RetrievalBenchmarkItem {
  readonly documentId: string;
  readonly sourceRef?: string;
  readonly sourceRevision?: string;
  readonly score?: number;
}

export interface RetrievalBenchmarkProvider {
  readonly providerId: string;
  readonly implementationRevision: string;
  search(query: string, limit: number): Promise<readonly RetrievalBenchmarkItem[]>;
}

export interface RetrievalBenchmarkCaseResult {
  readonly caseId: string;
  readonly category: RetrievalCaseCategory;
  readonly status: "OK" | "PROVIDER_ERROR";
  readonly retrievedDocumentIds: readonly string[];
  readonly relevantCount: number;
  readonly relevantRetrievedAtK: number;
  readonly reciprocalRank: number;
  readonly exactIdentifierHit: boolean | null;
  readonly latencyMs: number;
}

export interface RetrievalBenchmarkReport {
  readonly schemaVersion: "hybrid-retrieval-benchmark.v1";
  readonly providerId: string;
  readonly implementationRevision: string;
  readonly measuredAt: string;
  readonly caseCount: number;
  readonly topK: number;
  readonly metrics: {
    readonly recallAtK: number;
    readonly meanReciprocalRank: number;
    readonly exactIdentifierHitRate: number | null;
    readonly provenanceCoverage: number;
    readonly p50LatencyMs: number;
    readonly p95LatencyMs: number;
    readonly providerErrorRate: number;
  };
  readonly cases: readonly RetrievalBenchmarkCaseResult[];
}

export interface RetrievalBenchmarkThresholds {
  readonly minimumRecallDelta?: number;
  readonly minimumMrrDelta?: number;
  readonly minimumExactIdentifierDelta?: number;
  readonly maximumP95LatencyRegressionRatio?: number;
  readonly minimumProvenanceCoverage?: number;
  readonly maximumProviderErrorRate?: number;
}

export interface RetrievalBenchmarkComparison {
  readonly eligible: boolean;
  readonly failures: readonly string[];
  readonly delta: {
    readonly recallAtK: number;
    readonly meanReciprocalRank: number;
    readonly exactIdentifierHitRate: number | null;
    readonly p95LatencyMs: number;
    readonly provenanceCoverage: number;
  };
}

/** Reproducible harness for comparing current retrieval against an experimental provider. */
export async function runHybridRetrievalBenchmark(
  provider: RetrievalBenchmarkProvider,
  cases: readonly RetrievalBenchmarkCase[],
  options: { readonly topK?: number; readonly maxCases?: number } = {},
): Promise<RetrievalBenchmarkReport> {
  const topK = options.topK ?? 10;
  const maxCases = options.maxCases ?? 200;
  if (!Number.isSafeInteger(topK) || topK < 1 || topK > 50) {
    throw new Error("RETRIEVAL_BENCHMARK_INVALID_TOP_K");
  }
  if (!Number.isSafeInteger(maxCases) || maxCases < 1 || maxCases > 1000) {
    throw new Error("RETRIEVAL_BENCHMARK_INVALID_CASE_LIMIT");
  }
  if (cases.length === 0 || cases.length > maxCases) {
    throw new Error("RETRIEVAL_BENCHMARK_CASE_COUNT_OUT_OF_RANGE");
  }
  const seenCaseIds = new Set<string>();
  for (const item of cases) {
    if (!item.caseId.trim() || seenCaseIds.has(item.caseId)) {
      throw new Error("RETRIEVAL_BENCHMARK_INVALID_CASE_ID");
    }
    seenCaseIds.add(item.caseId);
    if (!item.query.trim() || item.relevantDocumentIds.length === 0) {
      throw new Error("RETRIEVAL_BENCHMARK_CASE_NEEDS_QUERY_AND_RELEVANT_DOCUMENTS");
    }
  }

  const latencySamples: number[] = [];
  const caseResults: RetrievalBenchmarkCaseResult[] = [];
  let provenanceItems = 0;
  let retrievedItems = 0;

  for (const item of cases) {
    const startedAt = performance.now();
    let rawResults: readonly RetrievalBenchmarkItem[] = [];
    let status: RetrievalBenchmarkCaseResult["status"] = "OK";
    try {
      rawResults = await provider.search(item.query, topK);
    } catch {
      status = "PROVIDER_ERROR";
    }
    const latencyMs = Math.max(0, performance.now() - startedAt);
    latencySamples.push(latencyMs);

    const uniqueResults: RetrievalBenchmarkItem[] = [];
    const seenDocumentIds = new Set<string>();
    for (const result of rawResults) {
      if (!result?.documentId?.trim() || seenDocumentIds.has(result.documentId)) continue;
      seenDocumentIds.add(result.documentId);
      uniqueResults.push(result);
      if (result.sourceRef?.trim() && result.sourceRevision?.trim()) provenanceItems += 1;
      retrievedItems += 1;
      if (uniqueResults.length >= topK) break;
    }

    const relevant = new Set(item.relevantDocumentIds);
    let firstRelevantRank = 0;
    for (let index = 0; index < uniqueResults.length; index += 1) {
      if (relevant.has(uniqueResults[index].documentId)) {
        firstRelevantRank = index + 1;
        break;
      }
    }
    const relevantRetrievedAtK = uniqueResults.reduce(
      (count, result) => count + (relevant.has(result.documentId) ? 1 : 0),
      0,
    );
    const reciprocalRank = firstRelevantRank ? 1 / firstRelevantRank : 0;
    const exactIdentifierHit = item.category === "EXACT_IDENTIFIER"
      ? uniqueResults[0]?.documentId === item.relevantDocumentIds[0]
      : null;

    caseResults.push({
      caseId: item.caseId,
      category: item.category,
      status,
      retrievedDocumentIds: uniqueResults.map((result) => result.documentId),
      relevantCount: relevant.size,
      relevantRetrievedAtK,
      reciprocalRank,
      exactIdentifierHit,
      latencyMs,
    });
  }

  const mean = (values: readonly number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const percentile = (values: readonly number[], p: number) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  };
  const exactCases = caseResults.filter((item) => item.exactIdentifierHit !== null);
  const recallAtK = mean(caseResults.map((item) => item.relevantRetrievedAtK / item.relevantCount));
  const meanReciprocalRank = mean(caseResults.map((item) => item.reciprocalRank));

  return {
    schemaVersion: "hybrid-retrieval-benchmark.v1",
    providerId: provider.providerId,
    implementationRevision: provider.implementationRevision,
    measuredAt: new Date().toISOString(),
    caseCount: caseResults.length,
    topK,
    metrics: {
      recallAtK,
      meanReciprocalRank,
      exactIdentifierHitRate: exactCases.length
        ? mean(exactCases.map((item) => item.exactIdentifierHit ? 1 : 0))
        : null,
      provenanceCoverage: retrievedItems ? provenanceItems / retrievedItems : 0,
      p50LatencyMs: percentile(latencySamples, 0.5),
      p95LatencyMs: percentile(latencySamples, 0.95),
      providerErrorRate: caseResults.filter((item) => item.status === "PROVIDER_ERROR").length / caseResults.length,
    },
    cases: caseResults,
  };
}

/** Promotion gate: a candidate must beat or preserve a defined baseline and provenance floor. */
export function compareRetrievalBenchmarks(
  baseline: RetrievalBenchmarkReport,
  candidate: RetrievalBenchmarkReport,
  thresholds: RetrievalBenchmarkThresholds = {},
): RetrievalBenchmarkComparison {
  if (baseline.caseCount !== candidate.caseCount || baseline.topK !== candidate.topK) {
    throw new Error("RETRIEVAL_BENCHMARK_BASELINE_MISMATCH");
  }

  const delta = {
    recallAtK: candidate.metrics.recallAtK - baseline.metrics.recallAtK,
    meanReciprocalRank: candidate.metrics.meanReciprocalRank - baseline.metrics.meanReciprocalRank,
    exactIdentifierHitRate:
      candidate.metrics.exactIdentifierHitRate === null || baseline.metrics.exactIdentifierHitRate === null
        ? null
        : candidate.metrics.exactIdentifierHitRate - baseline.metrics.exactIdentifierHitRate,
    p95LatencyMs: candidate.metrics.p95LatencyMs - baseline.metrics.p95LatencyMs,
    provenanceCoverage: candidate.metrics.provenanceCoverage - baseline.metrics.provenanceCoverage,
  };
  const failures: string[] = [];
  if (delta.recallAtK < (thresholds.minimumRecallDelta ?? 0)) failures.push("RECALL_REGRESSION");
  if (delta.meanReciprocalRank < (thresholds.minimumMrrDelta ?? 0)) failures.push("MRR_REGRESSION");
  if (
    delta.exactIdentifierHitRate !== null &&
    delta.exactIdentifierHitRate < (thresholds.minimumExactIdentifierDelta ?? 0)
  ) failures.push("EXACT_IDENTIFIER_REGRESSION");
  const latencyRatio = baseline.metrics.p95LatencyMs > 0
    ? candidate.metrics.p95LatencyMs / baseline.metrics.p95LatencyMs
    : candidate.metrics.p95LatencyMs > 0 ? Number.POSITIVE_INFINITY : 1;
  if (latencyRatio > (thresholds.maximumP95LatencyRegressionRatio ?? 1.2)) failures.push("P95_LATENCY_REGRESSION");
  if (candidate.metrics.provenanceCoverage < (thresholds.minimumProvenanceCoverage ?? 1)) {
    failures.push("PROVENANCE_COVERAGE_BELOW_THRESHOLD");
  }
  if (candidate.metrics.providerErrorRate > (thresholds.maximumProviderErrorRate ?? 0)) {
    failures.push("PROVIDER_ERROR_RATE_ABOVE_THRESHOLD");
  }
  return { eligible: failures.length === 0, failures, delta };
}
