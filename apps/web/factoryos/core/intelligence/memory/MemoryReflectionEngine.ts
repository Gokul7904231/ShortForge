import type {
  MemoryMentalModel,
  MemoryReflectionRequest,
  MemoryReflectionResult,
  MemoryRetrievalCandidate,
} from "./MemorySemanticsContracts";

export class MemoryReflectionEngine {
  /**
   * Reflect is a bounded planning layer, not an implicit model call.
   * It follows the learned-memory hierarchy: standing model -> observation ->
   * source evidence when freshness/contradiction requires grounding.
   */
  public buildContext(
    request: MemoryReflectionRequest,
    mentalModels: readonly MemoryMentalModel[],
    observations: readonly MemoryRetrievalCandidate[],
    rawEvidence: readonly MemoryRetrievalCandidate[],
  ): MemoryReflectionResult {
    const selected: MemoryRetrievalCandidate[] = [];
    const unresolvedReasons: string[] = [];
    let staleVerificationRequired = false;

    const relevantModels = mentalModels.filter(
      (model) => !request.scopeKey || model.scope.key === request.scopeKey,
    );

    for (const model of relevantModels) {
      const item = this.modelAsCandidate(model);
      if (this.containsQuery(item, request.question)) selected.push(item);
      if (model.dirtySince) staleVerificationRequired = true;
    }

    const observationMatches = observations.filter((item) =>
      this.containsQuery(item, request.question),
    );
    selected.push(...observationMatches);

    const hasStaleObservation = observationMatches.some((item) => item.stale);
    staleVerificationRequired ||= hasStaleObservation;

    const shouldReadRawEvidence =
      selected.length === 0 ||
      (staleVerificationRequired && request.includeRawEvidenceOnStale !== false);

    if (shouldReadRawEvidence) {
      const sourceMatches = rawEvidence.filter((item) =>
        this.containsQuery(item, request.question),
      );
      selected.push(...sourceMatches);
    }

    const unique = [...new Map(selected.map((item) => [item.memoryId, item])).values()];
    const bounded: MemoryRetrievalCandidate[] = [];
    let used = 0;
    for (const item of unique) {
      if (used >= request.maxTokens * 4) break;
      bounded.push(item);
      used += item.content.length;
    }

    if (bounded.length === 0) {
      unresolvedReasons.push("no_relevant_memory_at_requested_scope");
    }
    if (staleVerificationRequired) {
      unresolvedReasons.push("derived_memory_is_stale_and_requires_ground_truth_check");
    }

    return {
      hierarchy: staleVerificationRequired
        ? ["MENTAL_MODEL", "OBSERVATION", "RAW_EVIDENCE"]
        : ["MENTAL_MODEL", "OBSERVATION"],
      selectedItems: bounded,
      staleVerificationRequired,
      sourceEvidenceRefs: [...new Set(bounded.flatMap((item) => item.evidenceRefs))],
      unresolvedReasons,
    };
  }

  private modelAsCandidate(model: MemoryMentalModel): MemoryRetrievalCandidate {
    return {
      memoryId: model.modelId,
      title: model.question,
      semanticType: model.semanticType,
      scopeKey: model.scope.key,
      content: model.content,
      verificationState: model.verificationState,
      authority: "MODEL_ADVISORY",
      qualityState: "VALID",
      qualityScore: 0.8,
      stale: Boolean(model.dirtySince),
      freshness: {
        state: model.dirtySince ? "STALE" : "FRESH",
        reason: model.dirtySince ? model.dirtyReason : undefined,
        checkedAt: new Date().toISOString(),
        dirtySince: model.dirtySince,
      },
      evidenceRefs: model.evidenceRefs,
      provenance: "MENTAL_MODEL:" + model.modelId,
      entityRefs: [],
      relationIds: [],
      semanticScore: 0,
      lexicalScore: 1,
      graphScore: 0,
      temporalScore: 0,
      rerankScore: 1,
      channelRanks: { lexical: 1 },
    };
  }

  private containsQuery(item: Pick<MemoryRetrievalCandidate, "title" | "content">, query: string): boolean {
    const tokens = query.toLowerCase().split(/[^a-z0-9_:-]+/).filter((token) => token.length >= 2);
    if (tokens.length === 0) return true;
    const haystack = (item.title + " " + item.content).toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  }
}
