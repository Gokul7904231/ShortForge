import fs from "node:fs/promises";
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

type OpenComputerSandbox = any;
type OpenComputerModule = {
  Sandbox: {
    create(opts?: Record<string, unknown>): Promise<OpenComputerSandbox>;
    connect(id: string, opts?: Record<string, unknown>): Promise<OpenComputerSandbox>;
  };
};

async function loadOpenComputer(): Promise<OpenComputerModule> {
  try {
    const importModule = Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
    return (await importModule("@opencomputer/sdk")) as OpenComputerModule;
  } catch (error: any) {
    throw new Error(
      "OPENCOMPUTER_SDK_MISSING: install @opencomputer/sdk in the runtime that activates OpenComputer." +
        (error?.message ? " " + error.message : ""),
    );
  }
}

function apiKeyFor(credentials?: SandboxCredentialBundle): string {
  const apiKey = credentials?.OPENCOMPUTER_API_KEY || process.env.OPENCOMPUTER_API_KEY;
  if (!apiKey) throw new Error("SANDBOX_CREDENTIAL_MISSING:OPENCOMPUTER_API_KEY");
  return apiKey;
}

function apiUrlFor(credentials?: SandboxCredentialBundle): string {
  return (
    credentials?.OPENCOMPUTER_API_URL ||
    process.env.OPENCOMPUTER_API_URL ||
    "https://app.opencomputer.dev"
  ).replace(/\/$/, "");
}

function stateOf(sandbox: OpenComputerSandbox): SandboxRuntimeState {
  const status = String(sandbox?.status || sandbox?.state || "").toUpperCase();
  if (["CREATING", "STARTING", "PROVISIONING", "PENDING", "BOOTING"].includes(status)) return "PROVISIONING";
  if (["RUNNING", "READY", "ACTIVE"].includes(status)) return "RUNNING";
  if (["PAUSED", "SUSPENDED"].includes(status)) return "PAUSED";
  if (["HIBERNATED", "STOPPED"].includes(status)) return "HIBERNATED";
  if (["FAILED", "ERROR"].includes(status)) return "FAILED";
  if (["TERMINATED", "DELETED", "DESTROYED", "KILLED"].includes(status)) return "TERMINATED";
  return "UNKNOWN";
}

async function getSandbox(
  resourceId: string,
  credentials?: SandboxCredentialBundle,
): Promise<OpenComputerSandbox> {
  const { Sandbox } = await loadOpenComputer();
  return Sandbox.connect(resourceId, {
    apiKey: apiKeyFor(credentials),
    apiUrl: apiUrlFor(credentials),
  });
}

function toRuntime(sandbox: OpenComputerSandbox): SandboxRuntime {
  return {
    providerId: "sandbox_opencomputer",
    providerType: "OPENCOMPUTER",
    resourceId: String(sandbox.sandboxId || sandbox.id),
    state: stateOf(sandbox),
    createdAt:
      typeof sandbox.createdAt === "string" ? sandbox.createdAt : undefined,
    updatedAt: new Date().toISOString(),
    endpointUri:
      typeof sandbox.domain === "string" && sandbox.domain
        ? "https://" + sandbox.domain
        : undefined,
    providerMetadata: {
      sandboxId: sandbox.sandboxId || sandbox.id,
      status: sandbox.status,
      template: sandbox.template,
      domain: sandbox.domain,
    },
  };
}

async function authorizedProbe(credentials?: SandboxCredentialBundle): Promise<void> {
  const response = await fetch(apiUrlFor(credentials) + "/api/sandboxes", {
    headers: { "X-API-Key": apiKeyFor(credentials) },
  });
  if (!response.ok) {
    const error = new Error("OpenComputer authentication request returned HTTP " + response.status);
    (error as any).status = response.status;
    throw error;
  }
}

export class OpenComputerSandboxAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_opencomputer",
    providerType: "OPENCOMPUTER" as const,
    runtimeKind: "OPENCOMPUTER_SANDBOX" as const,
    apiVersion: "typescript-sdk-2.3.0",
    documentationUrl: "https://docs-v1.opencomputer.dev/reference/typescript-sdk/sandbox",
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
    const requiredKeys = ["OPENCOMPUTER_API_KEY"];
    const checkedAt = new Date().toISOString();
    if (!credentials?.OPENCOMPUTER_API_KEY && !process.env.OPENCOMPUTER_API_KEY) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: requiredKeys,
        checkedAt,
        evidence: ["OPENCOMPUTER_API_KEY is required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING:OPENCOMPUTER_API_KEY",
      };
    }

    try {
      await authorizedProbe(credentials);
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Authenticated against the OpenComputer sandbox API."],
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["OpenComputer credential validation request failed."],
        errorCode: "OPENCOMPUTER_AUTH_FAILED",
        errorMessage: error?.message || "OpenComputer validation failed.",
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    const { Sandbox } = await loadOpenComputer();
    const sandbox = await Sandbox.create({
      template:
        request.template ||
        process.env.OPENCOMPUTER_TEMPLATE ||
        "base",
      timeout: request.ttlSeconds || 3600,
      apiKey: apiKeyFor(credentials),
      apiUrl: apiUrlFor(credentials),
      cpuCount: request.metadata?.cpuCores
        ? Number(request.metadata.cpuCores)
        : undefined,
      memoryMB: request.metadata?.memoryMb
        ? Number(request.metadata.memoryMb)
        : undefined,
      envs: {
        SHORTFORGE_OPERATION_KEY: request.idempotencyKey,
        SHORTFORGE_SURFACE: "sandbox-fabric",
      },
      metadata: {
        shortforge_managed: "true",
        shortforge_operation_key: request.idempotencyKey,
      },
    });

    return {
      runtime: toRuntime(sandbox),
      reconciliationRequired: false,
      evidence: [
        "OpenComputer hosted sandbox created through the official TypeScript SDK.",
        "ShortForge operation identity is carried as sandbox metadata.",
      ],
    };
  }

  async getRuntime(
    resourceId: string,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    return toRuntime(await getSandbox(resourceId, credentials));
  }

  async waitReady(
    resourceId: string,
    timeoutMs = 60_000,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const sandbox = await getSandbox(resourceId, credentials);
      const state = stateOf(sandbox);
      if (state === "RUNNING") return toRuntime(sandbox);
      if (state === "FAILED" || state === "TERMINATED") return toRuntime(sandbox);
      if (typeof sandbox.isRunning === "function" && (await sandbox.isRunning())) {
        return toRuntime(sandbox);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return this.getRuntime(resourceId, credentials);
  }

  async uploadFile(
    request: SandboxFileTransferRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const sandbox = await getSandbox(request.runtime.resourceId, credentials);
    const data = await fs.readFile(request.localPath);
    await sandbox.files.write(request.remotePath, new Uint8Array(data));
  }

  async downloadFile(
    request: SandboxFileDownloadRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const sandbox = await getSandbox(request.runtime.resourceId, credentials);
    const data = await sandbox.files.readBytes(request.remotePath);
    await fs.writeFile(request.localPath, Buffer.from(data));
  }

  async execute(
    request: SandboxExecutionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxExecutionResult> {
    const started = Date.now();
    try {
      const sandbox = await getSandbox(request.runtime.resourceId, credentials);
      const result = await sandbox.exec.run(request.command, {
        cwd: request.workdir,
        env: request.env,
        timeout: Math.max(1, Math.ceil(request.timeoutMs / 1000)),
      });
      const exitCode = Number(result?.exitCode ?? 0);
      return {
        providerType: "OPENCOMPUTER",
        runtimeId: request.runtime.resourceId,
        status: exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode,
        stdout: String(result?.stdout || ""),
        stderr: String(result?.stderr || ""),
        durationMs: Date.now() - started,
        evidence: ["OpenComputer sandbox.exec.run executed the command inside the hosted sandbox."],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "OPENCOMPUTER",
        runtimeId: request.runtime.resourceId,
        status: timedOut ? "TIMED_OUT" : "UNAVAILABLE",
        durationMs: Date.now() - started,
        evidence: [
          timedOut
            ? "OpenComputer command exceeded the ShortForge execution timeout."
            : "OpenComputer sandbox command execution failed.",
        ],
        limitation: message,
      };
    }
  }

  async terminate(
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const sandbox = await getSandbox(runtime.resourceId, credentials);
    await sandbox.kill();
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
        evidence: ["Reconciled OpenComputer sandbox state from the provider."],
      };
    } catch (error: any) {
      const status = Number(error?.status || 0);
      if (status === 404) {
        return {
          runtime: { ...runtime, state: "TERMINATED", updatedAt: new Date().toISOString() },
          found: false,
          terminal: true,
          reconciliationRequired: false,
          evidence: ["OpenComputer reports the sandbox no longer exists."],
        };
      }
      return {
        runtime,
        found: false,
        terminal: false,
        reconciliationRequired: true,
        evidence: ["OpenComputer reconciliation failed: " + (error?.message || String(error))],
      };
    }
  }
}
