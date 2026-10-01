import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  NotebookCredentialValidation,
  NotebookExecutionRequest,
  NotebookExecutionResult,
  NotebookProviderAdapter,
  NotebookProviderMetadata,
  NotebookProvisionRequest,
  NotebookProvisionResult,
  NotebookRuntime,
  NotebookReconciliationResult,
} from "./NotebookContracts";
import { fileEvidence, runProcess } from "./NotebookUtils";

const DEFAULT_TIMEOUT_MS = 900_000;

export class KaggleNotebookAdapter implements NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata = {
    providerId: "notebook_kaggle",
    providerType: "KAGGLE",
    runtimeKind: "KAGGLE_KERNEL",
    apiVersion: "kaggle-cli",
    documentationUrl: "https://www.kaggle.com/docs/notebooks",
    paymentRequirement: "NO_CARD_NOT_ESTABLISHED",
    maxSessionSeconds: 43_200,
    gpuTypes: [
      "NvidiaTeslaP100",
      "NvidiaTeslaT4",
      "NvidiaL4",
      "NvidiaA100",
      "NvidiaH100",
    ],
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
      note: "Ephemeral notebook runtime; production worker admission remains a separate F06 gate.",
    },
  };

  async validateCredentials(): Promise<NotebookCredentialValidation> {
    const requiredKeys = ["KAGGLE_USERNAME", "KAGGLE_KEY"];
    const missingKeys = requiredKeys.filter((key) => !process.env[key]);

    if (missingKeys.length) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys,
        checkedAt: new Date().toISOString(),
        evidence: ["Kaggle credentials are not configured."],
      };
    }

    const result = await runProcess(
      "kaggle",
      ["kernels", "list", "--mine", "--page", "1"],
      { timeoutMs: 30_000 },
    );

    return {
      configured: true,
      authenticated: result.exitCode === 0,
      providerReachable: result.exitCode === 0,
      requiredKeys,
      missingKeys: [],
      checkedAt: new Date().toISOString(),
      evidence: [
        result.exitCode === 0
          ? "Kaggle CLI authentication check succeeded."
          : result.stderr || result.stdout || "Kaggle CLI authentication failed.",
      ],
      errorMessage:
        result.exitCode === 0
          ? undefined
          : "Kaggle CLI authentication check failed.",
    };
  }

  async provision(request: NotebookProvisionRequest): Promise<NotebookProvisionResult> {
    const validation = await this.validateCredentials();
    if (!validation.authenticated) {
      throw new Error("KAGGLE_PROVIDER_BLOCKED: credentials or CLI unavailable.");
    }

    if (request.metadata?.environmentVariables) {
      throw new Error(
        "KAGGLE_ENV_INJECTION_UNSUPPORTED: arbitrary environment injection is blocked to prevent secret upload.",
      );
    }

    const username = process.env.KAGGLE_USERNAME!;
    const slug =
      "shortforge-" +
      request.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) +
      "-" +
      Date.now();
    const kernelId = username + "/" + slug;
    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "shortforge-kaggle-"),
    );
    const outputDir = path.join(workDir, "output");

    const metadata = {
      id: kernelId,
      title: request.name,
      code_file: "worker.py",
      language: "python",
      kernel_type: "script",
      is_private: "true",
      enable_gpu: "true",
      enable_internet: "true",
      dataset_sources: [],
      competition_sources: [],
      kernel_sources: [],
      model_sources: [],
    };

    await fs.writeFile(
      path.join(workDir, "kernel-metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf8",
    );

    const command = Array.isArray(request.command)
      ? request.command.map((part) => JSON.stringify(part)).join(" ")
      : request.command || `python -c "print('ShortForge Kaggle notebook probe')"`;

    const script = this.workerScript(
      command,
      request.outputPath || "/kaggle/working/shortforge-output.mp4",
    );
    await fs.writeFile(path.join(workDir, "worker.py"), script, "utf8");

    const accelerator = request.gpuType
      ? this.mapAccelerator(request.gpuType)
      : "NvidiaTeslaT4";
    const timeoutSeconds = Math.min(
      43_200,
      Math.max(1, Math.floor((request.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000)),
    );

    const push = await runProcess(
      "kaggle",
      [
        "kernels",
        "push",
        "-p",
        workDir,
        "--accelerator",
        accelerator,
        "--timeout",
        String(timeoutSeconds),
      ],
      { timeoutMs: 60_000 },
    );

    if (push.exitCode !== 0) {
      await fs.rm(workDir, { recursive: true, force: true });
      throw new Error(
        "KAGGLE_KERNEL_PUSH_FAILED: " + (push.stderr || push.stdout),
      );
    }

    return {
      runtime: {
        providerId: this.metadata.providerId,
        providerType: "KAGGLE",
        resourceId: kernelId,
        runtimeKind: "KAGGLE_KERNEL",
        state: "QUEUED",
        updatedAt: new Date().toISOString(),
        gpuType: accelerator,
        gpuCount: accelerator.includes("T4") ? 2 : 1,
        providerMetadata: {
          workDir,
          outputDir,
          kernelSlug: slug,
          requestedAccelerator: accelerator,
        },
      },
      reconciliationRequired: false,
      evidence: [
        "Kaggle kernel was submitted through the official kernels push flow.",
      ],
    };
  }

  async getRuntime(resourceId: string): Promise<NotebookRuntime> {
    const result = await runProcess(
      "kaggle",
      ["kernels", "status", resourceId],
      { timeoutMs: 30_000 },
    );
    return {
      providerId: this.metadata.providerId,
      providerType: "KAGGLE",
      resourceId,
      runtimeKind: "KAGGLE_KERNEL",
      state: this.parseStatus(result.stdout),
      updatedAt: new Date().toISOString(),
      providerMetadata: { statusOutput: result.stdout },
    };
  }

  async execute(request: NotebookExecutionRequest): Promise<NotebookExecutionResult> {
    let runtime = request.runtime;
    let created: NotebookProvisionResult | undefined;

    try {
      if (!runtime) {
        if (!request.provision) {
          return {
            providerType: "KAGGLE",
            verificationLevel: "UNAVAILABLE",
            status: "UNAVAILABLE",
            evidence: [
              "Kaggle execution requires a runtime or a provision request.",
            ],
          };
        }
        created = await this.provision({
          ...request.provision,
          command: request.command,
          outputPath: request.outputPath,
        });
        runtime = created.runtime;
      }

      const started = Date.now();
      let state = (await this.getRuntime(runtime.resourceId)).state;

      while (state === "QUEUED" || state === "STARTING" || state === "RUNNING" || state === "READY") {
        if (Date.now() - started > request.timeoutMs) {
          return {
            providerType: "KAGGLE",
            runtimeId: runtime.resourceId,
            verificationLevel: "CONTROL_PLANE_VERIFIED",
            status: "TIMED_OUT",
            evidence: [
              "Kaggle kernel exceeded the ShortForge control timeout.",
            ],
            limitation:
              "Kaggle enforces its own notebook session limits; ShortForge does not extend them.",
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
        state = (await this.getRuntime(runtime.resourceId)).state;
      }

      if (state !== "SUCCEEDED") {
        return {
          providerType: "KAGGLE",
          runtimeId: runtime.resourceId,
          verificationLevel: "CONTROL_PLANE_VERIFIED",
          status: "FAILED",
          evidence: ["Kaggle kernel ended in state " + state + "."],
        };
      }

      const outputDir = String(
        runtime.providerMetadata.outputDir ||
          path.join(os.tmpdir(), "shortforge-kaggle-output-" + Date.now()),
      );
      await fs.mkdir(outputDir, { recursive: true });

      const download = await runProcess(
        "kaggle",
        ["kernels", "output", runtime.resourceId, "-p", outputDir, "-o"],
        { timeoutMs: 60_000 },
      );

      if (download.exitCode !== 0) {
        return {
          providerType: "KAGGLE",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "FAILED",
          stdout: download.stdout,
          stderr: download.stderr,
          evidence: ["Kaggle output download failed."],
        };
      }

      const files = await fs.readdir(outputDir);
      const artifactName = request.outputPath
        ? path.basename(request.outputPath)
        : files.find((file) => file.toLowerCase().endsWith(".mp4"));
      const artifact = artifactName
        ? path.join(outputDir, artifactName)
        : undefined;

      if (!artifact) {
        return {
          providerType: "KAGGLE",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "SUCCEEDED",
          stdout: download.stdout,
          evidence: [
            "Kaggle kernel completed and output was downloaded; no MP4 artifact was requested or found.",
          ],
        };
      }

      const evidence = await fileEvidence(artifact);
      if (evidence.artifactByteLength <= 0) {
        return {
          providerType: "KAGGLE",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "FAILED",
          evidence: ["Downloaded Kaggle artifact is empty."],
        };
      }

      return {
        providerType: "KAGGLE",
        runtimeId: runtime.resourceId,
        verificationLevel: "PHYSICAL_ARTIFACT_VERIFIED",
        status: "SUCCEEDED",
        exitCode: 0,
        stdout: download.stdout,
        artifactPath: artifact,
        artifactSha256: evidence.artifactSha256,
        artifactByteLength: evidence.artifactByteLength,
        evidence: [
          "Kaggle kernel executed.",
          "Physical output was downloaded through the Kaggle CLI.",
          "ShortForge recomputed SHA-256 and byte length locally.",
        ],
      };
    } finally {
      if (runtime?.resourceId) {
        await this.terminate(runtime).catch(() => undefined);
      }
      const workDir = created?.runtime.providerMetadata.workDir;
      if (workDir) {
        await fs.rm(String(workDir), { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  async terminate(runtime: NotebookRuntime): Promise<NotebookRuntime> {
    await runProcess(
      "kaggle",
      ["kernels", "delete", runtime.resourceId, "-y"],
      { timeoutMs: 30_000 },
    ).catch(() => undefined);

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }

  async reconcile(runtime: NotebookRuntime): Promise<NotebookReconciliationResult> {
    const current = await this.getRuntime(runtime.resourceId);
    return {
      runtime: current,
      found: current.state !== "UNKNOWN",
      adopted: current.state !== "UNKNOWN",
      terminal: ["SUCCEEDED", "FAILED", "TERMINATED"].includes(current.state),
      reconciliationRequired: current.state === "UNKNOWN",
      evidence: ["Kaggle status reconciled for " + runtime.resourceId + "."],
    };
  }

  private mapAccelerator(gpuType: string): string {
    const lower = gpuType.toLowerCase();
    if (lower.includes("a100")) return "NvidiaTeslaA100";
    if (lower.includes("l4")) return "NvidiaL4";
    if (lower.includes("p100")) return "NvidiaTeslaP100";
    if (lower.includes("h100")) return "NvidiaH100";
    return "NvidiaTeslaT4";
  }

  private parseStatus(output: string): NotebookRuntime["state"] {
    const text = output.toUpperCase();
    if (text.includes("COMPLETE")) return "SUCCEEDED";
    if (text.includes("ERROR") || text.includes("FAILED")) return "FAILED";
    if (text.includes("CANCEL")) return "TERMINATED";
    if (text.includes("RUNNING")) return "RUNNING";
    if (text.includes("QUEUED")) return "QUEUED";
    if (text.includes("STARTING")) return "STARTING";
    return "UNKNOWN";
  }

  private workerScript(command: string, outputPath: string): string {
    return [
      "import subprocess",
      "from pathlib import Path",
      "",
      "COMMAND = " + JSON.stringify(command),
      "OUTPUT = Path(" + JSON.stringify(outputPath) + ")",
      "",
      "print('SHORTFORGE_NOTEBOOK_START', flush=True)",
      "result = subprocess.run(['bash', '-lc', COMMAND])",
      "if result.returncode != 0:",
      "    raise SystemExit(result.returncode)",
      "",
      "if OUTPUT.exists():",
      "    print('SHORTFORGE_OUTPUT_PRESENT', OUTPUT, OUTPUT.stat().st_size, flush=True)",
      "else:",
      "    print('SHORTFORGE_NO_OUTPUT', OUTPUT, flush=True)",
      "",
      "print('SHORTFORGE_NOTEBOOK_COMPLETE', flush=True)",
    ].join("\\n");
  }
}
