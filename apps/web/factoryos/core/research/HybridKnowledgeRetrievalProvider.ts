import type {
  KnowledgeDocument,
  ShortForgeQualityReport,
} from "../intelligence/knowledge/OKFContracts";
import type { RetrievalBenchmarkItem, RetrievalBenchmarkProvider } from "./HybridRetrievalBenchmark";

export interface HybridKnowledgeCorpusPort {
  list(): KnowledgeDocument[];
  validateShortForgeKnowledgeQuality(): ShortForgeQualityReport;
  getDuplicateIdErrors(): Array<{ readonly id: string; readonly filePaths: readonly string[] }>;
}

export interface SemanticRetrievalCandidate {
  readonly documentId: string;
  /** Text is sent to the injected scorer; it must be a local model or an explicitly approved provider. */
  readonly text: string;
}

export interface SemanticRetrievalScorer {
  readonly providerId: string;
  readonly modelRevision: string;
  search(
    query: string,
    documents: readonly SemanticRetrievalCandidate[],
    signal: AbortSignal,
  ): Promise<ReadonlyMap<string, number>>;
}

export interface HybridKnowledgeRetrievalOptions {
  readonly semanticScorer?: SemanticRetrievalScorer;
  readonly bm25Weight?: number;
  readonly exactWeight?: number;
  readonly semanticWeight?: number;
  readonly maxCorpusDocuments?: number;
}

const RRF_CONSTANT = 60;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in",
  "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "we", "what",
  "when", "where", "which", "who", "why", "with",
]);
const TOKEN_REGEX = /[a-z0-9_./:#-]+/g;
const SECRET_PATH_CONTROL = /[\u0000-\u001F\u007F]/;

/**
 * Clean-room exact + BM25 retrieval with optional vector/semantic re-ranking.
 * It is an experiment candidate only; no vector index or third-party engine is
 * introduced. Semantic scoring is opt-in and must be injected by the caller.
 */
export class HybridKnowledgeRetrievalProvider implements RetrievalBenchmarkProvider {
  public readonly providerId: string;
  private qualitySnapshot: {
    readonly secretLeakErrors: readonly string[];
    readonly duplicateIds: ReadonlySet<string>;
  } | null = null;
  private readonly bm25Weight: number;
  private readonly exactWeight: number;
  private readonly semanticWeight: number;
  private readonly maxCorpusDocuments: number;

  constructor(
    private readonly corpus: HybridKnowledgeCorpusPort,
    public readonly implementationRevision: string,
    private readonly options: HybridKnowledgeRetrievalOptions = {},
  ) {
    if (!implementationRevision.trim() || implementationRevision.length > 128 ||
      SECRET_PATH_CONTROL.test(implementationRevision)) {
      throw new Error("HYBRID_RETRIEVAL_INVALID_REVISION");
    }
    this.bm25Weight = options.bm25Weight ?? 1;
    this.exactWeight = options.exactWeight ?? 3;
    this.semanticWeight = options.semanticWeight ?? 1.5;
    this.maxCorpusDocuments = options.maxCorpusDocuments ?? 10_000;
    for (const [name, value] of [
      ["bm25Weight", this.bm25Weight],
      ["exactWeight", this.exactWeight],
      ["semanticWeight", this.semanticWeight],
    ] as const) {
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`HYBRID_RETRIEVAL_INVALID_WEIGHT:${name}`);
      }
    }
    if (!Number.isSafeInteger(this.maxCorpusDocuments) ||
      this.maxCorpusDocuments < 1 || this.maxCorpusDocuments > 50_000) {
      throw new Error("HYBRID_RETRIEVAL_INVALID_CORPUS_LIMIT");
    }
    if (options.semanticScorer && (
      !options.semanticScorer.providerId.trim() ||
      options.semanticScorer.providerId.length > 96 ||
      SECRET_PATH_CONTROL.test(options.semanticScorer.providerId) ||
      !options.semanticScorer.modelRevision.trim() ||
      options.semanticScorer.modelRevision.length > 128 ||
      SECRET_PATH_CONTROL.test(options.semanticScorer.modelRevision)
    )) {
      throw new Error("HYBRID_RETRIEVAL_INVALID_SEMANTIC_PROVIDER");
    }
    this.providerId = options.semanticScorer
      ? "shortforge-hybrid-exact-bm25-vector-rerank"
      : "shortforge-hybrid-exact-bm25";
  }

  /** Re-run the canonical secret/duplicate checks after refreshing the corpus. */
  public refreshSafetySnapshot(): void {
    this.qualitySnapshot = null;
  }

  private getSafetySnapshot(): {
    readonly secretLeakErrors: readonly string[];
    readonly duplicateIds: ReadonlySet<string>;
  } {
    if (!this.qualitySnapshot) {
      const quality = this.corpus.validateShortForgeKnowledgeQuality();
      this.qualitySnapshot = {
        secretLeakErrors: [...quality.secretLeakErrors],
        duplicateIds: new Set(this.corpus.getDuplicateIdErrors().map((item) => item.id)),
      };
    }
    return this.qualitySnapshot;
  }

  public async search(
    query: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly RetrievalBenchmarkItem[]> {
    if (signal.aborted) throw new Error("HYBRID_RETRIEVAL_ABORTED");
    if (!query.trim() || query.length > 2000) throw new Error("HYBRID_RETRIEVAL_INVALID_QUERY");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("HYBRID_RETRIEVAL_INVALID_LIMIT");
    }

    const safety = this.getSafetySnapshot();
    const duplicateIds = safety.duplicateIds;
    const documents = this.corpus.list().slice(0, this.maxCorpusDocuments);
    if (signal.aborted) throw new Error("HYBRID_RETRIEVAL_ABORTED");

    const eligible = documents.filter((document) => {
      const id = document.frontmatter.sf_id || document.frontmatter.id;
      const filePath = document.filePath.replace(/\\/g, "/");
      if (!id || duplicateIds.has(id) || !filePath || filePath.length > 1024 ||
        SECRET_PATH_CONTROL.test(filePath)) return false;
      if (safety.secretLeakErrors.some((finding) =>
        finding.startsWith(`Secret pattern detected in ${document.filePath}:`))) return false;
      return true;
    });

    const queryTokens = tokenize(query);
    const bm25Scores = scoreBm25(eligible, queryTokens);
    const lexicalRanked = [...eligible].sort((left, right) => {
      const leftId = idOf(left);
      const rightId = idOf(right);
      return (bm25Scores.get(rightId) ?? 0) - (bm25Scores.get(leftId) ?? 0) ||
        leftId.localeCompare(rightId);
    });

    const queryLower = normalize(query);
    const exactRanked = lexicalRanked.filter((document) => exactMatch(document, queryLower));
    let semanticScores: ReadonlyMap<string, number> = new Map();
    if (this.options.semanticScorer) {
      semanticScores = await this.options.semanticScorer.search(
        query,
        eligible.map((document) => ({
          documentId: idOf(document),
          text: searchableText(document),
        })),
        signal,
      );
      if (signal.aborted) throw new Error("HYBRID_RETRIEVAL_ABORTED");
      for (const [id, score] of semanticScores) {
        if (!eligible.some((document) => idOf(document) === id) ||
          !Number.isFinite(score) || score < 0 || score > 1) {
          throw new Error("HYBRID_RETRIEVAL_INVALID_SEMANTIC_SCORE");
        }
      }
    }

    const exactRanks = rankMap(exactRanked);
    const lexicalRanks = rankMap(lexicalRanked.filter((document) => (bm25Scores.get(idOf(document)) ?? 0) > 0));
    const semanticRanked = [...semanticScores.entries()]
      .filter((entry) => entry[1] > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const semanticRanks = new Map(semanticRanked.map(([id], index) => [id, index + 1]));

    const fused = eligible.map((document) => {
      const id = idOf(document);
      const exactRank = exactRanks.get(id);
      const lexicalRank = lexicalRanks.get(id);
      const semanticRank = semanticRanks.get(id);
      const score =
        (exactRank ? this.exactWeight / (RRF_CONSTANT + exactRank) : 0) +
        (lexicalRank ? this.bm25Weight / (RRF_CONSTANT + lexicalRank) : 0) +
        (semanticRank ? this.semanticWeight / (RRF_CONSTANT + semanticRank) : 0);
      return { document, id, score };
    })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit);

    return fused.map(({ document, id, score }) => ({
      documentId: id,
      sourceRef: document.filePath.replace(/\\/g, "/"),
      sourceRevision: this.options.semanticScorer
        ? `${this.implementationRevision}+${this.options.semanticScorer.providerId}@${this.options.semanticScorer.modelRevision}`.slice(0, 256)
        : this.implementationRevision,
      score,
    }));
  }
}

function idOf(document: KnowledgeDocument): string {
  return document.frontmatter.sf_id || document.frontmatter.id;
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\\/g, "/");
}

function tokenize(value: string): string[] {
  const matches = value.toLowerCase().match(TOKEN_REGEX);
  const tokens: string[] = matches ? Array.from(matches) : [];
  return tokens.filter((token: string) => token.length >= 2 && !STOP_WORDS.has(token));
}

function searchableText(document: KnowledgeDocument): string {
  return [
    idOf(document),
    document.frontmatter.title ?? "",
    ...(document.frontmatter.tags ?? []),
    document.filePath,
    document.content,
  ].join(" ").toLowerCase();
}

function exactMatch(document: KnowledgeDocument, queryLower: string): boolean {
  if (!queryLower) return false;
  const id = normalize(idOf(document));
  const filePath = normalize(document.filePath);
  const title = normalize(document.frontmatter.title ?? "");
  if (id === queryLower || filePath === queryLower || title === queryLower) return true;

  // Identifiers and path-like queries are eligible for boundary-aware exact matches.
  const identifierLike = /[._/#:-]/.test(queryLower) || /[A-Z]/.test(queryLower);
  if (!identifierLike) return false;
  const escaped = queryLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundaryPattern = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`, "i");
  return boundaryPattern.test(searchableText(document));
}

function rankMap(documents: readonly KnowledgeDocument[]): Map<string, number> {
  return new Map(documents.map((document, index) => [idOf(document), index + 1]));
}

function scoreBm25(
  documents: readonly KnowledgeDocument[],
  queryTokens: readonly string[],
): Map<string, number> {
  const output = new Map<string, number>();
  if (!documents.length || !queryTokens.length) return output;

  const fields = documents.map((document) => {
    const title = [
      idOf(document),
      document.frontmatter.title ?? "",
      ...(document.frontmatter.tags ?? []),
      document.filePath,
    ].join(" ").toLowerCase();
    const body = document.content.toLowerCase();
    const titleTokens = tokenize(title);
    const bodyTokens = tokenize(body);
    const weightedTokens = [...titleTokens, ...titleTokens, ...bodyTokens];
    const frequencies = new Map<string, number>();
    for (const token of weightedTokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    return {
      document,
      frequencies,
      length: weightedTokens.length,
    };
  });

  const averageLength = fields.reduce((sum, field) => sum + field.length, 0) / fields.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const token of new Set(queryTokens)) {
    documentFrequency.set(token, fields.filter((field) => field.frequencies.has(token)).length);
  }

  for (const field of fields) {
    let score = 0;
    for (const token of queryTokens) {
      const tf = field.frequencies.get(token) ?? 0;
      if (tf === 0) continue;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (fields.length - df + 0.5) / (df + 0.5));
      const denominator = tf + 1.2 * (1 - 0.75 + 0.75 * (field.length / averageLength));
      score += idf * ((tf * (1.2 + 1)) / denominator);
    }
    output.set(idOf(field.document), score);
  }
  return output;
}
