import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(process.cwd());

function read(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("Treasury Wave 4 authority retirement", () => {
  it("keeps the legacy generations API as a pure compatibility facade", () => {
    const source = read("app/api/generations/route.ts");

    expect(source).not.toContain("quota-service");
    expect(source).not.toContain("generateBasicVideoContent");
    expect(source).not.toContain("providerFactory(");
    expect(source).toContain('export { POST } from "../generate-video/route";');
  });

  it("keeps CapabilityFirstRouter selection-only", () => {
    const source = read("factoryos/core/routing/CapabilityFirstRouter.ts");

    expect(source).not.toContain('from "../governor/CostGovernor"');
    expect(source).toContain(
      "Production routing requires routeCapabilityWithTreasury",
    );
    expect(source).toContain(
      "Treasury-backed asynchronous routing seam",
    );
  });

  it("prevents the legacy CostGovernor from authorizing production spend", () => {
    const source = read("factoryos/core/governor/CostGovernor.ts");

    expect(source).toContain(
      "Production economic admission is Treasury-owned",
    );
    expect(source).not.toContain(
      "return { allowed: true, requiresApproval: false, reason: "Paid execution permitted under active budget policy." }",
    );
  });

  it("prevents synthetic quota values in the Overseer tool gateway", () => {
    const source = read("lib/overseer/OverseerToolGateway.ts");

    expect(source).toContain("Treasury quota read unavailable");
    expect(source).not.toContain("status: "QUOTA_UNAVAILABLE"");
  });

  it("keeps Economic Intelligence read-only by construction", () => {
    const source = read(
      "factoryos/core/treasury/TreasuryEconomicIntelligence.ts",
    );

    expect(source).toContain("Read-only economic intelligence");
    expect(source).not.toContain(".reserve(");
    expect(source).not.toContain(".settle(");
    expect(source).not.toContain(".release(");
    expect(source).not.toContain(".freeze(");
    expect(source).not.toContain(".unfreeze(");
  });
});
