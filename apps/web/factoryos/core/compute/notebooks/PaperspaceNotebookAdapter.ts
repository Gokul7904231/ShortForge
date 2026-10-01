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

const BASE = "https://api.paperspace.com/v1";

export class PaperspaceNotebookAdapter implements NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata = {
    providerId: "notebook_paperspace",
    providerType: "PAPERSPACE",
    runtimeKind: "PAPERSPACE_MACHINE_BACKED_NOTEBOOK",
    apiVersion: "v1",
    documentationUrl: "https://docs.digitalocean.com/reference/paperspace/",
    paymentRequirement: "NO_CARD_NOT_ESTABLISHED",
    capabilities: {
      canValidateCredentials: true,
      canProvision: true,
      canExecuteCode: false,
      canInvokeHostedFunction: false,
      canReadOutputs: false,
      canReadLogs: false,
      canTerminate: true,
      supportsGpu: true,
      supportsPersistence: true,
      productionWorkerEligible: false,
      note: "Current v1 control surface is machine-oriented; notebook semantics are machine-backed.",
    },
  };

  async validateCredentials(credentials?: NotebookCredentialBundle): Promise<NotebookCredentialValidation> {
    const requiredKeys = [
      "PAPERSPACE_API_KEY",
      "PAPERSPACE_TEMPLATE_ID",
      "PAPERSPACE_MACHINE_TYPE",
      "PAPERSPACE_REGION",
    ];
    const env = { ...process.env, ...(credentials || {}) };
    const missingKeys = requiredKeys.filter((key) => !env[key]);

    if (missingKeys.length) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys,
        checkedAt: new Date().toISOString(),
        evidence: ["Paperspace machine-backed notebook configuration is incomplete."],
      };
    }

    try {
      const response = await this.request("/machines", {}, credentials);
      return {
        configured: true,
        authenticated: response.ok,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: [
          response.ok
            ? "Paperspace machine API accepted the credential."
            : "Paperspace returned HTTP " + response.status + ".",
        ],
        errorMessage: response.ok
          ? undefined
          : "Paperspace authentication failed.",
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: ["Paperspace API network check failed."],
        errorMessage: error?.message || String(error),
      };
    }
  }

  async provision(request: NotebookProvisionRequest, credentials?: NotebookCredentialBundle): Promise<NotebookProvisionResult> {
    const validation = await this.validateCredentials(credentials);
    if (!validation.authenticated) {
      throw new Error(
        "PAPERSPACE_PROVIDER_BLOCKED: credentials or machine configuration unavailable.",
      );
    }

    const env = { ...process.env, ...(credentials || {}) };
    const body = {
      name: request.name,
      machineType:
        request.metadata?.machineType || env.PAPERSPACE_MACHINE_TYPE,
      region: request.region || env.PAPERSPACE_REGION,
      templateId: request.templateId || env.PAPERSPACE_TEMPLATE_ID,
      diskSize:
        request.diskGb || Number(env.PAPERSPACE_DISK_GB || "50"),
      startOnCreate: true,
      ...(env.PAPERSPACE_STARTUP_SCRIPT_ID
        ? { startupScriptId: process.env.PAPERSPACE_STARTUP_SCRIPT_ID }
        : {}),
    };

    const response = await this.request("/machines", {
      method: "POST",
      body: JSON.stringify(body),
    }, credentials);

    if (!response.ok) {
      throw new Error(
        "PAPERSPACE_MACHINE_CREATE_FAILED: HTTP " +
          response.status +
          " " +
          (await response.text()),
      );
    }

    const data = (await response.json()) as any;
    const id = String(data.id || data.machineId || data.name);

    return {
      runtime: {
        providerId: this.metadata.providerId,
        providerType: "PAPERSPACE",
        resourceId: id,
        runtimeKind: "PAPERSPACE_MACHINE_BACKED_NOTEBOOK",
        state: this.mapState(data),
        updatedAt: new Date().toISOString(),
        gpuType: request.gpuType,
        gpuCount: request.gpuCount || 1,
        notebookUrl: data.notebookUrl || data.jupyterUrl,
        providerMetadata: data,
      },
      reconciliationRequired: false,
      evidence: [
        "Paperspace machine created through the current v1 machine API.",
      ],
    };
  }

  async getRuntime(resourceId: string, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime> {
    const response = await this.request(
      "/machines/" + encodeURIComponent(resourceId),
      {},
      credentials,
    );

    if (response.status === 404) {
      return {
        providerId: this.metadata.providerId,
        providerType: "PAPERSPACE",
        resourceId,
        runtimeKind: "PAPERSPACE_MACHINE_BACKED_NOTEBOOK",
        state: "TERMINATED",
        updatedAt: new Date().toISOString(),
        providerMetadata: {},
      };
    }

    if (!response.ok) {
      throw new Error("PAPERSPACE_MACHINE_GET_FAILED: HTTP " + response.status);
    }

    const data = (await response.json()) as any;
    return {
      providerId: this.metadata.providerId,
      providerType: "PAPERSPACE",
      resourceId,
      runtimeKind: "PAPERSPACE_MACHINE_BACKED_NOTEBOOK",
      state: this.mapState(data),
      updatedAt: new Date().toISOString(),
      gpuType: data.machineType,
      gpuCount: 1,
      notebookUrl: data.notebookUrl || data.jupyterUrl,
      providerMetadata: data,
    };
  }

  async execute(_request: NotebookExecutionRequest, _credentials?: NotebookCredentialBundle): Promise<NotebookExecutionResult> {
    return {
      providerType: "PAPERSPACE",
      verificationLevel: "CONTROL_PLANE_VERIFIED",
      status: "UNAVAILABLE",
      evidence: [
        "Paperspace code execution is not claimed through the current machine control API.",
        "Startup scripts remain a machine provisioning primitive, not a portable notebook execution/readback contract.",
      ],
      limitation:
        "No stable provider-neutral public command/log/file readback contract was established for notebook execution.",
    };
  }

  async terminate(runtime: NotebookRuntime, credentials?: NotebookCredentialBundle): Promise<NotebookRuntime> {
    const response = await this.request(
      "/machines/" + encodeURIComponent(runtime.resourceId),
      { method: "DELETE" },
      credentials,
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(
        "PAPERSPACE_MACHINE_DELETE_FAILED: HTTP " + response.status,
      );
    }

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }

  private async request(path: string, init: RequestInit = {}, credentials?: NotebookCredentialBundle): Promise<Response> {
    return fetch(BASE + path, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization:
          "Bearer " + (credentials?.PAPERSPACE_API_KEY || process.env.PAPERSPACE_API_KEY || ""),
        ...(init.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(init.headers || {}),
      },
    });
  }

  private mapState(data: any): NotebookRuntime["state"] {
    const state = String(data.state || data.status || "").toUpperCase();
    if (state.includes("RUNNING") || state.includes("READY")) return "READY";
    if (state.includes("PROVISION") || state.includes("CREAT")) return "STARTING";
    if (state.includes("STOP") || state.includes("TERMIN")) return "TERMINATED";
    if (state.includes("ERROR") || state.includes("FAIL")) return "FAILED";
    return "UNKNOWN";
  }
}
