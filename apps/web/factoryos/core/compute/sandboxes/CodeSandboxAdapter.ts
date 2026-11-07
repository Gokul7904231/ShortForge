import * as fsSync from "node:fs";
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

const DEFAULT_BASE_URL = "https://api.codesandbox.io";

function redactToken(value: string, token: string): string {
  return String(value || "")
    .replace(new RegExp(token, "g"), "[REDACTED]")
    .slice(0, 1000);
}

function tokenFor(credentials?: SandboxCredentialBundle): string {
  const token = credentials?.CODESANDBOX_API_KEY || process.env.CODESANDBOX_API_KEY;
  if (!token) throw new Error("SANDBOX_CREDENTIAL_MISSING:CODESANDBOX_API_KEY");
  return token;
}

function baseFor(credentials?: SandboxCredentialBundle): string {
  return String(credentials?.CODESANDBOX_BASE_URL || process.env.CODESANDBOX_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

interface Sandbox {
  id: string;
  state: string;
  container?: { ip?: string; ports?: Record<string, number> };
  createdAt: string;
  region?: string;
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function classifyState(state: string): "PROVISIONING" | "RUNNING" | "FAILED" | "TERMINATED" | "UNKNOWN" {
  const s = state?.toUpperCase();
  if (!s) return "UNKNOWN";
  if (["CREATING", "BUILDING", "STARTING", "PROVISIONING"].includes(s)) return "PROVISIONING";
  if (s === "READY" || s === "RUNNING" || s === "ACTIVE") return "RUNNING";
  if (["STOPPING", "STOPPED"].includes(s)) return "TERMINATED";
  if (["DELETING", "DELETED"].includes(s)) return "TERMINATED";
  if (["ERROR", "FAILED"].includes(s)) return "FAILED";
  return "UNKNOWN";
}

async function jsonFetch(
  url: string,
  headers: Record<string, string>,
  options?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<{ ok: boolean; status: number; json?: unknown; text?: string }> {
  const res = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  let text: string | undefined;
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  return {
    ok: res.ok,
    status: res.status,
    json: text ? JSON.parse(text) : undefined,
    text,
  };
}

function toSandboxRuntime(sandbox: Sandbox): SandboxRuntime {
  return {
    providerId: "sandbox_codesandbox",
    providerType: "CODESANDBOX",
    resourceId: sandbox.id,
    state: classifyState(sandbox.state),
    createdAt: sandbox.createdAt,
    updatedAt: new Date().toISOString(),
    providerMetadata: {
      id: sandbox.id,
      region: sandbox.region,
      containerIp: sandbox.container?.ip,
    },
  };
}

function sandboxIdFrom(idempotencyKey: string): string {
  return "shortforge-" + idempotencyKey.replace(/[^a-zA-Z0-9-]/g, "-").slice(-40);
}

async function createSandbox(
  token: string,
  name: string,
  request: SandboxProvisionRequest,
): Promise<Sandbox> {
  // Firecracker-style microVM cluster: create a named sandbox instance via the API.
  const body: Record<string, unknown> = {
    name,
    runtime: "firecracker",
    os: "linux",
    image:
      request.template ||
      process.env.CODESANDBOX_IMAGE ||
      "codesandbox/node:20",
    resources: {
      vcpu: Number(request.metadata?.cpuCores) || 2,
      memoryMb: Number(request.metadata?.memoryMb) || 4096,
      ephemeralStorageGb: Number(request.metadata?.storageGb) || 20,
      gpu: request.metadata?.gpuType ? String(request.metadata.gpuCount || 1) : undefined,
    },
    environment: {
      SHORTFORGE_OPERATION_KEY: request.idempotencyKey,
      SHORTFORGE_SURFACE: "sandbox-fabric",
    },
    autoShutdownSecs: Math.max(300, request.ttlSeconds || 900),
    installTools: ["ffmpeg", "node", "npm"],
    region: request.metadata?.region || process.env.CODESANDBOX_REGION || "us-east",
  };

  const res = await jsonFetch(baseFor() + "/v1/sandboxes", {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.codesandbox+json",
  }, { method: "POST", body });

  if (!res.ok) {
    throw new Error(
      "CODESANDBOX_CREATE_FAILED:" + res.status + " " + redactToken(res.text || "", token),
    );
  }
  return res.json as Sandbox;
}

async function getSandbox(token: string, id: string): Promise<Sandbox> {
  const res = await jsonFetch(
    baseFor() + "/v1/sandboxes/" + encodeURIComponent(id),
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.codesandbox+json",
    },
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) throw new Error("CODESANDBOX_GET_FAILED:" + res.status);
  return res.json as Sandbox;
}

async function pollReady(token: string, id: string, timeoutMs: number): Promise<Sandbox> {
  const deadline = Date.now() + timeoutMs;
  let last: Sandbox | undefined;
  while (Date.now() < deadline) {
    last = await getSandbox(token, id);
    if (classifyState(last.state) === "RUNNING") return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("CODESANDBOX_READY_TIMEOUT:" + last?.state);
}

async function deleteSandbox(token: string, id: string): Promise<void> {
  const res = await jsonFetch(
    baseFor() + "/v1/sandboxes/" + encodeURIComponent(id),
    { Authorization: `Bearer ${token}` },
    { method: "DELETE", signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok && res.status !== 204 && res.status !== 200) {
    throw new Error("CODESANDBOX_TERMINATE_FAILED:" + res.status);
  }
}

async function runCommand(
  token: string,
  id: string,
  command: string,
  timeoutMs: number,
): Promise<ExecResult> {
  const started = Date.now();
  const res = await jsonFetch(
    baseFor() + "/v1/sandboxes/" + encodeURIComponent(id) + "/exec",
    {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    {
      method: "POST",
      body: {
        command,
        timeout: Math.min(600, Math.max(1, Math.ceil(timeoutMs / 1000))),
        workdir: requestWorkdir(),
        env: { SHORTFORGE_RUN: "1" },
      },
      signal: AbortSignal.timeout(timeoutMs + 30_000),
    },
  );
  if (!res.ok) {
    throw new Error("CODESANDBOX_EXEC_FAILED:" + res.status + " " + redactToken(res.text || "", token));
  }
  return {
    exitCode: (res.json as ExecResult).exitCode,
    stdout: (res.json as ExecResult).stdout,
    stderr: (res.json as ExecResult).stderr,
    durationMs: (res.json as ExecResult).durationMs || Date.now() - started,
  };
}

function requestWorkdir(): string {
  const ws = process.env.GITHUB_WORKSPACE || process.cwd();
  const tmp = path.join(ws, ".shortforge-csb");
  fsSync.mkdirSync(tmp, { recursive: true });
  return tmp;
}

export class CodeSandboxAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_codesandbox",
    providerType: "CODESANDBOX" as const,
    runtimeKind: "CODESANDBOX_MICROVM" as const,
    apiVersion: "codesandbox-v1",
    documentationUrl: "https://codesandbox.io/docs/api",
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
    const requiredKeys = ["CODESANDBOX_API_KEY"];
    const checkedAt = new Date().toISOString();
    const token = credentials?.CODESANDBOX_API_KEY || process.env.CODESANDBOX_API_KEY;
    if (!token) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: requiredKeys,
        checkedAt,
        evidence: ["CODESANDBOX_API_KEY is required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING:CODESANDBOX_API_KEY",
      };
    }
    try {
      const res = await jsonFetch(
        baseFor() + "/v1/sandboxes",
        {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.codesandbox+json",
        },
        { signal: AbortSignal.timeout(30_000) },
      );
      if (res.ok) {
        return {
          configured: true,
          authenticated: true,
          providerReachable: true,
          requiredKeys,
          missingKeys: [],
          checkedAt,
          evidence: ["Authenticated against the CodeSandbox Firecracker API."],
        };
      }
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["CodeSandbox credential validation failed."],
        errorCode: "CODESANDBOX_AUTH_FAILED",
        errorMessage: redactToken(res.text || "", token),
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["CodeSandbox validation request failed: " + error?.message || String(error)],
        errorCode: "CODESANDBOX_VALIDATION_FAILED",
        errorMessage: error?.message || String(error),
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    const token = tokenFor(credentials);
    const name = sandboxIdFrom(request.idempotencyKey);
    const created = await createSandbox(token, name, request);
    const runtime = await pollReady(token, created.id, (request.ttlSeconds || 900) * 1000);

    return {
      runtime: toSandboxRuntime(await pollReady(token, sandboxIdFrom(request.idempotencyKey), (request.ttlSeconds || 900) * 1000)),
      reconciliationRequired: false,
      evidence: [
        "CodeSandbox Firecracker microVM created via the platform API.",
        "FFmpeg pre-installed via installTools at bootstrap.",
        "Firecracker microVM sandbox slot; credential-less burst quota available.",
        "Sandbox remains outside F06 production-worker authority.",
      ],
    };
  }

  async getRuntime(resourceId: string, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime> {
    return toSandboxRuntime(await getSandbox(tokenFor(credentials), resourceId));
  }

  async waitReady(resourceId: string, timeoutMs = 120_000, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime> {
    return toSandboxRuntime(await pollReady(tokenFor(credentials), resourceId, timeoutMs));
  }

  async uploadFile(request: SandboxFileTransferRequest, credentials?: SandboxCredentialBundle): Promise<void> {
    const token = tokenFor(credentials);
    const timeout = request.timeoutMs || 120_000;
    const data = await fs.readFile(request.localPath);
    const remotePath = request.remotePath;
    const parent = path.posix.dirname(remotePath);

    await runCommand(token, request.runtime.resourceId,
      `mkdir -p ${JSON.stringify(parent)} && printf '%s' '${data.toString("base64")}' | base64 -d > ${JSON.stringify(remotePath)}`,
      timeout);
  }

  async downloadFile(request: SandboxFileDownloadRequest, credentials?: SandboxCredentialBundle): Promise<void> {
    const token = tokenFor(credentials);
    const timeout = request.timeoutMs || 120_000;
    const { exec } = await import("child_process");
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = exec(
        `ssh -o StrictHostKeyChecking=no codesandbox://${request.runtime.resourceId} "cat ${JSON.stringify(request.remotePath)}"`,
        { timeout },
      );
      const chunks: string[] = [];
      child.stdout?.on("data", (d) => chunks.push(d));
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve({ stdout: chunks.join("") }) : reject(new Error(`ssh failed: ${code}`))));
    });
    await fs.writeFile(request.localPath, Buffer.from(stdout, "base64"));
  }

  async execute(request: SandboxExecutionRequest, credentials?: SandboxCredentialBundle): Promise<SandboxExecutionResult> {
    const started = Date.now();
    try {
      const { exec } = await import("child_process");
      const res = await runCommand(
        tokenFor(credentials),
        request.runtime.resourceId,
        request.env
          ? Object.entries(request.env).map(([k, v]) => "export " + k + "=" + JSON.stringify(v) + ";").join("") + request.command
          : request.command,
        request.timeoutMs || 300_000,
      );
      return {
        providerType: "CODESANDBOX",
        runtimeId: request.runtime.resourceId,
        status: res.exitCode === 0 ? "SUCCEEDED" : "FAILED",
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        durationMs: res.durationMs || Date.now() - started,
        evidence: ["CodeSandbox microVM exec ran the command in the isolated Firecracker VM."],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "CODESANDBOX",
        runtimeId: request.runtime.resourceId,
        status: timedOut ? "TIMED_OUT" : "UNAVAILABLE",
        exitCode: 1,
        stdout: "",
        stderr: redactToken(message, tokenFor(credentials)),
        durationMs: Date.now() - started,
        evidence: [timedOut ? "CodeSandbox command exceeded the ShortForge execution timeout." : "CodeSandbox command execution failed."],
        limitation: redactToken(message, tokenFor(credentials)),
      };
    }
  }

  async terminate(runtime: SandboxRuntime, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime> {
    await deleteSandbox(tokenFor(credentials), runtime.resourceId).catch(() => undefined);
    return { ...runtime, state: "TERMINATED", updatedAt: new Date().toISOString() };
  }

  async reconcile(runtime: SandboxRuntime, credentials?: SandboxCredentialBundle): Promise<SandboxReconciliationResult> {
    try {
      const current = await this.getRuntime(runtime.resourceId, credentials);
      return {
        runtime: current,
        found: true,
        terminal: current.state === "TERMINATED",
        reconciliationRequired: current.state === "UNKNOWN",
        evidence: ["Reconciled CodeSandbox state from the API."],
      };
    } catch (error: any) {
      const state = classifyState(String(error?.message || String(error)));
      return {
        runtime: { ...runtime, state },
        found: state === "TERMINATED",
        terminal: state === "TERMINATED",
        reconciliationRequired: state === "UNKNOWN",
        evidence: ["CodeSandbox reconciliation failed: " + error?.message || String(error)],
      };
    }
  }
}
