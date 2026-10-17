import {
  sandboxRegistry,
  type SandboxCredentialBundle,
  type SandboxCredentialValidation,
  type SandboxProviderType,
} from "@/factoryos/core/compute/sandboxes";
import { computeConnectionStore } from "./ComputeConnectionStore";

const PROVIDER_TYPE_BY_ID: Record<string, SandboxProviderType> = {
  sandbox_daytona_hosted: "DAYTONA",
  sandbox_modal_hosted: "MODAL",
  sandbox_instavm: "INSTAVM",
  sandbox_opencomputer: "OPENCOMPUTER",
  sandbox_blaxel: "BLAXEL",
};

function adapterFor(providerId: string) {
  const providerType = PROVIDER_TYPE_BY_ID[providerId];
  if (!providerType) throw new Error("SANDBOX_PROVIDER_NOT_IMPLEMENTED:" + providerId);
  const adapter = sandboxRegistry.get(providerType);
  if (!adapter) throw new Error("SANDBOX_PROVIDER_ADAPTER_MISSING:" + providerType);
  return { providerType, adapter };
}

export async function validateSandboxConnection(
  userId: string,
  connectionId: string,
): Promise<SandboxCredentialValidation & { providerId: string; providerType: SandboxProviderType }> {
  const connection = await computeConnectionStore.getForUser(userId, connectionId);
  if (!connection) throw new Error("COMPUTE_CONNECTION_NOT_FOUND");
  const { providerType, adapter } = adapterFor(connection.providerId);
  const secrets = await computeConnectionStore.getSecretsForUser(userId, connectionId);
  if (!secrets) throw new Error("COMPUTE_CONNECTION_SECRETS_NOT_FOUND");
  const result = await adapter.validateCredentials(secrets);
  await computeConnectionStore.updateValidation(userId, connectionId, {
    status: result.authenticated ? "CONNECTED" : "INVALID",
    lastValidatedAt: result.checkedAt,
    lastValidationEvidence: result.evidence,
  });
  return { ...result, providerId: connection.providerId, providerType };
}

export async function getSandboxCredentials(
  userId: string,
  connectionId: string,
): Promise<{ providerType: SandboxProviderType; credentials: SandboxCredentialBundle }> {
  const connection = await computeConnectionStore.getForUser(userId, connectionId);
  if (!connection) throw new Error("COMPUTE_CONNECTION_NOT_FOUND");
  const providerType = PROVIDER_TYPE_BY_ID[connection.providerId];
  if (!providerType) throw new Error("SANDBOX_PROVIDER_NOT_IMPLEMENTED:" + connection.providerId);
  const credentials = await computeConnectionStore.getSecretsForUser(userId, connectionId);
  if (!credentials) throw new Error("COMPUTE_CONNECTION_SECRETS_NOT_FOUND");
  return { providerType, credentials };
}