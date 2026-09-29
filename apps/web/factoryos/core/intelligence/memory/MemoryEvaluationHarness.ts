import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MemoryRecallQuery, MemoryRecallResult } from "./MemorySemanticsContracts";

export type MemoryEvaluationCategory =
  | "TEMPORAL"
  | "DYNAMIC_STATE"
  | "WORKFLOW"
  | "GOTCHA"
  | "PREMISE_AWARENESS"
  | "CONTRADICTION"
  | "PROVENANCE";

export interface MemoryEvaluationCase {
  readonly caseId: string;
  readonly category: MemoryEvaluationCategory;
  readonly query: MemoryRecallQuery;
  readonly expectedMemoryIds?: readonly string[];
  readonly forbiddenMemoryIds?: readonly string[];
  readonly minHits?: number;
}

export interface MemoryEvaluationCaseResult {
  readonly caseId: string;
  readonly category: MemoryEvaluationCategory;
  readonly expectedHits: number;
  readonly expectedTotal: number;
  readonly forbiddenHits: number;
  readonly unauthorizedHits: number;
  readonly estimatedTokens: number;
  readonly latencyMs: number;
  readonly passed: boolean;
  readonly retrievedMemoryIds: readonly string[];
  readonly resultDigest: string;
  readonly precisionAtK: number;
  readonly reciprocalRank: number;
  readonly ndcgAtK: number;
}

export interface MemoryEvaluationSummary {
  readonly runId: string;
  readonly generatedAt: string;
  readonly caseCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly recallAtK: number;
  readonly precisionAtK: number;
  readonly meanReciprocalRank: number;
  readonly ndcgAtK: number;
  readonly forbiddenHitRate: number;
  readonly unauthorizedHitRate: number;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly averageEstimatedTokens: number;
  readonly byCategory: Readonly<Record<string, {
    cases: number;
    passed: number;
    recallAtK: number;
    averageLatencyMs: number;
  }>>;
}

export interface MemoryEvaluationArtifactStore {
  append(record: MemoryEvaluationCaseResult): void;
}

export class JsonlMemoryEvaluationArtifactStore implements MemoryEvaluationArtifactStore {
  constructor(private readonly filePath: string) {}

  public append(record: MemoryEvaluationCaseResult): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify(record) + "\n";
    const fd = fs.openSync(this.filePath, "a");
    try {
      fs.writeSync(fd, line, null, "utf8");
    } finally {
      fs.closeSync(fd);
    }
  }
}

export interface MemoryEvaluationRunnerOptions {
  readonly artifactStore?: MemoryEvaluationArtifactStore;
  readonly concurrency?: number;
}

export class MemoryEvaluationHarness {
  constructor(
    private readonly recall: (query: MemoryRecallQuery) => Promise<MemoryRecallResult>,
    private readonly options: MemoryEvaluationRunnerOptions = {},
  ) {}

  public async run(
    cases: readonly MemoryEvaluationCase[],
    runId = "memory-eval-" + Date.now(),
  ): Promise<MemoryEvaluationSummary> {
    const concurrency = Math.max(1, Math.floor(this.options.concurrency ?? 1));
    const results: MemoryEvaluationCaseResult[] = [];
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= cases.length) return;

        const current = cases[index];
        const started = Date.now();
        let result: MemoryRecallResult;
        try {
          result = await this.recall(current.query);
        } catch (error) {
          const failure = this.failureResult(current, Date.now() - started, error);
          results[index] = failure;
          this.options.artifactStore?.append(failure);
          continue;
        }

        const expected = new Set(current.expectedMemoryIds ?? []);
        const forbidden = new Set(current.forbiddenMemoryIds ?? []);
        const retrieved = result.items.map((item) => item.memoryId);
        const expectedHits = retrieved.filter((id) => expected.has(id)).length;
        const forbiddenHits = retrieved.filter((id) => forbidden.has(id)).length;
        const authorizedScopeSet = current.query.accessContext
          ? new Set(current.query.accessContext.allowedScopeKeys)
          : undefined;
        const unauthorizedHits = authorizedScopeSet
          ? result.items.filter((item) =>
              !authorizedScopeSet.has(item.scopeKey) &&
              !(current.query.accessContext?.allowGlobalScope && item.scopeKey === "GLOBAL"),
            ).length
          : 0;
        const expectedTotal = expected.size;
        const minHits = current.minHits ?? (expectedTotal > 0 ? 1 : 0);
        const k = Math.max(1, retrieved.length);
        const precisionAtK = expectedTotal > 0 ? expectedHits / k : 0;
        const firstRelevantRank = retrieved.findIndex((id) => expected.has(id));
        const reciprocalRank = firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0;
        const idealHits = Math.min(expectedTotal, k);
        const dcg = retrieved.reduce((sum, id, rank) => {
          return sum + (expected.has(id) ? 1 / Math.log2(rank + 2) : 0);
        }, 0);
        const idcg = Array.from({ length: idealHits }, (_, rank) => 1 / Math.log2(rank + 2))
          .reduce((sum, value) => sum + value, 0);
        const ndcgAtK = idcg > 0 ? dcg / idcg : 0;
        const passed =
          expectedHits >= minHits &&
          forbiddenHits === 0 &&
          unauthorizedHits === 0;

        const resultDigest = createHash("sha256")
          .update(JSON.stringify({
            caseId: current.caseId,
            retrievedMemoryIds: retrieved,
            expectedHits,
            forbiddenHits,
            unauthorizedHits,
            estimatedTokens: result.estimatedTokens,
          }))
          .digest("hex");

        const record: MemoryEvaluationCaseResult = {
          caseId: current.caseId,
          category: current.category,
          expectedHits,
          expectedTotal,
          forbiddenHits,
          unauthorizedHits,
          estimatedTokens: result.estimatedTokens,
          latencyMs: Date.now() - started,
          passed,
          retrievedMemoryIds: retrieved,
          resultDigest,
          precisionAtK,
          reciprocalRank,
          ndcgAtK,
        };
        results[index] = record;
        this.options.artifactStore?.append(record);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, cases.length)) }, worker));

    return this.summarize(runId, results.filter(Boolean));
  }

  private summarize(runId: string, results: readonly MemoryEvaluationCaseResult[]): MemoryEvaluationSummary {
    const passedCount = results.filter((result) => result.passed).length;
    const expectedTotal = results.reduce((sum, result) => sum + result.expectedTotal, 0);
    const expectedHits = results.reduce((sum, result) => sum + result.expectedHits, 0);
    const averagePrecisionAtK = this.average(results.map((result) => result.precisionAtK));
    const meanReciprocalRank = this.average(results.map((result) => result.reciprocalRank));
    const ndcgAtK = this.average(results.map((result) => result.ndcgAtK));
    const forbiddenTotal = results.reduce((sum, result) => sum + result.forbiddenHits, 0);
    const unauthorizedTotal = results.reduce((sum, result) => sum + result.unauthorizedHits, 0);
    const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
    const categoryNames = [...new Set(results.map((result) => result.category))];
    const byCategory: Record<string, {
      cases: number;
      passed: number;
      recallAtK: number;
      averageLatencyMs: number;
    }> = {};

    for (const category of categoryNames) {
      const categoryResults = results.filter((result) => result.category === category);
      const categoryExpected = categoryResults.reduce((sum, result) => sum + result.expectedTotal, 0);
      const categoryHits = categoryResults.reduce((sum, result) => sum + result.expectedHits, 0);
      byCategory[category] = {
        cases: categoryResults.length,
        passed: categoryResults.filter((result) => result.passed).length,
        recallAtK: categoryExpected > 0 ? categoryHits / categoryExpected : 1,
        averageLatencyMs: this.average(categoryResults.map((result) => result.latencyMs)),
      };
    }

    return {
      runId,
      generatedAt: new Date().toISOString(),
      caseCount: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      recallAtK: expectedTotal > 0 ? expectedHits / expectedTotal : 1,
      precisionAtK: averagePrecisionAtK,
      meanReciprocalRank,
      ndcgAtK,
      forbiddenHitRate: results.length > 0 ? forbiddenTotal / results.length : 0,
      unauthorizedHitRate: results.length > 0 ? unauthorizedTotal / results.length : 0,
      averageLatencyMs: this.average(latencies),
      p95LatencyMs: this.percentile(latencies, 0.95),
      averageEstimatedTokens: this.average(results.map((result) => result.estimatedTokens)),
      byCategory,
    };
  }

  private failureResult(
    current: MemoryEvaluationCase,
    latencyMs: number,
    error: unknown,
  ): MemoryEvaluationCaseResult {
    const resultDigest = createHash("sha256")
      .update(current.caseId + ":" + String(error))
      .digest("hex");
    return {
      caseId: current.caseId,
      category: current.category,
      expectedHits: 0,
      expectedTotal: (current.expectedMemoryIds ?? []).length,
      forbiddenHits: 0,
      unauthorizedHits: 0,
      estimatedTokens: 0,
      latencyMs,
      passed: false,
      retrievedMemoryIds: [],
      resultDigest,
      precisionAtK: 0,
      reciprocalRank: 0,
      ndcgAtK: 0,
    };
  }

  private average(values: readonly number[]): number {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  private percentile(values: readonly number[], quantile: number): number {
    if (!values.length) return 0;
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * quantile) - 1));
    return values[index];
  }
}
