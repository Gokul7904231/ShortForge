import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvidenceSource } from "../core/contracts/ResearchPassportContracts";
import { DecodoBudgetGovernor } from "../core/research/ReachBudgetGovernor";
import { ReachResearchCache } from "../core/research/ReachCache";
import {
  DecodoFastSearchProvider,
  DecodoWebScrapingProvider,
} from "../core/research/ReachProviders";
import { InMemoryReachTelemetry, ReachProviderRouter } from "../core/research/ReachProviderRouter";
import type { ReachFetchRequest, ReachProvider, ReachProviderRequest, ReachProviderResponse } from "../core/research/ReachContracts";

const CONTRACT = {
  required: true,
  dataRequirements: ["Evidence-backed factual research."],
  queryRules: [
    { queryKind: "TOPIC_SCAN", queryTemplate: "{topic} facts primary sources" },
    { queryKind: "FACT_CHECK", queryTemplate: "{topic} fact check sources" },
  ],
  minSources: 2,
  citationRequired: true,
  freshness: "any" as const,
  sourcePolicy: "F00 evidence boundary",
  agentReachProfile: "engine:quiz",
};

function makeSource(id: string, url: string, provider: string): EvidenceSource {
  return {
    id,
    url,
    title: id,
    publisher: "example.com",
    retrievedAt: new Date().toISOString(),
    extractionMethod: "API_FEED",
    snippet: "evidence",
    reliabilityScore: 0.8,
    contentHash: id,
    sourceStatus: "ONLINE",
    provider,
  };
}

function response(provider: string, sources: EvidenceSource[]): ReachProviderResponse {
  return {
    provider,
    capability: "SEARCH",
    sources,
    requestId: provider + "_req",
    durationMs: 5,
  };
}

function provider(id: string, result: () => Promise<ReachProviderResponse>): ReachProvider {
  return {
    id,
    capabilities: ["SEARCH"],
    async search(_input: ReachProviderRequest) {
      return result();
    },
  };
}

function request(mode?: ReachFetchRequest["mode"]): ReachFetchRequest {
  return {
    engineId: "quiz",
    queryKind: mode === "PRECISION" ? "FACT_CHECK" : "TOPIC_SCAN",
    topic: "quantum computing",
    researchContract: CONTRACT,
    maxSources: 2,
    callerFloor: "floor00_analyst",
    mode,
  };
}

describe("Reach Provider Fabric", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("uses dedicated Decodo credentials for each provider", async () => {
    vi.stubEnv("DECODO_BASIC_AUTH", "legacy-secret");
    vi.stubEnv("DECODO_FAST_SEARCH_API_KEY", "fast-secret");
    vi.stubEnv("DECODO_WEB_SCRAPING_API_KEY", "web-secret");
    vi.stubEnv("DECODO_WEB_API_URL", "https://scraper.example/v2/scrape");

    const calls: Array<{ url: string; authorization: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          authorization: String(
            new Headers(init?.headers).get("Authorization"),
          ),
        });

        return new Response(
          JSON.stringify({
            results: [
              {
                url: "https://example.com/result",
                title: "Example",
                snippet: "evidence",
              },
            ],
            content: "Example page content",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const fast = new DecodoFastSearchProvider();
    await fast.search({
      request: request("PRECISION"),
      renderedQuery: "quantum computing fact check sources",
    });

    const web = new DecodoWebScrapingProvider();
    await web.retrieve({
      request: request("DEEP"),
      renderedQuery: "quantum computing facts primary sources",
      sourceUrl: "https://example.com/result",
    });

    expect(calls[0]?.authorization).toBe("Basic fast-secret");
    expect(calls[1]?.authorization).toBe("Basic web-secret");
    expect(calls[0]?.url).toContain("fastsearch.decodo.com");
    expect(calls[1]?.url).toBe("https://scraper.example/v2/scrape");
  });

  it("uses SearXNG first for normal research", async () => {
    const calls: string[] = [];
    const router = new ReachProviderRouter({
      providers: [
        provider("SEARXNG", async () => {
          calls.push("SEARXNG");
          return response("SEARXNG", [
            makeSource("s1", "https://one.example", "SEARXNG"),
            makeSource("s2", "https://two.example", "SEARXNG"),
          ]);
        }),
        provider("DECODO_FAST_SEARCH", async () => {
          calls.push("DECODO");
          return response("DECODO_FAST_SEARCH", [
            makeSource("d1", "https://three.example", "DECODO_FAST_SEARCH"),
          ]);
        }),
      ],
      budgetGovernor: new DecodoBudgetGovernor({ DECODO_FAST_SEARCH: 10 }),
    });

    const result = await router.acquire(
      request(),
      "quantum computing facts primary sources",
    );

    expect(calls).toEqual(["SEARXNG"]);
    expect(result.sources).toHaveLength(2);
  });

  it("uses Decodo first for precision research", async () => {
    const calls: string[] = [];
    const router = new ReachProviderRouter({
      providers: [
        provider("SEARXNG", async () => {
          calls.push("SEARXNG");
          return response("SEARXNG", [
            makeSource("s1", "https://one.example", "SEARXNG"),
          ]);
        }),
        provider("DECODO_FAST_SEARCH", async () => {
          calls.push("DECODO");
          return response("DECODO_FAST_SEARCH", [
            makeSource("d1", "https://three.example", "DECODO_FAST_SEARCH"),
            makeSource("d2", "https://four.example", "DECODO_FAST_SEARCH"),
          ]);
        }),
      ],
      budgetGovernor: new DecodoBudgetGovernor({ DECODO_FAST_SEARCH: 10 }),
    });

    const result = await router.acquire(
      request("PRECISION"),
      "quantum computing fact check sources",
    );

    expect(calls).toEqual(["DECODO"]);
    expect(result.sources).toHaveLength(2);
  });

  it("falls back to Decodo when SearXNG fails", async () => {
    const calls: string[] = [];
    const router = new ReachProviderRouter({
      providers: [
        provider("SEARXNG", async () => {
          calls.push("SEARXNG");
          throw new Error("SearXNG unavailable");
        }),
        provider("DECODO_FAST_SEARCH", async () => {
          calls.push("DECODO");
          return response("DECODO_FAST_SEARCH", [
            makeSource("d1", "https://three.example", "DECODO_FAST_SEARCH"),
            makeSource("d2", "https://four.example", "DECODO_FAST_SEARCH"),
          ]);
        }),
      ],
      budgetGovernor: new DecodoBudgetGovernor({ DECODO_FAST_SEARCH: 10 }),
      retryCount: 0,
    });

    const result = await router.acquire(
      request(),
      "quantum computing facts primary sources",
    );

    expect(calls).toEqual(["SEARXNG", "DECODO"]);
    expect(result.fallbackCount).toBeGreaterThanOrEqual(1);
  });

  it("skips Decodo when its budget is exhausted and uses SearXNG", async () => {
    const calls: string[] = [];
    const router = new ReachProviderRouter({
      providers: [
        provider("DECODO_FAST_SEARCH", async () => {
          calls.push("DECODO");
          return response("DECODO_FAST_SEARCH", [
            makeSource("d1", "https://three.example", "DECODO_FAST_SEARCH"),
          ]);
        }),
        provider("SEARXNG", async () => {
          calls.push("SEARXNG");
          return response("SEARXNG", [
            makeSource("s1", "https://one.example", "SEARXNG"),
            makeSource("s2", "https://two.example", "SEARXNG"),
          ]);
        }),
      ],
      budgetGovernor: new DecodoBudgetGovernor({ DECODO_FAST_SEARCH: 0 }),
      retryCount: 0,
    });

    const result = await router.acquire(
      request("PRECISION"),
      "quantum computing fact check sources",
    );

    expect(calls).toEqual(["SEARXNG"]);
    expect(result.sources).toHaveLength(2);
  });

  it("uses cache before another provider call", async () => {
    let calls = 0;
    const cache = new ReachResearchCache();
    const router = new ReachProviderRouter({
      cache,
      providers: [
        provider("SEARXNG", async () => {
          calls += 1;
          return response("SEARXNG", [
            makeSource("s1", "https://one.example", "SEARXNG"),
            makeSource("s2", "https://two.example", "SEARXNG"),
          ]);
        }),
      ],
    });

    const first = await router.acquire(
      request(),
      "quantum computing facts primary sources",
    );
    const second = await router.acquire(
      request(),
      "quantum computing facts primary sources",
    );

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(calls).toBe(1);
  });



  it("defaults Decodo web retrieval to standard/non-JS budget mode", () => {
    const provider = new DecodoWebScrapingProvider(
      "https://example.invalid",
      "test-auth",
    );

    expect(provider.budgetCapability()).toBe("DECODO_WEB_STANDARD");
  });

  it("corroborates with both providers and deduplicates the same URL", async () => {
    const telemetry = new InMemoryReachTelemetry();
    const router = new ReachProviderRouter({
      telemetry,
      providers: [
        provider("SEARXNG", async () =>
          response("SEARXNG", [
            makeSource("s1", "https://same.example", "SEARXNG"),
            makeSource("s2", "https://two.example", "SEARXNG"),
          ]),
        ),
        provider("DECODO_FAST_SEARCH", async () =>
          response("DECODO_FAST_SEARCH", [
            makeSource("d1", "https://same.example", "DECODO_FAST_SEARCH"),
            makeSource("d2", "https://three.example", "DECODO_FAST_SEARCH"),
          ]),
        ),
      ],
      budgetGovernor: new DecodoBudgetGovernor({ DECODO_FAST_SEARCH: 10 }),
    });

    const result = await router.acquire(
      { ...request(), mode: "CORROBORATION" },
      "quantum computing facts primary sources",
    );

    expect(result.providersUsed).toEqual([
      "SEARXNG",
      "DECODO_FAST_SEARCH",
    ]);
    expect(result.sources).toHaveLength(3);
    expect(
      telemetry.list().some(
        (event: any) => event.type === "PROVIDER_SUCCESS",
      ),
    ).toBe(true);
  });
});
