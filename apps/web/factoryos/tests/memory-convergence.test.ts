import { describe, expect, it } from "vitest";
import { MemoryRetrievalEngine } from "../core/intelligence/memory/MemoryRetrievalEngine";
import { MemoryRetentionNormalizer } from "../core/intelligence/memory/MemoryRetentionNormalizer";
import { InMemoryMemoryObservationStore, MemoryObservationConsolidator } from "../core/intelligence/memory/MemoryObservationConsolidator";
import type { MemoryConsolidationInput } from "../core/intelligence/memory/MemorySemanticsContracts";
import type { KnowledgeDocument } from "../core/intelligence/knowledge/OKFContracts";

function doc(
  id: string,
  content: string,
  extra: Record<string, unknown> = {},
): KnowledgeDocument {
  return {
    filePath: id + ".md",
    content,
    frontmatter: {
      id,
      type: "observation",
      title: id,
      status: "stable",
      sf_lifecycle: "active",
      sf_verification_state: "verified",
      sf_quality_state: "VALID",
      scope_key: "scope:test",
      sf_memory_type: "OBSERVATION",
      sf_memory_quality_score: 0.95,
      ...extra,
    },
  };
}

const accessContext = {
  principalId: "test-principal",
  allowedScopeKeys: ["scope:test"],
  allowGlobalScope: false,
};

describe("Memory Fabric convergence gates", () => {
  it("uses the actual frontmatter id in lexical retrieval", async () => {
    const engine = new MemoryRetrievalEngine();
    const result = await engine.recall(
      [doc("memory:renderer", "renderer requires AMD VAAPI")],
      {
        query: "AMD VAAPI",
        accessContext,
        maxItems: 5,
        maxChars: 4000,
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.memoryId).toBe("memory:renderer");
  });

  it("strictly excludes dirty/stale memories unless explicitly requested", async () => {
    const engine = new MemoryRetrievalEngine();
    const result = await engine.recall(
      [
        doc("memory:stale", "renderer switched to software", {
          sf_dirty_since: "2026-09-28T00:00:00.000Z",
        }),
      ],
      {
        query: "renderer software",
        accessContext,
        includeStale: false,
        maxItems: 5,
      },
    );

    expect(result.items).toHaveLength(0);
  });

  it("counts unique verified evidence rather than duplicate events", async () => {
    const store = new InMemoryMemoryObservationStore();
    const consolidator = new MemoryObservationConsolidator(store);
    const base: MemoryConsolidationInput = {
      memoryId: "memory:1",
      scope: { kind: "CUSTOM", key: "scope:test" },
      facetKey: "renderer:provider",
      statement: "F06 uses AMD VAAPI",
      semanticType: "OBSERVATION",
      verificationState: "VERIFIED",
      authority: "VERIFIED_SYSTEM",
      occurredAt: "2026-09-29T00:00:00.000Z",
      evidenceRefs: [{
        id: "evidence:1",
        sourceId: "receipt:1",
        sourceType: "VERIFICATION",
        capturedAt: "2026-09-29T00:00:00.000Z",
        verificationState: "VERIFIED",
        authority: "F07",
      }],
      entityRefs: ["floor:F06", "provider:AMD"],
    };

    await consolidator.consolidate([base]);
    await consolidator.consolidate([{ ...base, memoryId: "memory:2" }]);

    const observation = store.list("scope:test")[0];
    expect(observation?.proofCount).toBe(1);
    expect(observation?.sourceMemoryIds).toEqual(["memory:1", "memory:2"]);
  });

  it("keeps contradictions typed and preserves the current claim", async () => {
    const store = new InMemoryMemoryObservationStore();
    const consolidator = new MemoryObservationConsolidator(store);

    await consolidator.consolidate([{
      memoryId: "memory:1",
      scope: { kind: "CUSTOM", key: "scope:test" },
      facetKey: "renderer:provider",
      statement: "F06 uses AMD VAAPI",
      semanticType: "OBSERVATION",
      verificationState: "VERIFIED",
      authority: "VERIFIED_SYSTEM",
      occurredAt: "2026-09-29T00:00:00.000Z",
      evidenceRefs: [{
        id: "evidence:1",
        sourceId: "receipt:1",
        sourceType: "VERIFICATION",
        capturedAt: "2026-09-29T00:00:00.000Z",
        verificationState: "VERIFIED",
        authority: "F07",
      }],
      entityRefs: ["floor:F06"],
    }]);

    const existing = store.list("scope:test")[0];
    expect(existing).toBeDefined();

    await consolidator.consolidate([{
      memoryId: "memory:2",
      scope: { kind: "CUSTOM", key: "scope:test" },
      facetKey: "renderer:provider",
      statement: "F06 uses software encoding",
      semanticType: "OBSERVATION",
      verificationState: "VERIFIED",
      authority: "VERIFIED_SYSTEM",
      occurredAt: "2026-09-29T01:00:00.000Z",
      evidenceRefs: [{
        id: "evidence:2",
        sourceId: "receipt:2",
        sourceType: "VERIFICATION",
        capturedAt: "2026-09-29T01:00:00.000Z",
        verificationState: "VERIFIED",
        authority: "F07",
      }],
      entityRefs: ["floor:F06"],
      relationToExisting: {
        observationId: existing!.observationId,
        type: "CONTRADICTS",
      },
    }]);

    const updated = store.get(existing!.observationId);
    expect(updated?.statement).toBe("F06 uses AMD VAAPI");
    expect(updated?.verificationState).toBe("DISPUTED");
    expect(updated?.contradictingMemoryIds).toContain("memory:2");
    expect(updated?.history.at(-1)?.changeType).toBe("CONTRADICTED");
    expect(updated?.history.at(-1)?.statement).toBe("F06 uses AMD VAAPI");
  });

  it("blocks secrets from durable memory before fact extraction", async () => {
    const normalizer = new MemoryRetentionNormalizer();
    const decision = normalizer.classify({
      memoryId: "memory:secret",
      scope: { kind: "CUSTOM", key: "scope:test" },
      summary: "Deploy with token=super-secret-value-1234567890",
      payload: {},
      occurredAt: "2026-09-29T00:00:00.000Z",
      capturedAt: "2026-09-29T00:00:00.000Z",
      sourceType: "RUN_LOG",
      sourceId: "run:secret",
    });

    expect(decision.retentionClass).toBe("DO_NOT_LEARN");
    await expect(
      normalizer.retain({
        memoryId: "memory:secret",
        scope: { kind: "CUSTOM", key: "scope:test" },
        summary: "Deploy with token=super-secret-value-1234567890",
        payload: {},
        occurredAt: "2026-09-29T00:00:00.000Z",
        capturedAt: "2026-09-29T00:00:00.000Z",
        sourceType: "RUN_LOG",
        sourceId: "run:secret",
      }),
    ).resolves.toEqual([]);
  });

  it("blocks high-risk PII from long-lived learned memory", async () => {
    const normalizer = new MemoryRetentionNormalizer();
    const decision = normalizer.classify({
      memoryId: "memory:pii",
      scope: { kind: "CUSTOM", key: "scope:test" },
      summary: "Contact operator at test@example.com or +91 9876543210",
      payload: {},
      occurredAt: "2026-09-29T00:00:00.000Z",
      capturedAt: "2026-09-29T00:00:00.000Z",
      sourceType: "RUN_LOG",
      sourceId: "run:pii",
    });

    expect(decision.retentionClass).toBe("TEMPORARY");
    await expect(
      normalizer.retain({
        memoryId: "memory:pii",
        scope: { kind: "CUSTOM", key: "scope:test" },
        summary: "Contact operator at test@example.com or +91 9876543210",
        payload: {},
        occurredAt: "2026-09-29T00:00:00.000Z",
        capturedAt: "2026-09-29T00:00:00.000Z",
        sourceType: "RUN_LOG",
        sourceId: "run:pii",
      }),
    ).resolves.toEqual([]);
  });

});
