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

type ModalSandbox = any;
type ModalClient = any;
type ModalModule = { ModalClient: new (params?: Record<string, unknown>) => ModalClient };

function loadModal(): ModalModule {
  try {
    // Optional runtime dependency. The sandbox plane fails closed if Modal
    // is not installed in the runtime that activates the provider.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("modal") as ModalModule;
  } catch (error: any) {
    throw new Error(
      "MODAL_SDK_MISSING: install modal in the runtime that activates Modal." +
        (error?.message ? " " + error.message : ""),
    );
  }
}

function stateOf(sandbox: ModalSandbox): SandboxRuntimeState {
  const status = String(sandbox?.state || sandbox?.status || "").toUpperCase();
  if (["STARTING", "CREATING", "PENDING", "BOOTING"].includes(status)) return "PROVISIONING";
  if (["RUNNING", "READY"].includes(status)) return "RUNNING";
  if (["TERMINATED", "EXITED", "DELETED"].includes(status)) return "TERMINATED";
  if (["FAILED", "ERROR"].includes(status)) return "FAILED";
  return "UNKNOWN";
}

function clientFor(credentials?: SandboxCredentialBundle): ModalClient {
  const tokenId = credentials?.MODAL_TOKEN_ID || process.env.MODAL_TOKEN_ID;
  const tokenSecret = credentials?.MODAL_TOKEN_SECRET || process.env.MODAL_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error("SANDBOX_CREDENTIAL_MISSING:MODAL_TOKEN_ID_OR_SECRET");
  }
  const { ModalClient } = loadModal();
  return new ModalClient({
    tokenId,
    tokenSecret,
    timeoutMs: 30_000,
    maxRetries: 2,
  });
}

async function getSandbox(
  resourceId: string,
  credentials?: SandboxCredentialBundle,
): Promise<{ client: ModalClient; sandbox: ModalSandbox }> {
  const client = clientFor(credentials);
  const sandbox = await client.sandboxes.fromId(resourceId);
  return { client, sandbox };
}

function toRuntime(sandbox: ModalSandbox): SandboxRuntime {
  return {
    providerId: "sandbox_modal_hosted",
    providerType: "MODAL",
    resourceId: String(sandbox.sandboxId),
    state: stateOf(sandbox),
    updatedAt: new Date().toISOString(),
    providerMetadata: {
      sandboxId: sandbox.sandboxId,
      name: sandbox.name,
    },
  };
}

export class ModalSandboxAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_modal_hosted",
    providerType: "MODAL" as const,
    runtimeKind: "MODAL_SANDBOX" as const,
    apiVersion: "js-sdk-0.11.0",
    documentationUrl: "https://modal.com/docs/sdk/js/latest/Sandbox",
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
    const requiredKeys = ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"];
    const checkedAt = new Date().toISOString();
    const missingKeys = requiredKeys.filter(
      (key) => !(credentials?.[key] || process.env[key]),
    );

    if (missingKeys.length) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys,
        checkedAt,
        evidence: ["Modal token credentials are required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING",
      };
    }

    try {
      const client = clientFor(credentials);
      const iterator = client.sandboxes.list({ tags: { shortforge_probe: "true" } });
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
        evidence: ["Authenticated against the Modal Sandbox API."],
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Modal credential validation request failed."],
        errorCode: "MODAL_AUTH_FAILED",
        errorMessage: error?.message || "Modal validation failed.",
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    const client = clientFor(credentials);
    const appName =
      request.metadata?.appName ||
      process.env.MODAL_SANDBOX_APP_NAME ||
      "shortforge-sandbox";
    const imageRef =
      request.template ||
      process.env.MODAL_SANDBOX_IMAGE ||
      "python:3.12";
    const app = await client.apps.fromName(appName, { createIfMissing: true });
    const image = client.images.fromRegistry(imageRef);
    const sandbox = await client.sandboxes.create(app, image, {
      name:
        request.metadata?.shortforge_name ||
        "shortforge-sbx-" + request.idempotencyKey.replace(/[^a-zA-Z0-9-]/g, "-").slice(-40),
      command: ["sleep", "infinity"],
      timeoutMs: Math.max(60_000, (request.ttlSeconds || 3600) * 1000),
      cpu: request.metadata?.cpuCores
        ? Number(request.metadata.cpuCores)
        : undefined,
      memoryMiB: request.metadata?.memoryMb
        ? Number(request.metadata.memoryMb)
        : undefined,
      gpu: request.metadata?.gpuType
        ? String(request.metadata.gpuType) +
          (Number(request.metadata.gpuCount || 1) > 1
            ? ":" + String(Number(request.metadata.gpuCount))
            : "")
        : undefined,
      env: {
        SHORTFORGE_OPERATION_KEY: request.idempotencyKey,
        SHORTFORGE_SURFACE: "sandbox-fabric",
      },
      tags: { shortforge_managed: "true" },
    });

    return {
      runtime: toRuntime(sandbox),
      reconciliationRequired: false,
      evidence: [
        "Modal hosted sandbox created through the JavaScript SDK.",
        "Provider-side idempotency is not assumed; ShortForge operation identity is carried as metadata.",
      ],
    };
  }

  async getRuntime(
    resourceId: string,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const { sandbox } = await getSandbox(resourceId, credentials);
    return toRuntime(sandbox);
  }

  async waitReady(
    resourceId: string,
    timeoutMs = 60_000,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const { sandbox } = await getSandbox(resourceId, credentials);
    if (typeof sandbox.waitUntilReady === "function") {
      await sandbox.waitUntilReady(timeoutMs);
    } else {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (stateOf(sandbox) === "RUNNING") break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    return this.getRuntime(resourceId, credentials);
  }

  async uploadFile(
    request: SandboxFileTransferRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const { sandbox } = await getSandbox(request.runtime.resourceId, credentials);
    await sandbox.filesystem.copyFromLocal(
      request.localPath,
      request.remotePath,
    );
  }

  async downloadFile(
    request: SandboxFileDownloadRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const { sandbox } = await getSandbox(request.runtime.resourceId, credentials);
    await sandbox.filesystem.copyToLocal(
      request.remotePath,
      request.localPath,
    );
  }

  async execute(
    request: SandboxExecutionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxExecutionResult> {
    const started = Date.now();
    try {
      const { sandbox } = await getSandbox(request.runtime.resourceId, credentials);
      const process = await sandbox.exec(["bash", "-lc", request.command], {
        mode: "text",
        timeoutMs: request.timeoutMs,
        ...(request.workdir ? { workdir: request.workdir } : {}),
        ...(request.env ? { env: request.env } : {}),
      });
      const exitCode = Number(await process.wait());
      const stdout = await process.stdout.readText().catch(() => "");
      const stderr = await process.stderr.readText().catch(() => "");

      return {
        providerType: "MODAL",
        runtimeId: request.runtime.resourceId,
        status:
          exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        evidence: ["Modal Sandbox.exec executed the command inside the hosted sandbox."],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "MODAL",
        runtimeId: request.runtime.resourceId,
        status: timedOut ? "TIMED_OUT" : "UNAVAILABLE",
        durationMs: Date.now() - started,
        evidence: [
          timedOut
            ? "Modal command exceeded the ShortForge execution timeout."
            : "Modal sandbox command execution failed.",
        ],
        limitation: message,
      };
    }
  }

  async terminate(
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const { sandbox } = await getSandbox(runtime.resourceId, credentials);
    await sandbox.terminate({ wait: true });
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
        evidence: ["Reconciled Modal sandbox state from the provider."],
      };
    } catch (error: any) {
      return {
        runtime,
        found: false,
        terminal: false,
        reconciliationRequired: true,
        evidence: ["Modal sandbox reconciliation failed: " + (error?.message || String(error))],
      };
    }
  }
}
