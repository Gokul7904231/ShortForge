import { describe, expect, it, vi } from "vitest";
import type {
  KnowledgeDocument,
  ShortForgeQualityReport,
} from "../core/intelligence/knowledge/OKFContracts";
import { knowledgeDocumentContentRevision } from "../core/research/KnowledgeStoreRetrievalProvider";
import {
  HybridKnowledgeRetrievalProvider,
  type HybridKnowledgeCorpusPort,
  type SemanticRetrievalScorer,
} from "../core/research/HybridKnowledgeRetrievalProvider";

function doc(
  id: string,
  filePath: string,
  title: string,
  tags: string[],
  content: string,
): KnowledgeDocument {
  return {
    frontmatter: { id, sf_id: id, type: "reference", title, tags },
    content,
    filePath,
  };
}

function quality(secretLeakErrors: string[] = []): ShortForgeQualityReport {
  return {
    passing: secretLeakErrors.length === 0,
    totalDocuments: 4,
    documentsByType: { reference: 4 },
    duplicateIds: [],
    secretLeakErrors,
    brokenInternalLinks: [],
    missingProvenanceWarnings: [],
    staleDocumentWarnings: [],
    errors: [...secretLeakErrors],
    warnings: [],
  };
}

function corpusPort(
  docs: KnowledgeDocument[],
  secretLeakErrors: string[] = [],
  duplicateIds: string[] = [],
): HybridKnowledgeCorpusPort {
  return {
    list: () => docs,
    validateShortForgeKnowledgeQuality: () => quality(secretLeakErrors),
    getDuplicateIdErrors: () => duplicateIds.map((id) => ({
      id,
      filePaths: ["knowledge/duplicate-a.md", "knowledge/duplicate-b.md"],
    })),
  };
}

describe("HybridKnowledgeRetrievalProvider", () => {
  it("promotes exact identifier/path matches while scoring lexical relevance with BM25", async () => {
    const exact = doc(
      "work-manager",
      "apps/web/factoryos/core/work/MissionWorkManager.ts",
      "Mission work manager",
      ["mission", "tasks"],
      "MissionWorkManager.board returns task dependencies and current readiness state.",
    );
    const lexical = doc(
      "dependency-guide",
      "knowledge/dependency-guide.md",
      "Durable task dependency readiness guide",
      ["dependencies", "readiness"],
      "Durable task dependency readiness requires parent completion and lease validation.",
    );
    const irrelevant = doc(
      "voice-guide",
      "knowledge/voice-guide.md",
      "Voice rendering guide",
      ["audio"],
      "Speech synthesis and media pacing for vertical video.",
    );
    const provider = new HybridKnowledgeRetrievalProvider(
      corpusPort([irrelevant, lexical, exact]),
      "corpus-revision-1",
    );

    const exactResults = await provider.search(
      "apps/web/factoryos/core/work/MissionWorkManager.ts",
      3,
      new AbortController().signal,
    );
    expect(exactResults[0]?.documentId).toBe("work-manager");
    expect(exactResults[0]?.sourceRef).toBe("apps/web/factoryos/core/work/MissionWorkManager.ts");
    expect(exactResults[0]?.sourceRevision).toBe("corpus-revision-1");
    expect(exactResults[0]?.score).toBeGreaterThan(0);

    const lexicalResults = await provider.search(
      "durable task dependency readiness",
      3,
      new AbortController().signal,
    );
    expect(lexicalResults[0]?.documentId).toBe("dependency-guide");
  });

  it("filters canonical secret findings and duplicate IDs before fusion", async () => {
    const secret = doc("secret-doc", "knowledge/private.md", "Private config", ["config"], "private contents");
    const duplicate = doc("duplicate-doc", "knowledge/duplicate.md", "Duplicate", ["reference"], "duplicate contents");
    const safe = doc("safe-doc", "knowledge/safe.md", "Safe guide", ["reference"], "safe guide");
    const provider = new HybridKnowledgeRetrievalProvider(
      corpusPort(
        [secret, duplicate, safe],
        ["Secret pattern detected in knowledge/private.md: password-pattern"],
        ["duplicate-doc"],
      ),
      "revision",
    );

    const result = await provider.search("private safe guide", 10, new AbortController().signal);
    expect(result.map((item) => item.documentId)).toEqual(["safe-doc"]);
    expect(JSON.stringify(result)).not.toContain("private contents");
  });

  it("uses an explicitly injected semantic scorer to rerank candidates without requiring a new index", async () => {
    const lexical = doc("lexical-doc", "knowledge/lexical.md", "Lexical match", [], "query is present in text");
    const semantic = doc("semantic-doc", "knowledge/semantic.md", "Meaningful related memory", [], "conceptually related information with different wording");
    const scorer: SemanticRetrievalScorer = {
      providerId: "test-local-embedding",
      modelRevision: "fixture-v1",
      executionBoundary: "LOCAL",
      search: vi.fn(async (_query, docs) => new Map(
        docs.map((candidate) => [candidate.documentId, candidate.documentId === "semantic-doc" ? 0.99 : 0.2]),
      )),
    };
    const provider = new HybridKnowledgeRetrievalProvider(
      corpusPort([lexical, semantic]),
      "corpus-revision-2",
      { semanticScorer: scorer },
    );

    const result = await provider.search("different wording concept", 2, new AbortController().signal);

    expect(provider.providerId).toBe("shortforge-hybrid-exact-bm25-vector-rerank");
    expect(scorer.search).toHaveBeenCalledTimes(1);
    expect(result[0]?.documentId).toBe("semantic-doc");
    expect(provider.implementationRevision).toContain("test-local-embedding@fixture-v1");
    expect(result[0]?.sourceRevision).toBe(knowledgeDocumentContentRevision(semantic));
  });

  it("fails closed when remote semantic scoring is not explicitly approved", () => {
    const remoteScorer: SemanticRetrievalScorer = {
      providerId: "approved-remote-embedding",
      modelRevision: "remote-v1",
      executionBoundary: "APPROVED_REMOTE",
      async search() { return new Map(); },
    };

    expect(() => new HybridKnowledgeRetrievalProvider(
      corpusPort([]),
      "revision",
      { semanticScorer: remoteScorer },
    )).toThrow("HYBRID_RETRIEVAL_REMOTE_SEMANTICS_NOT_AUTHORIZED");

    expect(() => new HybridKnowledgeRetrievalProvider(
      corpusPort([]),
      "revision",
      { semanticScorer: remoteScorer, allowApprovedRemoteSemanticScorer: true },
    )).not.toThrow();
  });

  it("rejects malformed scorer outputs and invalid runtime inputs", async () => {
    const good = doc("doc-a", "knowledge/a.md", "A", [], "content");
    const invalidScorer: SemanticRetrievalScorer = {
      providerId: "test",
      modelRevision: "v1",
      executionBoundary: "LOCAL",
      async search() { return new Map([["missing-doc", 0.5]]); },
    };
    const provider = new HybridKnowledgeRetrievalProvider(
      corpusPort([good]),
      "revision",
      { semanticScorer: invalidScorer },
    );

    await expect(provider.search("valid query", 5, new AbortController().signal))
      .rejects.toThrow("HYBRID_RETRIEVAL_INVALID_SEMANTIC_SCORE");
    await expect(provider.search(" ", 5, new AbortController().signal))
      .rejects.toThrow("HYBRID_RETRIEVAL_INVALID_QUERY");
    await expect(provider.search("query", 0, new AbortController().signal))
      .rejects.toThrow("HYBRID_RETRIEVAL_INVALID_LIMIT");
    const abort = new AbortController();
    abort.abort();
    await expect(provider.search("query", 5, abort.signal))
      .rejects.toThrow("HYBRID_RETRIEVAL_ABORTED");
  });
});
