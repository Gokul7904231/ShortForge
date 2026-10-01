import type {
  SandboxCredentialBundle,
  SandboxCredentialValidation,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxProviderAdapter,
  SandboxProviderType,
  SandboxProvisionRequest,
  SandboxProvisionResult,
  SandboxRuntime,
} from "./SandboxContracts";

export class SandboxRegistry {
  private readonly adapters = new Map<SandboxProviderType, SandboxProviderAdapter>();

  register(adapter: SandboxProviderAdapter): void {
    if (this.adapters.has(adapter.metadata.providerType)) {
      throw new Error("Sandbox provider already registered: " + adapter.metadata.providerType);
    }
    this.adapters.set(adapter.metadata.providerType, adapter);
  }

  get(type: SandboxProviderType): SandboxProviderAdapter | undefined {
    return this.adapters.get(type);
  }

  metadata() {
    return [...this.adapters.values()].map((adapter) => adapter.metadata);
  }

  async validateCredentials(
    type: SandboxProviderType,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxCredentialValidation> {
    return this.require(type).validateCredentials(credentials);
  }

  async provision(
    type: SandboxProviderType,
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    return this.require(type).provision(request, credentials);
  }

  async waitReady(
    type: SandboxProviderType,
    resourceId: string,
    timeoutMs?: number,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    return this.require(type).waitReady(resourceId, timeoutMs, credentials);
  }

  async execute(
    type: SandboxProviderType,
    request: SandboxExecutionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxExecutionResult> {
    return this.require(type).execute(request, credentials);
  }

  async terminate(
    type: SandboxProviderType,
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    return this.require(type).terminate(runtime, credentials);
  }

  private require(type: SandboxProviderType): SandboxProviderAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error("Sandbox provider not registered: " + type);
    return adapter;
  }
}

export const sandboxRegistry = new SandboxRegistry();
