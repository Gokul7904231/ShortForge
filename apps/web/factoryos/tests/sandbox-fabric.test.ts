import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DaytonaSandboxAdapter,
  ModalSandboxAdapter,
  InstaVMSandboxAdapter,
  OpenComputerSandboxAdapter,
  BlaxelSandboxAdapter,
} from "@/factoryos/core/compute/sandboxes";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sandbox fabric", () => {
  it("fails closed when Daytona credentials are missing", async () => {
    const adapter = new DaytonaSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["DAYTONA_API_KEY"]);
  });

  it("fails closed when Modal credentials are missing", async () => {
    const adapter = new ModalSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual([
      "MODAL_TOKEN_ID",
      "MODAL_TOKEN_SECRET",
    ]);
  });

  it("fails closed when OpenComputer credentials are missing", async () => {
    const adapter = new OpenComputerSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["OPENCOMPUTER_API_KEY"]);
  });

  it("fails closed when Blaxel credentials are missing", async () => {
    const adapter = new BlaxelSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["BL_API_KEY", "BL_WORKSPACE"]);
  });

  it("fails closed when InstaVM credentials are missing", async () => {
    const adapter = new InstaVMSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["INSTAVM_API_KEY"]);
  });

  it("keeps the no-card default compute policy on approved sandbox providers", () => {
    expect(DEFAULT_COMPUTE_POLICY.allowedProviders).toContain("DAYTONA");
    expect(DEFAULT_COMPUTE_POLICY.allowedProviders).toContain("INSTAVM");
    expect(DEFAULT_COMPUTE_POLICY.allowedProviders).not.toContain("MODAL");
    expect(DEFAULT_COMPUTE_POLICY.preferredOrder).toContain("INSTAVM");
  });

  it("keeps all hosted sandbox adapters outside production worker authority", () => {
    const adapters = [
      new DaytonaSandboxAdapter(),
      new ModalSandboxAdapter(),
      new InstaVMSandboxAdapter(),
      new OpenComputerSandboxAdapter(),
      new BlaxelSandboxAdapter(),
    ];
    for (const adapter of adapters) {
      expect(adapter.metadata.capabilities.productionWorkerEligible).toBe(false);
    }
  });
});
