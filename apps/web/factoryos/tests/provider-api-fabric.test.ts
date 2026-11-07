import { describe, expect, it } from "vitest";
import { ProviderApiRegistry } from "../core/compute/api/ProviderApiRegistry";
import { ProviderApiOperationJournal } from "../core/compute/api/ProviderApiOperationJournal";
import { DaytonaProviderControl } from "../core/compute/api/providers/DaytonaProviderControl";

describe("Provider API Fabric", () => {
  it("keeps API control providers separate from the worker ComputeGateway", () => {
    const journal = new ProviderApiOperationJournal(":memory:");
    const registry = new ProviderApiRegistry(journal);

    registry.register(new DaytonaProviderControl());

    expect(registry.list().map((x) => x.metadata.providerType)).toEqual([
      "DAYTONA",
    ]);
  });

  it("does not synthesize credentials or claim providers are live when keys are absent", async () => {
    const adapters = [
      new DaytonaProviderControl(),
    ];

    for (const adapter of adapters) {
      const result = await adapter.validateCredentials();
      expect(result.configured).toBe(false);
      expect(result.authenticated).toBe(false);
      expect(result.providerReachable).toBe(false);
      expect(result.missingKeys.length).toBeGreaterThan(0);
    }
  });

  it("exposes render-launch capability separately from physical-render verification", () => {
    const daytona = new DaytonaProviderControl();

    expect(daytona.metadata.controlCapabilities.canConfigureEntrypointByApi).toBe(true);

    expect(daytona.metadata.controlCapabilities.canExecuteCommandByApi).toBe(true);

    expect(daytona.metadata.controlCapabilities.canVerifyPhysicalRenderByApi).toBe(true);
  });

  it("journals lifecycle mutations with a durable idempotency key", () => {
    const journal = new ProviderApiOperationJournal(":memory:");
    const a = journal.start({
      providerId: "api_daytona",
      providerType: "DAYTONA",
      operation: "PROVISION",
      idempotencyKey: "test-idempotency-1",
      requestPayload: { gpu: "RTX 5090" },
    });
    const b = journal.start({
      providerId: "api_daytona",
      providerType: "DAYTONA",
      operation: "PROVISION",
      idempotencyKey: "test-idempotency-1",
      requestPayload: { gpu: "RTX 5090" },
    });

    expect(b.operationId).toBe(a.operationId);
    expect(journal.listOpen("DAYTONA")).toHaveLength(1);
    journal.transition(a.operationId, "UNKNOWN", {
      reconciliationRequired: true,
    });
    expect(journal.get(a.operationId)?.reconciliationRequired).toBe(true);

    expect(() =>
      journal.start({
        providerId: "api_daytona",
        providerType: "DAYTONA",
        operation: "PROVISION",
        idempotencyKey: "test-idempotency-1",
        requestPayload: { gpu: "H100" },
      }),
    ).toThrow("IDEMPOTENCY_KEY_REUSE_CONFLICT");
  });
});
