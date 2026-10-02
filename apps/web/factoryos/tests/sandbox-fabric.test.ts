import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DaytonaSandboxAdapter,
  ModalSandboxAdapter,
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

  it("keeps both hosted sandbox adapters outside production worker authority", () => {
    const daytona = new DaytonaSandboxAdapter();
    const modal = new ModalSandboxAdapter();
    expect(daytona.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(modal.metadata.capabilities.productionWorkerEligible).toBe(false);
  });
});
