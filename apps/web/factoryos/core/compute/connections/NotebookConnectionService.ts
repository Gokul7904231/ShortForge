import {
  ColabNotebookAdapter,
  HuggingFaceZeroGPUAdapter,
  KaggleNotebookAdapter,
  LightningNotebookAdapter,
  NotebookRegistry,
  PaperspaceNotebookAdapter,
  type NotebookCredentialBundle,
  type NotebookProviderType,
  type NotebookCredentialValidation,
} from "@/factoryos/core/compute/notebooks";
import { computeConnectionStore } from "./ComputeConnectionStore";

const adapters = new NotebookRegistry();
adapters.register(new KaggleNotebookAdapter());
adapters.register(new ColabNotebookAdapter());
adapters.register(new PaperspaceNotebookAdapter());
adapters.register(new LightningNotebookAdapter());
adapters.register(new HuggingFaceZeroGPUAdapter());

const PROVIDER_TYPE_BY_ID: Record<string, NotebookProviderType> = {
  notebook_kaggle: "KAGGLE",
  notebook_colab: "COLAB",
  notebook_paperspace: "PAPERSPACE",
  notebook_lightning: "LIGHTNING",
  notebook_hf_zerogpu: "HF_ZEROGPU",
};

function adapterFor(providerId: string) {
  const providerType = PROVIDER_TYPE_BY_ID[providerId];
  if (!providerType) throw new Error("NOTEBOOK_PROVIDER_NOT_IMPLEMENTED:" + providerId);
  const adapter = adapters.get(providerType);
  if (!adapter) throw new Error("NOTEBOOK_PROVIDER_ADAPTER_MISSING:" + providerType);
  return adapter;
}

export async function validateNotebookConnection(
  userId: string,
  connectionId: string,
): Promise<NotebookCredentialValidation & { providerId: string }> {
  const connection = await computeConnectionStore.getForUser(userId, connectionId);
  if (!connection) throw new Error("COMPUTE_CONNECTION_NOT_FOUND");

  const secrets = await computeConnectionStore.getSecretsForUser(userId, connectionId);
  if (!secrets) throw new Error("COMPUTE_CONNECTION_SECRETS_NOT_FOUND");

  const result = await adapterFor(connection.providerId).validateCredentials(secrets);
  await computeConnectionStore.updateValidation(userId, connectionId, {
    status: result.authenticated ? "CONNECTED" : "INVALID",
    lastValidatedAt: result.checkedAt,
    lastValidationEvidence: result.evidence,
  });

  return { ...result, providerId: connection.providerId };
}

export async function getNotebookCredentials(
  userId: string,
  connectionId: string,
): Promise<{ providerType: NotebookProviderType; credentials: NotebookCredentialBundle }> {
  const connection = await computeConnectionStore.getForUser(userId, connectionId);
  if (!connection) throw new Error("COMPUTE_CONNECTION_NOT_FOUND");
  const providerType = PROVIDER_TYPE_BY_ID[connection.providerId];
  if (!providerType) throw new Error("NOTEBOOK_PROVIDER_NOT_IMPLEMENTED:" + connection.providerId);
  const credentials = await computeConnectionStore.getSecretsForUser(userId, connectionId);
  if (!credentials) throw new Error("COMPUTE_CONNECTION_SECRETS_NOT_FOUND");
  return { providerType, credentials };
}