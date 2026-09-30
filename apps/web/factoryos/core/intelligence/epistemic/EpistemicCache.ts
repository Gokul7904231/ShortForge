import { createHash } from "node:crypto";

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface EpistemicCacheLookup<T> {
  readonly hit: boolean;
  readonly value: T | undefined;
}

export interface EpistemicCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly sets: number;
  readonly evictions: number;
  readonly size: number;
  readonly hitRate: number;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const object = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(object)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalize(object[key]))
      .join(",") +
    "}"
  );
}

function keyFor(input: {
  readonly semanticFingerprint: string;
  readonly modelRef?: string;
  readonly modelVersion?: string;
  readonly policyVersion?: string;
}): string {
  return createHash("sha256")
    .update(canonicalize(input), "utf8")
    .digest("hex");
}

export interface EpistemicCacheKey {
  readonly semanticFingerprint: string;
  readonly modelRef?: string;
  readonly modelVersion?: string;
  readonly policyVersion?: string;
}

export class EpistemicCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private evictions = 0;

  constructor(private readonly maxEntries = 256, private readonly ttlMs = 300000) {}

  public get(key: EpistemicCacheKey, now = Date.now()): T | undefined {
    return this.getWithTelemetry(key, now).value;
  }

  public getWithTelemetry(key: EpistemicCacheKey, now = Date.now()): EpistemicCacheLookup<T> {
    const cacheKey = keyFor(key);
    const entry = this.entries.get(cacheKey);
    if (!entry) {
      this.misses += 1;
      return { hit: false, value: undefined };
    }

    if (entry.expiresAt <= now) {
      this.entries.delete(cacheKey);
      this.misses += 1;
      return { hit: false, value: undefined };
    }

    this.hits += 1;
    return { hit: true, value: entry.value };
  }

  public set(key: EpistemicCacheKey, value: T, now = Date.now()): void {
    const cacheKey = keyFor(key);
    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, {
      value,
      expiresAt: now + this.ttlMs,
    });
    this.sets += 1;

    while (this.entries.size > Math.max(1, this.maxEntries)) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== "string") break;
      this.entries.delete(oldest);
      this.evictions += 1;
    }
  }

  public clear(): void {
    this.entries.clear();
  }

  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.evictions = 0;
  }

  public stats(): EpistemicCacheStats {
    const lookups = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      size: this.entries.size,
      hitRate: lookups > 0 ? this.hits / lookups : 0,
    };
  }

  public get size(): number {
    return this.entries.size;
  }
}
