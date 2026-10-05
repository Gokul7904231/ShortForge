import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalApiRegistry } from "../core/integrations/external/ExternalApiRegistry";
import {
  canRunLive,
  redactSecretBearingUrl,
} from "../core/integrations/external/ExternalApiQualificationContracts";
import {
  configured,
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
    expect(canRunLive(profile, { live: true, allowMetered: false })).toBe(false);
    expect(canRunLive(profile, { live: true, allowMetered: true })).toBe(true);
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

  it("treats Hugging Face token aliases as equivalent configuration", () => {
    const profile = externalApiQualificationProfiles().find(
      (item) => item.providerId === "huggingface",
    )!;
    vi.stubEnv("HF_TOKEN", "hf_example_token");
    expect(configured(profile).configured).toBe(true);
  });
});
