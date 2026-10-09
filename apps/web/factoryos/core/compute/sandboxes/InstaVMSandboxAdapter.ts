import * as fs from "node:fs/promises";
import * as path from "node:path";
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
} from "./SandboxContracts";

type InstaVMClient = any;
type InstaVMModule = {
  InstaVM: new (...args: any[]) => InstaVMClient;
};

function loadInstaVM(): InstaVMModule {
  try {
    // Optional runtime dependency. The sandbox plane fails closed if the SDK
    // is not installed in the runtime that activates InstaVM.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("instavm") as InstaVMModule;
  } catch (error: any) {
    throw new Error(
      "INSTAVM_SDK_MISSING: install instavm in the runtime that activates InstaVM." +
        (error?.message ? " " + error.message : ""),
    );
  }
}

function apiKeyFor(credentials?: SandboxCredentialBundle): string {
  const apiKey = credentials?.INSTAVM_API_KEY || process.env.INSTAVM_API_KEY;
  if (!apiKey) {
    throw new Error("SANDBOX_CREDENTIAL_MISSING:INSTAVM_API_KEY");
  }
  return apiKey;
}

function clientFor(credentials?: SandboxCredentialBundle): InstaVMClient {
  const { InstaVM } = loadInstaVM();
  return new InstaVM(apiKeyFor(credentials));
}

function executeTimeoutSeconds(timeoutMs: number): number {
  return Math.min(600, Math.max(1, Math.ceil(timeoutMs / 1000)));
}

function shellQuote(value: string): string {
  if (value.includes("\0")) {
    throw new Error("INSTAVM_INVALID_PATH_OR_VALUE");
  }
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function envPrefix(env?: Record<string, string>): string {
  if (!env) return "";
  return Object.entries(env)
    .map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error("INSTAVM_INVALID_ENV_KEY:" + key);
      }
      return "export " + key + "=" + shellQuote(value) + ";";
    })
    .join("");
}

function normalizedBaseUrl(): string {
  return String(process.env.INSTAVM_BASE_URL || "https://api.instavm.io").replace(/\/+$/, "");
}

function sessionFrom(value: any): string | undefined {
  return (
    value?.session_id ||
    value?.sessionId ||
    value?.session ||
    (typeof value === "string" ? value : undefined)
  );
}

function redactError(value: unknown): string {
  return String(value || "")
    .replace(/instavm_[A-Za-z0-9._-]+/g, "instavm_[REDACTED]")
    .slice(0, 1000);
}

function classifyStateError(error: any): "TERMINATED" | "UNKNOWN" {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || error || "").toLowerCase();
  if (
    status === 404 ||
    /expired|not found|no active session|session .*ended|terminated|invalid session/.test(message)
  ) {
    return "TERMINATED";
  }
  return "UNKNOWN";
}

async function runtimeFromSession(
  client: InstaVMClient,
  sessionId: string,
): Promise<SandboxRuntime> {
  try {
    if (typeof client.getUsage === "function") {
      await client.getUsage(sessionId);
    } else {
      await client.execute("true", {
        language: "bash",
        timeout: 30,
        sessionId,
      });
    }
    return {
      providerId: "sandbox_instavm",
      providerType: "INSTAVM",
      resourceId: sessionId,
      state: "RUNNING",
      updatedAt: new Date().toISOString(),
      providerMetadata: {
        sessionId,
        ephemeralFilesystem: true,
      },
    };
  } catch (error: any) {
    const state = classifyStateError(error);
    return {
      providerId: "sandbox_instavm",
      providerType: "INSTAVM",
      resourceId: sessionId,
      state,
      updatedAt: new Date().toISOString(),
      providerMetadata: {
        sessionId,
        ephemeralFilesystem: true,
        stateError: redactError(error?.message || String(error)),
      },
    };
  }
}

export class InstaVMSandboxAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_instavm",
    providerType: "INSTAVM" as const,
    runtimeKind: "INSTAVM_SANDBOX" as const,
    apiVersion: "typescript-sdk",
    documentationUrl: "https://instavm.io/docs/quickstart",
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
    const requiredKeys = ["INSTAVM_API_KEY"];
    const checkedAt = new Date().toISOString();

    if (!credentials?.INSTAVM_API_KEY && !process.env.INSTAVM_API_KEY) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: requiredKeys,
        checkedAt,
        evidence: ["INSTAVM_API_KEY is required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING:INSTAVM_API_KEY",
      };
    }

    try {
      const client = clientFor(credentials);
      if (typeof client.getCurrentUser === "function") {
        await client.getCurrentUser();
      } else if (typeof client.getUsage === "function") {
        await client.getUsage();
      } else {
        throw new Error("INSTAVM_VALIDATION_API_UNAVAILABLE");
      }
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: [
          "Authenticated against the InstaVM API.",
          "InstaVM live physical MP4 artifact proof is recorded for this provider.",
        ],
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["InstaVM credential validation request failed."],
        errorCode: "INSTAVM_AUTH_FAILED",
        errorMessage: redactError(error?.message || "InstaVM validation failed."),
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    const client = clientFor(credentials);

    let sessionId = sessionFrom(client?.sessionId);
    let vmId: string | undefined;
    const usesExplicitVmSession = Boolean(request.template && client?.vms?.create);

    // The JavaScript SDK's documented execution contract is automatic session
    // creation on the first execute() call. Use that path for ordinary runs;
    // explicit VM/session binding is reserved for snapshot-backed requests.
    if (usesExplicitVmSession) {
      const vm = await client.vms.create(
        {
          snapshot_id: request.template,
          vm_lifetime_seconds: Math.max(60, request.ttlSeconds || 900),
          ...(request.metadata?.cpuCores
            ? { vcpu_count: Number(request.metadata.cpuCores) }
            : {}),
          ...(request.metadata?.memoryGb
            ? { memory_mb: Math.round(Number(request.metadata.memoryGb) * 1024) }
            : {}),
        },
        true,
      );
      sessionId = sessionFrom(vm?.session_id || vm?.sessionId) || sessionId;
      vmId = vm?.vm_id || vm?.vmId;
      if (!sessionId) {
        throw new Error("INSTAVM_VM_SESSION_ID_MISSING");
      }
    }

    try {
      const bootstrapOptions: Record<string, unknown> = {
        language: "bash",
        timeout: 30,
      };
      if (usesExplicitVmSession && sessionId) {
        bootstrapOptions.sessionId = sessionId;
      }

      const bootstrap = await client.execute("true", bootstrapOptions);
      const bootstrapExitCode = Number(
        bootstrap?.exitCode ?? bootstrap?.exit_code ?? 0,
      );
      if (bootstrapExitCode !== 0) {
        throw new Error("INSTAVM_BOOTSTRAP_FAILED");
      }

      // For ordinary sessions, the SDK sets sessionId as part of execute().
      // Keep the provider runtime bound to that exact session for every later
      // command, transfer, reconciliation and termination call.
      sessionId =
        sessionId ||
        sessionFrom(client?.sessionId) ||
        sessionFrom(bootstrap?.sessionId);
      if (!sessionId) {
        throw new Error("INSTAVM_SESSION_ID_MISSING_AFTER_EXECUTE");
      }
    } catch (error: any) {
      // Prefer the SDK's session identity for cleanup if execute() allocated
      // a VM but then failed before the identity was persisted locally.
      sessionId = sessionId || sessionFrom(client?.sessionId);
      if (sessionId && typeof client.closeSession === "function") {
        await client.closeSession(sessionId).catch(() => undefined);
      }
      throw new Error(
        "INSTAVM_SESSION_BOOTSTRAP_FAILED:" +
          redactError(error?.message || "InstaVM session execution failed."),
      );
    }

    return {
      runtime: {
        providerId: "sandbox_instavm",
        providerType: "INSTAVM",
        resourceId: sessionId,
        state: "RUNNING",
        updatedAt: new Date().toISOString(),
        providerMetadata: {
          sessionId,
          ...(vmId ? { vmId } : {}),
          ephemeralFilesystem: true,
          providerSessionIsCanonicalResource: true,
        },
      },
      reconciliationRequired: false,
      evidence: [
        "InstaVM hosted microVM session created through the official TypeScript SDK.",
        "Session ID is the canonical ShortForge runtime identity because filesystem state is scoped to the active session.",
        "Sandbox remains outside F06 production-worker authority.",
      ],
    };
  }

  async getRuntime(
    resourceId: string,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    return runtimeFromSession(clientFor(credentials), resourceId);
  }

  async waitReady(
    resourceId: string,
    timeoutMs = 60_000,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;

    while (Date.now() < deadline) {
      const current = await runtimeFromSession(clientFor(credentials), resourceId);
      if (current.state === "RUNNING") return current;
      lastError = current.providerMetadata.stateError;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
      "INSTAVM_READY_TIMEOUT" +
        (lastError ? ": " + String(lastError) : ""),
    );
  }

  async uploadFile(
    request: SandboxFileTransferRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    // The ShortForge render manifest is small. We write it through
    // session-bound execution so the bytes land in the exact VM behind
    // runtime.resourceId instead of an unrelated SDK session.
    const data = await fs.readFile(request.localPath);
    const remotePath = request.remotePath;
    const parent = path.posix.dirname(remotePath);
    const timeout = request.timeoutMs || 120_000;
    const client = clientFor(credentials);

    const initial = await client.execute(
      "mkdir -p " + shellQuote(parent) + " && : > " + shellQuote(remotePath),
      {
        language: "bash",
        timeout: executeTimeoutSeconds(timeout),
        sessionId: request.runtime.resourceId,
      },
    );

    if (Number(initial?.exitCode ?? initial?.exit_code ?? 0) !== 0) {
      throw new Error("INSTAVM_UPLOAD_INITIALIZE_FAILED");
    }

    const chunkBytes = 48 * 1024;
    for (let offset = 0; offset < data.length; offset += chunkBytes) {
      const encoded = data.subarray(offset, offset + chunkBytes).toString("base64");
      const response = await client.execute(
        "printf '%s' " +
          shellQuote(encoded) +
          " | base64 -d >> " +
          shellQuote(remotePath),
        {
          language: "bash",
          timeout: executeTimeoutSeconds(timeout),
          sessionId: request.runtime.resourceId,
        },
      );
      if (Number(response?.exitCode ?? response?.exit_code ?? 0) !== 0) {
        throw new Error("INSTAVM_UPLOAD_CHUNK_FAILED");
      }
    }

    const verify = await client.execute(
      "test -f " + shellQuote(remotePath) + " && stat -c '%s' " + shellQuote(remotePath),
      {
        language: "bash",
        timeout: executeTimeoutSeconds(timeout),
        sessionId: request.runtime.resourceId,
      },
    );
    if (Number(verify?.exitCode ?? verify?.exit_code ?? 0) !== 0) {
      throw new Error("INSTAVM_UPLOAD_VERIFY_FAILED");
    }
  }

  async downloadFile(
    request: SandboxFileDownloadRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<void> {
    const apiKey = apiKeyFor(credentials);
    const response = await fetch(normalizedBaseUrl() + "/download", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        filename: request.remotePath,
        session_id: request.runtime.resourceId,
      }),
      signal: AbortSignal.timeout(request.timeoutMs || 120_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        "INSTAVM_DOWNLOAD_FAILED:" +
          response.status +
          (detail ? ":" + detail.slice(0, 500) : ""),
      );
    }

    const contentType = response.headers.get("content-type") || "";
    let bytes: Buffer;

    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { content?: string };
      if (!payload?.content) {
        throw new Error("INSTAVM_DOWNLOAD_CONTENT_MISSING");
      }
      bytes = Buffer.from(payload.content, "base64");
    } else {
      bytes = Buffer.from(await response.arrayBuffer());
    }

    if (bytes.length === 0) {
      throw new Error("INSTAVM_DOWNLOAD_EMPTY_ARTIFACT");
    }

    await fs.writeFile(request.localPath, bytes);
  }

  async execute(
    request: SandboxExecutionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxExecutionResult> {
    const started = Date.now();
    try {
      const client = clientFor(credentials);
      const response = await client.execute(
        envPrefix(request.env) + request.command,
        {
          language: "bash",
          timeout: executeTimeoutSeconds(request.timeoutMs),
          sessionId: request.runtime.resourceId,
        },
      );
      const exitCode = Number(response?.exitCode ?? response?.exit_code ?? 0);
      return {
        providerType: "INSTAVM",
        runtimeId: request.runtime.resourceId,
        status: exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode,
        stdout: String(response?.stdout || response?.result || ""),
        stderr: String(response?.stderr || ""),
        durationMs: Number(
          response?.executionTime ??
            response?.execution_time ??
            Date.now() - started,
        ),
        evidence: [
          "InstaVM Execute API ran the command inside the session-bound Firecracker microVM.",
        ],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "INSTAVM",
        runtimeId: request.runtime.resourceId,
        status: timedOut
          ? "TIMED_OUT"
          : "UNAVAILABLE",
        durationMs: Date.now() - started,
        evidence: [
          timedOut
            ? "InstaVM command exceeded the ShortForge execution timeout."
            : "InstaVM sandbox command execution failed.",
        ],
        limitation: redactError(message),
      };
    }
  }

  async terminate(
    runtime: SandboxRuntime,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxRuntime> {
    const client = clientFor(credentials);
    if (typeof client.closeSession === "function") {
      await client.closeSession(runtime.resourceId);
    } else if (typeof client.kill === "function") {
      await client.kill(runtime.resourceId);
    } else {
      throw new Error("INSTAVM_SESSION_TERMINATION_UNSUPPORTED");
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
        terminal: current.state === "TERMINATED",
        reconciliationRequired: current.state === "UNKNOWN",
        evidence: [
          "Reconciled InstaVM session state through the provider SDK.",
        ],
      };
    } catch (error: any) {
      const state = classifyStateError(error);
      return {
        runtime: { ...runtime, state },
        found: state === "TERMINATED",
        terminal: state === "TERMINATED",
        reconciliationRequired: state === "UNKNOWN",
        evidence: [
          "InstaVM session reconciliation failed: " + redactError(error?.message || String(error)),
        ],
      };
    }
  }
}
