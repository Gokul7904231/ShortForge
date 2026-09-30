import { createHash } from "node:crypto";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";
import type { ReachFetchRequest } from "./ReachContracts";

interface CacheEntry {
  readonly expiresAt: number;
  readonly sources: readonly EvidenceSource[];
}

export interface ReachCacheOptions {
  readonly maxEntries?: number;
  readonly runTtlMs?: number;
  readonly recentTtlMs?: number;
  readonly anyTtlMs?: number;
}

export class ReachResearchCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlByFreshness: Record<"run" | "recent" | "any", number>;

  constructor(options: ReachCacheOptions = {}) {
    this.maxEntries = Math.max(10, Math.floor(options.maxEntries ?? 512));
    this.ttlByFreshness = {
      run: Math.max(1000, options.runTtlMs ?? 5 * 60 * 1000),
      recent: Math.max(1000, options.recentTtlMs ?? 6 * 60 * 60 * 1000),
      any: Math.max(1000, options.anyTtlMs ?? 24 * 60 * 60 * 1000),
    };
  }

  private key(request: ReachFetchRequest, renderedQuery: string): string {
    const parameters = Object.entries(request.parameters || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    const payload = JSON.stringify({
      engineId: request.engineId,
      queryKind: request.queryKind,
      renderedQuery,
      parameters,
      freshness: request.researchContract.freshness ?? "any",
    });

    return createHash("sha256").update(payload, "utf8").digest("hex");
  }

  get(
    request: ReachFetchRequest,
    renderedQuery: string,
  ): readonly EvidenceSource[] | undefined {
    const key = this.key(request, renderedQuery);
    const entry = this.entries.get(key);

    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return [...entry.sources];
  }

  set(
    request: ReachFetchRequest,
    renderedQuery: string,
    sources: readonly EvidenceSource[],
  ): void {
    const freshness = request.researchContract.freshness ?? "any";
    const ttl = this.ttlByFreshness[freshness];
    const key = this.key(request, renderedQuery);

    this.entries.delete(key);
    this.entries.set(key, {
      expiresAt: Date.now() + ttl,
      sources: Object.freeze([...sources]),
    });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

export function canonicalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

export function deduplicateEvidenceSources(
  sources: readonly EvidenceSource[],
): EvidenceSource[] {
  const seenUrls = new Set<string>();
  const seenHashes = new Set<string>();
  const result: EvidenceSource[] = [];

  for (const source of sources) {
    const canonicalUrl = canonicalizeSourceUrl(source.url);
    const contentHash = source.contentHash || "";
    const duplicate =
      seenUrls.has(canonicalUrl) ||
      (contentHash.length > 0 && seenHashes.has(contentHash));

    if (duplicate) continue;

    seenUrls.add(canonicalUrl);
    if (contentHash) seenHashes.add(contentHash);
    result.push(source);
  }

  return result;
}
