import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DaytonaSandboxAdapter,
  ModalSandboxAdapter,
  InstaVMSandboxAdapter,
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

  it("fails closed when InstaVM credentials are missing", async () => {
    const adapter = new InstaVMSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["INSTAVM_API_KEY"]);
  });

  it("keeps all hosted sandbox adapters outside production worker authority", () => {
    const daytona = new DaytonaSandboxAdapter();
    const modal = new ModalSandboxAdapter();
    const instavm = new InstaVMSandboxAdapter();
    expect(daytona.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(modal.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(instavm.metadata.capabilities.productionWorkerEligible).toBe(false);
  });
});
