import type {
  NotebookCredentialValidation,
  NotebookExecutionRequest,
  NotebookExecutionResult,
  NotebookProviderAdapter,
  NotebookProviderMetadata,
  NotebookProvisionRequest,
  NotebookProvisionResult,
  NotebookRuntime,
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
      canReadOutputs: false,
      canReadLogs: false,
      canTerminate: true,
      supportsGpu: true,
      supportsPersistence: true,
      productionWorkerEligible: false,
      note: "Current v1 control surface is machine-oriented; notebook semantics are machine-backed.",
    },
  };

  async validateCredentials(): Promise<NotebookCredentialValidation> {
    const requiredKeys = [
      "PAPERSPACE_API_KEY",
      "PAPERSPACE_TEMPLATE_ID",
      "PAPERSPACE_MACHINE_TYPE",
      "PAPERSPACE_REGION",
    ];
    const missingKeys = requiredKeys.filter((key) => !process.env[key]);

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
      const response = await this.request("/machines");
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

  async provision(request: NotebookProvisionRequest): Promise<NotebookProvisionResult> {
    const validation = await this.validateCredentials();
    if (!validation.authenticated) {
      throw new Error(
        "PAPERSPACE_PROVIDER_BLOCKED: credentials or machine configuration unavailable.",
      );
    }

    const body = {
      name: request.name,
      machineType:
        request.metadata?.machineType || process.env.PAPERSPACE_MACHINE_TYPE,
      region: request.region || process.env.PAPERSPACE_REGION,
      templateId: request.templateId || process.env.PAPERSPACE_TEMPLATE_ID,
      diskSize:
        request.diskGb || Number(process.env.PAPERSPACE_DISK_GB || "50"),
      startOnCreate: true,
      ...(process.env.PAPERSPACE_STARTUP_SCRIPT_ID
        ? { startupScriptId: process.env.PAPERSPACE_STARTUP_SCRIPT_ID }
        : {}),
    };

    const response = await this.request("/machines", {
      method: "POST",
      body: JSON.stringify(body),
    });

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

  async getRuntime(resourceId: string): Promise<NotebookRuntime> {
    const response = await this.request(
      "/machines/" + encodeURIComponent(resourceId),
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

  async execute(_request: NotebookExecutionRequest): Promise<NotebookExecutionResult> {
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

  async terminate(runtime: NotebookRuntime): Promise<NotebookRuntime> {
    const response = await this.request(
      "/machines/" + encodeURIComponent(runtime.resourceId),
      { method: "DELETE" },
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

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(BASE + path, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization:
          "Bearer " + (process.env.PAPERSPACE_API_KEY || ""),
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
