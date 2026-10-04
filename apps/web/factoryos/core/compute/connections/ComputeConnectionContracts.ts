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

export type ComputeConnectionExperience =
  | "OAUTH"
  | "GUIDED_MANUAL"
  | "MANUAL";

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

export interface ComputeCredentialInputDefinition {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface ComputeCredentialProfile {
  id: string;
  label: string;
  authMethod: ComputeConnectionAuthMethod;
  requiredKeys: string[];
  optionalKeys?: string[];
  inputs: ComputeCredentialInputDefinition[];
  advanced?: boolean;
}

export interface ComputeProviderOAuthDefinition {
  startPath: string;
  scopes: string[];
  /** Human-readable permissions shown to normal users instead of raw scope IDs. */
  permissions?: string[];
}

export interface ComputeProviderOnboardingDefinition {
  summary?: string;
  steps: string[];
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
  connectionExperience: ComputeConnectionExperience;
  credentialKeys: string[];
  configurableKeys: string[];
  credentialProfiles?: ComputeCredentialProfile[];
  oauth?: ComputeProviderOAuthDefinition;
  onboarding?: ComputeProviderOnboardingDefinition;
  setupUrl?: string;
  roles: Array<"BASIC" | "ADMIN">;
  implemented: boolean;
  description: string;
}

export interface ConnectionCreateInput {
  providerId: string;
  providerFamily?: ComputeProviderFamily;
  authMethod?: ComputeConnectionAuthMethod;
  displayName?: string;
  credentials: ComputeConnectionSecretBundle;
  metadata?: Record<string, string>;
  externalAccountId?: string;
}

export interface OAuthConnectionCreateInput {
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
