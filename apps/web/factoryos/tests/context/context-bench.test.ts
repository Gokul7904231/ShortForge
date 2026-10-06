import { describe, expect, it } from "vitest";
import {
  buildContextBenchDataset,
  buildDeterministicShadowPolicy,
  ContextBench,
  DEFAULT_CONTEXT_BENCH_ADMISSION_CRITERIA,
} from "../../core/intelligence/context/ContextBench";
import { fingerprintCLMShadowProposal } from "../../core/cognitive/context/ContextProposalIntegrity";

describe("ContextBench Wave G", () => {
  it("passes the deterministic shadow policy on development and held-out cases", async () => {
    const cases = buildContextBenchDataset();
    const bench = new ContextBench(
      "wave-g-test-source",
      DEFAULT_CONTEXT_BENCH_ADMISSION_CRITERIA,
    );

    const report = await bench.run(
      cases,
      buildDeterministicShadowPolicy(),
      "contextbench-test-pass",
    );

    expect(report.benchVersion).toBe("1.0.0");
    expect(report.datasetVersion).toBe("wave-g-context-policy-v1");
    expect(report.developmentCaseCount).toBe(16);
    expect(report.heldOutCaseCount).toBe(8);
    expect(report.comparison.candidate.caseCount).toBe(24);
    expect(report.comparison.candidate.proposalValidityRate).toBe(1);
    expect(report.comparison.candidate.integrityPassRate).toBe(1);
    expect(report.comparison.candidate.mutationSafetyRate).toBe(1);
    expect(report.comparison.candidate.criticalAnchorRetention).toBe(1);
    expect(report.comparison.candidate.retrievalRecovery).toBe(1);
    expect(report.comparison.candidate.usefulDeletionPrecision).toBe(1);
    expect(report.comparison.candidate.decisionQuality).toBeGreaterThan(0.8);
    expect(report.comparison.uplift.contextCompression).toBeGreaterThan(0.1);
    expect(report.admission.passed).toBe(true);

    expect(report.caseResults.every((result) =>
      result.proposalValid &&
      result.integrityPassed &&
      result.mutationSafetyPassed &&
      result.authorityViolationCount === 0,
    )).toBe(true);
  });

  it("fails closed when a shadow policy emits unsafe edits", async () => {
    const cases = buildContextBenchDataset().slice(0, 8).map((item) => ({
      ...item,
      split: "HELD_OUT" as const,
    }));
    const safe = buildDeterministicShadowPolicy();

    const unsafe = {
      modelRef: "unsafe-shadow",
      async propose(request: Parameters<typeof safe.port.propose>[0]) {
        const safeProposal = await safe.port.propose(request);
        const unsafeProposal = {
          ...safeProposal,
          edits: safeProposal.edits.map((edit) => ({
            ...edit,
            actor: "SYSTEM" as const,
          })),
          proposalFingerprint: "",
        };
        return {
          ...unsafeProposal,
          proposalFingerprint: fingerprintCLMShadowProposal(unsafeProposal),
        };
      },
    };

    const bench = new ContextBench(
      "wave-g-test-source",
      DEFAULT_CONTEXT_BENCH_ADMISSION_CRITERIA,
    );
    const report = await bench.run(
      cases,
      { port: unsafe, policyRevision: "unsafe-test" },
      "contextbench-test-fail",
    );

    expect(report.admission.passed).toBe(false);
    expect(report.admission.reasons).toContain("proposal_validity_below_threshold");
    expect(report.admission.reasons).toContain("critical_anchor_retention_below_threshold");
    expect(report.caseResults.some((result) =>
      result.validationErrors.some((error) => error.includes("actor CLM_PROPOSAL")),
    )).toBe(true);
  });

  it("keeps benchmark evaluation isolated from the original ContextFabric workspace", async () => {
    const [current] = buildContextBenchDataset();
    const port = buildDeterministicShadowPolicy();
    const bench = new ContextBench(
      "wave-g-test-source",
      DEFAULT_CONTEXT_BENCH_ADMISSION_CRITERIA,
    );

    const report = await bench.run(
      [current],
      port,
      "contextbench-test-isolation",
    );

    expect(report.caseResults[0].mutationSafetyPassed).toBe(true);
    expect(report.caseResults[0].finalReferenceIds).toContain("critical-0");
    expect(report.caseResults[0].finalReferenceIds).toContain("large-0");
  });
});
