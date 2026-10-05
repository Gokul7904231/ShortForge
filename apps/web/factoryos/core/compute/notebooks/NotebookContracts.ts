/**
 * ShortForge / FactoryOS Notebook & Interactive Compute Fabric.
 *
 * Notebook runtimes are modeled separately from the API-provider control plane
 * and from the F06 worker plane.
 */

export type NotebookProviderType =
  | "KAGGLE"
  | "COLAB"
  | "PAPERSPACE"
  | "LIGHTNING"
  | "HF_ZEROGPU";

export type NotebookRuntimeKind =
  | "KAGGLE_KERNEL"
  | "COLAB_RUNTIME"
  | "PAPERSPACE_MACHINE_BACKED_NOTEBOOK"
  | "LIGHTNING_STUDIO"
  | "ZEROGPU_SPACE";

export type NotebookPaymentRequirement =
  | "NO_CARD_STATED"
  | "NO_CARD_NOT_ESTABLISHED"
  | "CARD_OR_CREDIT_REQUIRED"
  | "SELF_HOSTED_NO_VENDOR_BILLING";

export type NotebookResourceState =
  | "REQUESTED"
  | "QUEUED"
  | "STARTING"
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TERMINATED"
  | "UNKNOWN";

export type NotebookVerificationLevel =
  | "UNAVAILABLE"
  | "CONTROL_PLANE_VERIFIED"
  | "CODE_EXECUTION_VERIFIED"
  | "PHYSICAL_ARTIFACT_VERIFIED";

export interface NotebookCapabilities {
  canValidateCredentials: boolean;
  canProvision: boolean;
  canExecuteCode: boolean;
  canInvokeHostedFunction: boolean;
  canReadOutputs: boolean;
  canReadLogs: boolean;
  canTerminate: boolean;
  supportsGpu: boolean;
  supportsPersistence: boolean;
  productionWorkerEligible: boolean;
  note?: string;
}

export interface NotebookProviderMetadata {
  providerId: string;
  providerType: NotebookProviderType;
  runtimeKind: NotebookRuntimeKind;
  apiVersion: string;
  documentationUrl: string;
  paymentRequirement: NotebookPaymentRequirement;
  capabilities: NotebookCapabilities;
  maxSessionSeconds?: number;
  gpuTypes?: string[];
}

export type NotebookCredentialBundle = Readonly<Record<string, string>>;

export interface NotebookCredentialValidation {
  configured: boolean;
  authenticated: boolean;
  providerReachable: boolean;
  requiredKeys: string[];
  missingKeys: string[];
  checkedAt: string;
  evidence: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface NotebookProvisionRequest {
  idempotencyKey: string;
  name: string;
  image?: string;
  templateId?: string;
  command?: string | string[];
  outputPath?: string;
  gpuType?: string;
  gpuCount?: number;
  cpuCores?: number;
  memoryMb?: number;
  diskGb?: number;
  timeoutMs?: number;
  region?: string;
  metadata?: Record<string, unknown>;
}

export interface NotebookRuntime {
  providerId: string;
  providerType: NotebookProviderType;
  resourceId: string;
  runtimeKind: NotebookRuntimeKind;
  state: NotebookResourceState;
  startedAt?: string;
  updatedAt: string;
  endpointUri?: string;
  notebookUrl?: string;
  gpuType?: string;
  gpuCount?: number;
  providerMetadata: Record<string, unknown>;
}

export interface NotebookProvisionResult {
  runtime: NotebookRuntime;
  reconciliationRequired: boolean;
  evidence: string[];
}

export interface NotebookExecutionRequest {
  runtime?: NotebookRuntime;
  provision?: NotebookProvisionRequest;
  command: string | string[];
  timeoutMs: number;
  outputPath?: string;
  /**
   * Optional local template directory for providers whose native notebook
   * lifecycle executes a repository-owned entrypoint. The provider copies the
   * template into its ephemeral submission bundle before pushing it.
   */
  templateDirectory?: string;
  /**
   * Optional caller-owned destination for a provider-downloaded artifact.
   * Providers must materialize the artifact before returning so their internal
   * ephemeral work directory can still be cleaned up safely.
   */
  artifactDestinationPath?: string;
}

export interface NotebookExecutionResult {
  providerType: NotebookProviderType;
  runtimeId?: string;
  verificationLevel: NotebookVerificationLevel;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "UNAVAILABLE";
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  artifactPath?: string;
  artifactSha256?: string;
  artifactByteLength?: number;
  evidence: string[];
  limitation?: string;
}

export interface NotebookReconciliationResult {
  runtime: NotebookRuntime;
  found: boolean;
  adopted: boolean;
  terminal: boolean;
  reconciliationRequired: boolean;
  evidence: string[];
}

export interface NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata;
  validateCredentials(credentials?: NotebookCredentialBundle): Promise<NotebookCredentialValidation>;
  provision(request: NotebookProvisionRequest, credentials?: NotebookCredentialBundle): Promise<NotebookProvisionResult>;
  getRuntime(resourceId: string, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime>;
  execute(request: NotebookExecutionRequest, credentials?: NotebookCredentialBundle): Promise<NotebookExecutionResult>;
  terminate(runtime: NotebookRuntime, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime>;
  reconcile?(runtime: NotebookRuntime, credentials?: NotebookCredentialBundle): Promise<NotebookReconciliationResult>;
}
