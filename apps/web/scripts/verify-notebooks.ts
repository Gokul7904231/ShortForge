import {
  createDefaultNotebookRegistry,
} from "../factoryos/core/compute/notebooks";

async function main() {
  const registry = createDefaultNotebookRegistry();

  console.log("=== SHORTFORGE NOTEBOOK FABRIC ===");
  console.table(
    registry.metadata().map((m) => ({
      provider: m.providerType,
      runtime: m.runtimeKind,
      payment: m.paymentRequirement,
      gpu: m.capabilities.supportsGpu,
      provision: m.capabilities.canProvision,
      execute: m.capabilities.canExecuteCode,
      persistence: m.capabilities.supportsPersistence,
      productionWorkerEligible:
        m.capabilities.productionWorkerEligible,
    })),
  );

  const selected = process.env.NOTEBOOK_PROVIDER;
  if (!selected) {
    console.log(
      "No NOTEBOOK_PROVIDER selected; contract inspection only. No external calls performed.",
    );
    return;
  }

  const valid = [
    "KAGGLE",
    "COLAB",
    "PAPERSPACE",
    "LIGHTNING",
    "HF_ZEROGPU",
  ];

  if (!valid.includes(selected)) {
    throw new Error("Unknown NOTEBOOK_PROVIDER: " + selected);
  }

  const adapter = registry.get(selected as any);
  if (!adapter) {
    throw new Error("Notebook provider not registered: " + selected);
  }

  const validation = await adapter.validateCredentials();
  console.log(JSON.stringify(validation, null, 2));

  if (!validation.authenticated) {
    throw new Error(
      "Notebook provider " + selected + " is not authenticated/configured.",
    );
  }

  console.log(
    "Authenticated. Live provisioning/execution remains explicit and provider-specific.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
