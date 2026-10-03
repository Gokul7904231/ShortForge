import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  NotebookCredentialValidation,
  NotebookExecutionRequest,
  NotebookExecutionResult,
  NotebookProviderAdapter,
  NotebookProviderMetadata,
  NotebookProvisionRequest,
  NotebookProvisionResult,
  NotebookRuntime,
  NotebookCredentialBundle,
} from "./NotebookContracts";
import { fileEvidence, runProcess } from "./NotebookUtils";

const BASE = "https://colaboratory.googleapis.com";
const COLAB_SCOPE = "https://www.googleapis.com/auth/colaboratory";
const DEFAULT_API_TIMEOUT_MS = 30_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 120_000;
const DEFAULT_EXECUTION_TIMEOUT_MS = 900_000;

type ColabRuntimeSpec = {
  key?: {
    variant?: string;
    accelerator?: string;
    shape?: string;
  };
  eligible?: boolean;
};

type ColabRuntimeConnection = {
  runtime: NotebookRuntime;
  token: string;
  url: string;
  expireTime?: string;
};

export class ColabNotebookAdapter implements NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata = {
    providerId: "notebook_colab",
    providerType: "COLAB",
    runtimeKind: "COLAB_RUNTIME",
    apiVersion: "v1beta + Jupyter",
    documentationUrl: "https://developers.google.com/colab/api/reference/rest",
    paymentRequirement: "NO_CARD_NOT_ESTABLISHED",
    maxSessionSeconds: 43_200,
    gpuTypes: ["T4", "L4", "A100"],
    capabilities: {
      canValidateCredentials: true,
      canProvision: true,
      canExecuteCode: true,
      canInvokeHostedFunction: false,
      canReadOutputs: true,
      canReadLogs: true,
      canTerminate: true,
      supportsGpu: true,
      supportsPersistence: false,
      productionWorkerEligible: false,
      note:
        "Uses the allowlisted Colab Runtime API plus the runtime's standard Jupyter REST/WebSocket interface. Execution is render-oriented and bounded; runtime admission remains outside F06 worker authority.",
    },
  };

  async validateCredentials(
    credentials?: NotebookCredentialBundle,
  ): Promise<NotebookCredentialValidation> {
    const requiredKeys = [
      "COLAB_ACCESS_TOKEN or Google Application Default Credentials",
    ];

    try {
      const token = await this.resolveAccessToken(credentials);
      const response = await this.apiFetch("/v1beta/runtimespecs", token);

      const text = await response.text();
      if (!response.ok) {
        const errorCode =
          response.status === 403
            ? "COLAB_API_ACCESS_DENIED"
            : response.status === 401
              ? "COLAB_API_UNAUTHORIZED"
              : "COLAB_API_HTTP_ERROR";
        return {
          configured: true,
          authenticated: false,
          providerReachable: true,
          requiredKeys,
          missingKeys: [],
          checkedAt: new Date().toISOString(),
          evidence: [
            response.status === 403
              ? "Colab API responded 403. The project/account may not yet be allowlisted or the OAuth scope may be missing."
              : `Colab runtimespecs returned HTTP ${response.status}.`,
          ],
          errorCode,
          errorMessage: text.slice(0, 500) || "Colab API credential check failed.",
        };
      }

      const body = this.parseJson(text);
      const specs = Array.isArray(body?.runtimeSpecs)
        ? (body.runtimeSpecs as ColabRuntimeSpec[])
        : [];
      const eligibleGpu = specs
        .filter((spec) => spec.eligible && spec.key?.variant === "VARIANT_GPU")
        .map((spec) => spec.key?.accelerator)
        .filter((value): value is string => Boolean(value));

      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: [
          "Colab runtimespecs endpoint accepted the authenticated request.",
          eligibleGpu.length
            ? `Eligible GPU accelerators reported by Colab: ${[...new Set(eligibleGpu)].join(", ")}.`
            : "Colab returned no currently eligible GPU runtime spec.",
        ],
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      return {
        configured: Boolean(
          credentials?.COLAB_ACCESS_TOKEN ||
            process.env.COLAB_ACCESS_TOKEN ||
            process.env.COLAB_GCLOUD_ADC !== "0",
        ),
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: [
          message.includes("gcloud")
            ? "No explicit token was available and Google Application Default Credentials could not be obtained."
            : "Colab API authentication/network check failed.",
        ],
        errorCode: message.includes("gcloud")
          ? "COLAB_AUTH_UNAVAILABLE"
          : "COLAB_API_NETWORK_ERROR",
        errorMessage: message.slice(0, 500),
      };
    }
  }

  async provision(
    request: NotebookProvisionRequest,
    credentials?: NotebookCredentialBundle,
  ): Promise<NotebookProvisionResult> {
    const token = await this.resolveAccessToken(credentials);
    const spec = await this.selectEligibleRuntimeSpec(
      token,
      request.gpuType || "NONE",
    );

    const requestId = randomUUID();
    const runtimeId =
      this.runtimeIdFrom(request.idempotencyKey) || "shortforge-runtime";
    const response = await this.apiFetch(
      "/v1beta/runtimes?requestId=" +
        encodeURIComponent(requestId) +
        "&runtimeId=" +
        encodeURIComponent(runtimeId),
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtimeSpec: spec }),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        "COLAB_RUNTIME_CREATE_FAILED: HTTP " +
          response.status +
          " " +
          responseText.slice(0, 1000),
      );
    }

    const operation = this.parseJson(responseText);
    if (!operation?.name) {
      throw new Error(
        "COLAB_RUNTIME_CREATE_FAILED: missing operation name.",
      );
    }

    const completed = await this.waitOperation(
      String(operation.name),
      request.timeoutMs || DEFAULT_OPERATION_TIMEOUT_MS,
      token,
    );

    if (!completed?.response?.name) {
      throw new Error(
        "COLAB_RUNTIME_CREATE_FAILED: completed operation did not return a runtime resource.",
      );
    }

    const connection = await this.getRuntimeConnection(
      String(completed.response.name),
      token,
    );
    return {
      runtime: connection.runtime,
      reconciliationRequired: false,
      evidence: [
        "Colab runtime was created through the beta runtime control API.",
        `Selected eligible runtime spec: ${String(spec.accelerator || "NONE")} / ${String(spec.shape || "SHAPE_STANDARD")}.`,
        "Jupyter connection metadata is held in process memory only; runtime proxy tokens are not persisted in the NotebookRuntime record.",
      ],
    };
  }

  async getRuntime(
    resourceId: string,
    credentials?: NotebookCredentialBundle,
  ): Promise<NotebookRuntime> {
    const token = await this.resolveAccessToken(credentials);
    return (await this.getRuntimeConnection(resourceId, token)).runtime;
  }

  async execute(
    request: NotebookExecutionRequest,
    credentials?: NotebookCredentialBundle,
  ): Promise<NotebookExecutionResult> {
    let runtime = request.runtime;
    let created: NotebookProvisionResult | undefined;

    try {
      if (!runtime) {
        if (!request.provision) {
          return {
            providerType: "COLAB",
            verificationLevel: "UNAVAILABLE",
            status: "UNAVAILABLE",
            evidence: [
              "Colab execution requires an existing runtime or a provision request.",
            ],
          };
        }
        created = await this.provision(request.provision, credentials);
        runtime = created.runtime;
      }

      const token = await this.resolveAccessToken(credentials);
      const connection = await this.getRuntimeConnection(
        runtime.resourceId,
        token,
      );

      if (
        !["READY", "RUNNING", "STARTING"].includes(connection.runtime.state)
      ) {
        return {
          providerType: "COLAB",
          runtimeId: connection.runtime.resourceId,
          verificationLevel: "CONTROL_PLANE_VERIFIED",
          status: "FAILED",
          evidence: [
            `Colab runtime is not executable in state ${connection.runtime.state}.`,
          ],
        };
      }

      const remoteCommand = Array.isArray(request.command)
        ? request.command.map((part) => this.shellQuote(part)).join(" ")
        : request.command;

      const outputPath = request.outputPath;
      const remoteCode = [
        "import subprocess",
        "from pathlib import Path",
        `command = ${JSON.stringify(remoteCommand)}`,
        `output_path = Path(${JSON.stringify(outputPath || "")})`,
        "print('SHORTFORGE_COLAB_RENDER_START', flush=True)",
        "result = subprocess.run(['bash', '-lc', command], text=True)",
        "print('SHORTFORGE_COLAB_EXIT_CODE:' + str(result.returncode), flush=True)",
        "if output_path:",
        "    exists = output_path.exists()",
        "    size = output_path.stat().st_size if exists else 0",
        "    print('SHORTFORGE_COLAB_OUTPUT:' + str(output_path) + ':' + str(size), flush=True)",
        "raise SystemExit(result.returncode)",
      ].join("\n");

      const bridge = await this.runJupyterBridge(
        connection,
        remoteCode,
        request.timeoutMs || DEFAULT_EXECUTION_TIMEOUT_MS,
      );

      if (bridge.exitCode !== 0) {
        return {
          providerType: "COLAB",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: bridge.timedOut ? "TIMED_OUT" : "FAILED",
          exitCode: bridge.exitCode,
          stdout: bridge.stdout,
          stderr: bridge.stderr,
          evidence: [
            "Colab Jupyter kernel execution returned a non-zero exit or timed out.",
            bridge.error || "No additional bridge error was reported.",
          ],
        };
      }

      if (!outputPath) {
        return {
          providerType: "COLAB",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "SUCCEEDED",
          exitCode: 0,
          stdout: bridge.stdout,
          stderr: bridge.stderr,
          evidence: [
            "Colab Jupyter kernel executed the command successfully.",
            "No outputPath was supplied, so no physical artifact was retrieved.",
          ],
        };
      }

      const localPath = path.join(
        await fs.mkdtemp(path.join(os.tmpdir(), "shortforge-colab-")),
        path.basename(outputPath),
      );
      await this.downloadRuntimeFile(
        connection.url,
        connection.token,
        outputPath,
        localPath,
      );

      const evidence = await fileEvidence(localPath);
      if (evidence.artifactByteLength <= 0) {
        return {
          providerType: "COLAB",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "FAILED",
          stdout: bridge.stdout,
          stderr: bridge.stderr,
          artifactPath: localPath,
          artifactSha256: evidence.artifactSha256,
          artifactByteLength: evidence.artifactByteLength,
          evidence: ["Colab returned an empty physical artifact."],
        };
      }

      if (
        outputPath.toLowerCase().endsWith(".mp4") &&
        !(await this.hasMp4FtypHeader(localPath))
      ) {
        return {
          providerType: "COLAB",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "FAILED",
          stdout: bridge.stdout,
          stderr: bridge.stderr,
          artifactPath: localPath,
          artifactSha256: evidence.artifactSha256,
          artifactByteLength: evidence.artifactByteLength,
          evidence: [
            "A physical output was retrieved, but the MP4 ftyp signature was not present.",
          ],
        };
      }

      return {
        providerType: "COLAB",
        runtimeId: runtime.resourceId,
        verificationLevel: "PHYSICAL_ARTIFACT_VERIFIED",
        status: "SUCCEEDED",
        exitCode: 0,
        stdout: bridge.stdout,
        stderr: bridge.stderr,
        artifactPath: localPath,
        artifactSha256: evidence.artifactSha256,
        artifactByteLength: evidence.artifactByteLength,
        evidence: [
          "Colab Jupyter kernel executed the render command.",
          "Physical output was downloaded through the runtime's Jupyter file endpoint.",
          "ShortForge recomputed SHA-256 and byte length locally.",
          ...(outputPath.toLowerCase().endsWith(".mp4")
            ? ["Local MP4 ftyp signature check passed."]
            : []),
        ],
      };
    } catch (error: any) {
      return {
        providerType: "COLAB",
        runtimeId: runtime?.resourceId,
        verificationLevel: "CONTROL_PLANE_VERIFIED",
        status: "FAILED",
        evidence: [
          error?.message || String(error),
          "No synthetic success is emitted when the Jupyter bridge or artifact retrieval fails.",
        ],
      };
    } finally {
      if (created?.runtime.resourceId) {
        await this.terminate(created.runtime, credentials).catch(() => undefined);
      }
    }
  }

  async terminate(
    runtime: NotebookRuntime,
    credentials?: NotebookCredentialBundle,
  ): Promise<NotebookRuntime> {
    const token = await this.resolveAccessToken(credentials);
    const response = await this.apiFetch(
      "/v1beta/runtimes/" +
        encodeURIComponent(runtime.resourceId) +
        "?allowMissing=true",
      token,
      { method: "DELETE" },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(
        "COLAB_RUNTIME_DELETE_FAILED: HTTP " + response.status,
      );
    }

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }

  private async resolveAccessToken(
    credentials?: NotebookCredentialBundle,
  ): Promise<string> {
    const explicit =
      credentials?.COLAB_ACCESS_TOKEN || process.env.COLAB_ACCESS_TOKEN;
    if (explicit) return explicit;

    if (process.env.COLAB_GCLOUD_ADC === "0") {
      throw new Error(
        "COLAB_AUTH_UNAVAILABLE: set COLAB_ACCESS_TOKEN or enable Google Application Default Credentials.",
      );
    }

    const gcloud = process.env.COLAB_GCLOUD_BIN || "gcloud";
    const result = await runProcess(
      gcloud,
      ["auth", "application-default", "print-access-token"],
      { timeoutMs: 20_000 },
    );

    if (result.exitCode !== 0 || !result.stdout.trim()) {
      throw new Error(
        "COLAB_GCLOUD_ADC_UNAVAILABLE: gcloud Application Default Credentials are unavailable. Authenticate with the Colab OAuth scope " +
          COLAB_SCOPE +
          ". " +
          (result.stderr || result.stdout || "").trim().slice(0, 500),
      );
    }

    return result.stdout.trim().split(/\s+/)[0];
  }

  private async apiFetch(
    endpoint: string,
    token: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const project =
      process.env.COLAB_GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", "Bearer " + token);
    if (project) headers.set("x-goog-user-project", project);

    return await fetch(
      BASE + endpoint,
      {
        ...init,
        headers,
        signal: AbortSignal.timeout(
          Number(process.env.COLAB_API_TIMEOUT_MS || DEFAULT_API_TIMEOUT_MS),
        ),
      },
    );
  }

  private async selectEligibleRuntimeSpec(
    token: string,
    requestedGpu: string,
  ): Promise<Record<string, string>> {
    const response = await this.apiFetch("/v1beta/runtimespecs", token);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        "COLAB_RUNTIME_SPECS_FAILED: HTTP " +
          response.status +
          " " +
          text.slice(0, 800),
      );
    }

    const body = this.parseJson(text);
    const specs = Array.isArray(body?.runtimeSpecs)
      ? (body.runtimeSpecs as ColabRuntimeSpec[])
      : [];
    const wanted = requestedGpu.toLowerCase();
    const eligible = specs.filter((spec) => spec.eligible && spec.key);
    const exact = eligible.find(
      (spec) =>
        String(spec.key?.accelerator || "").toLowerCase() === wanted &&
        Boolean(spec.key?.shape),
    );
    if (exact?.key) {
      return {
        variant: String(exact.key.variant || "VARIANT_GPU"),
        accelerator: String(exact.key.accelerator || requestedGpu),
        shape: String(exact.key.shape || "SHAPE_STANDARD"),
      };
    }

    if (wanted === "none" || wanted === "cpu") {
      const cpu = eligible.find(
        (spec) =>
          spec.key?.variant === "VARIANT_CPU" &&
          String(spec.key.accelerator) === "NONE",
      );
      if (cpu?.key) {
        return {
          variant: "VARIANT_CPU",
          accelerator: "NONE",
          shape: String(cpu.key.shape || "SHAPE_STANDARD"),
        };
      }
    }

    const available = eligible
      .map(
        (spec) =>
          `${String(spec.key?.accelerator || "UNKNOWN")}/${String(spec.key?.shape || "UNKNOWN")}`,
      )
      .join(", ");

    throw new Error(
      "COLAB_RUNTIME_SPEC_INELIGIBLE: requested " +
        requestedGpu +
        " is not currently eligible. Eligible specs: " +
        (available || "none"),
    );
  }

  private async getRuntimeConnection(
    resourceId: string,
    token: string,
  ): Promise<ColabRuntimeConnection> {
    const response = await this.apiFetch(
      "/v1beta/runtimes/" + encodeURIComponent(resourceId),
      token,
    );

    if (response.status === 404) {
      return {
        runtime: {
          providerId: this.metadata.providerId,
          providerType: "COLAB",
          resourceId,
          runtimeKind: "COLAB_RUNTIME",
          state: "TERMINATED",
          updatedAt: new Date().toISOString(),
          providerMetadata: {},
        },
        token: "",
        url: "",
      };
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        "COLAB_RUNTIME_GET_FAILED: HTTP " +
          response.status +
          " " +
          text.slice(0, 800),
      );
    }

    const data = this.parseJson(text);
    const connectionInfo = data?.connectionInfo;
    const runtime = {
      providerId: this.metadata.providerId,
      providerType: "COLAB" as const,
      resourceId,
      runtimeKind: "COLAB_RUNTIME" as const,
      state: this.mapState(data),
      updatedAt: new Date().toISOString(),
      notebookUrl: typeof data?.url === "string" ? data.url : undefined,
      gpuType:
        typeof data?.runtimeSpec?.accelerator === "string"
          ? data.runtimeSpec.accelerator
          : undefined,
      gpuCount: data?.runtimeSpec?.accelerator && data.runtimeSpec.accelerator !== "NONE" ? 1 : 0,
      providerMetadata: {
        runtimeName: data?.name,
        runtimeSpec: data?.runtimeSpec,
        connectionExpireTime: connectionInfo?.expireTime,
      },
    };

    if (!connectionInfo?.token || !connectionInfo?.url) {
      throw new Error(
        "COLAB_RUNTIME_CONNECTION_INFO_MISSING: runtime did not return usable Jupyter connection metadata.",
      );
    }

    return {
      runtime,
      token: String(connectionInfo.token),
      url: String(connectionInfo.url),
      expireTime:
        typeof connectionInfo.expireTime === "string"
          ? connectionInfo.expireTime
          : undefined,
    };
  }

  private async waitOperation(
    name: string,
    timeoutMs: number,
    token: string,
  ): Promise<any> {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const response = await this.apiFetch(
        "/v1/" + name.replace(/^\//, ""),
        token,
      );

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          "COLAB_OPERATION_GET_FAILED: HTTP " +
            response.status +
            " " +
            text.slice(0, 800),
        );
      }

      const data = this.parseJson(text);
      if (data.done) return data;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    throw new Error("COLAB_RUNTIME_CREATE_TIMEOUT");
  }

  private async runJupyterBridge(
    connection: ColabRuntimeConnection,
    code: string,
    timeoutMs: number,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    error?: string;
  }> {
    const candidates = [
      process.env.COLAB_JUPYTER_BRIDGE_PATH,
      path.resolve(process.cwd(), "scripts/colab-jupyter-exec.py"),
      path.resolve(process.cwd(), "apps/web/scripts/colab-jupyter-exec.py"),
    ].filter((value): value is string => Boolean(value));

    let bridgeScript = candidates[0] || "";
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        bridgeScript = candidate;
        break;
      } catch {
        // Try the next known project-root location.
      }
    }
    if (!bridgeScript) {
      throw new Error(
        "COLAB_JUPYTER_BRIDGE_NOT_FOUND: set COLAB_JUPYTER_BRIDGE_PATH or run from the ShortForge repository.",
      );
    }
    const codeB64 = Buffer.from(code, "utf8").toString("base64");

    const python =
      process.env.COLAB_JUPYTER_PYTHON ||
      (process.platform === "win32" ? "python" : "python3");

    let result: { exitCode: number; stdout: string; stderr: string };
    try {
      result = await runProcess(
        python,
        [bridgeScript],
        {
          timeoutMs,
          env: {
            SHORTFORGE_COLAB_BASE_URL: connection.url,
            SHORTFORGE_COLAB_RUNTIME_TOKEN: connection.token,
            SHORTFORGE_COLAB_CODE_B64: codeB64,
            SHORTFORGE_COLAB_TIMEOUT_MS: String(timeoutMs),
          },
        },
      );
    } catch (error: any) {
      if (process.platform !== "win32" || python === "py") throw error;
      result = await runProcess(
        "py",
        ["-3", bridgeScript],
        {
          timeoutMs,
          env: {
            SHORTFORGE_COLAB_BASE_URL: connection.url,
            SHORTFORGE_COLAB_RUNTIME_TOKEN: connection.token,
            SHORTFORGE_COLAB_CODE_B64: codeB64,
            SHORTFORGE_COLAB_TIMEOUT_MS: String(timeoutMs),
          },
        },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.stdout.trim().split("\n").pop() || "");
    } catch {
      parsed = undefined;
    }

    return {
      exitCode:
        typeof parsed?.exitCode === "number"
          ? parsed.exitCode
          : result.exitCode,
      stdout:
        typeof parsed?.stdout === "string" ? parsed.stdout : result.stdout,
      stderr:
        typeof parsed?.stderr === "string"
          ? parsed.stderr
          : result.stderr,
      timedOut:
        Boolean(parsed?.timedOut) || result.exitCode === 124,
      error: typeof parsed?.error === "string" ? parsed.error : undefined,
    };
  }

  private async downloadRuntimeFile(
    connectionUrl: string,
    runtimeToken: string,
    remotePath: string,
    localPath: string,
  ): Promise<void> {
    const base = connectionUrl.endsWith("/") ? connectionUrl : connectionUrl + "/";
    const relativePath =
      "files/" +
      this.jupyterRelativePath(remotePath)
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");

    const fileUrl = new URL(relativePath, base);
    const response = await fetch(fileUrl, {
      headers: {
        "X-Colab-Runtime-Proxy-Token": runtimeToken,
      },
      signal: AbortSignal.timeout(
        Number(process.env.COLAB_ARTIFACT_TIMEOUT_MS || 300_000),
      ),
    });

    if (!response.ok || !response.body) {
      const message = await response.text().catch(() => "");
      throw new Error(
        "COLAB_ARTIFACT_DOWNLOAD_FAILED: HTTP " +
          response.status +
          " " +
          message.slice(0, 500),
      );
    }

    await pipeline(
      Readable.fromWeb(response.body as any),
      (await import("node:fs")).createWriteStream(localPath),
    );
  }

  private jupyterRelativePath(remotePath: string): string {
    const normalized = remotePath.replace(/^\/+/, "");
    // Managed Colab runtimes normally expose /content as the Jupyter root.
    // Accept both a root-relative path and the common absolute /content/<file>
    // form used by render jobs, but never silently escape the Jupyter root.
    if (normalized === "content") return "";
    if (normalized.startsWith("content/")) return normalized.slice("content/".length);
    return normalized;
  }

  private async hasMp4FtypHeader(filePath: string): Promise<boolean> {
    const handle = await fs.open(filePath, "r");
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, 12, 0);
      return (
        bytesRead >= 8 &&
        header.subarray(4, 8).toString("ascii") === "ftyp"
      );
    } finally {
      await handle.close();
    }
  }

  private runtimeIdFrom(idempotencyKey: string): string {
    const raw = idempotencyKey
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 54);
    return ("shortforge-" + raw).slice(0, 63).replace(/-+$/g, "");
  }

  private shellQuote(value: string): string {
    return "'" + value.replaceAll("'", "'\"'\"'") + "'";
  }

  private parseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("COLAB_API_INVALID_JSON: provider returned malformed JSON.");
    }
  }

  private mapState(data: any): NotebookRuntime["state"] {
    const explicit = String(data?.state || "").toUpperCase();
    if (explicit.includes("TERMIN") || explicit.includes("STOP"))
      return "TERMINATED";
    if (explicit.includes("START") || explicit.includes("CONNECT"))
      return "STARTING";
    if (explicit.includes("RUN")) return "RUNNING";
    return "READY";
  }
}
