import {
  SandboxHttpClient,
  SandboxHttpError,
} from "./SandboxHttpClient";
import type {
  SandboxCredentialBundle,
  SandboxCredentialValidation,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxProviderAdapter,
  SandboxProvisionRequest,
  SandboxProvisionResult,
  SandboxReconciliationResult,
  SandboxRuntime,
  SandboxRuntimeState,
} from "./SandboxContracts";

interface PandaStackSandboxResponse {
  id?: string;
  state?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PandaStackExecResponse {
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  exitCode?: number;
  duration_ms?: number;
}

function mapState(value: unknown): SandboxRuntimeState {
  const state = String(value || "").toLowerCase();
  if (["creating", "requested", "booting", "provisioning", "starting"].includes(state)) return "PROVISIONING";
  if (["running", "ready"].includes(state)) return "RUNNING";
  if (state === "paused") return "PAUSED";
  if (["hibernated", "sleeping"].includes(state)) return "HIBERNATED";
  if (["failed", "error"].includes(state)) return "FAILED";
  if (["deleted", "terminated", "killed"].includes(state)) return "TERMINATED";
  return "UNKNOWN";
}

export class PandaStackSandboxAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_pandastack_hosted",
    providerType: "PANDASTACK" as const,
    runtimeKind: "FIRECRACKER_MICROVM" as const,
    apiVersion: "v1",
    documentationUrl: "https://docs.pandastack.ai/docs/",
    capabilities: {
      canValidateCredentials: true,
      canProvision: true,
      canExecuteCommand: true,
      canReadFile: true,
      canWriteFile: true,
      canTerminate: true,
      supportsPersistence: true,
      supportsSnapshots: true,
      supportsForks: true,
      productionWorkerEligible: false,
    },
  };

  private readonly client: SandboxHttpClient;

  constructor(client = new SandboxHttpClient()) {
    this.client = client;
  }

  async validateCredentials(
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxCredentialValidation> {
    const checkedAt = new Date().toISOString();
    const requiredKeys = ["PANDASTACK_API_KEY"];
    if (!credentials?.PANDASTACK_API_KEY) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: requiredKeys,
        checkedAt,
        evidence: ["PANDASTACK_API_KEY is required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING:PANDASTACK_API_KEY",
      };
    }

    try {
      await this.client.requestJson<Record<string, unknown>>("/v1/me", credentials, {}, 15_000);
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Authenticated against PandaStack /v1/me."],
      };
    } catch (error) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: !(error instanceof SandboxHttpError && error.status === 401),
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["PandaStack credential validation failed."],
        errorCode: error instanceof SandboxHttpError ? "HTTP_" + error.status : "SANDBOX_VALIDATION_FAILED",
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    const body = {
      template: request.template || "code-interpreter",
      ttl_seconds: request.ttlSeconds ?? 3600,
      metadata: {
        ...(request.metadata || {}),
        shortforge_operation_key: request.idempotencyKey,
        shortforge_surface: "sandbox-fabric",
      },
    };

    const response = await this.client.requestJson<PandaStackSandboxResponse>(
      "/v1/sandboxes",
      credentials,
      { method: "POST", body: JSON.stringify(body) },
      30_000,
    );

    if (!response.id) throw new Error("SANDBOX_PROVIDER_RESPONSE_INVALID:missing_id");

    const runtime = this.toRuntime(response);
    return {
      runtime,
      reconciliationRequired: runtime.state === "UNKNOWN",
      evidence: [
        "PandaStack sandbox created through POST /v1/sandboxes.",
        "ShortForge operation key was attached as metadata; provider-side idempotency is not assumed.",
      ],
    };
  }

  async getRuntime(
    resourceId: string,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const response = await this.client.requestJson<PandaStackSandboxResponse>(
      "/v1/sandboxes/" + encodeURIComponent(resourceId),
      credentials,
      { method: "GET" },
      15_000,
    );
    return this.toRuntime({ ...response, id: response.id || resourceId });
  }

  async waitReady(
    resourceId: string,
    timeoutMs = 60_000,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const deadline = Date.now() + timeoutMs;
    let last = await this.getRuntime(resourceId, credentials);
    while (Date.now() < deadline) {
      if (["RUNNING", "READY"].includes(last.state)) return last;
      if (["FAILED", "TERMINATED"].includes(last.state)) return last;
      await new Promise((resolve) => setTimeout(resolve, 500));
      last = await this.getRuntime(resourceId, credentials);
    }
    throw new Error("SANDBOX_READY_TIMEOUT:" + resourceId);
  }

  async execute(
    request: SandboxExecutionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxExecutionResult> {
    try {
      const response = await this.client.requestJson<PandaStackExecResponse>(
        "/v1/sandboxes/" + encodeURIComponent(request.runtime.resourceId) + "/exec",
        credentials,
        {
          method: "POST",
          body: JSON.stringify({
            cmd: request.command,
            timeout_seconds: Math.max(1, Math.ceil(request.timeoutMs / 1000)),
          }),
        },
        request.timeoutMs + 15_000,
      );

      const exitCode = response.exit_code ?? response.exitCode ?? 0;
      return {
        providerType: "PANDASTACK",
        runtimeId: request.runtime.resourceId,
        status: exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode,
        stdout: response.stdout || "",
        stderr: response.stderr || "",
        durationMs: response.duration_ms,
        evidence: ["PandaStack command execution completed through /exec."],
      };
    } catch (error) {
      if (error instanceof SandboxHttpError && error.status === 409) {
        return {
          providerType: "PANDASTACK",
          runtimeId: request.runtime.resourceId,
          status: "FAILED",
          evidence: ["Provider rejected execution because the sandbox was not runnable."],
          limitation: "Sandbox must be running before exec; ShortForge does not auto-resume a paused or hibernated sandbox.",
        };
      }
      if (error instanceof Error && error.message === "SANDBOX_PROVIDER_TIMEOUT") {
        return {
          providerType: "PANDASTACK",
          runtimeId: request.runtime.resourceId,
          status: "TIMED_OUT",
          evidence: ["Provider request exceeded the ShortForge execution deadline."],
        };
      }
      throw error;
    }
  }

  async terminate(
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    try {
      await this.client.requestJson<void>(
        "/v1/sandboxes/" + encodeURIComponent(runtime.resourceId),
        credentials,
        { method: "DELETE" },
        15_000,
      );
    } catch (error) {
      if (!(error instanceof SandboxHttpError && error.status === 404)) throw error;
    }

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }

  async reconcile(
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxReconciliationResult> {
    try {
      const current = await this.getRuntime(runtime.resourceId, credentials);
      return {
        runtime: current,
        found: true,
        terminal: ["FAILED", "TERMINATED"].includes(current.state),
        reconciliationRequired: current.state === "UNKNOWN",
        evidence: ["Reconciled sandbox state from provider control plane."],
      };
    } catch (error) {
      if (error instanceof SandboxHttpError && error.status === 404) {
        return {
          runtime: { ...runtime, state: "TERMINATED", updatedAt: new Date().toISOString() },
          found: false,
          terminal: true,
          reconciliationRequired: false,
          evidence: ["Provider reports the sandbox resource no longer exists."],
        };
      }
      throw error;
    }
  }

  private toRuntime(response: PandaStackSandboxResponse): SandboxRuntime {
    const updatedAt =
      typeof response.updated_at === "string"
        ? response.updated_at
        : new Date().toISOString();

    return {
      providerId: this.metadata.providerId,
      providerType: "PANDASTACK",
      resourceId: response.id || "",
      state: mapState(response.state || response.status),
      createdAt: typeof response.created_at === "string" ? response.created_at : undefined,
      updatedAt,
      providerMetadata: { ...response },
    };
  }
}