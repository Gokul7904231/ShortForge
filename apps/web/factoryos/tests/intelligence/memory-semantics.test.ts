import { describe, expect, it } from "vitest";
import type { KnowledgeDocument } from "../../core/intelligence/knowledge/OKFContracts";
import {
  InMemoryMemoryObservationStore,
  MemoryCompletionLedger,
  MemoryMentalModelManager,
  MemoryObservationConsolidator,
  MemoryProvenanceGuard,
  MemoryReflectionEngine,
  MemoryRetrievalEngine,
  type MemoryConsolidationInput,
  type MemoryRetrievalCandidate,
} from "../../core/intelligence/memory";

const evidence = (id: string) => ({
  id,
  sourceId: "source:" + id,
  sourceType: "RUNTIME_EVENT",
  quote: "verified quote",
  capturedAt: "2026-09-29T00:00:00.000Z",
  verificationState: "VERIFIED" as const,
  authority: "VERIFIED_SYSTEM" as const,
});

const input = (
  memoryId: string,
  statement: string,
  relationToExisting?: MemoryConsolidationInput["relationToExisting"],
): MemoryConsolidationInput => ({
  memoryId,
  scope: { kind: "MISSION", key: "mission-1" },
  facetKey: "render-configuration",
  statement,
  semanticType: "WORLD_FACT",
  verificationState: "VERIFIED",
  authority: "VERIFIED_SYSTEM",
  occurredAt: "2026-09-29T00:00:00.000Z",
  evidenceRefs: [evidence(memoryId)],
  relationToExisting,
});

function doc(
  id: string,
  title: string,
  content: string,
  extra: Partial<KnowledgeDocument["frontmatter"]> = {},
): KnowledgeDocument {
  return {
    filePath: id + ".md",
    content,
    frontmatter: {
      id,
      type: "observation",
      title,
      status: "stable",
      sf_lifecycle: "active",
      sf_memory_type: "OBSERVATION",
      sf_observation_scope: "mission-1",
      sf_verification_state: "verified",
      sf_quality_state: "VALID",
      sf_memory_quality_score: 0.95,
      sf_provenance: {
        source_type: "RUNTIME_EVENT",
        source_id: id,
        captured_at: "2026-09-29T00:00:00.000Z",
      },
      evidence_refs: ["e:" + id],
      entity_refs: ["render"],
      ...extra,
    },
  };
}

describe("ShortForge learned-memory semantics", () => {
  it("retains, consolidates, reinforces, and preserves contradiction history", () => {
    const store = new InMemoryMemoryObservationStore();
    const consolidator = new MemoryObservationConsolidator(store);

    const first = await consolidator.consolidate([input("m1", "F06 uses AMD VAAPI")]);
    expect(first[0].createdCount).toBe(1);

    const observationId = first[0].observationIds[0];
    const second = await consolidator.consolidate([
      input("m2", "F06 uses AMD VAAPI", {
        type: "SUPPORTS",
        observationId,
      }),
      input("m3", "F06 switched to software encoding", {
        type: "CONTRADICTS",
        observationId,
      }),
    ]);

    const observation = store.get(observationId)!;
    expect(observation.version).toBe(3);
    expect(observation.proofCount).toBe(3);
    expect(observation.history.some((entry) => entry.changeType === "CONTRADICTED")).toBe(true);
    expect(observation.contradictingMemoryIds).toContain("m3");
    expect(second[0].contradictedCount).toBe(1);
  });

  it("keeps dirty state until targeted consolidation finishes", async () => {
    const store = new InMemoryMemoryObservationStore();
    const consolidator = new MemoryObservationConsolidator(store);
    consolidator.markDirty("mission-2", "new_event", "2026-09-29T00:00:00.000Z");
    expect(consolidator.dirtyScopes().has("mission-2")).toBe(true);

    await consolidator.consolidate([
      { ...input("m4", "new evidence"), scope: { kind: "MISSION", key: "mission-2" } },
    ]);
    expect(consolidator.dirtyScopes().has("mission-2")).toBe(false);
  });

  it("supports four-channel retrieval, RRF, graph hops, and bounded output", async () => {
    const documents = [
      doc("a", "Encoder configuration", "AMD encoder configuration for F06"),
      doc("b", "Transfer outcome", "Asset transfer happened before encoder configuration"),
      doc("c", "Operator note", "A completely different topic"),
    ];

    const engine = new MemoryRetrievalEngine({
      semanticRetriever: {
        score: async (query, candidate) => candidate.frontmatter.id === "b" ? 0.95 : candidate.frontmatter.id === "a" ? 0.7 : 0.05,
      },
      relations: [
        {
          relationId: "r1",
          fromMemoryId: "a",
          toMemoryId: "b",
          type: "CAUSED_BY",
          scopeKey: "mission-1",
          createdAt: "2026-09-29T00:00:00.000Z",
          evidenceRefs: ["e:graph"],
        },
      ],
    });

    const result = await engine.recall(documents, {
      query: "encoder configuration",
      scopeKey: "mission-1",
      entityRefs: ["render"],
      maxItems: 2,
      maxChars: 80,
      trace: true,
    });

    expect(result.items.length).toBeLessThanOrEqual(2);
    expect(result.items[0].retrievalSignals ?? result.items[0].semanticScore).toBeTruthy();
    expect(result.trace?.channelCounts.semantic).toBeGreaterThan(0);
    expect(result.trace?.channelCounts.lexical).toBeGreaterThan(0);
    expect(result.trace?.channelCounts.graph).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeLessThanOrEqual(20);
  });

  it("marks derived memory stale and throttles mental-model refresh", async () => {
    const manager = new MemoryMentalModelManager();
    const model = await manager.create({
      key: "render-playbook",
      question: "What should F06 know about renderer failures?",
      scope: { kind: "MISSION", key: "mission-1" },
      refreshMode: "DELTA",
      minRefreshIntervalSeconds: 3600,
      refreshAfterConsolidation: true,
    });

    await manager.markDirty(model.modelId, "new_observation", "2026-09-29T00:00:00.000Z");
    expect(manager.shouldRefresh(model.modelId, Date.parse("2026-09-29T00:00:00.000Z"))).toBe(true);

    await manager.applyRefresh({
      modelId: model.modelId,
      content: "Prefer measured stage timings before speculative fixes.",
      sourceObservationIds: [],
      evidenceRefs: ["e:playbook"],
      now: "2026-09-29T00:10:00.000Z",
    });
    await manager.markDirty(model.modelId, "another_event", "2026-09-29T00:20:00.000Z");
    expect(manager.shouldRefresh(model.modelId, Date.parse("2026-09-29T00:20:01.000Z"))).toBe(false);
    expect(manager.shouldRefresh(model.modelId, Date.parse("2026-09-29T01:11:00.000Z"))).toBe(true);
  });

  it("enforces provenance lock and scope isolation", () => {
    const guard = new MemoryProvenanceGuard();
    const base: MemoryRetrievalCandidate = {
      memoryId: "m1",
      title: "fact",
      semanticType: "OBSERVATION",
      scopeKey: "mission-1",
      content: "fact",
      verificationState: "VERIFIED",
      authority: "VERIFIED_SYSTEM",
      qualityState: "VALID",
      qualityScore: 0.9,
      stale: false,
      freshness: { state: "FRESH", checkedAt: "2026-09-29T00:00:00.000Z" },
      evidenceRefs: ["e1"],
      provenance: "RUNTIME_EVENT:m1",
      entityRefs: [],
      relationIds: [],
      semanticScore: 0,
      lexicalScore: 1,
      graphScore: 0,
      temporalScore: 1,
      rerankScore: 1,
      channelRanks: {},
    };

    expect(guard.guardForAscalon({ query: "x", scopeKey: "mission-1" }, [base]).accepted).toHaveLength(1);
    expect(guard.guardForAscalon({ query: "x", scopeKey: "mission-2" }, [base]).violations[0].code).toBe("SCOPE_LEAK");

    const modelAuthority = { ...base, authority: "MODEL_ADVISORY" as const };
    expect(guard.guardForAscalon({ query: "x", scopeKey: "mission-1" }, [modelAuthority]).violations[0].code)
      .toBe("MODEL_INFERENCE_AS_AUTHORITY");
  });

  it("reflects from mental model to observations to raw evidence when stale", async () => {
    const reflection = new MemoryReflectionEngine();
    const modelManager = new MemoryMentalModelManager();
    const model = await modelManager.create({
      question: "What happened to F06 renderer?",
      scope: { kind: "MISSION", key: "mission-1" },
      content: "Renderer latency increased.",
      evidenceRefs: ["e:model"],
    });
    const item: MemoryRetrievalCandidate = {
      memoryId: "obs-1",
      title: "renderer",
      semanticType: "OBSERVATION",
      scopeKey: "mission-1",
      content: "Renderer moved from hardware to software",
      verificationState: "VERIFIED",
      authority: "VERIFIED_SYSTEM",
      qualityState: "VALID",
      qualityScore: 0.9,
      stale: true,
      freshness: {
        state: "STALE",
        reason: "derived_memory_dirty_since_last_refresh",
        checkedAt: "2026-09-29T00:00:00.000Z",
      },
      evidenceRefs: ["e:obs"],
      provenance: "RUNTIME_EVENT:obs-1",
      entityRefs: [],
      relationIds: [],
      semanticScore: 0,
      lexicalScore: 1,
      graphScore: 0,
      temporalScore: 0,
      rerankScore: 1,
      channelRanks: {},
    };
    const raw = { ...item, memoryId: "raw-1", semanticType: "EVIDENCE" as const, stale: false, content: "Measured software render duration was 42s" };

    const result = reflection.buildContext(
      { question: "renderer", maxTokens: 200, includeRawEvidenceOnStale: true },
      [model],
      [item],
      [raw],
    );

    expect(result.hierarchy).toEqual(["MENTAL_MODEL", "OBSERVATION", "RAW_EVIDENCE"]);
    expect(result.staleVerificationRequired).toBe(true);
    expect(result.sourceEvidenceRefs).toContain("e:obs");
    expect(result.sourceEvidenceRefs).toContain("e:model");
  });

  it("treats completion proof as current only for the exact definition", () => {
    const ledger = new MemoryCompletionLedger();
    const definition = {
      gateId: "memory-recall",
      layer: "BRANCH" as const,
      outcome: "hybrid recall is bounded",
      check: "node check-memory.mjs",
      expect: "MEMORY_OK",
      cwd: "apps/web",
    };
    const gate = ledger.registerGate(definition);

    ledger.recordProof({
      gateId: gate.gateId,
      kind: "AUTOMATIC_COMMAND",
      definitionDigest: gate.definitionDigest,
      evidenceDigest: "evidence:1",
      observedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(ledger.snapshot().status).toBe("ALL_MET");

    ledger.refreshDefinition({
      ...definition,
      expect: "MEMORY_OK_V2",
    });
    expect(ledger.snapshot().status).toBe("REVERIFY_REQUIRED");

    ledger.abandon("memory-recall", "validation owner unavailable");
    expect(ledger.snapshot().status).toBe("HANDOFF");
    expect(ledger.canReleaseLayer("BRANCH")).toBe(false);
  });
});
