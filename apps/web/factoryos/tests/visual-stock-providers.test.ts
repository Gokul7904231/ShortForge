import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PexafyProvider,
  PexelsProvider,
  PixabayProvider,
  ProviderFramework,
} from "../../lib/visual-assets/ProviderFramework";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ShortForge stock visual acquisition providers", () => {
  it("registers stock providers without making them implicit default choices", () => {
    const framework = new ProviderFramework();
    expect(framework.getProvider("pexels")).toBeInstanceOf(PexelsProvider);
    expect(framework.getProvider("pixabay")).toBeInstanceOf(PixabayProvider);
    expect(framework.getProvider("pexafy")).toBeInstanceOf(PexafyProvider);
    expect(framework.getProvider("unrequested-provider")).toBeUndefined();
  });

  it("normalizes Pexels search results with source and attribution metadata", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-test-key");
    const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(new URL(String(url)).pathname).toBe("/v1/search");
      expect(new URL(String(url)).searchParams.get("query")).toBe("vertical city");
      expect(new Headers(init?.headers).get("Authorization")).toBe("pexels-test-key");
      return new Response(JSON.stringify({
        photos: [{
          id: 42,
          width: 1080,
          height: 1920,
          url: "https://www.pexels.com/photo/42/",
          photographer: "Ada Example",
          alt: "A vertical skyline",
          src: { original: "https://images.example/42.jpg" },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", mock);

    const [asset] = await new PexelsProvider().search("vertical city", 3);
    expect(asset.source).toBe("pexels");
    expect(asset.author).toBe("Ada Example");
    expect(asset.sourceUrl).toBe("https://www.pexels.com/photo/42/");
    expect(asset.originalUrl).toBe("https://images.example/42.jpg");
    expect(asset.license).toBe("Pexels License");
    expect(asset.attributionRequired).toBe(true);
    expect(asset.usagePolicy?.materialization).toBe("DOWNLOAD_TO_CAS");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("enforces Pixabay safe search and preserves the content licence/source", async () => {
    vi.stubEnv("PIXABAY_API_KEY", "pixabay-test-key");
    const mock = vi.fn(async (url: string | URL) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe("/api/");
      expect(parsed.searchParams.get("key")).toBe("pixabay-test-key");
      expect(parsed.searchParams.get("safesearch")).toBe("true");
      expect(parsed.searchParams.get("image_type")).toBe("photo");
      return new Response(JSON.stringify({
        hits: [{
          id: 99,
          pageURL: "https://pixabay.com/images/id-99/",
          user: "Pixabay Creator",
          tags: "city, skyline",
          imageWidth: 1920,
          imageHeight: 1080,
          largeImageURL: "https://cdn.example/99.jpg",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", mock);

    const [asset] = await new PixabayProvider().search("city skyline", 3);
    expect(asset.source).toBe("pixabay");
    expect(asset.license).toBe("Pixabay Content License");
    expect(asset.author).toBe("Pixabay Creator");
    expect(asset.sourceUrl).toBe("https://pixabay.com/images/id-99/");
    expect(asset.originalUrl).toBe("https://cdn.example/99.jpg");
    expect(asset.tags).toEqual(["city", "skyline"]);
    expect(asset.usagePolicy?.materialization).toBe("DOWNLOAD_TO_CAS");
  });

  it("uses Pexafy semantic search and preserves returned licence/attribution data", async () => {
    vi.stubEnv("PEXAFY_API_KEY", "pexafy-test-key");
    const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(new URL(String(url)).pathname).toBe("/api/v1/search/photos");
      expect(new URL(String(url)).searchParams.get("q")).toBe("calm city");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("pexafy-test-key");
      return new Response(JSON.stringify({
        data: [{
          photo_id: "p1",
          urls: { full: "https://cdn.example/p1.jpg" },
          width: 1200,
          height: 1800,
          photographer_username: "Pexafy Creator",
          source: "Pexels",
          license_type: "free",
          description: "A calm vertical city scene",
          relevance_score: 0.8,
          attribution: { plain: "Photo by Pexafy Creator" },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", mock);

    const [asset] = await new PexafyProvider().search("calm city", 2);
    expect(asset.source).toBe("pexafy");
    expect(asset.license).toBe("free");
    expect(asset.author).toBe("Pexafy Creator");
    expect(asset.credits).toBe("Photo by Pexafy Creator");
    expect(asset.originalUrl).toBe("https://cdn.example/p1.jpg");
    expect(asset.usagePolicy?.materialization).toBe("DOWNLOAD_TO_CAS");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when stock-provider credentials are absent", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    vi.stubEnv("PIXABAY_API_KEY", "");
    vi.stubEnv("PEXAFY_API_KEY", "");

    expect(await new PexelsProvider().search("x", 3)).toEqual([]);
    expect(await new PixabayProvider().search("x", 3)).toEqual([]);
    expect(await new PexafyProvider().search("x", 3)).toEqual([]);
  });
});
