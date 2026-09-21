/**
 * ShortForge Reach — Controlled External Information Access Subsystem
 * Gated, policy-aware interface providing source access, normalized data, and evidence.
 */

import { LightpandaBrowserAdapter } from "./LightpandaBrowserAdapter";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";
import { randomUUID, createHash } from "node:crypto";

export interface ReachFetchRequest {
  readonly queryOrUrl: string;
  readonly type: "URL" | "QUERY";
  readonly maxSources?: number;
  readonly callerFloor?: string;
  readonly intent?: string;
}

export interface ReachTestProvider {
  isTestFixture: true;
  acquire(request: ReachFetchRequest): Promise<EvidenceSource[]>;
}

export class ReachSubsystem {
  private browserAdapter: LightpandaBrowserAdapter;
  private testProvider?: ReachTestProvider;

  constructor(testProvider?: ReachTestProvider) {
    this.browserAdapter = new LightpandaBrowserAdapter();
    this.testProvider = testProvider;
  }

  /**
   * Acquires external sources and returns normalized EvidenceSource array.
   */
  async acquireSources(request: ReachFetchRequest): Promise<EvidenceSource[]> {
    if (this.testProvider) {
      const testSources = await this.testProvider.acquire(request);
      return testSources.map((s) => ({
        ...s,
        extractionMethod: "TEST_FIXTURE" as const,
        sourceStatus: "TEST_FIXTURE" as const,
      }));
    }

    const sources: EvidenceSource[] = [];
    const now = new Date().toISOString();

    if (request.type === "URL" || request.queryOrUrl.startsWith("http://") || request.queryOrUrl.startsWith("https://")) {
      const url = request.queryOrUrl;
      const snapshot = await this.browserAdapter.navigateAndExtract(url);
      const contentHash = createHash("sha256").update(snapshot.textContent, "utf8").digest("hex");
      sources.push({
        id: `src_${randomUUID().substring(0, 8)}`,
        url,
        title: snapshot.title,
        publisher: new URL(url).hostname,
        retrievedAt: now,
        extractionMethod: "BROWSER_DOM",
        snippet: snapshot.textContent.slice(0, 600),
        reliabilityScore: 0.92,
        contentHash,
        sourceStatus: "ONLINE",
        sourceQuality: "TIER_1_PRIMARY",
      });
      return sources;
    }

    // Keyword Query / Trend Exploration Path: Real search API or clean empty list
    const query = request.queryOrUrl;
    const searchApiUrl = process.env.SEARCH_API_URL;

    if (searchApiUrl) {
      try {
        const res = await fetch(`${searchApiUrl}?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results)) {
            for (const item of data.results.slice(0, request.maxSources || 5)) {
              const itemHash = createHash("sha256").update(item.snippet || item.title || "", "utf8").digest("hex");
              sources.push({
                id: `src_${randomUUID().substring(0, 8)}`,
                url: item.url,
                title: item.title,
                publisher: item.publisher || (item.url ? new URL(item.url).hostname : "Search Provider"),
                retrievedAt: now,
                extractionMethod: "API_FEED",
                snippet: (item.snippet || "").slice(0, 600),
                reliabilityScore: typeof item.score === "number" ? item.score : 0.85,
                contentHash: itemHash,
                sourceStatus: "ONLINE",
              });
            }
            return sources;
          }
        }
      } catch (err: any) {
        console.warn(`[ReachSubsystem] Search API query failed: ${err.message}`);
      }
    }

    // When no external search provider is configured, do NOT manufacture synthetic internal domains
    return [];
  }
}
