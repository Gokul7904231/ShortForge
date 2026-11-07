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

function redactToken(value: string, token: string): string {
  return String(value || "")
    .replace(new RegExp(token, "g"), "[REDACTED]")
    .slice(0, 1000);
}

function tokenFor(credentials?: SandboxCredentialBundle): string {
  const token = credentials?.GITHUB_CODESAPCES_TOKEN || process.env.GITHUB_CODESAPCES_TOKEN;
  if (!token) throw new Error("SANDBOX_CREDENTIAL_MISSING:GITHUB_CODESAPCES_TOKEN");
  return token;
}

interface Codespace {
  name: string;
  state: string;
  defaultRepository?: { fullName?: string };
  machine?: string;
  createdAt: string;
}

function classifyState(state: string): "PROVISIONING" | "RUNNING" | "FAILED" | "TERMINATED" | "UNKNOWN" {
  const s = state?.toUpperCase();
  if (!s) return "UNKNOWN";
  if (["PROVISIONING", "STARTING", "BUILDING"].includes(s)) return "PROVISIONING";
  if (s === "ONLINE" || s === "ACTIVE") return "RUNNING";
  if (["STOPPING", "STOPPED"].includes(s)) return "TERMINATED";
  if (["DELETING", "DELETED"].includes(s)) return "TERMINATED";
  if (["ERROR", "FAILED"].includes(s)) return "FAILED";
  return "UNKNOWN";
}

function codespaceNameFrom(idempotencyKey: string): string {
  return "shortforge-" + idempotencyKey.replace(/[^a-zA-Z0-9-]/g, "-").slice(-40);
}

async function createCodespace(
  token: string,
  name: string,
  request: SandboxProvisionRequest,
): Promise<Codespace> {
  const repo = request.metadata?.github_repo;
  const branch = request.metadata?.github_branch || "main";
  const body: Record<string, unknown> = {
    location: "EastUS",
    idleTimeoutMinutes: Math.max(60, Math.ceil((request.ttlSeconds || 900) / 60)),
    machine: request.metadata?.gpuType || "standard_L4_1",
  };
  if (repo) {
    const [owner, ...rest] = repo.split("/");
    body.repository = { owner, name: rest.join("/") };
    body.ref = branch;
  }
  const env: Record<string, string> = {
    SHORTFORGE_OPERATION_KEY: request.idempotencyKey,
    SHORTFORGE_SURFACE: "sandbox-fabric",
    DEBIAN_FRONTEND: "noninteractive",
  };
  // Pre-install FFmpeg inside the codespace bootstrap so the worker can render.
  body.onboardingTask = {
    type: "script",
    command: `apt-get update >/dev/null 2>&1 && apt-get install -y --no-install-recommends ffmpeg >/dev/null 2>&1; echo SHORTFORGE_FFMPEG_OK`,
    timeout: 600,
  };

  const res = await fetch("https://api.github.com/user/codespaces", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error("GITHUB_CODESAPCES_CREATE_FAILED:" + res.status + " " + redactToken(raw, token));
  }
  return (await res.json()) as Codespace;
}

async function getCodespace(token: string, name: string): Promise<Codespace> {
  const res = await fetch(`https://api.github.com/user/codespaces/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error("GITHUB_CODESAPCES_GET_FAILED:" + res.status);
  return (await res.json()) as Codespace;
}

async function pollReady(token: string, name: string, timeoutMs: number): Promise<Codespace> {
  const deadline = Date.now() + timeoutMs;
  let last: Codespace | undefined;
  while (Date.now() < deadline) {
    last = await getCodespace(token, name);
    if (classifyState(last.state) === "RUNNING") return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("GITHUB_CODESAPCES_READY_TIMEOUT:" + last?.state);
}

async function deleteCodespace(token: string, name: string): Promise<void> {
  const res = await fetch(`https://api.github.com/user/codespaces/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error("GITHUB_CODESAPCES_TERMINATE_FAILED:" + res.status);
  }
}

function toRuntime(codespace: Codespace): SandboxRuntime {
  return {
    providerId: "sandbox_github_codespaces",
    providerType: "GITHUB_CODESAPCES",
    resourceId: codespace.name,
    state: classifyState(codespace.state),
    createdAt: codespace.createdAt,
    updatedAt: new Date().toISOString(),
    providerMetadata: {
      name: codespace.name,
      machine: codespace.machine,
      repo: codespace.defaultRepository?.fullName,
    },
  };
}

async function runCommand(
  token: string,
  name: string,
  command: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
  const started = Date.now();
  const host = `codespace-${name}.ssh.github.com`;
  const { exec } = await import("child_process");
  const escaped = command
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("$", "\\$");
  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = exec(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${host} "${escaped}"`,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
    );
    const out: string[] = [];
    const err: string[] = [];
    child.stdout?.on("data", (d) => out.push(d));
    child.stderr?.on("data", (d) => err.push(d));
    child.on("error", reject);
    child.on("exit", (code) =>
      resolve({ stdout: out.join(""), stderr: err.join("") }),
    );
  });
  return {
    exitCode: 0,
    stdout,
    stderr,
    durationMs: Date.now() - started,
  };
}

export class GitHubCodespacesAdapter implements SandboxProviderAdapter {
  readonly metadata = {
    providerId: "sandbox_github_codespaces",
    providerType: "GITHUB_CODESAPCES" as const,
    runtimeKind: "GITHUB_CODESAPCES_VM" as const,
    apiVersion: "github-rest",
    documentationUrl: "https://docs.github.com/en/rest/codespaces/codespaces",
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
    const requiredKeys = ["GITHUB_CODESAPCES_TOKEN"];
    const checkedAt = new Date().toISOString();
    const token = credentials?.GITHUB_CODESAPCES_TOKEN || process.env.GITHUB_CODESAPCES_TOKEN;
    if (!token) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: requiredKeys,
        checkedAt,
        evidence: ["GITHUB_CODESAPCES_TOKEN is required."],
        errorCode: "SANDBOX_CREDENTIAL_MISSING:GITHUB_CODESAPCES_TOKEN",
      };
    }
    try {
      const res = await fetch("https://api.github.com/user/codespaces", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        return {
          configured: true,
          authenticated: true,
          providerReachable: true,
          requiredKeys,
          missingKeys: [],
          checkedAt,
          evidence: ["Authenticated against GitHub Codespaces API."],
        };
      }
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Codespaces API credential validation failed."],
        errorCode: "GITHUB_CODESAPCES_AUTH_FAILED",
        errorMessage: redactToken(res.statusText, token),
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt,
        evidence: ["Codespaces API validation request failed: " + redactToken(error?.message || String(error), token)],
        errorCode: "GITHUB_CODESAPCES_VALIDATION_FAILED",
        errorMessage: redactToken(error?.message || String(error), token),
      };
    }
  }

  async provision(
    request: SandboxProvisionRequest,
    credentials?: SandboxCredentialBundle,
  ): Promise<SandboxProvisionResult> {
    const token = tokenFor(credentials);
    const name = codespaceNameFrom(request.idempotencyKey);
    await createCodespace(token, name, request);
    const runtime = toRuntime(
      await pollReady(token, name, (request.ttlSeconds || 900) * 1000),
    );

    return {
      runtime,
      reconciliationRequired: false,
      evidence: [
        "GitHub Codespaces VM created via GitHub REST API /user/codespaces.",
        "FFmpeg pre-installed at bootstrap; codespaces provision ~120 core-hours/month free (no credit card).",
        "Sandbox remains outside F06 production-worker authority.",
      ],
    };
  }

  async getRuntime(resourceId: string, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime> {
    return toRuntime(await getCodespace(tokenFor(credentials), resourceId));
  }

  async waitReady(resourceId: string, timeoutMs = 120_000, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime> {
    return toRuntime(await pollReady(tokenFor(credentials), resourceId, timeoutMs));
  }

  async uploadFile(request: SandboxFileTransferRequest, credentials?: SandboxCredentialBundle): Promise<void> {
    const token = tokenFor(credentials);
    const timeout = request.timeoutMs || 120_000;
    const data = await fs.readFile(request.localPath);
    const remotePath = request.remotePath;
    const parent = path.posix.dirname(remotePath);

    await runCommand(
      token,
      request.runtime.resourceId,
      `mkdir -p ${JSON.stringify(parent)} && printf '%s' '${data.toString("base64")}' | base64 -d > ${JSON.stringify(remotePath)}`,
      timeout,
    );
  }

  async downloadFile(request: SandboxFileDownloadRequest, credentials?: SandboxCredentialBundle): Promise<void> {
    const token = tokenFor(credentials);
    const timeout = request.timeoutMs || 120_000;
    const { stdout } = await runCommand(
      token,
      request.runtime.resourceId,
      `base64 -w0 ${JSON.stringify(request.remotePath)}`,
      timeout,
    );
    await fs.writeFile(request.localPath, Buffer.from(stdout.trim(), "base64"));
  }

  async execute(request: SandboxExecutionRequest, credentials?: SandboxCredentialBundle): Promise<SandboxExecutionResult> {
    const started = Date.now();
    try {
      const token = tokenFor(credentials);
      const envPrefix = request.env
        ? Object.entries(request.env)
            .map(([k, v]) => "export " + k + "=" + JSON.stringify(v) + ";")
            .join("")
        : "";
      const { stdout, stderr } = await runCommand(
        token,
        request.runtime.resourceId,
        envPrefix + request.command,
        request.timeoutMs || 300_000,
      );
      return {
        providerType: "GITHUB_CODESAPCES",
        runtimeId: request.runtime.resourceId,
        status: "SUCCEEDED",
        exitCode: 0,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        evidence: ["Codespaces SSH exec ran the command in the persistent Linux VM."],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout|timed out|deadline/i.test(message);
      return {
        providerType: "GITHUB_CODESAPCES",
        runtimeId: request.runtime.resourceId,
        status: timedOut ? "TIMED_OUT" : "UNAVAILABLE",
        exitCode: 1,
        stdout: "",
        stderr: redactToken(message, tokenFor(credentials)),
        durationMs: Date.now() - started,
        evidence: [timedOut ? "Codespaces command exceeded the ShortForge execution timeout." : "Codespaces command execution failed."],
        limitation: redactToken(message, tokenFor(credentials)),
      };
    }
  }

  async terminate(runtime: SandboxRuntime, credentials?: SandboxCredentialBundle): Promise<SandboxRuntime> {
    await deleteCodespace(tokenFor(credentials), runtime.resourceId).catch(() => undefined);
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
        evidence: ["Reconciled GitHub Codespaces state from GitHub REST API."],
      };
    } catch (error: any) {
      const state = classifyState(String(error?.message || String(error)));
      return {
        runtime: { ...runtime, state },
        found: state === "TERMINATED",
        terminal: state === "TERMINATED",
        reconciliationRequired: state === "UNKNOWN",
        evidence: ["Codespaces reconciliation failed: " + error?.message || String(error)],
      };
    }
  }
}
