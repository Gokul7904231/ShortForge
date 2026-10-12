import type {
  KnowledgeContentType,
  KnowledgeDocument,
  ShortForgeQualityReport,
} from "../intelligence/knowledge/OKFContracts";
import type { RetrievalBenchmarkItem, RetrievalBenchmarkProvider } from "./HybridRetrievalBenchmark";

export interface KnowledgeStoreRetrievalPort {
  search(query: string, options?: { readonly type?: KnowledgeContentType; readonly limit?: number }): KnowledgeDocument[];
  validateShortForgeKnowledgeQuality(): ShortForgeQualityReport;
  getDuplicateIdErrors(): Array<{ readonly id: string; readonly filePaths: readonly string[] }>;
}

/**
 * Adapts the existing ShortForge OKF KnowledgeStore ranking as a reproducible
 * benchmark baseline. It introduces no index or second knowledge authority.
 *
 * Documents identified by the canonical quality scanner as secret-bearing or
 * by the store as duplicate-ID records are omitted from benchmark output.
 */
export class KnowledgeStoreRetrievalProvider implements RetrievalBenchmarkProvider {
  public readonly providerId = "shortforge-knowledge-store";
  private qualitySnapshot: { readonly secretLeakErrors: readonly string[]; readonly duplicateIds: ReadonlySet<string> } | null = null;

  constructor(
    private readonly store: KnowledgeStoreRetrievalPort,
    public readonly implementationRevision: string,
  ) {
    if (!implementationRevision.trim() || implementationRevision.length > 128 ||
      /[\u0000-\u001F\u007F]/.test(implementationRevision)) {
      throw new Error("KNOWLEDGE_RETRIEVAL_INVALID_REVISION");
    }
  }

  /**
   * Refreshes the exclusion snapshot between benchmark runs when the underlying
   * corpus may have changed. A single run then uses one stable safety baseline.
   */
  public refreshQualitySnapshot(): void {
    this.qualitySnapshot = null;
  }

  private getQualitySnapshot(): { readonly secretLeakErrors: readonly string[]; readonly duplicateIds: ReadonlySet<string> } {
    if (!this.qualitySnapshot) {
      const quality = this.store.validateShortForgeKnowledgeQuality();
      this.qualitySnapshot = {
        secretLeakErrors: [...quality.secretLeakErrors],
        duplicateIds: new Set(this.store.getDuplicateIdErrors().map((entry) => entry.id)),
      };
    }
    return this.qualitySnapshot;
  }

  public async search(
    query: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly RetrievalBenchmarkItem[]> {
    if (signal.aborted) throw new Error("KNOWLEDGE_RETRIEVAL_ABORTED");
    if (!query.trim() || query.length > 2000) throw new Error("KNOWLEDGE_RETRIEVAL_INVALID_QUERY");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("KNOWLEDGE_RETRIEVAL_INVALID_LIMIT");
    }

    const quality = this.getQualitySnapshot();
    const duplicateIds = quality.duplicateIds;
    if (signal.aborted) throw new Error("KNOWLEDGE_RETRIEVAL_ABORTED");

    const candidates = this.store.search(query, { limit: Math.min(limit * 4, 200) });
    if (signal.aborted) throw new Error("KNOWLEDGE_RETRIEVAL_ABORTED");

    const output: RetrievalBenchmarkItem[] = [];
    const seenIds = new Set<string>();
    for (const document of candidates) {
      const id = document.frontmatter.sf_id || document.frontmatter.id;
      const filePath = document.filePath.replace(/\\/g, "/");
      if (!id || seenIds.has(id) || duplicateIds.has(id)) continue;
      if (!filePath || filePath.length > 1024 || /[\u0000-\u001F\u007F]/.test(filePath)) continue;

      const secretFlagged = quality.secretLeakErrors.some(
        (finding) => finding.startsWith(`Secret pattern detected in ${document.filePath}:`),
      );
      if (secretFlagged) continue;

      seenIds.add(id);
      output.push({
        documentId: id,
        sourceRef: filePath,
        sourceRevision: this.implementationRevision,
      });
      if (output.length >= limit) break;
    }
    return output;
  }
}
