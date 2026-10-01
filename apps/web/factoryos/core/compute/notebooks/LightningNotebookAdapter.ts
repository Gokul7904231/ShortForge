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
import { runProcess } from "./NotebookUtils";

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

    const studio = request.name;
    const machine = request.gpuType || ({ ...process.env, ...(credentials || {}) }).LIGHTNING_MACHINE || "T4";
    const python = ({ ...process.env, ...(credentials || {}) }).LIGHTNING_PYTHON || "python3";

    const script = [
      "from lightning_sdk import Studio, Machine",
      "studio=Studio(" + JSON.stringify(studio) + ")",
      "machine_name=" + JSON.stringify(machine),
      "machine=getattr(Machine, machine_name, Machine.T4)",
      "studio.start(machine)",
      "print('SHORTFORGE_LIGHTNING_STUDIO_READY:' + studio.name)",
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
        resourceId: studio,
        runtimeKind: "LIGHTNING_STUDIO",
        state: "READY",
        updatedAt: new Date().toISOString(),
        gpuType: machine,
        gpuCount: 1,
        providerMetadata: { stdout: result.stdout, machine, studio },
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

    const python = process.env.LIGHTNING_PYTHON || "python3";
    const command = Array.isArray(request.command)
      ? request.command.join(" ")
      : request.command;

    const script = [
      "from lightning_sdk import Studio",
      "studio=Studio(" + JSON.stringify(runtime.resourceId) + ")",
      "result=studio.run(" + JSON.stringify(command) + ")",
      "print('SHORTFORGE_LIGHTNING_RUN_RESULT')",
      "print(result)",
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

    return {
      providerType: "LIGHTNING",
      runtimeId: runtime.resourceId,
      verificationLevel: "CODE_EXECUTION_VERIFIED",
      status: "SUCCEEDED",
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      evidence: ["Lightning Studio code execution completed through lightning-sdk."],
      limitation:
        "Artifact transfer into the ShortForge CAS is not yet part of this notebook adapter.",
    };
  }

  async terminate(runtime: NotebookRuntime, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime> {
    const python = process.env.LIGHTNING_PYTHON || "python3";
    const script =
      "from lightning_sdk import Studio; Studio(" +
      JSON.stringify(runtime.resourceId) +
      ").stop(); print('SHORTFORGE_LIGHTNING_STUDIO_STOPPED')";

    await runProcess(python, ["-c", script], { timeoutMs: 60_000, env: { ...process.env, ...(credentials || {}) } }).catch(
      () => undefined,
    );

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }
}
