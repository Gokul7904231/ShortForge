import { describe, expect, it } from "vitest";
import { ProviderApiRegistry } from "../core/compute/api/ProviderApiRegistry";
import { ProviderApiOperationJournal } from "../core/compute/api/ProviderApiOperationJournal";
import { VastProviderControl } from "../core/compute/api/providers/VastProviderControl";
import { RunPodV2ProviderControl } from "../core/compute/api/providers/RunPodV2ProviderControl";
import { DaytonaProviderControl } from "../core/compute/api/providers/DaytonaProviderControl";
import { PaperspaceProviderControl } from "../core/compute/api/providers/PaperspaceProviderControl";
import { ModalProviderControl } from "../core/compute/api/providers/ModalProviderControl";

describe("Provider API Fabric", () => {
  it("keeps API control providers separate from the worker ComputeGateway", () => {
    const journal = new ProviderApiOperationJournal(":memory:");
    const registry = new ProviderApiRegistry(journal);

    registry.register(new VastProviderControl());
    registry.register(new RunPodV2ProviderControl());
    registry.register(new DaytonaProviderControl());
    registry.register(new PaperspaceProviderControl());
    registry.register(new ModalProviderControl());

    expect(registry.list().map((x) => x.metadata.providerType)).toEqual([
      "VAST",
      "RUNPOD",
      "DAYTONA",
      "PAPERSPACE",
      "MODAL",
    ]);
  });

  it("does not synthesize credentials or claim providers are live when keys are absent", async () => {
    const adapters = [
      new VastProviderControl(),
      new RunPodV2ProviderControl(),
      new DaytonaProviderControl(),
      new PaperspaceProviderControl(),
      new ModalProviderControl(),
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
    const vast = new VastProviderControl();
    const runpod = new RunPodV2ProviderControl();
    const paperspace = new PaperspaceProviderControl();
    const daytona = new DaytonaProviderControl();
    const modal = new ModalProviderControl();

    expect(vast.metadata.controlCapabilities.canExecuteCommandByApi).toBe(false);
    expect(runpod.metadata.controlCapabilities.canExecuteCommandByApi).toBe(false);
    expect(paperspace.metadata.controlCapabilities.canExecuteCommandByApi).toBe(false);
    expect(daytona.metadata.controlCapabilities.canExecuteCommandByApi).toBe(true);
    expect(modal.metadata.controlCapabilities.canExecuteCommandByApi).toBe(true);

    expect(vast.metadata.controlCapabilities.canVerifyPhysicalRenderByApi).toBe(false);
    expect(runpod.metadata.controlCapabilities.canVerifyPhysicalRenderByApi).toBe(false);
    expect(paperspace.metadata.controlCapabilities.canVerifyPhysicalRenderByApi).toBe(false);
    expect(daytona.metadata.controlCapabilities.canVerifyPhysicalRenderByApi).toBe(true);
    expect(modal.metadata.controlCapabilities.canVerifyPhysicalRenderByApi).toBe(true);
  });

  it("journals lifecycle mutations with a durable idempotency key", () => {
    const journal = new ProviderApiOperationJournal(":memory:");
    const a = journal.start({
      providerId: "api_vast",
      providerType: "VAST",
      operation: "PROVISION",
      idempotencyKey: "test-idempotency-1",
      requestPayload: { gpu: "RTX 5090" },
    });
    const b = journal.start({
      providerId: "api_vast",
      providerType: "VAST",
      operation: "PROVISION",
      idempotencyKey: "test-idempotency-1",
      requestPayload: { gpu: "RTX 5090" },
    });

    expect(b.operationId).toBe(a.operationId);
    expect(journal.listOpen("VAST")).toHaveLength(1);
    journal.transition(a.operationId, "UNKNOWN", {
      reconciliationRequired: true,
    });
    expect(journal.get(a.operationId)?.reconciliationRequired).toBe(true);

    expect(() =>
      journal.start({
        providerId: "api_vast",
        providerType: "VAST",
        operation: "PROVISION",
        idempotencyKey: "test-idempotency-1",
        requestPayload: { gpu: "H100" },
      }),
    ).toThrow("IDEMPOTENCY_KEY_REUSE_CONFLICT");
  });
});
