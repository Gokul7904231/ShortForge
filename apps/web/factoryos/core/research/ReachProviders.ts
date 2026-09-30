import { createHash, randomUUID } from "node:crypto";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";
import type {
  ReachProvider,
  ReachProviderRequest,
  ReachProviderResponse,
} from "./ReachContracts";
import { ReachProviderError } from "./ReachContracts";

function makeContentHash(text: string): string {
  return createHash("sha256").update(text || "", "utf8").digest("hex");
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function sourceFromSearchItem(
  item: Record<string, unknown>,
  provider: string,
  renderedQuery: string,
  providerRequestId: string,
): EvidenceSource | null {
  const url =
    typeof item.url === "string"
      ? item.url
      : typeof item.link === "string"
        ? item.link
        : "";

  if (!url) return null;

  const title =
    typeof item.title === "string"
      ? item.title
      : typeof item.name === "string"
        ? item.name
        : renderedQuery;

  const snippet =
    typeof item.snippet === "string"
      ? item.snippet
      : typeof item.description === "string"
        ? item.description
        : "";

  return {
    id: "src_" + randomUUID().slice(0, 8),
    url,
    title: title.slice(0, 300),
    publisher:
      typeof item.publisher === "string"
        ? item.publisher
        : typeof item.source === "string"
          ? item.source
          : hostname(url),
    retrievedAt: new Date().toISOString(),
    extractionMethod: "API_FEED",
    snippet: snippet.slice(0, 600),
    reliabilityScore:
      typeof item.score === "number"
        ? Math.max(0, Math.min(1, item.score))
        : 0.75,
    contentHash: makeContentHash(snippet || title),
    sourceStatus: "ONLINE",
    provider,
    providerRequestId,
    renderedQuery,
  };
}

function readResults(data: any): Record<string, unknown>[] {
  const candidates: unknown[] = [
    data?.results,
    data?.organic,
    data?.results?.organic,
    data?.results?.results?.organic,
    data?.results?.[0]?.content?.results?.results?.organic,
    data?.results?.[0]?.content?.results?.organic,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object",
      );
    }
  }

  return [];
}

function extractPageText(data: any): string {
  const candidates = [
    data?.content,
    data?.markdown,
    data?.html,
    data?.results?.[0]?.content,
    data?.results?.[0]?.markdown,
    data?.results?.[0]?.html,
    data?.results?.[0]?.content?.markdown,
    data?.results?.[0]?.content?.html,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function authHeader(auth: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: auth.startsWith("Basic ") ? auth : "Basic " + auth,
  };
}

export class SearXNGProvider implements ReachProvider {
  readonly id = "SEARXNG" as const;
  readonly capabilities = ["SEARCH"] as const;

  private readonly baseUrl: string;

  constructor(baseUrl = process.env.SEARXNG_BASE_URL || "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async search(input: ReachProviderRequest): Promise<ReachProviderResponse> {
    if (!this.baseUrl) {
      throw new ReachProviderError("SEARXNG_BASE_URL is not configured.");
    }

    const requestId = "searx_" + randomUUID().slice(0, 8);
    const started = Date.now();
    const url = new URL(this.baseUrl + "/search");

    url.searchParams.set("q", input.renderedQuery);
    url.searchParams.set("format", "json");

    const language = input.request.parameters?.language;
    const timeRange = input.request.parameters?.time_range;
    const engines = input.request.parameters?.engines;

    if (language) url.searchParams.set("language", language);
    if (timeRange) url.searchParams.set("time_range", timeRange);
    if (engines) url.searchParams.set("engines", engines);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "SearXNG returned HTTP " + response.status + ".",
          {
            retryable: response.status === 429 || response.status >= 500,
            status: response.status,
          },
        );
      }

      const data = await response.json();
      const maxSources = Math.min(
        Math.max(Math.floor(input.request.maxSources ?? 5), 1),
        20,
      );

      const sources = readResults(data)
        .slice(0, maxSources)
        .map((item) =>
          sourceFromSearchItem(
            item,
            this.id,
            input.renderedQuery,
            requestId,
          ),
        )
        .filter((source): source is EvidenceSource => !!source);

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof ReachProviderError) throw error;
      throw new ReachProviderError(
        error instanceof Error ? error.message : "SearXNG request failed.",
        { retryable: true },
      );
    }
  }
}

export class DecodoFastSearchProvider implements ReachProvider {
  readonly id = "DECODO_FAST_SEARCH" as const;
  readonly capabilities = ["SEARCH"] as const;

  private readonly endpoint: string;
  private readonly auth: string;

  constructor(
    endpoint = process.env.DECODO_FAST_SEARCH_URL ||
      "https://fastsearch.decodo.com/v0/search",
    auth = process.env.DECODO_BASIC_AUTH || "",
  ) {
    this.endpoint = endpoint;
    this.auth = auth;
  }

  async search(input: ReachProviderRequest): Promise<ReachProviderResponse> {
    if (!this.auth) {
      throw new ReachProviderError("DECODO_BASIC_AUTH is not configured.");
    }

    const requestId = "decodo_search_" + randomUUID().slice(0, 8);
    const started = Date.now();

    const payload: Record<string, string> = {
      query: input.renderedQuery,
    };

    if (input.request.parameters?.geo) {
      payload.geo = input.request.parameters.geo;
    }

    if (input.request.parameters?.gl) {
      payload.gl = input.request.parameters.gl;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: authHeader(this.auth),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "Decodo Fast Search returned HTTP " + response.status + ".",
          {
            retryable: response.status === 429 || response.status >= 500,
            status: response.status,
          },
        );
      }

      const data = await response.json();
      const maxSources = Math.min(
        Math.max(Math.floor(input.request.maxSources ?? 5), 1),
        20,
      );

      const sources = readResults(data)
        .slice(0, maxSources)
        .map((item) =>
          sourceFromSearchItem(
            item,
            this.id,
            input.renderedQuery,
            requestId,
          ),
        )
        .filter((source): source is EvidenceSource => !!source);

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof ReachProviderError) throw error;
      throw new ReachProviderError(
        error instanceof Error ? error.message : "Decodo Fast Search failed.",
        { retryable: true },
      );
    }
  }
}

export class DecodoWebScrapingProvider implements ReachProvider {
  readonly id = "DECODO_WEB_SCRAPE" as const;
  readonly capabilities = ["WEB_RETRIEVE"] as const;

  private readonly endpoint: string;
  private readonly auth: string;
  private readonly proxyPool: "standard" | "premium";
  private readonly headless: "html" | "none";

  constructor(
    endpoint = process.env.DECODO_WEB_API_URL ||
      "https://scraper-api.decodo.com/v2/scrape",
    auth = process.env.DECODO_BASIC_AUTH || "",
    proxyPool =
      process.env.DECODO_WEB_PROXY_POOL === "premium"
        ? "premium"
        : "standard",
    headless =
      process.env.DECODO_WEB_HEADLESS === "none" ? "none" : "html",
  ) {
    this.endpoint = endpoint;
    this.auth = auth;
    this.proxyPool = proxyPool;
    this.headless = headless;
  }

  budgetCapability() {
    if (this.proxyPool === "premium" && this.headless === "html") {
      return "DECODO_WEB_PREMIUM_JS" as const;
    }
    if (this.proxyPool === "premium") {
      return "DECODO_WEB_PREMIUM" as const;
    }
    if (this.headless === "html") {
      return "DECODO_WEB_JS" as const;
    }
    return "DECODO_WEB_STANDARD" as const;
  }

  async retrieve(input: ReachProviderRequest): Promise<ReachProviderResponse> {
    if (!this.auth) {
      throw new ReachProviderError("DECODO_BASIC_AUTH is not configured.");
    }

    if (!input.sourceUrl) {
      throw new ReachProviderError(
        "Decodo web retrieval requires a source URL discovered by Reach.",
      );
    }

    const requestId = "decodo_web_" + randomUUID().slice(0, 8);
    const started = Date.now();

    const payload: Record<string, string> = {
      target: "universal",
      url: input.sourceUrl,
      proxy_pool: this.proxyPool,
      headless: this.headless,
    };

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: authHeader(this.auth),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "Decodo Web Scraping returned HTTP " + response.status + ".",
          {
            retryable: response.status === 429 || response.status >= 500,
            status: response.status,
          },
        );
      }

      const data = await response.json();
      const pageText = extractPageText(data);

      const source: EvidenceSource = {
        id: "src_" + randomUUID().slice(0, 8),
        url: input.sourceUrl,
        title: hostname(input.sourceUrl),
        publisher: hostname(input.sourceUrl),
        retrievedAt: new Date().toISOString(),
        extractionMethod: "HTTP_SCRAPE",
        snippet: pageText.slice(0, 600),
        reliabilityScore: 0.8,
        contentHash: makeContentHash(pageText),
        sourceStatus: "ONLINE",
        provider: this.id,
        providerRequestId: requestId,
        renderedQuery: input.renderedQuery,
      };

      return {
        provider: this.id,
        capability: "WEB_RETRIEVE",
        sources: pageText ? [source] : [],
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof ReachProviderError) throw error;
      throw new ReachProviderError(
        error instanceof Error
          ? error.message
          : "Decodo Web Scraping failed.",
        { retryable: true },
      );
    }
  }
}
