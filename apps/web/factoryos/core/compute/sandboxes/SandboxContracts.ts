/**
 * ShortForge / FactoryOS Sandbox Fabric.
 *
 * Sandboxes are an isolated execution plane. They are not notebook runtimes,
 * are not F06 workers, and do not become production workers implicitly.
 */
export type SandboxProviderType = "PANDASTACK";

export type SandboxRuntimeState =
  | "REQUESTED"
  | "PROVISIONING"
  | "READY"
  | "RUNNING"
  | "PAUSED"
  | "HIBERNATED"
  | "FAILED"
  | "TERMINATED"
  | "UNKNOWN";

export interface SandboxProviderMetadata {
  providerId: string;
  providerType: SandboxProviderType;
  runtimeKind: "FIRECRACKER_MICROVM";
  apiVersion: string;
  documentationUrl: string;
  capabilities: {
    canValidateCredentials: boolean;
    canProvision: boolean;
    canExecuteCommand: boolean;
    canReadFile: boolean;
    canWriteFile: boolean;
    canTerminate: boolean;
    supportsPersistence: boolean;
    supportsSnapshots: boolean;
    supportsForks: boolean;
    productionWorkerEligible: boolean;
  };
}

export type SandboxCredentialBundle = Readonly<Record<string, string>>;

export interface SandboxCredentialValidation {
  configured: boolean;
  authenticated: boolean;
  providerReachable: boolean;
  requiredKeys: string[];
  missingKeys: string[];
  checkedAt: string;
  evidence: string[];
  errorCode?: string;
}

export interface SandboxProvisionRequest {
  idempotencyKey: string;
  template?: string;
  ttlSeconds?: number;
  metadata?: Record<string, string>;
}

export interface SandboxRuntime {
  providerId: string;
  providerType: SandboxProviderType;
  resourceId: string;
  state: SandboxRuntimeState;
  createdAt?: string;
  updatedAt: string;
  endpointUri?: string;
  providerMetadata: Record<string, unknown>;
}

export interface SandboxProvisionResult {
  runtime: SandboxRuntime;
  reconciliationRequired: boolean;
  evidence: string[];
}

export interface SandboxExecutionRequest {
  runtime: SandboxRuntime;
  command: string;
  timeoutMs: number;
}

export interface SandboxExecutionResult {
  providerType: SandboxProviderType;
  runtimeId: string;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "UNAVAILABLE";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  evidence: string[];
  limitation?: string;
}

export interface SandboxReconciliationResult {
  runtime: SandboxRuntime;
  found: boolean;
  terminal: boolean;
  reconciliationRequired: boolean;
  evidence: string[];
}

export interface SandboxProviderAdapter {
  readonly metadata: SandboxProviderMetadata;
  validateCredentials(credentials?: SandboxCredentialBundle): Promise<SandboxCredentialValidation>;
  provision(request: SandboxProvisionRequest, credentials?: SandboxCredentialBundle): Promise<SandboxProvisionResult>;
  getRuntime(resourceId: string, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime>;
  waitReady(resourceId: string, timeoutMs?: number, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime>;
  execute(request: SandboxExecutionRequest, credentials?: SandboxCredentialBundle): Promise<SandboxExecutionResult>;
  terminate(runtime: SandboxRuntime, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime>;
  reconcile?(runtime: SandboxRuntime, credentials?: SandboxCredentialBundle): Promise<SandboxReconciliationResult>;
}