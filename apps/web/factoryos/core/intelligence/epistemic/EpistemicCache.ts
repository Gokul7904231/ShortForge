import { createHash } from "node:crypto";

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
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

  constructor(private readonly maxEntries = 256, private readonly ttlMs = 300000) {}

  public get(key: EpistemicCacheKey, now = Date.now()): T | undefined {
    const cacheKey = keyFor(key);
    const entry = this.entries.get(cacheKey);
    if (!entry) return undefined;

    if (entry.expiresAt <= now) {
      this.entries.delete(cacheKey);
      return undefined;
    }

    return entry.value;
  }

  public set(key: EpistemicCacheKey, value: T, now = Date.now()): void {
    const cacheKey = keyFor(key);
    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, {
      value,
      expiresAt: now + this.ttlMs,
    });

    while (this.entries.size > Math.max(1, this.maxEntries)) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== "string") break;
      this.entries.delete(oldest);
    }
  }

  public clear(): void {
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}
