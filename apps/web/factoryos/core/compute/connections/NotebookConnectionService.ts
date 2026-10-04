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
import { refreshKaggleAccessToken } from "./KaggleOAuthService";
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
  let credentials = await computeConnectionStore.getSecretsForUser(userId, connectionId);
  if (!credentials) throw new Error("COMPUTE_CONNECTION_SECRETS_NOT_FOUND");

  if (providerType === "KAGGLE" && credentials.KAGGLE_REFRESH_TOKEN) {
    const expiresAt = Number(credentials.KAGGLE_TOKEN_EXPIRES_AT || "0");
    const refreshWindowMs = 5 * 60 * 1000;
    if (expiresAt > 0 && expiresAt - Date.now() <= refreshWindowMs) {
      try {
        const refreshed = await refreshKaggleAccessToken(credentials.KAGGLE_REFRESH_TOKEN);
        if (!refreshed.access_token) {
          throw new Error("KAGGLE_TOKEN_REFRESH_RESPONSE_INCOMPLETE");
        }
        {
          credentials = {
            ...credentials,
            KAGGLE_API_TOKEN: refreshed.access_token,
            ...(refreshed.expires_in
              ? {
                  KAGGLE_TOKEN_EXPIRES_AT: String(
                    Date.now() + refreshed.expires_in * 1000,
                  ),
                }
              : {}),
            ...(refreshed.refresh_token
              ? { KAGGLE_REFRESH_TOKEN: refreshed.refresh_token }
              : {}),
          };
          await computeConnectionStore.updateSecretsForUser(
            userId,
            connectionId,
            credentials,
          );
        }
      } catch (error) {
        if (expiresAt > Date.now()) {
          // Keep the current token for the remainder of its valid window.
        } else {
          throw new Error(
            "COMPUTE_KAGGLE_TOKEN_REFRESH_FAILED:" +
              (error instanceof Error ? error.message : "refresh failed"),
          );
        }
      }
    }
  }

  return { providerType, credentials };
}