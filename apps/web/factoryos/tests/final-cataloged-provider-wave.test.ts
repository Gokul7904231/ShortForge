import { afterEach, describe, expect, it, vi } from "vitest";
import { PerspectiveProvider } from "../core/integrations/external/PerspectiveProvider";
import { SpeakAiProvider } from "../core/integrations/external/SpeakAiProvider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Perspective provider", () => {
  it("fails closed without a credential", async () => {
    await expect(new PerspectiveProvider().analyze({ text: "hello" })).rejects.toThrow(
      /PERSPECTIVE_API_KEY/,
    );
  });

  it("sends AnalyzeComment request and normalizes attribute scores", async () => {
    vi.stubEnv("PERSPECTIVE_API_KEY", "test-key");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("commentanalyzer.googleapis.com/v1alpha1/comments:analyze");
      expect(String(url)).toContain("key=test-key");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.comment.text).toBe("hello");
      expect(body.requestedAttributes.TOXICITY).toEqual({});
      return new Response(
        JSON.stringify({
          requestId: "perspective-123",
          attributeScores: {
            TOXICITY: {
              summaryScore: { value: 0.82 },
            },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new PerspectiveProvider().analyze({ text: "hello" });
    expect(result.requestId).toBe("perspective-123");
    expect(result.attributeScores.TOXICITY?.value).toBe(0.82);
    expect(result.detected.TOXICITY).toBe(true);
  });

  it("rejects malformed score responses", async () => {
    vi.stubEnv("PERSPECTIVE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ attributeScores: {} }), { status: 200 }),
      ),
    );
    await expect(new PerspectiveProvider().analyze({ text: "hello" })).rejects.toThrow(
      /no usable attribute scores/,
    );
  });
});

describe("Speak AI provider", () => {
  it("authenticates with the documented two-header flow", async () => {
    vi.stubEnv("SPEAK_AI_API_KEY", "speak-test");
    const calls: Array<{ url: string; headers: Headers; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({ url: String(url), headers, body: String(init?.body ?? "") });
        if (String(url).endsWith("/auth/accessToken")) {
          return new Response(
            JSON.stringify({
              status: "success",
              data: {
                accessToken: "access-token",
                refreshToken: "refresh-token",
              },
            }),
            { status: 200 },
          );
        }
        if (String(url).includes("/media/status/")) {
          expect(headers.get("x-speakai-key")).toBe("speak-test");
          expect(headers.get("x-access-token")).toBe("access-token");
          return new Response(
            JSON.stringify({
              status: "success",
              data: { status: "processed", processingProgress: "100" },
            }),
            { status: 200 },
          );
        }
        throw new Error("unexpected Speak AI endpoint: " + String(url));
      }),
    );

    const provider = new SpeakAiProvider();
    const result = await provider.status("media-123");
    expect(result.mediaId).toBe("media-123");
    expect(result.state).toBe("processed");
    expect(calls).toHaveLength(2);
  });

  it("normalizes timestamped transcript segments", async () => {
    vi.stubEnv("SPEAK_AI_API_KEY", "speak-test");
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/auth/accessToken")) {
        return new Response(
          JSON.stringify({
            status: "success",
            data: { accessToken: "access-token", refreshToken: "refresh-token" },
          }),
          { status: 200 },
        );
      }
      expect(String(url)).toContain("/media/transcript/media-123");
      expect(new Headers(init?.headers).get("x-access-token")).toBe("access-token");
      return new Response(
        JSON.stringify({
          status: "success",
          data: {
            language: "en",
            is_generated: false,
            transcript: [
              { start: 1.5, duration: 2.0, text: "first segment" },
              { start: 3.5, duration: 1.0, text: "second segment" },
            ],
            metadata: {
              videoId: "abcdefghijk",
              sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
            },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new SpeakAiProvider().transcript("media-123");
    expect(result.providerId).toBe("SPEAK_AI");
    expect(result.videoId).toBe("abcdefghijk");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.startSeconds).toBe(1.5);
    expect(result.text).toContain("first segment");
  });
});
