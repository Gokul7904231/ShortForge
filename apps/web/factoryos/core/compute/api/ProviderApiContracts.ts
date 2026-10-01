/**
 * ShortForge / FactoryOS Provider Control Plane — API-only contracts.
 *
 * This layer acquires and reconciles cloud compute resources.
 * It deliberately does NOT execute ShortForge render workers, own CAS, or
 * certify F07 artifacts.
 */

export type ApiProviderType =
  | "VAST"
  | "RUNPOD"
  | "DAYTONA"
  | "PAPERSPACE"
  | "MODAL";

export type ProviderDiscoveryKind =
  | "DYNAMIC_MARKETPLACE"
  | "CATALOG"
  | "SANDBOX"
  | "MACHINE"
  | "SDK_SANDBOX";

export type ProviderResourceState =
  | "REQUESTED"
  | "ACCEPTED"
  | "PROVISIONING"
  | "BOOTING"
  | "READY"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED"
  | "TERMINATING"
  | "TERMINATED"
  | "FAILED"
  | "UNKNOWN";

export type ProviderOperationType =
  | "AUTH_VALIDATE"
  | "ACCOUNT_CONTEXT"
  | "QUOTA"
  | "DISCOVER_OFFERS"
  | "PROVISION"
  | "GET_RESOURCE"
  | "START"
  | "STOP"
  | "RESTART"
  | "TERMINATE"
  | "RECONCILE"
  | "RENDER_PROBE";

export type ProviderOperationState =
  | "REQUESTED"
  | "ACCEPTED"
  | "PROVISIONING"
  | "READY"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN"
  | "TERMINATING"
  | "TERMINATED";

export type CapacityConfidence = "LIVE" | "DECLARED" | "UNKNOWN";

export type RenderVerificationLevel =
  | "UNAVAILABLE"
  | "CONTROL_PLANE_VERIFIED"
  | "RENDER_LAUNCH_VERIFIED"
  | "PHYSICAL_RENDER_VERIFIED";

export interface ProviderApiMetadata {
  providerId: string;
  providerType: ApiProviderType;
  apiVersion: string;
  discoveryKind: ProviderDiscoveryKind;
  baseUrl: string;
  documentationUrl: string;
  controlCapabilities: {
    canValidateCredentials: boolean;
    canDiscoverOffers: boolean;
    canReadResource: boolean;
    canProvision: boolean;
    canTerminate: boolean;
    canConfigureEntrypointByApi: boolean;
    canExecuteCommandByApi: boolean;
    canReadLogsByApi: boolean;
    canReadFilesByApi: boolean;
    canVerifyPhysicalRenderByApi: boolean;
  };
}

export interface CredentialValidationResult {
  configured: boolean;
  authenticated: boolean;
  providerReachable: boolean;
  requiredKeys: string[];
  missingKeys: string[];
  providerAccountId?: string;
  providerRequestId?: string;
  checkedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderAccountContext {
  providerId: string;
  accountId?: string;
  displayName?: string;
  plan?: string;
  currency?: string;
  metadata: Record<string, unknown>;
}

export interface ProviderQuota {
  known: boolean;
  cpuCores?: number;
  memoryMb?: number;
  gpuCount?: number;
  activeResourceCount?: number;
  maxResourceCount?: number;
  observedAt: string;
  source: "PROVIDER_API" | "LOCAL_POLICY" | "UNKNOWN";
  raw?: Record<string, unknown>;
}

export interface OfferDiscoveryRequest {
  gpuType?: string;
  minVramMb?: number;
  gpuCount?: number;
  minCpuCores?: number;
  minMemoryMb?: number;
  region?: string;
  regions?: string[];
  acceleratorRequired?: boolean;
  onDemandOnly?: boolean;
  maxHourlyPrice?: number;
  maxOffers?: number;
}

export interface ComputeOffer {
  offerId: string;
  providerId: string;
  providerType: ApiProviderType;
  discoveryKind: ProviderDiscoveryKind;
  capacityConfidence: CapacityConfidence;
  observedAt: string;
  expiresAt?: string;
  compute: {
    cpuCores?: number;
    memoryMb?: number;
    diskGb?: number;
  };
  accelerator?: {
    type?: string;
    count: number;
    vramMb?: number;
    hardwareVideoEncode?: boolean;
  };
  location?: {
    region?: string;
    zone?: string;
    datacenter?: string;
  };
  pricing?: {
    hourly?: number;
    currency?: string;
    minimumBilledSeconds?: number;
  };
  network?: {
    publicIpAvailable?: boolean;
    publicPortsAvailable?: boolean;
    bandwidthMbps?: number;
  };
  preemption?: {
    interruptible?: boolean;
    warningSeconds?: number;
  };
  capabilities: {
    customImage: boolean;
    startupCommand: boolean;
    commandExecutionByApi: boolean;
    fileReadByApi: boolean;
  };
  providerMetadata: Record<string, unknown>;
}

export interface ProvisionRequest {
  factoryExecutionId?: string;
  missionId?: string;
  idempotencyKey: string;
  offerId?: string;
  name?: string;
  image: string;
  command?: string | string[];
  environmentVariables?: Record<string, string>;
  gpuType?: string;
  gpuCount?: number;
  minVramMb?: number;
  cpuCores?: number;
  memoryMb?: number;
  diskGb?: number;
  maxDurationSeconds?: number;
  region?: string;
  ports?: string[];
  providerOptions?: Record<string, unknown>;
}

export interface ResourceReference {
  providerId: string;
  providerType: ApiProviderType;
  resourceId: string;
  idempotencyKey?: string;
  operationId?: string;
}

export interface ProviderResource {
  reference: ResourceReference;
  state: ProviderResourceState;
  endpointUri?: string;
  startedAt?: string;
  updatedAt: string;
  expiresAt?: string;
  gpu?: {
    type?: string;
    count?: number;
    vramMb?: number;
  };
  compute?: {
    cpuCores?: number;
    memoryMb?: number;
  };
  providerMetadata: Record<string, unknown>;
}

export interface ProvisionAccepted {
  operationId: string;
  reference: ResourceReference;
  state: ProviderResourceState;
  acceptedAt: string;
  providerRequestId?: string;
  reconciliationRequired: boolean;
  rawResponse?: Record<string, unknown>;
}

export interface TerminateRequest {
  reference: ResourceReference;
  operationId?: string;
  reason?: string;
  wait?: boolean;
}

export interface TerminationResult {
  operationId: string;
  reference: ResourceReference;
  state: "TERMINATING" | "TERMINATED" | "UNKNOWN";
  completedAt?: string;
  providerRequestId?: string;
  reconciliationRequired: boolean;
}

export interface ReconciliationResult {
  reference: ResourceReference;
  previousState?: ProviderResourceState;
  currentState: ProviderResourceState;
  found: boolean;
  adopted: boolean;
  terminal: boolean;
  reconciliationRequired: boolean;
  providerRequestId?: string;
  resource?: ProviderResource;
  evidence: string[];
}

export interface RenderProbeRequest {
  image: string;
  gpuType?: string;
  gpuCount?: number;
  cpuCores?: number;
  memoryMb?: number;
  diskGb?: number;
  timeoutMs: number;
  renderCommand: string | string[];
  outputPath?: string;
  expectedDurationSeconds?: number;
}

export interface RenderProbeResult {
  providerId: string;
  providerType: ApiProviderType;
  verificationLevel: RenderVerificationLevel;
  passed: boolean;
  resourceId?: string;
  exitCode?: number;
  artifactSha256?: string;
  artifactByteLength?: number;
  mediaProbe?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
  evidence: string[];
  limitation?: string;
}

export interface ProviderOperationRecord {
  operationId: string;
  factoryExecutionId?: string;
  missionId?: string;
  providerId: string;
  providerType: ApiProviderType;
  operation: ProviderOperationType;
  state: ProviderOperationState;
  idempotencyKey: string;
  requestHash: string;
  attempt: number;
  externalOperationId?: string;
  externalResourceId?: string;
  requestedAt: string;
  acceptedAt?: string;
  readyAt?: string;
  completedAt?: string;
  expiresAt?: string;
  providerStatus?: string;
  providerRequestId?: string;
  providerErrorCode?: string;
  providerErrorMessage?: string;
  reconciliationRequired: boolean;
  metadata: Record<string, unknown>;
}

export interface ProviderControlAdapter {
  readonly metadata: ProviderApiMetadata;
  validateCredentials(): Promise<CredentialValidationResult>;
  getAccountContext(): Promise<ProviderAccountContext>;
  getQuota(): Promise<ProviderQuota>;
  discoverOffers(request?: OfferDiscoveryRequest): Promise<ComputeOffer[]>;
  provision(request: ProvisionRequest): Promise<ProvisionAccepted>;
  /**
   * Optional recovery hook for a timed-out/ambiguous PROVISION request.
   * Implementations must discover an already-created resource using a
   * deterministic provider-visible identity rather than creating another one.
   */
  reconcileProvision?(
    request: ProvisionRequest,
    operation: ProviderOperationRecord,
  ): Promise<ProvisionAccepted | undefined>;
  getResource(resourceId: string): Promise<ProviderResource>;
  terminate(request: TerminateRequest): Promise<TerminationResult>;
  reconcile(reference: ResourceReference): Promise<ReconciliationResult>;
  renderProbe?(request: RenderProbeRequest): Promise<RenderProbeResult>;
}
