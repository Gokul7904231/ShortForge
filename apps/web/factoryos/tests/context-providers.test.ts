import { afterEach, describe, expect, it, vi } from "vitest";
import { NominatimProvider, OpenMeteoProvider } from "../core/integrations/external/ContextProviders";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Open-Meteo provider", () => {
  it("rejects invalid coordinates before network dispatch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new OpenMeteoProvider().forecast({
        latitude: 91,
        longitude: 0,
        current: ["temperature_2m"],
      }),
    ).rejects.toThrow(/valid WGS84/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a forecast and preserves requested query fields", async () => {
    vi.stubEnv(
      "OPEN_METEO_BASE_URL",
      "https://weather.example.test/v1",
    );
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/forecast?latitude=11.01");
      expect(String(url)).toContain("current=temperature_2m");
      return new Response(
        JSON.stringify({
          latitude: 11.01,
          longitude: 76.96,
          timezone: "Asia/Kolkata",
          elevation: 411,
          current: { temperature_2m: 28.4 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenMeteoProvider().forecast({
      latitude: 11.01,
      longitude: 76.96,
      current: ["temperature_2m"],
    });
    expect(result.providerId).toBe("OPEN_METEO");
    expect(result.current?.temperature_2m).toBe(28.4);
  });
});

describe("Nominatim provider", () => {
  it("requires an identifying application User-Agent", async () => {
    vi.stubEnv(
      "NOMINATIM_BASE_URL",
      "https://geo.example.test",
    );
    vi.stubEnv("NOMINATIM_USER_AGENT", "ShortForge/1.0 (test@example.com)");

    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("User-Agent")).toContain("ShortForge/1.0");
      return new Response(
        JSON.stringify([
          {
            place_id: 1,
            display_name: "Coimbatore, Tamil Nadu, India",
            lat: "11.0168",
            lon: "76.9558",
            type: "city",
            address: { city: "Coimbatore", state: "Tamil Nadu" },
          },
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new NominatimProvider().search("Coimbatore", { limit: 1 });
    expect(result[0]?.displayName).toContain("Coimbatore");
    expect(result[0]?.latitude).toBeCloseTo(11.0168);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches repeated identical queries and avoids a second request", async () => {
    vi.stubEnv(
      "NOMINATIM_BASE_URL",
      "https://geo.example.test",
    );
    vi.stubEnv("NOMINATIM_USER_AGENT", "ShortForge/1.0 (test@example.com)");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            place_id: 1,
            display_name: "Example",
            lat: "1",
            lon: "2",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new NominatimProvider();
    await provider.search("Example");
    await provider.search("Example");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
