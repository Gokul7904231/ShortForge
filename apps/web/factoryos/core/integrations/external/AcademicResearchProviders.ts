import { createHash, randomUUID } from "node:crypto";
import type { EvidenceSource } from "../../contracts/ResearchPassportContracts";
import type {
  ReachProvider,
  ReachProviderRequest,
  ReachProviderResponse,
} from "../../research/ReachContracts";
import { ReachProviderError } from "../../research/ReachContracts";

const MAX_RESULTS = 10;

function contentHash(value: string): string {
  return createHash("sha256").update(value || "", "utf8").digest("hex");
}

function source(
  provider: string,
  url: string,
  title: string,
  snippet: string,
  requestId: string,
): EvidenceSource {
  return {
    id: "src_" + randomUUID().slice(0, 8),
    url,
    title: title.slice(0, 300),
    publisher: provider,
    retrievedAt: new Date().toISOString(),
    extractionMethod: "API_FEED",
    snippet: snippet.slice(0, 600),
    reliabilityScore: 0.85,
    isPrimarySource: false,
    contentHash: contentHash(snippet || title),
    sourceStatus: "ONLINE",
    provider,
    providerRequestId: requestId,
  };
}

function fail(provider: string, error: unknown): never {
  if (error instanceof ReachProviderError) throw error;
  throw new ReachProviderError(
    provider +
      " request failed: " +
      (error instanceof Error ? error.message : String(error)),
    { retryable: true },
  );
}

export class OpenAlexProvider implements ReachProvider {
  readonly id = "OPENALEX" as const;
  readonly capabilities = ["SEARCH"] as const;

  async search(
    input: ReachProviderRequest,
  ): Promise<ReachProviderResponse> {
    const requestId = "openalex_" + randomUUID().slice(0, 8);
    const started = Date.now();
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", input.renderedQuery);
    url.searchParams.set(
      "per-page",
      String(
        Math.min(
          Math.max(Number(input.request.maxSources ?? MAX_RESULTS), 1),
          MAX_RESULTS,
        ),
      ),
    );

    const mailto = process.env.OPENALEX_EMAIL?.trim();
    if (mailto) url.searchParams.set("mailto", mailto);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "OpenAlex returned HTTP " + response.status + ".",
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      }

      const data: any = await response.json();
      const sources = Array.isArray(data?.results)
        ? data.results
            .slice(0, MAX_RESULTS)
            .map((work: any) => {
              const doi =
                typeof work?.doi === "string" ? work.doi : "";
              const urlValue =
                doi ||
                work?.primary_location?.landing_page_url ||
                work?.id ||
                "";

              if (!urlValue) return null;

              const title =
                work?.display_name ||
                work?.title ||
                "OpenAlex work";

              const authors = Array.isArray(work?.authorships)
                ? work.authorships
                    .slice(0, 4)
                    .map((a: any) => a?.author?.display_name)
                    .filter(Boolean)
                    .join(", ")
                : "";

              const snippet = [
                authors ? "Authors: " + authors : "",
                work?.publication_year
                  ? "Year: " + work.publication_year
                  : "",
                work?.primary_location?.source?.display_name
                  ? "Venue: " +
                    work.primary_location.source.display_name
                  : "",
                work?.abstract_inverted_index
                  ? "Abstract available."
                  : "",
              ]
                .filter(Boolean)
                .join(" | ");

              return source(
                this.id,
                urlValue,
                title,
                snippet,
                requestId,
              );
            })
            .filter((item: EvidenceSource | null): item is EvidenceSource => Boolean(item))
        : [];

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return fail(this.id, error);
    }
  }
}

export class ArxivProvider implements ReachProvider {
  readonly id = "ARXIV" as const;
  readonly capabilities = ["SEARCH"] as const;

  async search(
    input: ReachProviderRequest,
  ): Promise<ReachProviderResponse> {
    const requestId = "arxiv_" + randomUUID().slice(0, 8);
    const started = Date.now();
    const url = new URL("https://export.arxiv.org/api/query");
    url.searchParams.set(
      "search_query",
      "all:" + input.renderedQuery,
    );
    url.searchParams.set("start", "0");
    url.searchParams.set(
      "max_results",
      String(
        Math.min(
          Math.max(Number(input.request.maxSources ?? MAX_RESULTS), 1),
          MAX_RESULTS,
        ),
      ),
    );
    url.searchParams.set("sortBy", "relevance");

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/atom+xml, application/xml" },
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "arXiv returned HTTP " + response.status + ".",
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      }

      const xml = await response.text();
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
        .slice(0, MAX_RESULTS)
        .map((match) => match[1]);

      const unescapeXml = (value: string): string =>
        value
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

      const field = (
        entry: string,
        name: string,
      ): string => {
        const match = entry.match(
          new RegExp(
            "<" +
              name +
              "[^>]*>([\\s\\S]*?)</" +
              name +
              ">",
          ),
        );
        return match ? unescapeXml(match[1].trim()) : "";
      };

      const sources = entries
        .map((entry) => {
          const title = field(entry, "title") || "arXiv paper";
          const summary = field(entry, "summary");
          const id = field(entry, "id");
          const authors = [
            ...entry.matchAll(
              /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g,
            ),
          ]
            .slice(0, 4)
            .map((match) => unescapeXml(match[1].trim()))
            .join(", ");

          if (!id) return null;

          return source(
            this.id,
            id,
            title.replace(/\s+/g, " "),
            [
              authors ? "Authors: " + authors : "",
              summary
                ? summary.replace(/\s+/g, " ").slice(0, 450)
                : "",
            ]
              .filter(Boolean)
              .join(" | "),
            requestId,
          );
        })
        .filter((item: EvidenceSource | null): item is EvidenceSource => Boolean(item));

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return fail(this.id, error);
    }
  }
}

export class SemanticScholarProvider implements ReachProvider {
  readonly id = "SEMANTIC_SCHOLAR" as const;
  readonly capabilities = ["SEARCH"] as const;

  async search(
    input: ReachProviderRequest,
  ): Promise<ReachProviderResponse> {
    const requestId = "s2_" + randomUUID().slice(0, 8);
    const started = Date.now();
    const url = new URL(
      "https://api.semanticscholar.org/graph/v1/paper/search",
    );
    url.searchParams.set("query", input.renderedQuery);
    url.searchParams.set(
      "limit",
      String(
        Math.min(
          Math.max(Number(input.request.maxSources ?? MAX_RESULTS), 1),
          MAX_RESULTS,
        ),
      ),
    );
    url.searchParams.set(
      "fields",
      "paperId,title,abstract,url,year,authors,externalIds",
    );

    const key = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...(key ? { "x-api-key": key } : {}),
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "Semantic Scholar returned HTTP " +
            response.status +
            ".",
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      }

      const data: any = await response.json();
      const sources = Array.isArray(data?.data)
        ? data.data
            .map((paper: any) => {
              const urlValue =
                typeof paper?.url === "string"
                  ? paper.url
                  : paper?.paperId
                    ? "https://www.semanticscholar.org/paper/" +
                      paper.paperId
                    : "";

              if (!urlValue) return null;

              const authors = Array.isArray(paper?.authors)
                ? paper.authors
                    .slice(0, 4)
                    .map((a: any) => a?.name)
                    .filter(Boolean)
                    .join(", ")
                : "";

              return source(
                this.id,
                urlValue,
                paper?.title || "Semantic Scholar paper",
                [
                  paper?.year ? "Year: " + paper.year : "",
                  authors ? "Authors: " + authors : "",
                  paper?.abstract || "",
                ]
                  .filter(Boolean)
                  .join(" | "),
                requestId,
              );
            })
            .filter((item: EvidenceSource | null): item is EvidenceSource => Boolean(item))
        : [];

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return fail(this.id, error);
    }
  }
}

export class CrossrefProvider implements ReachProvider {
  readonly id = "CROSSREF" as const;
  readonly capabilities = ["SEARCH"] as const;

  async search(
    input: ReachProviderRequest,
  ): Promise<ReachProviderResponse> {
    const requestId = "crossref_" + randomUUID().slice(0, 8);
    const started = Date.now();
    const url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query.bibliographic", input.renderedQuery);
    url.searchParams.set(
      "rows",
      String(
        Math.min(
          Math.max(Number(input.request.maxSources ?? MAX_RESULTS), 1),
          MAX_RESULTS,
        ),
      ),
    );
    url.searchParams.set(
      "select",
      "DOI,title,URL,author,published,container-title,abstract",
    );

    const mailto =
      process.env.CROSSREF_MAILTO?.trim() ||
      process.env.CROSSREF_EMAIL?.trim();

    if (mailto) url.searchParams.set("mailto", mailto);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": mailto
            ? "ShortForge/ExternalApiFabric (mailto:" + mailto + ")"
            : "ShortForge/ExternalApiFabric",
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "Crossref returned HTTP " + response.status + ".",
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      }

      const data: any = await response.json();
      const items = data?.message?.items;

      const sources = Array.isArray(items)
        ? items
            .map((item: any) => {
              const doi =
                typeof item?.DOI === "string"
                  ? item.DOI
                  : "";
              const urlValue =
                typeof item?.URL === "string"
                  ? item.URL
                  : doi
                    ? "https://doi.org/" + doi
                    : "";

              if (!urlValue) return null;

              const authors = Array.isArray(item?.author)
                ? item.author
                    .slice(0, 4)
                    .map((a: any) =>
                      [a?.given, a?.family]
                        .filter(Boolean)
                        .join(" "),
                    )
                    .filter(Boolean)
                    .join(", ")
                : "";

              return source(
                this.id,
                urlValue,
                Array.isArray(item?.title)
                  ? item.title[0] || "Crossref work"
                  : "Crossref work",
                [
                  authors ? "Authors: " + authors : "",
                  Array.isArray(item?.["container-title"])
                    ? item?.["container-title"]?.[0]
                    : "",
                  item?.published?.["date-parts"]?.[0]?.[0]
                    ? "Year: " +
                      item.published["date-parts"][0][0]
                    : "",
                  typeof item?.abstract === "string"
                    ? item.abstract
                    : "",
                ]
                  .filter(Boolean)
                  .join(" | "),
                requestId,
              );
            })
            .filter((item: EvidenceSource | null): item is EvidenceSource => Boolean(item))
        : [];

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return fail(this.id, error);
    }
  }
}

export class UnpaywallProvider implements ReachProvider {
  readonly id = "UNPAYWALL" as const;
  readonly capabilities = ["SEARCH"] as const;

  async search(
    input: ReachProviderRequest,
  ): Promise<ReachProviderResponse> {
    const doi = input.request.parameters?.doi?.trim();
    if (!doi) {
      throw new ReachProviderError(
        "Unpaywall requires parameters.doi for DOI enrichment.",
      );
    }

    const email =
      process.env.UNPAYWALL_EMAIL?.trim() ||
      process.env.CROSSREF_MAILTO?.trim();

    if (!email) {
      throw new ReachProviderError(
        "UNPAYWALL_EMAIL is required for Unpaywall API access.",
      );
    }

    const requestId = "unpaywall_" + randomUUID().slice(0, 8);
    const started = Date.now();
    const url =
      "https://api.unpaywall.org/v2/" +
      encodeURIComponent(doi) +
      "?email=" +
      encodeURIComponent(email);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) {
        throw new ReachProviderError(
          "Unpaywall returned HTTP " + response.status + ".",
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
          },
        );
      }

      const data: any = await response.json();
      const bestOaLocation =
        data?.best_oa_location?.url_for_pdf ||
        data?.best_oa_location?.url_for_landing_page ||
        "";

      const landing =
        data?.doi_url ||
        data?.best_oa_location?.url_for_landing_page ||
        bestOaLocation;

      const snippet = [
        data?.is_oa ? "Open access: yes." : "Open access: no.",
        data?.journal_is_oa
          ? "Journal is open access."
          : "",
        bestOaLocation
          ? "Open-access full text candidate available."
          : "No OA full-text location returned.",
      ]
        .filter(Boolean)
        .join(" ");

      const sources = landing
        ? [
            source(
              this.id,
              landing,
              data?.title || "Unpaywall DOI enrichment",
              snippet,
              requestId,
            ),
          ]
        : [];

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return fail(this.id, error);
    }
  }
}
