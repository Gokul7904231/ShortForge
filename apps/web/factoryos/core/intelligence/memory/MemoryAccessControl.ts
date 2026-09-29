import type { MemoryProvenanceGuardReport, MemoryRecallQuery, MemoryRetrievalCandidate } from "./MemorySemanticsContracts";

export interface MemoryAccessContext {
  readonly principalId: string;
  readonly allowedScopeKeys: readonly string[];
  readonly allowGlobalScope?: boolean;
}

export class MemoryAccessControl {
  public apply(
    context: MemoryAccessContext,
    query: MemoryRecallQuery,
    candidates: readonly MemoryRetrievalCandidate[],
  ): MemoryProvenanceGuardReport {
    const allowed = new Set(context.allowedScopeKeys);
    const accepted: MemoryRetrievalCandidate[] = [];
    const rejected: MemoryRetrievalCandidate[] = [];
    const violations = candidates.flatMap((candidate) => {
      const scopeAllowed =
        allowed.has(candidate.scopeKey) ||
        (context.allowGlobalScope === true && candidate.scopeKey === "GLOBAL");
      if (!scopeAllowed) {
        rejected.push(candidate);
        return [{
          memoryId: candidate.memoryId,
          code: "SCOPE_LEAK" as const,
          detail: "principal " + context.principalId + " is not authorized for memory scope " + candidate.scopeKey,
        }];
      }
      accepted.push(candidate);
      return [];
    });

    return { accepted, rejected, violations };
  }
}
