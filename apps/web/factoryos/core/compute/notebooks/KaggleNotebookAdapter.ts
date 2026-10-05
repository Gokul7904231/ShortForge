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
  NotebookCredentialBundle,
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

  async validateCredentials(credentials?: NotebookCredentialBundle): Promise<NotebookCredentialValidation> {
    const env = { ...process.env, ...(credentials || {}) };
    const hasModernToken = Boolean(env.KAGGLE_API_TOKEN);
    const hasLegacyKeys = Boolean(env.KAGGLE_USERNAME && env.KAGGLE_KEY);
    const requiredKeys = hasModernToken
      ? ["KAGGLE_API_TOKEN"]
      : ["KAGGLE_USERNAME", "KAGGLE_KEY"];
    const missingKeys = requiredKeys.filter((key) => !env[key]);

    if (!hasModernToken && !hasLegacyKeys) {
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
      { timeoutMs: 30_000, env },
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

  async provision(request: NotebookProvisionRequest, credentials?: NotebookCredentialBundle): Promise<NotebookProvisionResult> {
    const validation = await this.validateCredentials(credentials);
    if (!validation.authenticated) {
      throw new Error("KAGGLE_PROVIDER_BLOCKED: credentials or CLI unavailable.");
    }

    if (request.metadata?.environmentVariables) {
      throw new Error(
        "KAGGLE_ENV_INJECTION_UNSUPPORTED: arbitrary environment injection is blocked to prevent secret upload.",
      );
    }

    const username = ({ ...process.env, ...(credentials || {}) }).KAGGLE_USERNAME;
    if (!username) {
      throw new Error(
        "KAGGLE_USERNAME_REQUIRED: token connections must be resolved to a Kaggle username before execution.",
      );
    }
    // Kaggle requires a new kernel's title and slug to correspond. The previous
    // implementation appended a timestamp only to the slug, which can yield a
    // 409 Conflict on SaveKernel because the title no longer resolves to that slug.
    const timestamp = Date.now();
    const kernelTitle = request.name + "-" + timestamp;
    // Kaggle resolves the kernel by the slug derived from its title. Keep
    // metadata.id aligned with that canonical slug; an extra prefix here can
    // allow SaveKernel to succeed but make later status/output calls resolve
    // a different (non-existent) kernel resource.
    const slug = kernelTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);
    const kernelId = username + "/" + slug;
    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "shortforge-kaggle-"),
    );
    const outputDir = path.join(workDir, "output");

    const templateDirectory =
      typeof request.templateDirectory === "string"
        ? request.templateDirectory.trim()
        : "";

    let metadata: Record<string, unknown> = {};
    let codeFile = "worker.py";

    if (templateDirectory) {
      const templateStat = await fs.stat(templateDirectory).catch(() => undefined);
      if (!templateStat?.isDirectory()) {
        throw new Error(
          "KAGGLE_TEMPLATE_DIRECTORY_NOT_FOUND: " + templateDirectory,
        );
      }

      await fs.cp(templateDirectory, workDir, {
        recursive: true,
        force: true,
      });

      const templateMetadataPath = path.join(workDir, "kernel-metadata.json");
      const templateMetadataRaw = await fs
        .readFile(templateMetadataPath, "utf8")
        .catch(() => "{}");
      try {
        metadata = JSON.parse(templateMetadataRaw) as Record<string, unknown>;
      } catch {
        throw new Error("KAGGLE_TEMPLATE_METADATA_INVALID");
      }

      codeFile =
        typeof metadata.code_file === "string" && metadata.code_file
          ? metadata.code_file
          : "worker.py";

      await fs.access(path.join(workDir, codeFile)).catch(() => {
        throw new Error(
          "KAGGLE_TEMPLATE_ENTRYPOINT_MISSING: " + codeFile,
        );
      });

      const templateMarker =
        typeof metadata.kernel_type === "string"
          ? String(metadata.kernel_type)
          : "";
      metadata = {
        ...metadata,
        id: kernelId,
        title: kernelTitle,
        code_file: codeFile,
        language: "python",
        kernel_type: templateMarker || "script",
        is_private: "true",
        enable_gpu: request.gpuType ? "true" : "false",
        enable_internet: "true",
        dataset_sources: Array.isArray(metadata.dataset_sources)
          ? metadata.dataset_sources
          : [],
        competition_sources: Array.isArray(metadata.competition_sources)
          ? metadata.competition_sources
          : [],
        kernel_sources: Array.isArray(metadata.kernel_sources)
          ? metadata.kernel_sources
          : [],
        model_sources: Array.isArray(metadata.model_sources)
          ? metadata.model_sources
          : [],
      };
    } else {
      metadata = {
        id: kernelId,
        title: kernelTitle,
        code_file: "worker.py",
        language: "python",
        kernel_type: "script",
        is_private: "true",
        enable_gpu: request.gpuType ? "true" : "false",
        enable_internet: "true",
        dataset_sources: [],
        competition_sources: [],
        kernel_sources: [],
        model_sources: [],
      };

      const command = Array.isArray(request.command)
        ? request.command.map((part) => JSON.stringify(part)).join(" ")
        : request.command || `python -c "print('ShortForge Kaggle notebook probe')"`;

      const script = this.workerScript(
        command,
        request.outputPath || "/kaggle/working/shortforge-output.mp4",
      );
      await fs.writeFile(path.join(workDir, "worker.py"), script, "utf8");
    }

    await fs.writeFile(
      path.join(workDir, "kernel-metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf8",
    );

    if (templateDirectory) {
      const safeMetadata = {
        renderer:
          typeof request.metadata?.renderer === "string"
            ? request.metadata.renderer
            : "shortforge",
        outputPath:
          request.outputPath ||
          "/kaggle/working/shortforge/outputs/shortforge-output.mp4",
        command:
          Array.isArray(request.command)
            ? request.command
            : request.command || "",
        modelId:
          typeof request.metadata?.modelId === "string"
            ? request.metadata.modelId
            : "",
        prompt:
          typeof request.metadata?.prompt === "string"
            ? request.metadata.prompt
            : "",
        negativePrompt:
          typeof request.metadata?.negativePrompt === "string"
            ? request.metadata.negativePrompt
            : "",
        nativeWidth:
          typeof request.metadata?.nativeWidth === "number"
            ? request.metadata.nativeWidth
            : 480,
        nativeHeight:
          typeof request.metadata?.nativeHeight === "number"
            ? request.metadata.nativeHeight
            : 832,
        fps:
          typeof request.metadata?.fps === "number"
            ? request.metadata.fps
            : 16,
        numFrames:
          typeof request.metadata?.numFrames === "number"
            ? request.metadata.numFrames
            : 21,
        numInferenceSteps:
          typeof request.metadata?.numInferenceSteps === "number"
            ? request.metadata.numInferenceSteps
            : 12,
        guidanceScale:
          typeof request.metadata?.guidanceScale === "number"
            ? request.metadata.guidanceScale
            : 5,
        requireDualT4: Boolean(request.metadata?.requireDualT4),
      };

      await fs.writeFile(
        path.join(workDir, "shortforge-render-request.json"),
        JSON.stringify(safeMetadata, null, 2),
        "utf8",
      );
    }

    const accelerator = request.gpuType
      ? this.mapAccelerator(request.gpuType)
      : undefined;
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
        ...(accelerator ? ["--accelerator", accelerator] : []),
        "--timeout",
        String(timeoutSeconds),
      ],
      { timeoutMs: 60_000, env: { ...process.env, ...(credentials || {}) } },
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
        gpuCount: accelerator?.includes("T4") ? 2 : accelerator ? 1 : 0,
        providerMetadata: {
          workDir,
          outputDir,
          kernelSlug: slug,
          requestedAccelerator: accelerator ?? "CPU",
        },
      },
      reconciliationRequired: false,
      evidence: [
        "Kaggle kernel was submitted through the official kernels push flow.",
      ],
    };
  }

  async getRuntime(resourceId: string, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime> {
    const result = await runProcess(
      "kaggle",
      ["kernels", "status", resourceId],
      { timeoutMs: 30_000, env: { ...process.env, ...(credentials || {}) } },
    );
    return {
      providerId: this.metadata.providerId,
      providerType: "KAGGLE",
      resourceId,
      runtimeKind: "KAGGLE_KERNEL",
      state: this.parseStatus(result.stdout + "\n" + result.stderr),
      updatedAt: new Date().toISOString(),
      providerMetadata: { statusOutput: result.stdout, statusError: result.stderr },
    };
  }

  async execute(request: NotebookExecutionRequest, credentials?: NotebookCredentialBundle): Promise<NotebookExecutionResult> {
    let runtime = request.runtime;
    let created: NotebookProvisionResult | undefined;
    let preserveRuntime = false;

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
        created = await this.provision(
          {
            ...request.provision,
            command: request.command,
            outputPath: request.outputPath,
          },
          credentials,
        );
        runtime = created.runtime;
      }

      const started = Date.now();
      let observedRuntime = await this.getRuntime(runtime.resourceId, credentials);
      let state = observedRuntime.state;

      // Kaggle can briefly report no recognized worker state immediately after a
      // successful push while the kernel record propagates. Treat UNKNOWN as a
      // retryable control-plane state during the bounded execution window rather
      // than converting that propagation race into a false failure.
      while (
        state === "QUEUED" ||
        state === "STARTING" ||
        state === "RUNNING" ||
        state === "READY" ||
        state === "UNKNOWN"
      ) {
        if (Date.now() - started > request.timeoutMs) {
          const outputDir = String(
            runtime.providerMetadata.outputDir ||
              path.join(os.tmpdir(), "shortforge-kaggle-output-" + Date.now()),
          );
          const artifactProbe = await this.downloadArtifact(
            runtime.resourceId,
            request,
            outputDir,
            credentials,
          );
          const logs = await runProcess(
            "kaggle",
            ["kernels", "logs", runtime.resourceId],
            { timeoutMs: 60_000, env: { ...process.env, ...(credentials || {}) } },
          ).catch((error) => ({
            exitCode: 1,
            stdout: "",
            stderr: String(error),
          }));

          if (
            artifactProbe.artifactPath &&
            artifactProbe.artifactSha256 &&
            (artifactProbe.artifactByteLength || 0) >= 1024
          ) {
            const persistedArtifactPath = await this.persistArtifact(
              artifactProbe.artifactPath,
              request.artifactDestinationPath,
            );
            return {
              providerType: "KAGGLE",
              runtimeId: runtime.resourceId,
              verificationLevel: "PHYSICAL_ARTIFACT_VERIFIED",
              status: "SUCCEEDED",
              exitCode: 0,
              stdout: artifactProbe.stdout,
              artifactPath: persistedArtifactPath,
              artifactSha256: artifactProbe.artifactSha256,
              artifactByteLength: artifactProbe.artifactByteLength,
              evidence: [
                "Kaggle status polling reached its control timeout.",
                "Kaggle output download succeeded during timeout reconciliation.",
                "ShortForge recomputed SHA-256 and byte length locally.",
              ],
            };
          }

          if (process.env.KAGGLE_KEEP_FAILED_RUNTIME === "1") {
            preserveRuntime = true;
          }

          return {
            providerType: "KAGGLE",
            runtimeId: runtime.resourceId,
            verificationLevel: "CONTROL_PLANE_VERIFIED",
            status: "TIMED_OUT",
            evidence: [
              "Kaggle kernel exceeded the ShortForge control timeout.",
              "Last Kaggle status output: " +
                String(observedRuntime.providerMetadata.statusOutput || "").slice(-1000),
              "Last Kaggle status error: " +
                String(observedRuntime.providerMetadata.statusError || "").slice(-1000),
              "Kaggle log tail: " +
                String(logs.stdout || logs.stderr || "").slice(-4000),
              artifactProbe.error || "Kaggle output reconciliation did not produce a usable MP4.",
            ],
            limitation:
              "Kaggle hosted execution can remain queued or running under capacity pressure. The timeout path now performs artifact and log reconciliation before deciding failure.",
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
        observedRuntime = await this.getRuntime(runtime.resourceId, credentials);
        state = observedRuntime.state;
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
      const artifactProbe = await this.downloadArtifact(
        runtime.resourceId,
        request,
        outputDir,
        credentials,
      );

      if (artifactProbe.error) {
        return {
          providerType: "KAGGLE",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "FAILED",
          stdout: artifactProbe.stdout,
          stderr: artifactProbe.stderr,
          evidence: [artifactProbe.error],
        };
      }

      if (!artifactProbe.artifactPath) {
        return {
          providerType: "KAGGLE",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "SUCCEEDED",
          stdout: artifactProbe.stdout,
          evidence: [
            "Kaggle kernel completed and output was downloaded; no MP4 artifact was requested or found.",
          ],
        };
      }

      if ((artifactProbe.artifactByteLength || 0) <= 0) {
        return {
          providerType: "KAGGLE",
          runtimeId: runtime.resourceId,
          verificationLevel: "CODE_EXECUTION_VERIFIED",
          status: "FAILED",
          evidence: ["Downloaded Kaggle artifact is empty."],
        };
      }

      const persistedArtifactPath = await this.persistArtifact(
        artifactProbe.artifactPath,
        request.artifactDestinationPath,
      );
      return {
        providerType: "KAGGLE",
        runtimeId: runtime.resourceId,
        verificationLevel: "PHYSICAL_ARTIFACT_VERIFIED",
        status: "SUCCEEDED",
        exitCode: 0,
        stdout: artifactProbe.stdout,
        artifactPath: persistedArtifactPath,
        artifactSha256: artifactProbe.artifactSha256,
        artifactByteLength: artifactProbe.artifactByteLength,
        evidence: [
          "Kaggle kernel executed.",
          "Physical output was downloaded through the Kaggle CLI.",
          "ShortForge recomputed SHA-256 and byte length locally.",
        ],
      };
    } finally {
      if (runtime?.resourceId && !preserveRuntime) {
        await this.terminate(runtime, credentials).catch(() => undefined);
      }
      const workDir = created?.runtime.providerMetadata.workDir;
      if (workDir) {
        await fs.rm(String(workDir), { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  private async downloadArtifact(
    resourceId: string,
    request: NotebookExecutionRequest,
    outputDir: string,
    credentials?: NotebookCredentialBundle,
  ): Promise<{
    artifactPath?: string;
    artifactSha256?: string;
    artifactByteLength?: number;
    stdout: string;
    stderr: string;
    error?: string;
  }> {
    await fs.mkdir(outputDir, { recursive: true });

    const download = await runProcess(
      "kaggle",
      ["kernels", "output", resourceId, "-p", outputDir, "-o"],
      { timeoutMs: 60_000, env: { ...process.env, ...(credentials || {}) } },
    );

    if (download.exitCode !== 0) {
      return {
        stdout: download.stdout,
        stderr: download.stderr,
        error: "Kaggle output download failed: " + (download.stderr || download.stdout),
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
        stdout: download.stdout,
        stderr: download.stderr,
      };
    }

    const evidence = await fileEvidence(artifact);
    if (evidence.artifactByteLength <= 0) {
      return {
        stdout: download.stdout,
        stderr: download.stderr,
        error: "Downloaded Kaggle artifact is empty.",
      };
    }

    return {
      stdout: download.stdout,
      stderr: download.stderr,
      artifactPath: artifact,
      artifactSha256: evidence.artifactSha256,
      artifactByteLength: evidence.artifactByteLength,
    };
  }

  private async persistArtifact(
    artifactPath: string,
    destinationPath?: string,
  ): Promise<string> {
    const destination = destinationPath?.trim();
    if (!destination || destination === artifactPath) return artifactPath;

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(artifactPath, destination);

    const evidence = await fileEvidence(destination);
    if (evidence.artifactByteLength !== (await fs.stat(artifactPath)).size) {
      throw new Error(
        "KAGGLE_ARTIFACT_PERSIST_FAILED: destination byte length mismatch.",
      );
    }

    return destination;
  }

  async terminate(runtime: NotebookRuntime, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime> {
    await runProcess(
      "kaggle",
      ["kernels", "delete", runtime.resourceId, "-y"],
      { timeoutMs: 30_000, env: { ...process.env, ...(credentials || {}) } },
    ).catch(() => undefined);

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }

  async reconcile(runtime: NotebookRuntime, credentials?: NotebookCredentialBundle): Promise<NotebookReconciliationResult> {
    const current = await this.getRuntime(runtime.resourceId, credentials);
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
    ].join("\n");
  }
}
