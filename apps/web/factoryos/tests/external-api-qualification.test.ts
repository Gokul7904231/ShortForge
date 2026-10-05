import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalApiRegistry } from "../core/integrations/external/ExternalApiRegistry";
import {
  canRunLive,
  redactSecretBearingUrl,
} from "../core/integrations/external/ExternalApiQualificationContracts";
import {
  configured,
  executeProfile,
  externalApiQualificationProfiles,
} from "../core/integrations/external/ExternalApiQualificationProbes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("External API qualification matrix", () => {
  it("has one qualification profile for every implemented registry provider", () => {
    const providers = ExternalApiRegistry.list();
    const profiles = externalApiQualificationProfiles();
    expect(providers).toHaveLength(28);
    expect(profiles).toHaveLength(28);

    const profileIds = new Set(profiles.map((profile) => profile.providerId));
    for (const provider of providers) {
      expect(profileIds.has(provider.id)).toBe(true);
      expect(provider.lifecycle).toBe("IMPLEMENTED");
    }
  });

  it("blocks metered or destructive live probes unless explicitly authorized", () => {
    const profile = externalApiQualificationProfiles().find(
      (item) => item.providerId === "perplexity_mcp",
    )!;
    expect(canRunLive(profile, { live: true, allowMetered: false, allowDestructive: false })).toBe(false);
    expect(canRunLive(profile, { live: true, allowMetered: true, allowDestructive: false })).toBe(true);
  });

  it("requires the Safe Browsing non-commercial acknowledgement", () => {
    const profile = externalApiQualificationProfiles().find(
      (item) => item.providerId === "google_safe_browsing",
    )!;
    vi.stubEnv("SAFE_BROWSING_API_KEY", "test-key");
    expect(configured(profile).configured).toBe(false);
    vi.stubEnv("SAFE_BROWSING_NONCOMMERCIAL_CONFIRMED", "true");
    expect(configured(profile).configured).toBe(true);
  });

  it("does not leak secret-bearing query parameters into evidence", () => {
    expect(
      redactSecretBearingUrl(
        "https://example.test/search?key=abc123&token=secret&query=x",
      ),
    ).toContain("key=%5BREDACTED%5D");
    expect(
      redactSecretBearingUrl(
        "https://example.test/search?key=abc123&token=secret&query=x",
      ),
    ).toContain("token=%5BREDACTED%5D");
  });

  it("uses the versioned Crossref REST endpoint for live qualification", async () => {
    const profile = externalApiQualificationProfiles().find(
      (item) => item.providerId === "crossref",
    )!;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("https://api.crossref.org/v1/works");
      expect(url).toContain("rows=1");
      return new Response(JSON.stringify({
        message: {
          items: [{ DOI: "10.1234/example", title: ["Machine learning"] }],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeProfile(profile);
    expect(result.capabilityVerified).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats Hugging Face token aliases as equivalent configuration", () => {
    const profile = externalApiQualificationProfiles().find(
      (item) => item.providerId === "huggingface",
    )!;
    vi.stubEnv("HF_TOKEN", "hf_example_token");
    expect(configured(profile).configured).toBe(true);
  });
});

  it("requires a separate destructive authorization for URLScan", () => {
    const profile = externalApiQualificationProfiles().find(
      (item) => item.providerId === "urlscan",
    )!;
    expect(
      canRunLive(profile, {
        live: true,
        allowMetered: false,
        allowDestructive: false,
      }),
    ).toBe(false);
    expect(
      canRunLive(profile, {
        live: true,
        allowMetered: false,
        allowDestructive: true,
      }),
    ).toBe(true);
  });
