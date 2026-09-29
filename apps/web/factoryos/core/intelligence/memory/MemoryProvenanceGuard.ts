import type {
  MemoryProvenanceGuardReport,
  MemoryProvenanceViolation,
  MemoryRecallQuery,
  MemoryRetrievalCandidate,
} from "./MemorySemanticsContracts";

export interface MemoryProvenancePolicy {
  readonly requireEvidenceForVerified?: boolean;
  readonly requireScopeMatch?: boolean;
  readonly rejectExpired?: boolean;
  readonly rejectDisputed?: boolean;
  readonly rejectModelAuthorityClaims?: boolean;
}

export class MemoryProvenanceGuard {
  public inspect(
    query: MemoryRecallQuery,
    candidates: readonly MemoryRetrievalCandidate[],
    policy: MemoryProvenancePolicy = {},
  ): MemoryProvenanceGuardReport {
    const violations: MemoryProvenanceViolation[] = [];
    const accepted: MemoryRetrievalCandidate[] = [];
    const rejected: MemoryRetrievalCandidate[] = [];

    for (const candidate of candidates) {
      const check = this.checkCandidate(query, candidate, policy);
      if (check.length === 0) {
        accepted.push(candidate);
      } else {
        rejected.push(candidate);
        violations.push(...check);
      }
    }

    return { accepted, rejected, violations };
  }

  public guardForAscalon(
    query: MemoryRecallQuery,
    candidates: readonly MemoryRetrievalCandidate[],
  ): MemoryProvenanceGuardReport {
    return this.inspect(query, candidates, {
      requireEvidenceForVerified: true,
      requireScopeMatch: true,
      rejectExpired: true,
      rejectDisputed: true,
      rejectModelAuthorityClaims: true,
    });
  }

  private checkCandidate(
    query: MemoryRecallQuery,
    candidate: MemoryRetrievalCandidate,
    policy: MemoryProvenancePolicy,
  ): MemoryProvenanceViolation[] {
    const failures: MemoryProvenanceViolation[] = [];
    if (policy.requireScopeMatch !== false && query.scopeKey && candidate.scopeKey !== query.scopeKey) {
      failures.push({
        memoryId: candidate.memoryId,
        code: "SCOPE_LEAK",
        detail: "memory scope does not match recall scope",
      });
    }

    if (policy.rejectDisputed !== false && candidate.verificationState === "DISPUTED") {
      failures.push({
        memoryId: candidate.memoryId,
        code: "DISPUTED",
        detail: "disputed memory cannot enter the trusted projection",
      });
    }

    if (policy.rejectExpired !== false && candidate.validUntil && Date.parse(candidate.validUntil) <= Date.now()) {
      failures.push({
        memoryId: candidate.memoryId,
        code: "EXPIRED",
        detail: "memory is outside its validity window",
      });
    }

    if (policy.requireEvidenceForVerified !== false &&
        candidate.verificationState === "VERIFIED" &&
        candidate.evidenceRefs.length === 0) {
      failures.push({
        memoryId: candidate.memoryId,
        code: "MISSING_EVIDENCE",
        detail: "verified memory has no evidence lineage",
      });
    }

    if (candidate.provenance === "UNSPECIFIED") {
      failures.push({
        memoryId: candidate.memoryId,
        code: "INVALID_PROVENANCE",
        detail: "memory has no source provenance label",
      });
    }

    if (policy.rejectModelAuthorityClaims !== false &&
        candidate.authority === "MODEL_ADVISORY" &&
        candidate.verificationState === "VERIFIED") {
      failures.push({
        memoryId: candidate.memoryId,
        code: "MODEL_INFERENCE_AS_AUTHORITY",
        detail: "model-advisory memory may not be treated as authoritative verification",
      });
    }

    if (String(candidate.qualityState).toUpperCase() === "QUARANTINED") {
      failures.push({
        memoryId: candidate.memoryId,
        code: "QUARANTINED",
        detail: "quarantined memory cannot be projected",
      });
    }

    return failures;
  }
}
