import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoogleSafeBrowsingProvider,
  OcrSpaceProvider,
  UrlscanProvider,
} from "../core/integrations/external/SafetyDocumentProviders";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OCR.Space provider", () => {
  it("fails closed when credentials are absent", async () => {
    await expect(
      new OcrSpaceProvider().parse({ url: "https://example.com/a.png" }),
    ).rejects.toThrow(/OCR_SPACE_API_KEY/);
  });

  it("normalizes parsed pages and text", async () => {
    vi.stubEnv("OCR_SPACE_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(String(_url)).toBe("https://api.ocr.space/parse/image");
      expect(new Headers(init?.headers).get("apikey")).toBe("test-key");
      expect(String(init?.body)).toContain("url=https%3A%2F%2Fexample.com%2Fa.png");
      return new Response(
        JSON.stringify({
          OCRExitCode: 1,
          IsErroredOnProcessing: false,
          ParsedResults: [
            { ParsedText: "Page one" },
            { ParsedText: "Page two" },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OcrSpaceProvider().parse({
      url: "https://example.com/a.png",
    });
    expect(result.pages).toHaveLength(2);
    expect(result.parsedText).toBe("Page one\nPage two");
  });
});

describe("Google Safe Browsing provider", () => {
  it("fails closed unless the non-commercial usage boundary is explicitly confirmed", async () => {
    vi.stubEnv("SAFE_BROWSING_API_KEY", "test-key");
    await expect(
      new GoogleSafeBrowsingProvider().check({ url: "https://example.com" }),
    ).rejects.toThrow(/NONCOMMERCIAL_CONFIRMED/);
  });

  it("normalizes threat matches", async () => {
    vi.stubEnv("SAFE_BROWSING_NONCOMMERCIAL_CONFIRMED", "true");
    vi.stubEnv("SAFE_BROWSING_API_KEY", "test-key");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("threatMatches%3Afind");
      expect(String(url)).toContain("key=test-key");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          matches: [
            {
              threatType: "MALWARE",
              platformType: "ANY_PLATFORM",
              threatEntryType: "URL",
              threat: { url: "https://evil.example" },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GoogleSafeBrowsingProvider().check({
      url: "https://evil.example",
    });
    expect(result.matched).toBe(true);
    expect(result.matches[0]?.threatType).toBe("MALWARE");
    expect(result.usageBoundary).toBe("NON_COMMERCIAL_ONLY");
  });
});

describe("urlscan provider", () => {
  it("submits private scans by default", async () => {
    vi.stubEnv("URLSCAN_API_KEY", "test-key");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://urlscan.io/api/v1/scan");
      expect(new Headers(init?.headers).get("api-key")).toBe("test-key");
      expect(JSON.parse(String(init?.body)).visibility).toBe("private");
      return new Response(
        JSON.stringify({
          uuid: "12345678-1234-1234-1234-123456789012",
          visibility: "private",
          result: "https://urlscan.io/result/12345678-1234-1234-1234-123456789012/",
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new UrlscanProvider().submit("https://example.com");
    expect(result.scanId).toBe("12345678-1234-1234-1234-123456789012");
    expect(result.visibility).toBe("private");
  });

  it("treats an initial 404 as pending", async () => {
    vi.stubEnv("URLSCAN_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not ready", { status: 404 })),
    );

    const result = await new UrlscanProvider().getResult(
      "12345678-1234-1234-1234-123456789012",
    );
    expect(result.status).toBe("PENDING");
  });
});
