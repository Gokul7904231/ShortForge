import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import type { MemorySemanticRetriever } from "./MemoryRetrievalEngine";

export interface MemoryEmbeddingProvider {
  embed(text: string): readonly number[] | Promise<readonly number[]>;
}

export class CosineMemorySemanticRetriever implements MemorySemanticRetriever {
  constructor(private readonly provider: MemoryEmbeddingProvider) {}

  public async score(query: string, candidate: KnowledgeDocument): Promise<number> {
    const [queryEmbedding, candidateEmbedding] = await Promise.all([
      this.provider.embed(query),
      this.provider.embed([
        candidate.frontmatter.id,
        candidate.frontmatter.title || "",
        candidate.content,
      ].join("
")),
    ]);

    if (queryEmbedding.length === 0 || queryEmbedding.length !== candidateEmbedding.length) return 0;

    let dot = 0;
    let queryNorm = 0;
    let candidateNorm = 0;
    for (let index = 0; index < queryEmbedding.length; index += 1) {
      const q = queryEmbedding[index];
      const c = candidateEmbedding[index];
      if (!Number.isFinite(q) || !Number.isFinite(c)) return 0;
      dot += q * c;
      queryNorm += q * q;
      candidateNorm += c * c;
    }

    if (queryNorm === 0 || candidateNorm === 0) return 0;
    return Math.max(0, Math.min(1, dot / Math.sqrt(queryNorm * candidateNorm)));
  }
}
