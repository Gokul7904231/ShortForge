/**
 * ShortForge Compute Connection Hub
 *
 * A connection is the user's durable authorization to a remote compute
 * provider. Secrets are always kept server-side and are never included in
 * public connection records, routing telemetry, or MCP tool payloads.
 */

export type ComputeProviderFamily = "NOTEBOOK" | "SANDBOX" | "API_GPU";

export type ComputeConnectionAuthMethod =
  | "OAUTH2"
  | "API_KEY"
  | "TOKEN"
  | "CREDENTIAL_BUNDLE";

export type ComputeConnectionStatus =
  | "CONNECTED"
  | "UNVERIFIED"
  | "INVALID"
  | "REVOKED"
  | "DISCONNECTED"
  | "BLOCKED";

export interface ComputeConnectionSecretBundle {
  readonly [key: string]: string;
}

export interface ComputeConnection {
  connectionId: string;
  userId: string;
  providerId: string;
  providerFamily: ComputeProviderFamily;
  displayName: string;
  authMethod: ComputeConnectionAuthMethod;
  status: ComputeConnectionStatus;
  externalAccountId?: string;
  maskedSecrets: Record<string, string>;
  metadata: Record<string, string>;
  capabilities?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
  lastValidationEvidence?: string[];
}

export interface PublicComputeConnection extends Omit<ComputeConnection, "userId"> {
  secretKeys: string[];
}

export interface ComputeProviderDefinition {
  providerId: string;
  providerFamily: ComputeProviderFamily;
  displayName: string;
  authMethod: ComputeConnectionAuthMethod;
  credentialKeys: string[];
  configurableKeys: string[];
  roles: Array<"BASIC" | "ADMIN">;
  implemented: boolean;
  description: string;
}

export interface ConnectionCreateInput {
  providerId: string;
  displayName?: string;
  credentials: ComputeConnectionSecretBundle;
  metadata?: Record<string, string>;
  externalAccountId?: string;
}

export interface ConnectionValidationResult {
  connectionId: string;
  providerId: string;
  status: ComputeConnectionStatus;
  authenticated: boolean;
  checkedAt: string;
  evidence: string[];
  errorCode?: string;
  errorMessage?: string;
}
