import { createHash } from "node:crypto";
import { ContextFabric } from "../../cognitive/context/ContextFabric";
import { fingerprintCLMShadowProposal } from "../../cognitive/context/ContextProposalIntegrity";
import type {
  CLMContextProposal,
  CLMContextProposalPort,
  ContextProposalBudget,
} from "../../cognitive/context/ContextFabricContracts";
import type { ContextReference } from "../../cognitive/CognitiveContracts";

export const CONTEXT_BENCH_VERSION = "1.0.0" as const;
export const CONTEXT_BENCH_DATASET_VERSION = "wave-g-context-policy-v1" as const;

export type ContextBenchSplit = "DEVELOPMENT" | "HELD_OUT";

export interface ContextBenchCase {
  readonly caseId: string;
  readonly split: ContextBenchSplit;
  readonly initialReferences: readonly ContextReference[];
  readonly candidateReferences: readonly ContextReference[];
  readonly criticalAnchorIds: readonly string[];
  readonly usefulDeletionIds: readonly string[];
  readonly forbiddenIds: readonly string[];
  readonly budget: ContextProposalBudget;
}

export interface ContextBenchCaseResult {
  readonly caseId: string;
  readonly split: ContextBenchSplit;
  readonly proposalValid: boolean;
  readonly integrityPassed: boolean;
  readonly mutationSafetyPassed: boolean;
  readonly criticalAnchorRetention: number;
  readonly usefulDeletionPrecision: number;
  readonly contextCompression: number;
  readonly retrievalRecovery: number;
  readonly decisionQuality: number;
  readonly deletedReferenceIds: readonly string[];
  readonly finalReferenceIds: readonly string[];
  readonly validationErrors: readonly string[];
  readonly authorityViolationCount: number;
  readonly latencyMs: number;
  readonly resultDigest: string;
}

export interface ContextBenchMetrics {
  readonly caseCount: number;
  readonly passedCases: number;
  readonly failedCases: number;
  readonly proposalValidityRate: number;
  readonly integrityPassRate: number;
  readonly mutationSafetyRate: number;
  readonly criticalAnchorRetention: number;
  readonly usefulDeletionPrecision: number;
  readonly contextCompression: number;
  readonly retrievalRecovery: number;
  readonly decisionQuality: number;
  readonly authorityViolationCount: number;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
}

export interface ContextBenchComparison {
  readonly baseline: ContextBenchMetrics;
  readonly candidate: ContextBenchMetrics;
  readonly uplift: {
    readonly criticalAnchorRetention: number;
    readonly usefulDeletionPrecision: number;
    readonly contextCompression: number;
    readonly retrievalRecovery: number;
    readonly decisionQuality: number;
  };
}

export interface ContextBenchAdmissionCriteria {
  readonly minTotalCases: number;
  readonly minHeldOutCases: number;
  readonly minProposalValidityRate: number;
  readonly minIntegrityPassRate: number;
  readonly minMutationSafetyRate: number;
  readonly minCriticalAnchorRetention: number;
  readonly minUsefulDeletionPrecision: number;
  readonly minRetrievalRecovery: number;
  readonly minDecisionQuality: number;
  readonly minCompressionUplift: number;
  readonly maxAuthorityViolationCount: number;
  readonly maxP95LatencyRegressionMs: number;
}

export interface ContextBenchAdmissionDecision {
  readonly passed: boolean;
  readonly reasons: readonly string[];
}

export interface ContextBenchReport {
  readonly benchVersion: typeof CONTEXT_BENCH_VERSION;
  readonly datasetVersion: typeof CONTEXT_BENCH_DATASET_VERSION;
  readonly runId: string;
  readonly generatedAt: string;
  readonly comparison: ContextBenchComparison;
  readonly admission: ContextBenchAdmissionDecision;
  readonly developmentCaseCount: number;
  readonly heldOutCaseCount: number;
  readonly caseResults: readonly ContextBenchCaseResult[];
  readonly sourceRevision: string;
  readonly policyRevision: string;
}

export interface ContextBenchPolicy {
  readonly port: CLMContextProposalPort;
  readonly policyRevision: string;
}

export class ContextBench {
  public constructor(
    private readonly sourceRevision: string,
    private readonly criteria: ContextBenchAdmissionCriteria,
  ) {}

  public async run(
    cases: readonly ContextBenchCase[],
    policy: ContextBenchPolicy,
    runId = "contextbench-" + Date.now(),
  ): Promise<ContextBenchReport> {
    const orderedCases = [...cases];
    const caseResults: ContextBenchCaseResult[] = [];

    for (const current of orderedCases) {
      caseResults.push(await this.evaluateCase(current, policy.port));
    }

    const baselineResults = orderedCases.map((current) =>
      this.evaluateBaselineCase(current),
    );
    const candidate = this.summarize(caseResults);
    const baseline = this.summarize(baselineResults);
    const comparison: ContextBenchComparison = {
      baseline,
      candidate,
      uplift: {
        criticalAnchorRetention: candidate.criticalAnchorRetention - baseline.criticalAnchorRetention,
        usefulDeletionPrecision: candidate.usefulDeletionPrecision - baseline.usefulDeletionPrecision,
        contextCompression: candidate.contextCompression - baseline.contextCompression,
        retrievalRecovery: candidate.retrievalRecovery - baseline.retrievalRecovery,
        decisionQuality: candidate.decisionQuality - baseline.decisionQuality,
      },
    };

    const developmentCaseCount = orderedCases.filter((item) => item.split === "DEVELOPMENT").length;
    const heldOutCaseCount = orderedCases.filter((item) => item.split === "HELD_OUT").length;
    const admission = this.admit(comparison, {
      developmentCaseCount,
      heldOutCaseCount,
    });

    return {
      benchVersion: CONTEXT_BENCH_VERSION,
      datasetVersion: CONTEXT_BENCH_DATASET_VERSION,
      runId,
      generatedAt: new Date().toISOString(),
      comparison,
      admission,
      developmentCaseCount,
      heldOutCaseCount,
      caseResults,
      sourceRevision: this.sourceRevision,
      policyRevision: policy.policyRevision,
    };
  }

  public admit(
    comparison: ContextBenchComparison,
    counts: { readonly developmentCaseCount: number; readonly heldOutCaseCount: number },
  ): ContextBenchAdmissionDecision {
    const reasons: string[] = [];
    const { baseline, candidate, uplift } = comparison;

    if (candidate.caseCount < this.criteria.minTotalCases) reasons.push("insufficient_total_cases");
    if (counts.heldOutCaseCount < this.criteria.minHeldOutCases) reasons.push("insufficient_held_out_cases");
    if (candidate.proposalValidityRate < this.criteria.minProposalValidityRate) reasons.push("proposal_validity_below_threshold");
    if (candidate.integrityPassRate < this.criteria.minIntegrityPassRate) reasons.push("integrity_below_threshold");
    if (candidate.mutationSafetyRate < this.criteria.minMutationSafetyRate) reasons.push("mutation_safety_below_threshold");
    if (candidate.criticalAnchorRetention < this.criteria.minCriticalAnchorRetention) reasons.push("critical_anchor_retention_below_threshold");
    if (candidate.usefulDeletionPrecision < this.criteria.minUsefulDeletionPrecision) reasons.push("useful_deletion_precision_below_threshold");
    if (candidate.retrievalRecovery < this.criteria.minRetrievalRecovery) reasons.push("retrieval_recovery_below_threshold");
    if (candidate.decisionQuality < this.criteria.minDecisionQuality) reasons.push("decision_quality_below_threshold");
    if (uplift.contextCompression < this.criteria.minCompressionUplift) reasons.push("compression_uplift_below_threshold");
    if (candidate.authorityViolationCount > this.criteria.maxAuthorityViolationCount) reasons.push("authority_violations_present");
    if (candidate.p95LatencyMs > baseline.p95LatencyMs + this.criteria.maxP95LatencyRegressionMs) reasons.push("latency_regression_exceeds_threshold");

    return { passed: reasons.length === 0, reasons };
  }

  private async evaluateCase(
    current: ContextBenchCase,
    port: CLMContextProposalPort,
  ): Promise<ContextBenchCaseResult> {
    const fabric = new ContextFabric({
      workspaceId: "ctxbench_" + current.caseId,
      missionId: "ctxbench_mission",
      taskId: current.caseId,
    });
    this.seedFabric(fabric, current.initialReferences);

    const before = fabric.getWorkspace();
    const startedAt = Date.now();
    let result;
    try {
      result = await fabric.proposeCLMShadowEdits(port, {
        traceId: "ctxbench-trace-" + current.caseId,
        policyVersion: "context-policy-v1",
        candidateReferences: current.candidateReferences,
        budget: current.budget,
      });
    } catch (error) {
      return this.failureResult(current, Date.now() - startedAt, "proposal_execution_failed: " + String(error));
    }

    const latencyMs = Date.now() - startedAt;
    const mutationSafetyPassed =
      JSON.stringify(fabric.getWorkspace()) === JSON.stringify(before);
    const integrityPassed = result.validation.valid &&
      result.validation.normalizedProposal !== undefined &&
      fingerprintCLMShadowProposal(result.proposal) === result.proposal.proposalFingerprint;

    if (!result.validation.valid || !integrityPassed || !mutationSafetyPassed) {
      return {
        caseId: current.caseId,
        split: current.split,
        proposalValid: result.validation.valid,
        integrityPassed,
        mutationSafetyPassed,
        criticalAnchorRetention: 0,
        usefulDeletionPrecision: 1,
        contextCompression: 0,
        retrievalRecovery: 0,
        decisionQuality: 0,
        deletedReferenceIds: [],
        finalReferenceIds: before.activeReferences.map((item) => item.refId),
        validationErrors: result.validation.errors,
        authorityViolationCount: result.validation.errors.filter((error) => /forbidden|authority/i.test(error)).length,
        latencyMs,
        resultDigest: this.digest(current.caseId, {
          proposalValid: result.validation.valid,
          integrityPassed,
          mutationSafetyPassed,
          errors: result.validation.errors,
        }),
      };
    }

    const hypothetical = new ContextFabric({
      workspaceId: before.workspaceId,
      missionId: before.missionId,
      taskId: before.taskId,
    });
    this.seedFabric(hypothetical, current.initialReferences);
    const after = hypothetical.applyEdits([...result.proposal.edits]);
    return this.scoreCase(current, before, after, result.validation.errors, latencyMs);
  }

  private evaluateBaselineCase(current: ContextBenchCase): ContextBenchCaseResult {
    const startedAt = Date.now();
    const beforeRefs = current.initialReferences;
    return this.scoreCase(
      current,
      {
        activeReferences: [...beforeRefs],
        totalTokens: beforeRefs.reduce((sum, item) => sum + item.tokenCount, 0),
      },
      {
        activeReferences: [...beforeRefs],
        totalTokens: beforeRefs.reduce((sum, item) => sum + item.tokenCount, 0),
      },
      [],
      Date.now() - startedAt,
    );
  }

  private scoreCase(
    current: ContextBenchCase,
    before: { readonly activeReferences: readonly ContextReference[]; readonly totalTokens: number },
    after: { readonly activeReferences: readonly ContextReference[]; readonly totalTokens: number },
    validationErrors: readonly string[],
    latencyMs: number,
  ): ContextBenchCaseResult {
    const beforeIds = new Set(before.activeReferences.map((item) => item.refId));
    const afterIds = new Set(after.activeReferences.map((item) => item.refId));
    const candidateIds = new Set(current.candidateReferences.map((item) => item.refId));
    const critical = current.criticalAnchorIds;
    const usefulDeletion = new Set(current.usefulDeletionIds);
    const forbidden = new Set(current.forbiddenIds);
    const retainedCritical = critical.filter((id) => afterIds.has(id)).length;
    const criticalAnchorRetention = critical.length ? retainedCritical / critical.length : 1;
    const recoverableCritical = critical.filter((id) => candidateIds.has(id));
    const recoveredCritical = recoverableCritical.filter((id) => afterIds.has(id)).length;
    const retrievalRecovery = recoverableCritical.length ? recoveredCritical / recoverableCritical.length : 1;
    const deletedReferenceIds = [...beforeIds].filter((id) => !afterIds.has(id));
    const usefulDeleted = deletedReferenceIds.filter((id) => usefulDeletion.has(id)).length;
    const usefulDeletionPrecision = deletedReferenceIds.length ? usefulDeleted / deletedReferenceIds.length : 1;
    const contextCompression = before.totalTokens > 0
      ? Math.max(0, 1 - after.totalTokens / before.totalTokens)
      : 0;
    const forbiddenRetained = forbidden.size
      ? [...forbidden].filter((id) => afterIds.has(id)).length / forbidden.size
      : 0;
    const decisionQuality =
      criticalAnchorRetention * 0.35 +
      retrievalRecovery * 0.25 +
      usefulDeletionPrecision * 0.15 +
      Math.max(0, 1 - forbiddenRetained) * 0.15 +
      Math.min(1, contextCompression) * 0.10;

    const proposalValid = validationErrors.length === 0;
    return {
      caseId: current.caseId,
      split: current.split,
      proposalValid,
      integrityPassed: true,
      mutationSafetyPassed: true,
      criticalAnchorRetention,
      usefulDeletionPrecision,
      contextCompression,
      retrievalRecovery,
      decisionQuality,
      deletedReferenceIds,
      finalReferenceIds: after.activeReferences.map((item) => item.refId),
      validationErrors,
      authorityViolationCount: 0,
      latencyMs,
      resultDigest: this.digest(current.caseId, {
        finalReferenceIds: after.activeReferences.map((item) => item.refId),
        deletedReferenceIds,
        criticalAnchorRetention,
        usefulDeletionPrecision,
        contextCompression,
        retrievalRecovery,
        decisionQuality,
      }),
    };
  }

  private summarize(results: readonly ContextBenchCaseResult[]): ContextBenchMetrics {
    return {
      caseCount: results.length,
      passedCases: results.filter((result) =>
        result.proposalValid &&
        result.integrityPassed &&
        result.mutationSafetyPassed &&
        result.authorityViolationCount === 0 &&
        result.decisionQuality >= this.criteria.minDecisionQuality,
      ).length,
      failedCases: results.filter((result) => !(
        result.proposalValid &&
        result.integrityPassed &&
        result.mutationSafetyPassed &&
        result.authorityViolationCount === 0 &&
        result.decisionQuality >= this.criteria.minDecisionQuality
      )).length,
      proposalValidityRate: this.average(results.map((result) => result.proposalValid ? 1 : 0)),
      integrityPassRate: this.average(results.map((result) => result.integrityPassed ? 1 : 0)),
      mutationSafetyRate: this.average(results.map((result) => result.mutationSafetyPassed ? 1 : 0)),
      criticalAnchorRetention: this.average(results.map((result) => result.criticalAnchorRetention)),
      usefulDeletionPrecision: this.average(results.map((result) => result.usefulDeletionPrecision)),
      contextCompression: this.average(results.map((result) => result.contextCompression)),
      retrievalRecovery: this.average(results.map((result) => result.retrievalRecovery)),
      decisionQuality: this.average(results.map((result) => result.decisionQuality)),
      authorityViolationCount: results.reduce((sum, result) => sum + result.authorityViolationCount, 0),
      averageLatencyMs: this.average(results.map((result) => result.latencyMs)),
      p95LatencyMs: this.percentile(results.map((result) => result.latencyMs), 0.95),
    };
  }

  private seedFabric(fabric: ContextFabric, references: readonly ContextReference[]): void {
    fabric.applyEdits(references.map((reference) => ({
      editId: "seed_" + reference.refId,
      baseVersion: fabric.getWorkspace().version,
      actor: "SYSTEM" as const,
      type: "RETAIN" as const,
      reference,
      reason: "ContextBench fixture seed",
    })));
  }

  private failureResult(
    current: ContextBenchCase,
    latencyMs: number,
    reason: string,
  ): ContextBenchCaseResult {
    return {
      caseId: current.caseId,
      split: current.split,
      proposalValid: false,
      integrityPassed: false,
      mutationSafetyPassed: false,
      criticalAnchorRetention: 0,
      usefulDeletionPrecision: 0,
      contextCompression: 0,
      retrievalRecovery: 0,
      decisionQuality: 0,
      deletedReferenceIds: [],
      finalReferenceIds: current.initialReferences.map((item) => item.refId),
      validationErrors: [reason],
      authorityViolationCount: 0,
      latencyMs,
      resultDigest: this.digest(current.caseId, { reason }),
    };
  }

  private average(values: readonly number[]): number {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  private percentile(values: readonly number[], quantile: number): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
    return sorted[index];
  }

  private digest(caseId: string, value: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify({ datasetVersion: CONTEXT_BENCH_DATASET_VERSION, caseId, value }))
      .digest("hex");
  }
}

export const DEFAULT_CONTEXT_BENCH_ADMISSION_CRITERIA: ContextBenchAdmissionCriteria = {
  minTotalCases: 24,
  minHeldOutCases: 8,
  minProposalValidityRate: 1,
  minIntegrityPassRate: 1,
  minMutationSafetyRate: 1,
  minCriticalAnchorRetention: 0.95,
  minUsefulDeletionPrecision: 0.9,
  minRetrievalRecovery: 0.9,
  minDecisionQuality: 0.8,
  minCompressionUplift: 0.1,
  maxAuthorityViolationCount: 0,
  maxP95LatencyRegressionMs: 250,
};

export function benchmarkReference(
  id: string,
  overrides: Partial<ContextReference> = {},
): ContextReference {
  return {
    refId: id,
    type: "DOCUMENT",
    title: "Benchmark Reference " + id,
    summary: "Synthetic ContextBench evidence " + id,
    tokenCount: 40,
    timestamp: "2026-10-06T08:00:00.000Z",
    confidence: 0.9,
    source: "contextbench-fixture",
    tags: ["contextbench"],
    isDereferenced: false,
    ...overrides,
  };
}

export function buildContextBenchDataset(): ContextBenchCase[] {
  return Array.from({ length: 24 }, (_, index) => {
    const split: ContextBenchSplit = index < 16 ? "DEVELOPMENT" : "HELD_OUT";
    const critical = benchmarkReference("critical-" + index, {
      type: index % 2 === 0 ? "DOCUMENT" : "MEMORY",
      tokenCount: 60 + (index % 3) * 10,
      tags: ["contextbench", "critical", index % 2 === 0 ? "evidence" : "decision"],
      title: index % 2 === 0 ? "Critical evidence " + index : "Critical decision context " + index,
    });
    const stale = benchmarkReference("stale-" + index, {
      type: "LOG",
      timestamp: "2026-10-06T00:00:00.000Z",
      tags: ["contextbench", "noise", "stale"],
    });
    const duplicateA = benchmarkReference("dup-a-" + index, { title: "Repeated noise " + index });
    const duplicateB = benchmarkReference("dup-b-" + index, { title: "Repeated noise " + index });
    const large = benchmarkReference("large-" + index, {
      tokenCount: 320,
      summary: "Low-value verbose context ".repeat(15),
      tags: ["contextbench", "noise", "verbose"],
    });

    return {
      caseId: "g-" + String(index + 1).padStart(2, "0"),
      split,
      initialReferences: [stale, duplicateA, duplicateB, large],
      candidateReferences: [critical],
      criticalAnchorIds: [critical.refId],
      usefulDeletionIds: [stale.refId, duplicateB.refId],
      forbiddenIds: [],
      budget: {
        maxEdits: 4,
        maxContextGrowthTokens: 200,
        maxLatencyMs: 5000,
        maxCost: 0.5,
      },
    };
  });
}

export function buildDeterministicShadowPolicy(): ContextBenchPolicy {
  const port: CLMContextProposalPort = {
    modelRef: "contextbench-deterministic-shadow",
    async propose(request): Promise<CLMContextProposal> {
      const activeIds = new Set(request.workspace.activeReferences.map((item) => item.refId));
      const critical = request.candidateReferences.filter((item) =>
        item.tags.includes("critical") && !activeIds.has(item.refId),
      );
      const edits = [
        ...critical.map((reference) => ({
          editId: "bench-retain-" + reference.refId,
          baseVersion: request.workspace.version,
          actor: "CLM_PROPOSAL" as const,
          type: "RETAIN" as const,
          reference,
          reason: "retain benchmark-critical evidence",
        })),
        {
          editId: "bench-optimize",
          baseVersion: request.workspace.version,
          actor: "CLM_PROPOSAL" as const,
          type: "OPTIMIZE" as const,
          reason: "remove stale and redundant benchmark noise",
        },
      ];
      const proposalWithoutFingerprint = {
        schemaVersion: "1.0.0" as const,
        proposalId: "ctxbench-proposal-" + request.workspace.workspaceId,
        workspaceId: request.workspace.workspaceId,
        missionId: request.workspace.missionId,
        taskId: request.workspace.taskId,
        baseVersion: request.workspace.version,
        generatedAt: "2026-10-06T08:30:00.000Z",
        provenance: {
          source: "CLM_SHADOW" as const,
          modelRef: "contextbench-deterministic-shadow",
          modelVersion: CONTEXT_BENCH_VERSION,
          traceId: request.traceId,
          policyVersion: request.policyVersion,
        },
        authorityScope: "WORKING_CONTEXT_ONLY" as const,
        confidence: 0.9,
        estimatedCost: 0.01,
        estimatedContextGrowthTokens: critical.reduce((sum, item) => sum + item.tokenCount, 0),
        budget: request.budget,
        edits,
        rationale: "Deterministic benchmark shadow policy retains critical candidate evidence and optimizes known noise.",
      };
      return {
        ...proposalWithoutFingerprint,
        proposalFingerprint: fingerprintCLMShadowProposal({
          ...proposalWithoutFingerprint,
          proposalFingerprint: "",
        }),
      };
    },
  };
  return { port, policyRevision: "contextbench-shadow-policy-v1" };
}
