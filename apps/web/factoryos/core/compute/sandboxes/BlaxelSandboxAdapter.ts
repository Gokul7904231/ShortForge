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

type BlaxelSandbox = any;
type BlaxelModule = {
  SandboxInstance: {
    createIfNotExists(opts: Record<string, unknown>): Promise<BlaxelSandbox>;
    get(name: string): Promise<BlaxelSandbox>;
    delete(name: string): Promise<void>;
    list(opts?: Record<string, unknown>): Promise<any>;
  };
};

async function loadBlaxel(): Promise<BlaxelModule> {
  try {
    const importModule = Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
    return (await importModule("@blaxel/core")) as BlaxelModule;
  } catch (error: any) {
    throw new Error(
      "BLAXEL_SDK_MISSING: install @blaxel/core in the runtime that activates Blaxel." +
        (error?.message ? " " + error.message : ""),
    );
  }
}

function apiKeyFor(credentials?: SandboxCredentialBundle): string {
  const apiKey = credentials?.BL_API_KEY || process.env.BL_API_KEY;
  if (!apiKey) throw new Error("SANDBOX_CREDENTIAL_MISSING:BL_API_KEY");
  return apiKey;
}

function workspaceFor(credentials?: SandboxCredentialBundle): string {
  const workspace = credentials?.BL_WORKSPACE || process.env.BL_WORKSPACE;
  if (!workspace) throw new Error("SANDBOX_CREDENTIAL_MISSING:BL_WORKSPACE");
  return workspace;
}

function stateOf(sandbox: BlaxelSandbox): SandboxRuntimeState {
  const status = String(sandbox?.status || sandbox?.state || "").toUpperCase();
  if (["CREATING", "STARTING", "PROVISIONING", "PENDING"].includes(status)) return "PROVISIONING";
  if (["RUNNING", "READY", "ACTIVE"].includes(status)) return "RUNNING";
  if (["PAUSED", "SUSPENDED", "HIBERNATED"].includes(status)) return "PAUSED";
  if (["FAILED", "ERROR"].includes(status)) return "FAILED";
  if (["TERMINATED", "DELETED", "DESTROYED", "TERMINATING", "DELETING"].includes(status)) return "TERMINATED";
  return "UNKNOWN";
}

function sandboxNameFromResource(resourceId: string): string {
  return resourceId;
}

function toRuntime(sandbox: BlaxelSandbox): SandboxRuntime {
  const name = String(sandbox?.metadata?.name || sandbox?.name || sandbox?.id);
  return {
    providerId: "sandbox_blaxel",
    providerType: "BLAXEL",
    resourceId: name,
    state: stateOf(sandbox),
    createdAt:
      typeof sandbox.createdAt === "string"
        ? sandbox.createdAt
        : typeof sandbox.metadata?.createdAt === "string"
          ? sandbox.metadata.createdAt
          : undefined,
    updatedAt: new Date().toISOString(),
    providerMetadata: {
      name,
      status: sandbox.status,
      image: sandbox.image,
      region: sandbox.region,
    },
  };
}

async function getSandbox(
  resourceId: string,
  credentials?: SandboxCredentialBundle,
): Promise<BlaxelSandbox> {
  workspaceFor(credentials);
  const { SandboxInstance } = await loadBlaxel();
  return SandboxInstance.get(sandboxNameFromResource(resourceId));
}

export class BlaxelSandboxAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_blaxel",
    providerType: "BLAXEL" as const,
    runtimeKind: "BLAXEL_SANDBOX" as const,
    apiVersion: "core-0.3.25",
    documentationUrl: "https://www.npmjs.com/package/@blaxel/core",
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
    const requiredKeys = ["BL_API_KEY", "BL_WORKSPACE"];
    const checkedAt = new Date().toISOString();
    const missingKeys = requiredKeys.filter((key) => {
      if (key === "BL_API_KEY") return !(credentials?.BL_API_KEY || process.env.BL_API_KEY);
      return !(credentials?.BL_WORKSPACE || process.env.BL_WORKSPACE);
    });

    if (missingKeys.length) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys,
        checkedAt,
        evidence: ["BL_API_KEY and BL_WORKSPACE are required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING",
      };
    }

    try {
      workspaceFor(credentials);
      apiKeyFor(credentials);
      const { SandboxInstance } = await loadBlaxel();
      await SandboxInstance.list({ limit: 1 });
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Authenticated against the configured Blaxel workspace."],
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Blaxel credential validation request failed."],
        errorCode: "BLAXEL_AUTH_FAILED",
        errorMessage: error?.message || "Blaxel validation failed.",
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    workspaceFor(credentials);
    apiKeyFor(credentials);
    const { SandboxInstance } = await loadBlaxel();

    const name =
      request.metadata?.shortforge_name ||
      "shortforge-sbx-" +
        request.idempotencyKey.replace(/[^a-zA-Z0-9-]/g, "-").slice(-40);
    const ttlMinutes = request.ttlSeconds
      ? Math.max(1, Math.ceil(request.ttlSeconds / 60))
      : 60;

    const sandbox = await SandboxInstance.createIfNotExists({
      name,
      image:
        request.template ||
        process.env.BLAXEL_SANDBOX_IMAGE ||
        "blaxel/base-image:latest",
      memory: request.metadata?.memoryMb
        ? Number(request.metadata.memoryMb)
        : 4096,
      region: process.env.BLAXEL_REGION || undefined,
      labels: {
        shortforge_managed: "true",
        shortforge_operation_key: request.idempotencyKey,
      },
      ttl: ttlMinutes + "m",
    });

    return {
      runtime: toRuntime(sandbox),
      reconciliationRequired: false,
      evidence: [
        "Blaxel hosted sandbox created or reused through SandboxInstance.createIfNotExists.",
        "Blaxel workspace-scoped credentials are resolved by the SDK from BL_WORKSPACE and BL_API_KEY.",
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
    await sandbox.fs.writeBinary(request.remotePath, new Uint8Array(data));
  }

  async downloadFile(
    request: SandboxFileDownloadRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const sandbox = await getSandbox(request.runtime.resourceId, credentials);
    const data = await sandbox.fs.readBinary(request.remotePath);
    if (data instanceof Uint8Array) {
      await fs.writeFile(request.localPath, Buffer.from(data));
      return;
    }
    if (data instanceof Blob) {
      await fs.writeFile(request.localPath, Buffer.from(await data.arrayBuffer()));
      return;
    }
    if (data && typeof data.getReader === "function") {
      const reader = data.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = Buffer.from(next.value);
        chunks.push(chunk);
        total += chunk.length;
      }
      await fs.writeFile(request.localPath, Buffer.concat(chunks, total));
      return;
    }
    throw new Error("BLAXEL_BINARY_READ_UNSUPPORTED");

  }

  async execute(
    request: SandboxExecutionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxExecutionResult> {
    const started = Date.now();
    try {
      const sandbox = await getSandbox(request.runtime.resourceId, credentials);
      const result = await sandbox.process.exec({
        name:
          "shortforge-" +
          request.runtime.resourceId.replace(/[^a-zA-Z0-9-]/g, "-").slice(-30) +
          "-" +
          Date.now().toString(36),
        command: request.command,
        workingDir: request.workdir,
        waitForCompletion: true,
        timeout: Math.max(1, Math.ceil(request.timeoutMs / 1000)),
        ...(request.env
          ? { env: Object.entries(request.env).map(([name, value]) => ({ name, value })) }
          : {}),
      });
      const exitCode = Number(result?.exitCode ?? 0);
      return {
        providerType: "BLAXEL",
        runtimeId: request.runtime.resourceId,
        status: exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode,
        stdout: String(result?.stdout || ""),
        stderr: String(result?.stderr || ""),
        durationMs: Date.now() - started,
        evidence: ["Blaxel sandbox process.exec executed the command inside the hosted sandbox."],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "BLAXEL",
        runtimeId: request.runtime.resourceId,
        status: timedOut ? "TIMED_OUT" : "UNAVAILABLE",
        durationMs: Date.now() - started,
        evidence: [
          timedOut
            ? "Blaxel command exceeded the ShortForge execution timeout."
            : "Blaxel sandbox command execution failed.",
        ],
        limitation: message,
      };
    }
  }

  async terminate(
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    workspaceFor(credentials);
    const { SandboxInstance } = await loadBlaxel();
    await SandboxInstance.delete(runtime.resourceId);
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
        evidence: ["Reconciled Blaxel sandbox state from the provider."],
      };
    } catch (error: any) {
      return {
        runtime,
        found: false,
        terminal: true,
        reconciliationRequired: false,
        evidence: ["Blaxel reports the sandbox is unavailable or deleted."],
      };
    }
  }
}
