import { isEffectiveAdmin } from "@/lib/auth/roles";
import type { AdminUser } from "@/lib/auth/types";
import { introspectKaggleToken } from "./KaggleOAuthService";
import { COMPUTE_PROVIDER_CATALOG, getComputeProviderDefinition } from "./ComputeConnectionCatalog";
import { computeConnectionStore } from "./ComputeConnectionStore";
import type {
  ConnectionCreateInput,
  ComputeConnectionSecretBundle,
  ComputeProviderFamily,
  PublicComputeConnection,
  OAuthConnectionCreateInput,
  ComputeCredentialProfile,
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
  if (!provider.roles.includes(role)) throw new Error("COMPUTE_PROVIDER_FORBIDDEN:" + providerId);
  if (!provider.implemented) throw new Error("COMPUTE_PROVIDER_NOT_IMPLEMENTED:" + providerId);
  return provider;
}

function selectCredentialProfile(
  provider: NonNullable<ReturnType<typeof getComputeProviderDefinition>>,
  input: ComputeConnectionSecretBundle,
): ComputeCredentialProfile {
  const profiles = provider.credentialProfiles?.length
    ? provider.credentialProfiles
    : [{
        id: "default",
        label: provider.displayName,
        authMethod: provider.authMethod,
        requiredKeys: provider.credentialKeys,
        inputs: provider.credentialKeys.map((key) => ({ key, label: key, secret: true, required: true })),
      }];

  const match = profiles.find((profile) => profile.requiredKeys.every((key) => !!input[key]));
  if (!match) throw new Error("COMPUTE_CREDENTIAL_PROFILE_UNSUPPORTED:" + provider.providerId);
  return match;
}

function sanitizeCredentials(
  provider: ReturnType<typeof getComputeProviderDefinition>,
  input: ComputeConnectionSecretBundle,
): { credentials: ComputeConnectionSecretBundle; authMethod: ComputeCredentialProfile["authMethod"] } {
  if (!provider) throw new Error("COMPUTE_PROVIDER_UNKNOWN");
  const profiles = provider.credentialProfiles?.length
    ? provider.credentialProfiles
    : [{ id: "default", label: provider.displayName, authMethod: provider.authMethod, requiredKeys: provider.credentialKeys, inputs: [] }];
  const selected = selectCredentialProfile(provider, input);
  const allowed = new Set<string>([
    ...provider.credentialKeys,
    ...provider.configurableKeys,
    ...profiles.flatMap((profile) => [...profile.requiredKeys, ...(profile.optionalKeys || [])]),
  ]);

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!allowed.has(key)) throw new Error("COMPUTE_CREDENTIAL_KEY_UNSUPPORTED:" + key);
    if (typeof value !== "string" || value.length === 0) throw new Error("COMPUTE_CREDENTIAL_VALUE_INVALID:" + key);
    if (value.length > 20_000) throw new Error("COMPUTE_CREDENTIAL_VALUE_TOO_LARGE:" + key);
    clean[key] = value;
  }
  for (const required of selected.requiredKeys) {
    if (!clean[required]) throw new Error("COMPUTE_CREDENTIAL_MISSING:" + required);
  }
  return { credentials: clean, authMethod: selected.authMethod };
}

export class ComputeConnectionService {
  async list(user: AdminUser) {
    return { connections: await computeConnectionStore.listForUser(user.uid), providers: listAvailableProviders(user) };
  }

  async create(user: AdminUser, input: ConnectionCreateInput): Promise<PublicComputeConnection> {
    const provider = assertProviderAccess(user, input.providerId);
    const sanitized = sanitizeCredentials(provider, input.credentials);

    // Kaggle's modern personal token is a much simpler advanced fallback than
    // asking users for both a username and a legacy key. Resolve its identity
    // server-side, then keep the existing adapter contract intact.
    if (provider.providerId === "notebook_kaggle" && sanitized.credentials.KAGGLE_API_TOKEN) {
      const identity = await introspectKaggleToken(sanitized.credentials.KAGGLE_API_TOKEN);
      const credentials = {
        ...sanitized.credentials,
        KAGGLE_USERNAME: identity.username,
        KAGGLE_USER_ID: String(identity.userId),
        ...(identity.expiresAt ? { KAGGLE_TOKEN_EXPIRES_AT: String(identity.expiresAt * 1000) } : {}),
      };
      return computeConnectionStore.create(user.uid, {
        providerId: provider.providerId,
        providerFamily: provider.providerFamily,
        authMethod: sanitized.authMethod,
        displayName: input.displayName || provider.displayName,
        credentials,
        metadata: { ...(input.metadata || {}), kaggleUsername: identity.username, kaggleUserId: String(identity.userId), kaggleScopes: identity.scope },
        externalAccountId: input.externalAccountId || String(identity.userId),
      });
    }

    return computeConnectionStore.create(user.uid, {
      providerId: provider.providerId,
      providerFamily: provider.providerFamily,
      authMethod: sanitized.authMethod,
      displayName: input.displayName || provider.displayName,
      credentials: sanitized.credentials,
      metadata: input.metadata,
      externalAccountId: input.externalAccountId,
    });
  }

  async createOAuth(user: AdminUser, input: OAuthConnectionCreateInput): Promise<PublicComputeConnection> {
    const provider = assertProviderAccess(user, input.providerId);
    if (provider.connectionExperience !== "OAUTH" || !provider.oauth) {
      throw new Error("COMPUTE_PROVIDER_OAUTH_UNSUPPORTED:" + provider.providerId);
    }
    if (!input.credentials || Object.keys(input.credentials).length === 0) {
      throw new Error("COMPUTE_OAUTH_CREDENTIALS_EMPTY");
    }
    return computeConnectionStore.upsertOAuth(user.uid, {
      providerId: provider.providerId,
      providerFamily: provider.providerFamily,
      authMethod: "TOKEN",
      displayName: input.displayName || provider.displayName,
      credentials: input.credentials,
      metadata: input.metadata,
      externalAccountId: input.externalAccountId,
    });
  }

  async remove(user: AdminUser, connectionId: string): Promise<boolean> {
    return computeConnectionStore.deleteForUser(user.uid, connectionId);
  }

  async getProviderFamilyForConnection(user: AdminUser, connectionId: string): Promise<ComputeProviderFamily> {
    const connection = await computeConnectionStore.getForUser(user.uid, connectionId);
    if (!connection) throw new Error("COMPUTE_CONNECTION_NOT_FOUND");
    return connection.providerFamily;
  }
}

export const computeConnectionService = new ComputeConnectionService();
