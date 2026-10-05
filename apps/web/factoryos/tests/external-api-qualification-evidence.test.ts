import { describe, expect, it } from "vitest";
import {
  qualificationEvidenceIsSufficient,
  type ExternalApiQualificationProfile,
} from "../core/integrations/external/ExternalApiQualificationContracts";

function profile(overrides: Partial<ExternalApiQualificationProfile> = {}): ExternalApiQualificationProfile {
  return {
    providerId: "test",
    probeKind: "JSON_GET",
    credentialEnvs: [],
    metered: false,
    destructive: false,
    defaultEnabled: false,
    capability: "ACADEMIC_RESEARCH",
    endpointDescription: "test",
    notes: "test",
    ...overrides,
  };
}

describe("qualification evidence sufficiency", () => {
  it("rejects capability proof without a live network request", () => {
    expect(
      qualificationEvidenceIsSufficient(profile(), {
        capabilityVerified: true,
        evidence: ["CAPABILITY_OUTPUT", "NORMALIZED_PROVIDER_RESULT"],
      }),
    ).toBe(false);
  });

  it("requires MCP tool execution for Perplexity", () => {
    const p = profile({ providerId: "perplexity_mcp", probeKind: "MCP", capability: "WEB_RESEARCH + MCP_TOOLS" });
    expect(
      qualificationEvidenceIsSufficient(p, {
        capabilityVerified: true,
        evidence: ["LIVE_NETWORK_REQUEST", "CAPABILITY_OUTPUT", "NORMALIZED_PROVIDER_RESULT"],
      }),
    ).toBe(false);
    expect(
      qualificationEvidenceIsSufficient(p, {
        capabilityVerified: true,
        evidence: ["LIVE_NETWORK_REQUEST", "CAPABILITY_OUTPUT", "MCP_TOOL_EXECUTION"],
      }),
    ).toBe(true);
  });

  it("requires physical material evidence for visual and TTS providers", () => {
    const visual = profile({ providerId: "pexels", capability: "VISUAL_ASSET_SEARCH" });
    expect(
      qualificationEvidenceIsSufficient(visual, {
        capabilityVerified: true,
        evidence: ["LIVE_NETWORK_REQUEST", "CAPABILITY_OUTPUT"],
      }),
    ).toBe(false);

    const tts = profile({ providerId: "ibm_tts", capability: "TTS", probeKind: "BINARY_POST" });
    expect(
      qualificationEvidenceIsSufficient(tts, {
        capabilityVerified: true,
        evidence: ["LIVE_NETWORK_REQUEST", "CAPABILITY_OUTPUT"],
      }),
    ).toBe(false);
    expect(
      qualificationEvidenceIsSufficient(tts, {
        capabilityVerified: true,
        evidence: ["LIVE_NETWORK_REQUEST", "CAPABILITY_OUTPUT", "PHYSICAL_AUDIO"],
      }),
    ).toBe(true);
  });
});
