import { describe, it, expect, beforeEach, vi } from "vitest";
import { CapabilityRegistry } from "../core/cognitive/CapabilityRegistry";

describe("FactoryOS Frontier v3 — Universal Capability Registry & Policy Boundary Suite", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  it("1. Metadata & Inventory: Registers universal capabilities with licensing and health metadata", () => {
    const caps = registry.getAll();
    expect(caps.length).toBeGreaterThanOrEqual(10);

    const browserCap = registry.get("browser.access");
    expect(browserCap).toBeDefined();
    expect(browserCap?.type).toBe("BROWSER");
    expect(browserCap?.provider).toBe("lightpanda-clean-room");
    expect(browserCap?.licenseMetadata?.spdx).toBe("Clean-Room");
    expect(browserCap?.policy?.allowedFloors).toContain("floor00_analyst");

    const ttsCap = registry.get("voice.tts");
    expect(ttsCap).toBeDefined();
    expect(ttsCap?.type).toBe("VOICE");
    expect(ttsCap?.health).toBe("HEALTHY");
  });

  it("2. Policy Authorization: Allows execution when caller role and floor match policy boundary", async () => {
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://trends.google.com",
      text: async () => "<html><head><title>Google Trends</title></head><body>Daily Search Trends</body></html>",
    } as any);

    try {
      const res = await registry.execute({
        requestExecutionId: "req_cap_001",
        capabilityId: "browser.access",
        missionId: "mis_test_001",
        jobId: "job_test_001",
        floorId: "floor00_analyst",
        callerRole: "CREATOR",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: { url: "https://trends.google.com" },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.findings?.[0]).toContain("Navigated to https://trends.google.com");
      expect(res.outputData).toBeDefined();
    } finally {
      global.fetch = origFetch;
    }
  });

  it("3. Policy Boundary Enforcement: Rejects execution when caller floor is unauthorized", async () => {
    // Floor 02 Scripting is NOT allowed to invoke browser.access directly
    const res = await registry.execute({
      requestExecutionId: "req_cap_002",
      capabilityId: "browser.access",
      missionId: "mis_test_001",
      jobId: "job_test_001",
      floorId: "floor02_scripting",
      callerRole: "CREATOR",
      initiatedBy: "system",
      timestamp: new Date().toISOString(),
      inputData: { url: "https://unauthorized-crawl.com" },
    });

    expect(res.status).toBe("REJECTED");
    expect(res.policyRejectionReason).toContain("Floor 'floor02_scripting' is not authorized");
    expect(res.error).toContain("Policy Boundary Rejection");
  });

  it("4. Capability Authorization: Authorizes wildcard role capabilities", () => {
    const auth = registry.authorizeExecution("research.web", {
      role: "USER",
      floorId: "floor00_analyst",
    });
    expect(auth.authorized).toBe(true);
  });
});
