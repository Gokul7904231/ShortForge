import fs from "node:fs/promises";
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
  NotebookCredentialBundle,
} from "./NotebookContracts";
import { fileEvidence, runProcess } from "./NotebookUtils";

export class LightningNotebookAdapter implements NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata = {
    providerId: "notebook_lightning",
    providerType: "LIGHTNING",
    runtimeKind: "LIGHTNING_STUDIO",
    apiVersion: "lightning-sdk",
    documentationUrl: "https://lightning.ai/docs/platform/",
    paymentRequirement: "NO_CARD_STATED",
    capabilities: {
      canValidateCredentials: true,
      canProvision: true,
      canExecuteCode: true,
      canInvokeHostedFunction: false,
      canReadOutputs: true,
      canReadLogs: true,
      canTerminate: true,
      supportsGpu: true,
      supportsPersistence: true,
      productionWorkerEligible: false,
      note: "SDK-controlled Studio; worker-plane production eligibility remains separate.",
    },
    gpuTypes: ["T4", "A10G", "V100", "A100"],
  };

  async validateCredentials(credentials?: NotebookCredentialBundle): Promise<NotebookCredentialValidation> {
    const env = { ...process.env, ...(credentials || {}) };
    const requiredKeys = ["LIGHTNING_USER_ID", "LIGHTNING_API_KEY"];
    const missingKeys = requiredKeys.filter((key) => !env[key]);

    if (missingKeys.length) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys,
        checkedAt: new Date().toISOString(),
        evidence: ["Lightning Studio credentials are not configured."],
      };
    }

    const probe = await runProcess(
      "lightning",
      ["mmt", "list", "--all"],
      { timeoutMs: 30_000, env },
    );

    return {
      configured: true,
      authenticated: probe.exitCode === 0,
      providerReachable: probe.exitCode === 0,
      requiredKeys,
      missingKeys: [],
      checkedAt: new Date().toISOString(),
      evidence: [
        probe.exitCode === 0
          ? "Lightning authenticated API call (mmt list --all) succeeded."
          : probe.stderr || probe.stdout || "Lightning authentication check failed.",
      ],
      errorMessage:
        probe.exitCode === 0
          ? undefined
          : "Lightning CLI authentication check failed.",
    };
  }

  async provision(request: NotebookProvisionRequest, credentials?: NotebookCredentialBundle): Promise<NotebookProvisionResult> {
    const validation = await this.validateCredentials(credentials);
    if (!validation.authenticated) {
      throw new Error(
        "LIGHTNING_PROVIDER_BLOCKED: SDK, credentials, or account configuration unavailable.",
      );
    }

    const env = { ...process.env, ...(credentials || {}) };
    const existingStudio = env.LIGHTNING_EXISTING_STUDIO?.trim();
    const studioName = existingStudio || request.name;
    const teamspace = env.LIGHTNING_TEAMSPACE;
    if (!teamspace) {
      throw new Error(
        "LIGHTNING_TEAMSPACE_REQUIRED: set LIGHTNING_TEAMSPACE to owner/teamspace for CI-managed Studios.",
      );
    }
    const machine = request.gpuType || env.LIGHTNING_MACHINE || "CPU";
    const python = env.LIGHTNING_PYTHON || "python3";

    const script = [
      "from lightning_sdk import Studio, Machine",
      "studio=Studio(" + JSON.stringify(studioName) + ", teamspace=" + JSON.stringify(teamspace) + ", create_ok=" + (existingStudio ? "False" : "True") + ")",
      "machine_name=" + JSON.stringify(machine),
      "machine=None if machine_name == 'CPU' else Machine.from_str(machine_name)",
      "studio.start() if machine is None else studio.start(machine)",
      "print('SHORTFORGE_LIGHTNING_STUDIO_READY:' + studio.name)",
      "print('SHORTFORGE_LIGHTNING_TEAMSPACE:' + studio.teamspace.name)",
    ].join(";");

    const result = await runProcess(
      python,
      ["-c", script],
      { timeoutMs: request.timeoutMs || 120_000, env: { ...process.env, ...(credentials || {}) } },
    );

    if (result.exitCode !== 0) {
      throw new Error(
        "LIGHTNING_STUDIO_START_FAILED: " + (result.stderr || result.stdout),
      );
    }

    return {
      runtime: {
        providerId: this.metadata.providerId,
        providerType: "LIGHTNING",
        resourceId: studioName,
        runtimeKind: "LIGHTNING_STUDIO",
        state: "READY",
        updatedAt: new Date().toISOString(),
        gpuType: machine,
        gpuCount: machine.includes("_X_") ? Number(machine.split("_X_")[1] || 1) : 1,
        providerMetadata: { stdout: result.stdout, machine, studio: studioName, teamspace },
      },
      reconciliationRequired: false,
      evidence: ["Lightning Studio started through lightning-sdk."],
    };
  }

  async getRuntime(resourceId: string, _credentials?: NotebookCredentialBundle): Promise<NotebookRuntime> {
    return {
      providerId: this.metadata.providerId,
      providerType: "LIGHTNING",
      resourceId,
      runtimeKind: "LIGHTNING_STUDIO",
      state: "UNKNOWN",
      updatedAt: new Date().toISOString(),
      providerMetadata: {
        note: "Studio lifecycle read is non-authoritative until a stable provider read surface is wired.",
      },
    };
  }

  async execute(request: NotebookExecutionRequest, credentials?: NotebookCredentialBundle): Promise<NotebookExecutionResult> {
    const runtime =
      request.runtime ||
      (request.provision
        ? (await this.provision(request.provision, credentials)).runtime
        : undefined);

    if (!runtime) {
      return {
        providerType: "LIGHTNING",
        verificationLevel: "UNAVAILABLE",
        status: "UNAVAILABLE",
        evidence: [
          "Lightning execution requires a runtime or a provision request.",
        ],
      };
    }

    const env = { ...process.env, ...(credentials || {}) };
    const teamspace = env.LIGHTNING_TEAMSPACE;
    if (!teamspace) {
      return {
        providerType: "LIGHTNING",
        runtimeId: runtime.resourceId,
        verificationLevel: "UNAVAILABLE",
        status: "UNAVAILABLE",
        evidence: [
          "LIGHTNING_TEAMSPACE is required to address a Studio outside an interactive Studio context.",
        ],
      };
    }
    const python = env.LIGHTNING_PYTHON || "python3";
    const command = Array.isArray(request.command)
      ? request.command.join(" ")
      : request.command;

    const script = [
      "from lightning_sdk import Studio",
      "studio=Studio(" + JSON.stringify(runtime.resourceId) + ", teamspace=" + JSON.stringify(teamspace) + ", create_ok=False)",
      "result=studio.run_with_exit_code(" + JSON.stringify(command) + ")",
      "out, code = result if isinstance(result, tuple) else (result, 0)",
      "print('SHORTFORGE_LIGHTNING_RUN_RESULT')",
      "print(out)",
      "raise SystemExit(code)",
    ].join(";");

    const result = await runProcess(
      python,
      ["-c", script],
      { timeoutMs: request.timeoutMs, env: { ...process.env, ...(credentials || {}) } },
    );

    if (result.exitCode !== 0) {
      return {
        providerType: "LIGHTNING",
        runtimeId: runtime.resourceId,
        verificationLevel: "CODE_EXECUTION_VERIFIED",
        status: result.exitCode === 124 ? "TIMED_OUT" : "FAILED",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        evidence: [
          "Lightning Studio run returned a non-zero or timed-out process result.",
        ],
      };
    }

    if (request.outputPath && request.artifactDestinationPath) {
      const downloaded = await this.downloadArtifact(
        runtime,
        request.outputPath,
        request.artifactDestinationPath,
        credentials,
      );
      return {
        providerType: "LIGHTNING",
        runtimeId: runtime.resourceId,
        verificationLevel: "PHYSICAL_ARTIFACT_VERIFIED",
        status: "SUCCEEDED",
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
        artifactPath: downloaded.artifactPath,
        artifactSha256: downloaded.artifactSha256,
        artifactByteLength: downloaded.artifactByteLength,
        evidence: [
          "Lightning Studio code execution completed through lightning-sdk.",
          "Physical artifact downloaded from the Studio through the Lightning SDK.",
          "ShortForge recomputed SHA-256 and byte length outside Lightning.",
        ],
      };
    }

    return {
      providerType: "LIGHTNING",
      runtimeId: runtime.resourceId,
      verificationLevel: "CODE_EXECUTION_VERIFIED",
      status: "SUCCEEDED",
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      evidence: ["Lightning Studio code execution completed through lightning-sdk."],
    };
  }

  private async downloadArtifact(
    runtime: NotebookRuntime,
    remotePath: string,
    destinationPath: string,
    credentials?: NotebookCredentialBundle,
  ): Promise<{ artifactPath: string; artifactSha256: string; artifactByteLength: number }> {
    const env = { ...process.env, ...(credentials || {}) };
    const teamspace = env.LIGHTNING_TEAMSPACE;
    if (!teamspace) {
      throw new Error(
        "LIGHTNING_TEAMSPACE_REQUIRED: physical artifact download requires explicit Teamspace.",
      );
    }

    const [org, teamspaceName] = teamspace.split("/", 2);
    if (!org || !teamspaceName) {
      throw new Error(
        "LIGHTNING_TEAMSPACE_INVALID: expected <org>/<teamspace>.",
      );
    }

    const normalizedRemotePath = remotePath
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .trim();
    if (!normalizedRemotePath || normalizedRemotePath.includes("..")) {
      throw new Error(
        "LIGHTNING_ARTIFACT_PATH_INVALID: outputPath must be a relative Studio-home path.",
      );
    }

    const absoluteDestination = path.resolve(destinationPath);
    await fs.mkdir(path.dirname(absoluteDestination), { recursive: true });

    const studioUri =
      "lit://" +
      org +
      "/" +
      teamspaceName +
      "/studios/" +
      runtime.resourceId +
      "/" +
      normalizedRemotePath;

    const listing = await runProcess(
      "lightning",
      ["ls", studioUri],
      { timeoutMs: 30_000, env },
    );

    const result = await runProcess(
      "lightning",
      ["cp", studioUri, absoluteDestination],
      { timeoutMs: 120_000, env },
    );

    if (result.exitCode !== 0) {
      throw new Error(
        "LIGHTNING_ARTIFACT_DOWNLOAD_FAILED: " +
          (result.stderr || result.stdout || "lightning cp failed") +
          "\nRemote artifact probe: " +
          (listing.stdout || listing.stderr || "lightning ls returned no output"),
      );
    }

    const evidence = await fileEvidence(absoluteDestination);
    if (evidence.artifactByteLength <= 0) {
      throw new Error(
        "LIGHTNING_ARTIFACT_DOWNLOAD_EMPTY: downloaded artifact is zero bytes.",
      );
    }

    return evidence;
  }

  async terminate(runtime: NotebookRuntime, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime> {
    const env = { ...process.env, ...(credentials || {}) };
    const teamspace = env.LIGHTNING_TEAMSPACE;
    if (!teamspace) {
      return {
        ...runtime,
        state: "UNKNOWN",
        updatedAt: new Date().toISOString(),
      };
    }
    const python = env.LIGHTNING_PYTHON || "python3";
    const script =
      "from lightning_sdk import Studio; Studio(" +
      JSON.stringify(runtime.resourceId) +
      ", teamspace=" +
      JSON.stringify(teamspace) +
      ", create_ok=False).stop(); print('SHORTFORGE_LIGHTNING_STUDIO_STOPPED')";

    await runProcess(python, ["-c", script], { timeoutMs: 60_000, env }).catch(
      () => undefined,
    );

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }
}
