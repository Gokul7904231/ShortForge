import { randomUUID } from "node:crypto";
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

const BASE = "https://colaboratory.googleapis.com";

export class ColabNotebookAdapter implements NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata = {
    providerId: "notebook_colab",
    providerType: "COLAB",
    runtimeKind: "COLAB_RUNTIME",
    apiVersion: "v1beta",
    documentationUrl: "https://research.google.com/colaboratory/",
    paymentRequirement: "NO_CARD_NOT_ESTABLISHED",
    maxSessionSeconds: 43_200,
    gpuTypes: ["T4", "L4", "A100"],
    capabilities: {
      canValidateCredentials: true,
      canProvision: true,
      canExecuteCode: false,
      canReadOutputs: false,
      canReadLogs: false,
      canTerminate: true,
      supportsGpu: true,
      supportsPersistence: false,
      productionWorkerEligible: false,
      note: "Colab runtime API access is beta/allowlisted; the adapter exposes control only.",
    },
  };

  async validateCredentials(): Promise<NotebookCredentialValidation> {
    const requiredKeys = ["COLAB_ACCESS_TOKEN"];
    const token = process.env.COLAB_ACCESS_TOKEN;

    if (!token) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: requiredKeys,
        checkedAt: new Date().toISOString(),
        evidence: ["COLAB_ACCESS_TOKEN is not configured."],
      };
    }

    try {
      const response = await fetch(BASE + "/v1beta/runtimespecs", {
        headers: { Authorization: "Bearer " + token },
      });

      return {
        configured: true,
        authenticated: response.ok,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: [
          response.ok
            ? "Colab runtimespecs endpoint accepted the credential."
            : "Colab API returned HTTP " + response.status + ".",
        ],
        errorMessage: response.ok
          ? undefined
          : "Colab API credential check failed.",
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: ["Colab API network check failed."],
        errorMessage: error?.message || String(error),
      };
    }
  }

  async provision(request: NotebookProvisionRequest): Promise<NotebookProvisionResult> {
    const validation = await this.validateCredentials();
    if (!validation.authenticated) {
      throw new Error(
        "COLAB_PROVIDER_BLOCKED: credential or API allowlist unavailable.",
      );
    }

    const requestId = randomUUID();
    const runtimeId = request.idempotencyKey
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 50);

    const runtimeSpec: Record<string, unknown> = {
      variant: request.gpuType ? "VARIANT_GPU" : "VARIANT_CPU",
      ...(request.gpuType ? { accelerator: request.gpuType } : {}),
      shape: "SHAPE_STANDARD",
    };

    const response = await fetch(
      BASE +
        "/v1beta/runtimes?requestId=" +
        encodeURIComponent(requestId) +
        "&runtimeId=" +
        encodeURIComponent(runtimeId),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.COLAB_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ runtimeSpec }),
      },
    );

    if (!response.ok) {
      throw new Error(
        "COLAB_RUNTIME_CREATE_FAILED: HTTP " +
          response.status +
          " " +
          (await response.text()),
      );
    }

    const operation = (await response.json()) as any;
    if (!operation?.name) {
      throw new Error("COLAB_RUNTIME_CREATE_FAILED: missing operation name.");
    }

    const completed = await this.waitOperation(
      String(operation.name),
      request.timeoutMs || 120_000,
    );

    if (!completed?.response?.name) {
      throw new Error(
        "COLAB_RUNTIME_CREATE_FAILED: completed operation did not return a runtime resource.",
      );
    }

    const runtime = await this.getRuntime(String(completed.response.name));
    return {
      runtime,
      reconciliationRequired: false,
      evidence: [
        "Colab runtime was created through the beta runtime control API.",
        "Connection metadata is retained for a future explicit Jupyter bridge.",
      ],
    };
  }

  async getRuntime(resourceId: string): Promise<NotebookRuntime> {
    const response = await fetch(
      BASE + "/v1beta/runtimes/" + encodeURIComponent(resourceId),
      {
        headers: {
          Authorization: "Bearer " + (process.env.COLAB_ACCESS_TOKEN || ""),
        },
      },
    );

    if (response.status === 404) {
      return {
        providerId: this.metadata.providerId,
        providerType: "COLAB",
        resourceId,
        runtimeKind: "COLAB_RUNTIME",
        state: "TERMINATED",
        updatedAt: new Date().toISOString(),
        providerMetadata: {},
      };
    }

    if (!response.ok) {
      throw new Error("COLAB_RUNTIME_GET_FAILED: HTTP " + response.status);
    }

    const data = (await response.json()) as any;
    return {
      providerId: this.metadata.providerId,
      providerType: "COLAB",
      resourceId,
      runtimeKind: "COLAB_RUNTIME",
      state: this.mapState(data),
      updatedAt: new Date().toISOString(),
      endpointUri: data.connectionInfo?.url,
      notebookUrl: data.url,
      gpuType: data.runtimeSpec?.accelerator,
      gpuCount: data.runtimeSpec?.accelerator ? 1 : 0,
      providerMetadata: {
        runtime: data,
        connectionInfo: data.connectionInfo,
      },
    };
  }

  async execute(_request: NotebookExecutionRequest): Promise<NotebookExecutionResult> {
    return {
      providerType: "COLAB",
      verificationLevel: "CONTROL_PLANE_VERIFIED",
      status: "UNAVAILABLE",
      evidence: [
        "Colab code execution is intentionally outside this control-plane adapter.",
        "A future explicit Jupyter bridge must use runtime connection metadata and obey Colab service restrictions.",
      ],
      limitation:
        "Free managed Colab is not treated as a distributed worker substrate.",
    };
  }

  async terminate(runtime: NotebookRuntime): Promise<NotebookRuntime> {
    const response = await fetch(
      BASE + "/v1beta/runtimes/" + encodeURIComponent(runtime.resourceId),
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + (process.env.COLAB_ACCESS_TOKEN || ""),
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error("COLAB_RUNTIME_DELETE_FAILED: HTTP " + response.status);
    }

    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }

  private async waitOperation(name: string, timeoutMs: number): Promise<any> {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const response = await fetch(
        BASE + "/v1beta/" + name,
        {
          headers: {
            Authorization: "Bearer " + (process.env.COLAB_ACCESS_TOKEN || ""),
          },
        },
      );

      if (!response.ok) {
        throw new Error("COLAB_OPERATION_GET_FAILED: HTTP " + response.status);
      }

      const data = (await response.json()) as any;
      if (data.done) return data;

      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    throw new Error("COLAB_RUNTIME_CREATE_TIMEOUT");
  }

  private mapState(data: any): NotebookRuntime["state"] {
    const state = String(data.state || "").toUpperCase();
    if (state.includes("RUNNING") || state.includes("READY")) return "READY";
    if (state.includes("START") || state.includes("CONNECT")) return "STARTING";
    if (state.includes("TERMIN") || state.includes("STOP")) return "TERMINATED";
    return "UNKNOWN";
  }
}
