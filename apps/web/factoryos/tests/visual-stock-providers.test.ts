import { afterEach, describe, expect, it, vi } from "vitest";
import { PexafyProvider, PexelsProvider, PixabayProvider } from "../../lib/visual-assets/StockVisualProviders";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Stock visual acquisition providers", () => {
  it("normalizes Pexels attribution metadata", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-test");
    const mock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("pexels-test");
      return new Response(
        JSON.stringify({
          photos: [
            {
              id: 42,
              width: 1080,
              height: 1920,
              url: "https://www.pexels.com/photo/42/",
              photographer: "Ada Example",
              src: { large: "https://images.example/42.jpg" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", mock);

    const result = await new PexelsProvider().search("vertical city skyline", 3);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("pexels");
    expect(result[0].attributionRequired).toBe(true);
    expect(result[0].author).toBe("Ada Example");
    expect(result[0].sourceUrl).toBe("https://www.pexels.com/photo/42/");
  });

  it("normalizes Pixabay license/source metadata and safe search", async () => {
    vi.stubEnv("PIXABAY_API_KEY", "pixabay-test");
    const mock = vi.fn(async (url: string | URL) => {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get("key")).toBe("pixabay-test");
      expect(parsed.searchParams.get("safesearch")).toBe("true");
      return new Response(
        JSON.stringify({
          hits: [
            {
              id: 99,
              pageURL: "https://pixabay.com/images/id-99/",
              user: "Pixabay Creator",
              tags: "city, skyline",
              imageWidth: 1920,
              imageHeight: 1080,
              largeImageURL: "https://cdn.example/99.jpg",
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", mock);

    const result = await new PixabayProvider().search("city skyline", 3);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("pixabay");
    expect(result[0].license).toBe("Pixabay Content License");
    expect(result[0].author).toBe("Pixabay Creator");
    expect(result[0].attributionRequired).toBe(true);
    expect(result[0].tags).toEqual(["city", "skyline"]);
  });

  it("uses Pexafy semantic search and preserves provider license/attribution", async () => {
    vi.stubEnv("PEXAFY_API_KEY", "pexafy-test");
    const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("x-api-key")).toBe("pexafy-test");
      expect(new URL(String(url)).pathname).toBe("/api/v1/search/photos");
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              photo_id: "p1",
              image_url: "https://cdn.example/p1.jpg",
              width: 1200,
              height: 1800,
              photographer_full_name: "Pexafy Creator",
              photographer_url: "https://pexafy.com/p/Pexafy-Creator",
              source: "Pexels",
              license_type: "free",
              source_image_url: "https://www.pexels.com/photo/1/",
              description: "A calm vertical city scene",
              relevance_score: 0.8,
              attribution: { plain: "Photo by Pexafy Creator" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", mock);

    const result = await new PexafyProvider().search("calm city scene", 2);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("pexafy");
    expect(result[0].license).toBe("free");
    expect(result[0].credits).toBe("Photo by Pexafy Creator");
    expect(result[0].sourceUrl).toContain("pexafy.com/p/");
  });

  it("fails closed when a stock API credential is absent", async () => {
    expect(await new PexelsProvider().search("x", 3)).toEqual([]);
    expect(await new PixabayProvider().search("x", 3)).toEqual([]);
    expect(await new PexafyProvider().search("x", 3)).toEqual([]);
  });
});
