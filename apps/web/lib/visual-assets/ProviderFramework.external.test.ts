import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PexafyProvider,
  PexelsProvider,
  PixabayProvider,
} from "./ProviderFramework";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("governed stock visual adapters", () => {
  it("normalizes Pexels photo results and preserves attribution", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-test");
    const fetchMock = vi.fn(
      async (_url: string | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("Authorization")).toBe("pexels-test");
        return new Response(
          JSON.stringify({
            photos: [{
              id: 42,
              width: 2160,
              height: 3240,
              url: "https://www.pexels.com/photo/42/",
              photographer: "Ada",
              alt: "mountain sunrise",
              src: { original: "https://images.pexels.com/photos/42/original.jpeg" }
            }]
          }),
          { status: 200 }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const [asset] = await new PexelsProvider().search("mountain sunrise", 1);

    expect(asset.source).toBe("pexels");
    expect(asset.originalUrl).toContain("pexels.com");
    expect(asset.attributionRequired).toBe(true);
    expect(asset.usagePolicy?.materialization).toBe("DOWNLOAD_TO_CAS");
    expect(asset.credits).toContain("Ada");
  });

  it("normalizes Pixabay hits and records its download-to-server constraint", async () => {
    vi.stubEnv("PIXABAY_API_KEY", "pixabay-test");
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("pixabay.com/api/");
      expect(String(url)).toContain("key=pixabay-test");
      return new Response(
        JSON.stringify({
          hits: [{
            id: 7,
            pageURL: "https://pixabay.com/photos/7/",
            largeImageURL: "https://cdn.example/large.jpg",
            webformatURL: "https://cdn.example/web.jpg",
            imageWidth: 2400,
            imageHeight: 3200,
            user: "Ada",
            tags: "mountain, sunrise"
          }]
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const [asset] = await new PixabayProvider().search("mountain sunrise", 1);

    expect(asset.source).toBe("pixabay");
    expect(asset.originalUrl).toBe("https://cdn.example/large.jpg");
    expect(asset.usagePolicy?.providerPolicy).toContain("do not permanently hotlink");
    expect(asset.tags).toContain("mountain");
  });

  it("normalizes Pexafy semantic results and preserves license/source metadata", async () => {
    vi.stubEnv("PEXAFY_API_KEY", "pexafy-test");
    const fetchMock = vi.fn(
      async (_url: string | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("x-api-key")).toBe("pexafy-test");
        return new Response(
          JSON.stringify({
            success: true,
            data: [{
              photo_id: "p1",
              urls: { full: "https://img.example/full.jpg" },
              description: "Serene mountain landscape",
              alt_description: "mountains at sunrise",
              source: "Pexels",
              license_type: "free",
              photographer_username: "ada",
              attribution: { plain: "Photo by Ada via Pexafy" },
              relevance_score: 0.92
            }]
          }),
          { status: 200 }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const [asset] = await new PexafyProvider().search("serene mountain", 1);

    expect(asset.source).toBe("pexafy");
    expect(asset.license).toBe("free");
    expect(asset.attributionRequired).toBe(false);
    expect(asset.credits).toContain("Ada");
    expect(asset.qualityScore).toBeCloseTo(9.2);
  });

  it("fails closed when provider credentials are absent", async () => {
    expect(await new PexelsProvider().search("test", 2)).toEqual([]);
    expect(await new PixabayProvider().search("test", 2)).toEqual([]);
    expect(await new PexafyProvider().search("test", 2)).toEqual([]);
  });

  it("does not invent candidates from malformed successful responses", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-test");
    vi.stubEnv("PIXABAY_API_KEY", "pixabay-test");
    vi.stubEnv("PEXAFY_API_KEY", "pexafy-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    expect(await new PexelsProvider().search("test", 2)).toEqual([]);
    expect(await new PixabayProvider().search("test", 2)).toEqual([]);
    expect(await new PexafyProvider().search("test", 2)).toEqual([]);
  });
});
