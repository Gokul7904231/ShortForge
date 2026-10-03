import { afterEach, describe, expect, it, vi } from "vitest";
import { NotebookRegistry } from "../core/compute/notebooks/NotebookRegistry";
import { NotebookOperationJournal } from "../core/compute/notebooks/NotebookOperationJournal";
import { KaggleNotebookAdapter } from "../core/compute/notebooks/KaggleNotebookAdapter";
import { ColabNotebookAdapter } from "../core/compute/notebooks/ColabNotebookAdapter";
import { PaperspaceNotebookAdapter } from "../core/compute/notebooks/PaperspaceNotebookAdapter";
import { LightningNotebookAdapter } from "../core/compute/notebooks/LightningNotebookAdapter";
import { HuggingFaceZeroGPUAdapter } from "../core/compute/notebooks/HuggingFaceZeroGPUAdapter";
import { NotebookRouter } from "../core/compute/notebooks/NotebookRouter";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Notebook & Interactive Compute Fabric", () => {
  it("registers all five canonical notebook/interactive providers without network calls", () => {
    const journal = new NotebookOperationJournal(":memory:");
    const registry = new NotebookRegistry(journal);

    registry.register(new KaggleNotebookAdapter());
    registry.register(new ColabNotebookAdapter());
    registry.register(new PaperspaceNotebookAdapter());
    registry.register(new LightningNotebookAdapter());
    registry.register(new HuggingFaceZeroGPUAdapter());

    expect(registry.list()).toHaveLength(5);
    expect(registry.metadata().map((m) => m.providerType)).toEqual([
      "KAGGLE",
      "COLAB",
      "PAPERSPACE",
      "LIGHTNING",
      "HF_ZEROGPU",
    ]);

    journal.close();
  });

  it("fails closed when Kaggle credentials are absent", async () => {
    delete process.env.KAGGLE_USERNAME;
    delete process.env.KAGGLE_KEY;

    const result = await new KaggleNotebookAdapter().validateCredentials();

    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual([
      "KAGGLE_USERNAME",
      "KAGGLE_KEY",
    ]);
  });

  it("keeps Colab render execution enabled while preserving the non-worker boundary", () => {
    const colab = new ColabNotebookAdapter();
    const zero = new HuggingFaceZeroGPUAdapter();

    expect(colab.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(colab.metadata.capabilities.canExecuteCode).toBe(true);
    expect(colab.metadata.capabilities.canReadOutputs).toBe(true);
    expect(colab.metadata.capabilities.canReadLogs).toBe(true);
    expect(zero.metadata.runtimeKind).toBe("ZEROGPU_SPACE");
    expect(zero.metadata.capabilities.canProvision).toBe(false);
    expect(zero.metadata.capabilities.productionWorkerEligible).toBe(false);
  });

  it("validates Colab access and reports eligible GPU specs without exposing secrets", async () => {
    const adapter = new ColabNotebookAdapter();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          runtimeSpecs: [
            {
              key: {
                variant: "VARIANT_GPU",
                accelerator: "T4",
                shape: "SHAPE_STANDARD",
              },
              eligible: true,
            },
            {
              key: {
                variant: "VARIANT_GPU",
                accelerator: "A100",
                shape: "SHAPE_STANDARD",
              },
              eligible: false,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const validation = await adapter.validateCredentials({
      COLAB_ACCESS_TOKEN: "ephemeral-test-token",
    });

    expect(validation.authenticated).toBe(true);
    expect(validation.providerReachable).toBe(true);
    expect(validation.evidence.join(" ")).toContain("T4");
    expect(validation.evidence.join(" ")).not.toContain("ephemeral-test-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://colaboratory.googleapis.com/v1beta/runtimespecs",
    );
  });

  it("models Paperspace as a machine-backed notebook rather than a legacy notebook API", () => {
    const paperspace = new PaperspaceNotebookAdapter();

    expect(paperspace.metadata.runtimeKind).toBe(
      "PAPERSPACE_MACHINE_BACKED_NOTEBOOK",
    );
    expect(paperspace.metadata.capabilities.canProvision).toBe(true);
    expect(paperspace.metadata.capabilities.canExecuteCode).toBe(false);
  });

  it("records no-card status as evidence, not as an unsupported claim", () => {
    const adapters = [
      new KaggleNotebookAdapter(),
      new ColabNotebookAdapter(),
      new PaperspaceNotebookAdapter(),
      new LightningNotebookAdapter(),
      new HuggingFaceZeroGPUAdapter(),
    ];

    expect(adapters.map((a) => a.metadata.paymentRequirement)).toEqual([
      "NO_CARD_NOT_ESTABLISHED",
      "NO_CARD_NOT_ESTABLISHED",
      "NO_CARD_NOT_ESTABLISHED",
      "NO_CARD_STATED",
      "NO_CARD_NOT_ESTABLISHED",
    ]);
  });

  it("routes strict no-card workloads only to providers with explicit no-card evidence", () => {
    const router = new NotebookRouter([
      new KaggleNotebookAdapter(),
      new ColabNotebookAdapter(),
      new PaperspaceNotebookAdapter(),
      new LightningNotebookAdapter(),
      new HuggingFaceZeroGPUAdapter(),
    ]);

    const decision = router.route({
      gpuRequired: true,
      noCardOnly: true,
    });

    expect(decision.admitted).toBe(true);
    expect(decision.selectedProvider).toBe("LIGHTNING");
    expect(
      decision.candidates.find((candidate) => candidate.providerType === "KAGGLE")?.admitted,
    ).toBe(false);
    expect(
      decision.candidates.find((candidate) => candidate.providerType === "LIGHTNING")?.admitted,
    ).toBe(true);
  });

  it("keeps notebook registration independent from ComputeRouter", () => {
    const journal = new NotebookOperationJournal(":memory:");
    const registry = new NotebookRegistry(journal);
    registry.register(new KaggleNotebookAdapter());

    expect(registry.get("KAGGLE")?.metadata.runtimeKind).toBe("KAGGLE_KERNEL");
    expect(registry.get("KAGGLE")?.metadata.capabilities.supportsGpu).toBe(true);

    journal.close();
  });
});
