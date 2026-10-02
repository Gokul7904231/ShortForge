import { afterEach, describe, expect, it, vi } from "vitest";
import { DaytonaSandboxAdapter, ModalSandboxAdapter } from "@/factoryos/core/compute/sandboxes";

const credentials = { DAYTONA_API_KEY: "dt_test_secret" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sandbox fabric", () => {
  it("fails closed when Daytona SDK is not installed", async () => {
    const adapter = new DaytonaSandboxAdapter();
    const result = await adapter.validateCredentials(credentials);
    expect(result.configured).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.errorCode).toBe("DAYTONA_AUTH_FAILED");
  });

        it("keeps both hosted sandbox adapters outside production worker authority", () => {
    const daytona = new DaytonaSandboxAdapter();
    const modal = new ModalSandboxAdapter();
    expect(daytona.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(modal.metadata.capabilities.productionWorkerEligible).toBe(false);
  });
});