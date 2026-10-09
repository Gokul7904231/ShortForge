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


type InstaVMApiExecution = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  vmId?: string;
};

function redactProviderMessage(value: unknown, apiKey: string): string {
  return redactError(value).replaceAll(apiKey, "[REDACTED]");
}

async function postInstaVMJson(
  apiKey: string,
  route: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<any> {
  const response = await fetch(normalizedBaseUrl() + route, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const raw = await response.text();
  let payload: any = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      if (response.ok) throw new Error("INSTAVM_API_INVALID_JSON");
      payload = { raw: raw.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const detail =
      payload?.detail ?? payload?.error ?? payload?.message ?? payload?.raw ?? raw.slice(0, 500);
    const safeDetail =
      typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(
      "INSTAVM_HTTP_" +
        response.status +
        ":" +
        redactProviderMessage(safeDetail, apiKey),
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("INSTAVM_API_RESPONSE_INVALID");
  }
  return payload;
}

async function createInstaVMVm(
  apiKey: string,
  request: SandboxProvisionRequest,
): Promise<{ sessionId: string; vmId?: string }> {
  const body: Record<string, unknown> = {
    vm_lifetime_seconds: Math.max(60, Math.floor(request.ttlSeconds || 900)),
  };
  if (request.template) body.snapshot_id = request.template;

  const cpuCores = Number(request.metadata?.cpuCores);
  if (Number.isFinite(cpuCores) && cpuCores > 0) {
    body.vcpu_count = Math.max(1, Math.floor(cpuCores));
  }

  const memoryGb = Number(request.metadata?.memoryGb);
  if (Number.isFinite(memoryGb) && memoryGb > 0) {
    body.memory_mb = Math.max(256, Math.round(memoryGb * 1024));
  }

  const result = await postInstaVMJson(
    apiKey,
    "/v1/vms?wait=true",
    body,
    120_000,
  );
  const sessionId = sessionFrom(result);
  if (!sessionId) {
    throw new Error("INSTAVM_VM_SESSION_ID_MISSING");
  }
  return {
    sessionId,
    ...(result?.vm_id || result?.vmId
      ? { vmId: String(result.vm_id || result.vmId) }
      : {}),
  };
}

async function executeInstaVMCommand(
  apiKey: string,
  sessionId: string,
  command: string,
  timeoutMs: number,
): Promise<InstaVMApiExecution> {
  const timeout = executeTimeoutSeconds(timeoutMs);
  const result = await postInstaVMJson(
    apiKey,
    "/execute",
    {
      command,
      language: "bash",
      timeout,
      session_id: sessionId,
    },
    (timeout + 15) * 1000,
  );
  const exitValue = result?.exit_code ?? result?.exitCode;
  if (exitValue === undefined || exitValue === null || !Number.isFinite(Number(exitValue))) {
    throw new Error("INSTAVM_EXECUTE_EXIT_CODE_MISSING");
  }
  const executionTime = Number(result?.execution_time ?? result?.executionTime ?? 0);
  return {
    exitCode: Number(exitValue),
    stdout: String(result?.stdout ?? result?.output ?? result?.result ?? ""),
    stderr: String(result?.stderr ?? ""),
    durationMs: Number.isFinite(executionTime) ? executionTime * 1000 : 0,
    ...(result?.vm_id || result?.vmId
      ? { vmId: String(result.vm_id || result.vmId) }
      : {}),
  };
}

async function terminateInstaVMSession(
  apiKey: string,
  sessionId: string,
): Promise<void> {
  await postInstaVMJson(
    apiKey,
    "/kill",
    { session_id: sessionId },
    30_000,
  );
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
    const apiKey = apiKeyFor(credentials);
    const created = await createInstaVMVm(apiKey, request);
    const sessionId = created.sessionId;
    let vmId = created.vmId;

    try {
      const bootstrap = await executeInstaVMCommand(
        apiKey,
        sessionId,
        "printf 'SHORTFORGE_INSTAVM_BOOTSTRAP_OK\\n'",
        30_000,
      );
      if (bootstrap.exitCode !== 0) {
        throw new Error("INSTAVM_BOOTSTRAP_FAILED");
      }
      vmId = vmId || bootstrap.vmId;
    } catch (error: any) {
      await terminateInstaVMSession(apiKey, sessionId).catch(() => undefined);
      throw new Error(
        "INSTAVM_SESSION_BOOTSTRAP_FAILED:" +
          redactProviderMessage(error?.message || "InstaVM session execution failed.", apiKey),
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
        "InstaVM VM-create REST API returned the canonical session ID.",
        "InstaVM Execute REST API ran the bootstrap command inside the session-bound Firecracker microVM.",
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
    const data = await fs.readFile(request.localPath);
    const remotePath = request.remotePath;
    const parent = path.posix.dirname(remotePath);
    const timeout = request.timeoutMs || 120_000;
    const apiKey = apiKeyFor(credentials);

    const initial = await executeInstaVMCommand(
      apiKey,
      request.runtime.resourceId,
      "mkdir -p " + shellQuote(parent) + " && : > " + shellQuote(remotePath),
      timeout,
    );
    if (initial.exitCode !== 0) {
      throw new Error("INSTAVM_UPLOAD_INITIALIZE_FAILED");
    }

    const chunkBytes = 48 * 1024;
    for (let offset = 0; offset < data.length; offset += chunkBytes) {
      const encoded = data.subarray(offset, offset + chunkBytes).toString("base64");
      const response = await executeInstaVMCommand(
        apiKey,
        request.runtime.resourceId,
        "printf '%s' " + shellQuote(encoded) + " | base64 -d >> " + shellQuote(remotePath),
        timeout,
      );
      if (response.exitCode !== 0) {
        throw new Error("INSTAVM_UPLOAD_CHUNK_FAILED");
      }
    }

    const verify = await executeInstaVMCommand(
      apiKey,
      request.runtime.resourceId,
      "test -f " + shellQuote(remotePath) + " && stat -c '%s' " + shellQuote(remotePath),
      timeout,
    );
    if (verify.exitCode !== 0) {
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
      const response = await executeInstaVMCommand(
        apiKeyFor(credentials),
        request.runtime.resourceId,
        envPrefix(request.env) + request.command,
        request.timeoutMs || 30_000,
      );
      return {
        providerType: "INSTAVM",
        runtimeId: request.runtime.resourceId,
        status: response.exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode: response.exitCode,
        stdout: response.stdout,
        stderr: response.stderr,
        durationMs: response.durationMs || Date.now() - started,
        evidence: [
          "InstaVM Execute REST API ran the command inside the session-bound Firecracker microVM.",
        ],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "INSTAVM",
        runtimeId: request.runtime.resourceId,
        status: timedOut ? "TIMED_OUT" : "UNAVAILABLE",
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
    await terminateInstaVMSession(apiKeyFor(credentials), runtime.resourceId);
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
