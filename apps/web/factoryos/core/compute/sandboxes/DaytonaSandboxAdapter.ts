import type {
  SandboxCredentialBundle,
  SandboxCredentialValidation,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxFileDownloadRequest,
  SandboxFileTransferRequest,
  SandboxProviderAdapter,
  SandboxProvisionRequest,
  SandboxProvisionResult,
  SandboxReconciliationResult,
  SandboxRuntime,
  SandboxRuntimeState,
} from "./SandboxContracts";

type DaytonaSandbox = any;
type DaytonaClient = any;
type DaytonaModule = { Daytona: new (config?: Record<string, unknown>) => DaytonaClient };

function loadDaytona(): DaytonaModule {
  try {
    // Optional runtime dependency. The sandbox plane fails closed if the SDK
    // is not installed in the runtime that activates Daytona.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@daytona/sdk") as DaytonaModule;
  } catch (error: any) {
    throw new Error(
      "DAYTONA_SDK_MISSING: install @daytona/sdk in the runtime that activates Daytona." +
        (error?.message ? " " + error.message : ""),
    );
  }
}

function stateOf(sandbox: DaytonaSandbox): SandboxRuntimeState {
  const state = String(sandbox?.state || sandbox?.status || "").toUpperCase();
  if (["STARTING", "CREATING", "PROVISIONING", "PENDING"].includes(state)) return "PROVISIONING";
  if (["RUNNING", "READY"].includes(state)) return "RUNNING";
  if (["PAUSED"].includes(state)) return "PAUSED";
  if (["HIBERNATED", "ARCHIVED"].includes(state)) return "HIBERNATED";
  if (["FAILED", "ERROR"].includes(state)) return "FAILED";
  if (["TERMINATED", "DELETED", "DESTROYED"].includes(state)) return "TERMINATED";
  return "UNKNOWN";
}

function clientFor(credentials?: SandboxCredentialBundle): DaytonaClient {
  const apiKey = credentials?.DAYTONA_API_KEY || process.env.DAYTONA_API_KEY;
  if (!apiKey) throw new Error("SANDBOX_CREDENTIAL_MISSING:DAYTONA_API_KEY");
  const { Daytona } = loadDaytona();
  return new Daytona({
    apiKey,
    apiUrl: credentials?.DAYTONA_API_URL || process.env.DAYTONA_API_URL,
    target: credentials?.DAYTONA_TARGET || process.env.DAYTONA_TARGET,
    requestTimeoutMs: 30_000,
  });
}

function toRuntime(sandbox: DaytonaSandbox): SandboxRuntime {
  return {
    providerId: "sandbox_daytona_hosted",
    providerType: "DAYTONA",
    resourceId: String(sandbox.id),
    state: stateOf(sandbox),
    createdAt:
      typeof sandbox.createdAt === "string" ? sandbox.createdAt : undefined,
    updatedAt: new Date().toISOString(),
    providerMetadata: {
      name: sandbox.name,
      state: sandbox.state,
      image: sandbox.image,
      target: sandbox.target,
    },
  };
}

export class DaytonaSandboxAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_daytona_hosted",
    providerType: "DAYTONA" as const,
    runtimeKind: "DAYTONA_SANDBOX" as const,
    apiVersion: "typescript-sdk",
    documentationUrl: "https://www.daytona.io/docs/en/typescript-sdk/",
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

  async validateCredentials(
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxCredentialValidation> {
    const requiredKeys = ["DAYTONA_API_KEY"];
    const checkedAt = new Date().toISOString();
    if (!credentials?.DAYTONA_API_KEY && !process.env.DAYTONA_API_KEY) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: requiredKeys,
        checkedAt,
        evidence: ["DAYTONA_API_KEY is required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING:DAYTONA_API_KEY",
      };
    }

    try {
      const client = clientFor(credentials);
      const iterator = client.list();
      if (iterator?.[Symbol.asyncIterator]) {
        await iterator[Symbol.asyncIterator]().next();
      }
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Authenticated against the Daytona sandbox API."],
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Daytona credential validation request failed."],
        errorCode: "DAYTONA_AUTH_FAILED",
        errorMessage: error?.message || "Daytona validation failed.",
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    const client = clientFor(credentials);
    const ttlMinutes = request.ttlSeconds
      ? Math.max(1, Math.ceil(request.ttlSeconds / 60))
      : 60;
    const sandbox = await client.create({
      name:
        request.metadata?.shortforge_name ||
        "shortforge-sbx-" + request.idempotencyKey.replace(/[^a-zA-Z0-9-]/g, "-").slice(-40),
      language: request.metadata?.language || "python",
      image: request.template || process.env.DAYTONA_SANDBOX_IMAGE || "python:3.12",
      envVars: {
        SHORTFORGE_OPERATION_KEY: request.idempotencyKey,
        SHORTFORGE_SURFACE: "sandbox-fabric",
      },
      autoDeleteInterval: ttlMinutes,
      ephemeral: request.metadata?.ephemeral === "false" ? false : true,
      ...(request.metadata?.gpuType
        ? {
            resources: {
              gpu: Number(request.metadata.gpuCount || 1),
              gpuType: request.metadata.gpuType,
              ...(request.metadata.cpuCores
                ? { cpu: Number(request.metadata.cpuCores) }
                : {}),
              ...(request.metadata.memoryGb
                ? { memory: Number(request.metadata.memoryGb) }
                : {}),
            },
          }
        : {}),
    }, {
      timeout: Number(request.metadata?.createTimeoutSeconds || 60),
    });

    return {
      runtime: toRuntime(sandbox),
      reconciliationRequired: false,
      evidence: [
        "Daytona hosted sandbox created through the TypeScript SDK.",
        "Provider-side idempotency is not assumed; ShortForge operation identity is carried as metadata.",
      ],
    };
  }

  async getRuntime(
    resourceId: string,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const sandbox = await clientFor(credentials).get(resourceId);
    return toRuntime(sandbox);
  }

  async waitReady(
    resourceId: string,
    timeoutMs = 60_000,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const client = clientFor(credentials);
    const sandbox = await client.get(resourceId);
    if (stateOf(sandbox) !== "RUNNING" && stateOf(sandbox) !== "READY") {
      await client.start(sandbox, Math.max(1, Math.ceil(timeoutMs / 1000)));
    }
    return toRuntime(await client.get(resourceId));
  }

  async uploadFile(
    request: SandboxFileTransferRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const sandbox = await clientFor(credentials).get(request.runtime.resourceId);
    await sandbox.fs.uploadFile(
      request.localPath,
      request.remotePath,
      Math.max(1, Math.ceil((request.timeoutMs || 1_800_000) / 1000)),
    );
  }

  async downloadFile(
    request: SandboxFileDownloadRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const sandbox = await clientFor(credentials).get(request.runtime.resourceId);
    await sandbox.fs.downloadFile(
      request.remotePath,
      request.localPath,
      Math.max(1, Math.ceil((request.timeoutMs || 1_800_000) / 1000)),
    );
  }

  async execute(
    request: SandboxExecutionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxExecutionResult> {
    const started = Date.now();
    try {
      const sandbox = await clientFor(credentials).get(request.runtime.resourceId);
      const response = await sandbox.process.executeCommand(
        request.command,
        request.workdir,
        request.env,
        Math.max(1, Math.ceil(request.timeoutMs / 1000)),
      );
      const exitCode = Number(response?.exitCode ?? response?.exit_code ?? 0);
      return {
        providerType: "DAYTONA",
        runtimeId: request.runtime.resourceId,
        status: exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode,
        stdout: String(response?.result || response?.stdout || ""),
        stderr: String(response?.stderr || ""),
        durationMs: Date.now() - started,
        evidence: ["Daytona Process API executed the command inside the hosted sandbox."],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "DAYTONA",
        runtimeId: request.runtime.resourceId,
        status: timedOut ? "TIMED_OUT" : "UNAVAILABLE",
        durationMs: Date.now() - started,
        evidence: [
          timedOut
            ? "Daytona command exceeded the ShortForge execution timeout."
            : "Daytona sandbox command execution failed.",
        ],
        limitation: message,
      };
    }
  }

  async terminate(
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const client = clientFor(credentials);
    const sandbox = await client.get(runtime.resourceId);
    await client.delete(sandbox, 60, true);
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
        evidence: ["Reconciled Daytona sandbox state from the provider."],
      };
    } catch (error: any) {
      const status = Number(error?.status || 0);
      if (status === 404) {
        return {
          runtime: { ...runtime, state: "TERMINATED", updatedAt: new Date().toISOString() },
          found: false,
          terminal: true,
          reconciliationRequired: false,
          evidence: ["Daytona reports the sandbox no longer exists."],
        };
      }
      return {
        runtime,
        found: false,
        terminal: false,
        reconciliationRequired: true,
        evidence: ["Daytona sandbox reconciliation failed: " + (error?.message || String(error))],
      };
    }
  }
}
