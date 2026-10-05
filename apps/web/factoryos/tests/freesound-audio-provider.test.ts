import { afterEach, describe, expect, it, vi } from "vitest";
import { FreesoundAudioProvider } from "../core/integrations/external/FreesoundAudioProvider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Freesound audio asset provider", () => {
  it("fails closed when credentials are absent", async () => {
    await expect(new FreesoundAudioProvider().search("rain", 2)).resolves.toEqual([]);
  });

  it("normalizes license and generative-AI preference metadata", async () => {
    vi.stubEnv("FREESOUND_API_KEY", "test-token");
    const mock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("freesound.org/apiv2/search/");
      expect(String(url)).toContain("fields=id%2Cname");
      expect(String(url)).toContain("token=test-token");
      return new Response(
        JSON.stringify({
          results: [{
            id: 123,
            name: "rain ambience",
            username: "Ada",
            license: "Attribution",
            tags: ["rain", "ambience"],
            url: "https://freesound.org/people/Ada/sounds/123/",
            previews: { "preview-hq-mp3": "https://cdn.example/rain.mp3" },
            score: 0.91,
            gen_ai_preference: "no-gen-ai",
          }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", mock);

    const [asset] = await new FreesoundAudioProvider().search("rain", 1);
    expect(asset.providerId).toBe("FREESOUND");
    expect(asset.license).toBe("Attribution");
    expect(asset.genAiPreference).toBe("no-gen-ai");
    expect(asset.creator).toBe("Ada");
    expect(asset.previewUrl).toContain("rain.mp3");
  });

  it("does not fabricate candidates from malformed success payloads", async () => {
    vi.stubEnv("FREESOUND_API_KEY", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await expect(new FreesoundAudioProvider().search("rain", 2)).rejects.toThrow(
      /Malformed search response/,
    );
  });
});
