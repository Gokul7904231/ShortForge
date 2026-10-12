import { describe, expect, it, vi } from "vitest";
import type { KnowledgeDocument, ShortForgeQualityReport } from "../core/intelligence/knowledge/OKFContracts";
import {
  KnowledgeStoreRetrievalProvider,
  knowledgeDocumentContentRevision,
  type KnowledgeStoreRetrievalPort,
} from "../core/research/KnowledgeStoreRetrievalProvider";

function document(id: string, filePath: string): KnowledgeDocument {
  return {
    frontmatter: { id, sf_id: id, type: "reference", title: id },
    content: `Content for ${id}`,
    filePath,
  };
}

function quality(secretLeakErrors: string[] = []): ShortForgeQualityReport {
  return {
    passing: secretLeakErrors.length === 0,
    totalDocuments: 0,
    documentsByType: {},
    duplicateIds: [],
    secretLeakErrors,
    brokenInternalLinks: [],
    missingProvenanceWarnings: [],
    staleDocumentWarnings: [],
    errors: [...secretLeakErrors],
    warnings: [],
  };
}

describe("KnowledgeStore retrieval benchmark baseline adapter", () => {
  it("adapts existing ranked search results with source revision provenance", async () => {
    const safe = document("safe-doc", "knowledge/research/safe.md");
    const store: KnowledgeStoreRetrievalPort = {
      search: vi.fn(() => [safe]),
      validateShortForgeKnowledgeQuality: () => quality(),
      getDuplicateIdErrors: () => [],
    };
    const provider = new KnowledgeStoreRetrievalProvider(store, "a".repeat(40));
    const results = await provider.search("research provenance", 5, new AbortController().signal);

    expect(results).toEqual([{
      documentId: "safe-doc",
      sourceRef: "knowledge/research/safe.md",
      sourceRevision: knowledgeDocumentContentRevision(safe),
    }]);
    expect(results[0].sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(knowledgeDocumentContentRevision({ ...safe, content: "changed content" }))
      .not.toBe(results[0].sourceRevision);
  });

  it("excludes documents flagged by secret scan or duplicate-ID detection", async () => {
    const secretDoc = document("secret-doc", "knowledge/private.md");
    const duplicateDoc = document("duplicate-doc", "knowledge/duplicate.md");
    const safeDoc = document("safe-doc", "knowledge/safe.md");
    const store: KnowledgeStoreRetrievalPort = {
      search: () => [secretDoc, duplicateDoc, safeDoc],
      validateShortForgeKnowledgeQuality: () => quality([
        "Secret pattern detected in knowledge/private.md: password-pattern",
      ]),
      getDuplicateIdErrors: () => [
        { id: "duplicate-doc", filePaths: ["knowledge/duplicate.md", "knowledge/other.md"] },
      ],
    };
    const provider = new KnowledgeStoreRetrievalProvider(store, "local-corpus-v1");
    const results = await provider.search("knowledge", 5, new AbortController().signal);

    expect(results.map((item) => item.documentId)).toEqual(["safe-doc"]);
  });

  it("rejects invalid query/limit and cancelled benchmark probes", async () => {
    const store: KnowledgeStoreRetrievalPort = {
      search: () => [],
      validateShortForgeKnowledgeQuality: () => quality(),
      getDuplicateIdErrors: () => [],
    };
    const provider = new KnowledgeStoreRetrievalProvider(store, "revision-1");
    await expect(provider.search(" ", 5, new AbortController().signal))
      .rejects.toThrow("KNOWLEDGE_RETRIEVAL_INVALID_QUERY");
    await expect(provider.search("query", 51, new AbortController().signal))
      .rejects.toThrow("KNOWLEDGE_RETRIEVAL_INVALID_LIMIT");
    const controller = new AbortController();
    controller.abort();
    await expect(provider.search("query", 5, controller.signal))
      .rejects.toThrow("KNOWLEDGE_RETRIEVAL_ABORTED");
  });
});
