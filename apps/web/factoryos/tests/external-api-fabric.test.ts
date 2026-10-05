import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExternalApiRegistry,
} from "../core/integrations/external/ExternalApiRegistry";
import {
  OpenAlexProvider,
  ArxivProvider,
  SemanticScholarProvider,
  CrossrefProvider,
  UnpaywallProvider,
} from "../core/integrations/external/AcademicResearchProviders";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("External API registry", () => {
  it("contains the requested research and MCP provider set", () => {
    const ids = new Set(
      ExternalApiRegistry.list().map((provider) => provider.id),
    );

    for (const id of [
      "openalex",
      "arxiv",
      "semantic_scholar",
      "crossref",
      "unpaywall",
      "perplexity_mcp",
      "pexels",
      "pixabay",
      "pexafy",
      "arcmira",
      "transcriptyt",
      "vidwords",
      "tubetotranscript",
      "youtube_data_api",
      "gemini",
      "groq",
      "openrouter",
      "huggingface",
      "ibm_tts",
      "audexum",
      "speak_ai",
      "freesound",
      "ocr_space",
      "perspective",
      "google_safe_browsing",
      "urlscan",
      "open_meteo",
      "nominatim",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("does not present the unverified VidWords provider as implemented", () => {
    expect(
      ExternalApiRegistry.get("vidwords")?.lifecycle,
    ).toBe("UNVERIFIED");
  });

  it("does not present the legacy Hugging Face stub as production-ready", () => {
    expect(
      ExternalApiRegistry.get("huggingface")?.lifecycle,
    ).toBe("PARTIAL");
  });
});

describe("Academic research provider adapters", () => {
  it("normalizes OpenAlex work results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                id: "https://openalex.org/W1",
                doi: "https://doi.org/10.1234/example",
                display_name: "Example Research",
                publication_year: 2026,
                primary_location: {
                  landing_page_url: "https://example.org/paper",
                },
                authorships: [
                  { author: { display_name: "Ada Example" } },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await new OpenAlexProvider().search({
      request: {
        engineId: "f00",
        queryKind: "TOPIC_SCAN",
        topic: "example",
        researchContract: {} as any,
        maxSources: 3,
      },
      renderedQuery: "example",
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].provider).toBe("OPENALEX");
    expect(result.sources[0].url).toBe(
      "https://doi.org/10.1234/example",
    );
  });

  it("parses arXiv Atom entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          [
            "<feed>",
            "<entry>",
            "<id>https://arxiv.org/abs/1234.5678</id>",
            "<title>Test Paper</title>",
            "<summary>A useful summary.</summary>",
            "<author><name>Ada Lovelace</name></author>",
            "</entry>",
            "</feed>",
          ].join(""),
          {
            status: 200,
            headers: { "content-type": "application/atom+xml" },
          },
        ),
      ),
    );

    const result = await new ArxivProvider().search({
      request: {
        engineId: "f00",
        queryKind: "TOPIC_SCAN",
        topic: "example",
        researchContract: {} as any,
        maxSources: 3,
      },
      renderedQuery: "machine learning",
    });

    expect(result.sources[0].url).toBe(
      "https://arxiv.org/abs/1234.5678",
    );
    expect(result.sources[0].title).toBe("Test Paper");
  });

  it("uses Semantic Scholar x-api-key when configured", async () => {
    process.env.SEMANTIC_SCHOLAR_API_KEY = "test-key";
    const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("paper/search");
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
        "test-key",
      );
      return new Response(
        JSON.stringify({
          data: [
            {
              paperId: "P1",
              title: "Paper one",
              url: "https://www.semanticscholar.org/paper/P1",
              year: 2026,
              authors: [{ name: "Ada" }],
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", mock);

    const result = await new SemanticScholarProvider().search({
      request: {
        engineId: "f00",
        queryKind: "TOPIC_SCAN",
        topic: "example",
        researchContract: {} as any,
        maxSources: 3,
      },
      renderedQuery: "example",
    });

    expect(result.sources).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("uses the Crossref polite pool when an email is configured", async () => {
    process.env.CROSSREF_MAILTO = "research@example.com";
    const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("mailto=research%40example.com");
      expect(
        (init?.headers as Record<string, string>)["User-Agent"],
      ).toContain("research@example.com");
      return new Response(
        JSON.stringify({
          message: {
            items: [
              {
                DOI: "10.1234/example",
                URL: "https://doi.org/10.1234/example",
                title: ["Example Crossref"],
                author: [{ given: "Ada", family: "Lovelace" }],
                published: { "date-parts": [[2026]] },
              },
            ],
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", mock);

    const result = await new CrossrefProvider().search({
      request: {
        engineId: "f00",
        queryKind: "TOPIC_SCAN",
        topic: "example",
        researchContract: {} as any,
        maxSources: 3,
      },
      renderedQuery: "example",
    });

    expect(result.sources[0].url).toBe(
      "https://doi.org/10.1234/example",
    );
  });

  it("fails closed for Unpaywall without a DOI/email", async () => {
    await expect(
      new UnpaywallProvider().search({
        request: {
          engineId: "f00",
          queryKind: "TOPIC_SCAN",
          topic: "example",
          researchContract: {} as any,
        },
        renderedQuery: "example",
      }),
    ).rejects.toThrow(/requires parameters\.doi/);
  });
});
