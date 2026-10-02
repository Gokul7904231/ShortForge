import { isEffectiveAdmin } from "@/lib/auth/roles";
import type { AdminUser } from "@/lib/auth/types";
import {
  COMPUTE_PROVIDER_CATALOG,
  getComputeProviderDefinition,
} from "./ComputeConnectionCatalog";
import { computeConnectionStore } from "./ComputeConnectionStore";
import type {
  ConnectionCreateInput,
  ComputeConnectionSecretBundle,
  ComputeProviderFamily,
  PublicComputeConnection,
} from "./ComputeConnectionContracts";

function roleFor(user: AdminUser): "BASIC" | "ADMIN" {
  return isEffectiveAdmin(user) ? "ADMIN" : "BASIC";
}

export function listAvailableProviders(user: AdminUser) {
  const role = roleFor(user);
  return COMPUTE_PROVIDER_CATALOG
    .filter((provider) => provider.roles.includes(role))
    .map(({ credentialKeys, configurableKeys, ...provider }) => ({
      ...provider,
      credentialKeys,
      configurableKeys,
    }))
    .sort((a, b) => a.providerId.localeCompare(b.providerId));
}

function assertProviderAccess(user: AdminUser, providerId: string) {
  const provider = getComputeProviderDefinition(providerId);
  if (!provider) throw new Error("COMPUTE_PROVIDER_UNKNOWN:" + providerId);

  const role = roleFor(user);
  if (!provider.roles.includes(role)) {
    throw new Error("COMPUTE_PROVIDER_FORBIDDEN:" + providerId);
  }

  if (!provider.implemented) {
    throw new Error("COMPUTE_PROVIDER_NOT_IMPLEMENTED:" + providerId);
  }

  return provider;
}

function sanitizeCredentials(
  provider: ReturnType<typeof getComputeProviderDefinition>,
  input: ComputeConnectionSecretBundle,
): ComputeConnectionSecretBundle {
  if (!provider) throw new Error("COMPUTE_PROVIDER_UNKNOWN");

  const allowed = new Set([
    ...provider.credentialKeys,
    ...provider.configurableKeys,
  ]);
  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(input || {})) {
    if (!allowed.has(key)) {
      throw new Error("COMPUTE_CREDENTIAL_KEY_UNSUPPORTED:" + key);
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("COMPUTE_CREDENTIAL_VALUE_INVALID:" + key);
    }
    if (value.length > 20_000) {
      throw new Error("COMPUTE_CREDENTIAL_VALUE_TOO_LARGE:" + key);
    }
    clean[key] = value;
  }

  for (const required of provider.credentialKeys) {
    if (!clean[required]) {
      throw new Error("COMPUTE_CREDENTIAL_MISSING:" + required);
    }
  }

  return clean;
}

export class ComputeConnectionService {
  async list(user: AdminUser) {
    return {
      connections: await computeConnectionStore.listForUser(user.uid),
      providers: listAvailableProviders(user),
    };
  }

  async create(
    user: AdminUser,
    input: ConnectionCreateInput,
  ): Promise<PublicComputeConnection> {
    const provider = assertProviderAccess(user, input.providerId);
    const credentials = sanitizeCredentials(provider, input.credentials);

    return computeConnectionStore.create(user.uid, {
      providerId: provider.providerId,
      providerFamily: provider.providerFamily,
      authMethod: provider.authMethod,
      displayName: input.displayName || provider.displayName,
      credentials,
      metadata: input.metadata,
      externalAccountId: input.externalAccountId,
    });
  }

  async remove(user: AdminUser, connectionId: string): Promise<boolean> {
    return computeConnectionStore.deleteForUser(user.uid, connectionId);
  }

  async getProviderFamilyForConnection(
    user: AdminUser,
    connectionId: string,
  ): Promise<ComputeProviderFamily> {
    const connection = await computeConnectionStore.getForUser(user.uid, connectionId);
    if (!connection) throw new Error("COMPUTE_CONNECTION_NOT_FOUND");
    return connection.providerFamily;
  }
}

export const computeConnectionService = new ComputeConnectionService();