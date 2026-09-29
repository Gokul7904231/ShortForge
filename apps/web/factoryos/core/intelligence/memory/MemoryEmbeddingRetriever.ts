import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import type { MemorySemanticRetriever } from "./MemoryRetrievalEngine";

export interface MemoryEmbeddingProvider {
  embed(text: string): readonly number[] | Promise<readonly number[]>;
}

export class CosineMemorySemanticRetriever implements MemorySemanticRetriever {
  private readonly queryCache = new Map<string, Promise<readonly number[]>>();
  private readonly candidateCache = new Map<string, Promise<readonly number[]>>();
  private readonly maxQueryCache = 128;
  private readonly maxCandidateCache = 2048;

  constructor(private readonly provider: MemoryEmbeddingProvider) {}

  public async score(query: string, candidate: KnowledgeDocument): Promise<number> {
    const queryEmbedding = await this.cachedEmbed(this.queryCache, query, this.maxQueryCache);
    const candidateText = [
      candidate.frontmatter.id,
      candidate.frontmatter.title || "",
      candidate.content,
    ].join("\n");
    const candidateKey = [
      candidate.frontmatter.id,
      String(candidate.frontmatter.updated_at || candidate.frontmatter.sf_source_hash || candidate.content.length),
    ].join(":");
    const candidateEmbedding = await this.cachedEmbed(
      this.candidateCache,
      candidateKey,
      this.maxCandidateCache,
      candidateText,
    );

    if (queryEmbedding.length === 0 || queryEmbedding.length !== candidateEmbedding.length) return 0;

    let dot = 0;
    let queryNorm = 0;
    let candidateNorm = 0;
    for (let index = 0; index < queryEmbedding.length; index += 1) {
      const q = queryEmbedding[index] ?? 0;
      const c = candidateEmbedding[index] ?? 0;
      if (!Number.isFinite(q) || !Number.isFinite(c)) return 0;
      dot += q * c;
      queryNorm += q * q;
      candidateNorm += c * c;
    }

    if (queryNorm === 0 || candidateNorm === 0) return 0;
    return Math.max(0, Math.min(1, dot / Math.sqrt(queryNorm * candidateNorm)));
  }

  public clearCache(): void {
    this.queryCache.clear();
    this.candidateCache.clear();
  }

  private async cachedEmbed(
    cache: Map<string, Promise<readonly number[]>>,
    key: string,
    maxEntries: number,
    textOverride?: string,
  ): Promise<readonly number[]> {
    const existing = cache.get(key);
    if (existing) return existing;

    const pending = Promise.resolve(this.provider.embed(textOverride ?? key));
    cache.set(key, pending);
    if (cache.size > maxEntries) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest) cache.delete(oldest);
    }

    try {
      return await pending;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  }
}
