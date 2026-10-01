import { BaseProviderControlAdapter } from "../BaseProviderControlAdapter";
import {
  type ComputeOffer,
  type CredentialValidationResult,
  type OfferDiscoveryRequest,
  type ProviderAccountContext,
  type ProviderControlAdapter,
  type ProviderQuota,
  type ProviderResource,
  type ProvisionAccepted,
  type ProvisionRequest,
  type ReconciliationResult,
  type RenderProbeRequest,
  type RenderProbeResult,
  type ResourceReference,
  type TerminateRequest,
  type TerminationResult,
} from "../ProviderApiContracts";
import { ProviderApiError } from "../ProviderApiTransport";

function n(value: unknown): number | undefined {
  const x = Number(value);
  return Number.isFinite(x) ? x : undefined;
}

export class PaperspaceProviderControl
  extends BaseProviderControlAdapter
  implements ProviderControlAdapter
{
  readonly metadata = {
    providerId: "api_paperspace",
    providerType: "PAPERSPACE" as const,
    apiVersion: "v1",
    discoveryKind: "MACHINE" as const,
    baseUrl: process.env.PAPERSPACE_API_BASE_URL || "https://api.paperspace.com/v1",
    documentationUrl: "https://docs.paperspace.com/api-reference/",
    controlCapabilities: {
      canValidateCredentials: true,
      canDiscoverOffers: true,
      canReadResource: true,
      canProvision: true,
      canTerminate: true,
      canConfigureEntrypointByApi: true,
      canExecuteCommandByApi: false,
      canReadLogsByApi: false,
      canReadFilesByApi: false,
      canVerifyPhysicalRenderByApi: false,
    },
  };

  private readonly apiKey = process.env.PAPERSPACE_API_KEY;

  constructor() {
    super(
      process.env.PAPERSPACE_API_BASE_URL || "https://api.paperspace.com/v1",
      process.env.PAPERSPACE_API_KEY,
    );
  }

  async validateCredentials(): Promise<CredentialValidationResult> {
    const checkedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys: ["PAPERSPACE_API_KEY"],
        missingKeys: ["PAPERSPACE_API_KEY"],
        checkedAt,
      };
    }
    try {
      const response = await this.transport.request<any>({
        method: "GET",
        path: "/machines",
        retryMode: "SAFE",
      });
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys: ["PAPERSPACE_API_KEY"],
        missingKeys: [],
        providerRequestId: response.requestId,
        checkedAt,
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: error?.status !== 401,
        providerReachable: Boolean(error?.status),
        requiredKeys: ["PAPERSPACE_API_KEY"],
        missingKeys: [],
        providerRequestId: error?.providerRequestId,
        checkedAt,
        errorCode: error?.providerCode || String(error?.status || "PAPERSPACE_API_ERROR"),
        errorMessage: error?.message || String(error),
      };
    }
  }

  async getAccountContext(): Promise<ProviderAccountContext> {
    return {
      providerId: this.metadata.providerId,
      metadata: { apiVersion: "v1", legacyApi: false },
    };
  }

  async getQuota(): Promise<ProviderQuota> {
    return {
      known: false,
      observedAt: new Date().toISOString(),
      source: "UNKNOWN",
    };
  }

  async discoverOffers(request: OfferDiscoveryRequest = {}): Promise<ComputeOffer[]> {
    const types = request.gpuType
      ? [request.gpuType]
      : this.csvEnv("PAPERSPACE_MACHINE_TYPES");
    const regions = request.regions?.length
      ? request.regions
      : request.region
        ? [request.region]
        : this.csvEnv("PAPERSPACE_REGIONS");

    if (!types.length || !regions.length) {
      return [];
    }

    const offers: ComputeOffer[] = [];
    for (const machineType of types) {
      for (const region of regions) {
        const response = await this.transport.request<any>({
          method: "GET",
          path: `/machine-availability?machineType=${encodeURIComponent(machineType)}&region=${encodeURIComponent(region)}`,
          retryMode: "SAFE",
        });
        const available = Boolean(response.data?.available);
        if (request.acceleratorRequired && !available) continue;
        offers.push({
          offerId: `paperspace:${region}:${machineType}`,
          providerId: this.metadata.providerId,
          providerType: "PAPERSPACE",
          discoveryKind: "MACHINE",
          capacityConfidence: "LIVE",
          observedAt: new Date().toISOString(),
          compute: {
            cpuCores: request.minCpuCores,
            memoryMb: request.minMemoryMb,
          },
          accelerator: {
            type: machineType,
            count: request.gpuCount || 1,
            vramMb: request.minVramMb,
          },
          location: { region },
          capabilities: {
            customImage: true,
            startupCommand: true,
            commandExecutionByApi: false,
            fileReadByApi: false,
          },
          providerMetadata: {
            machineType,
            available,
            availabilityResponse: response.data,
          },
        });
      }
    }
    return offers;
  }

  async provision(request: ProvisionRequest): Promise<ProvisionAccepted> {
    const templateId =
      String(request.providerOptions?.templateId || process.env.PAPERSPACE_TEMPLATE_ID || "");
    if (!templateId) {
      throw new Error("Paperspace provisioning requires PAPERSPACE_TEMPLATE_ID or providerOptions.templateId.");
    }

    let startupScriptId = String(
      request.providerOptions?.startupScriptId ||
        process.env.PAPERSPACE_STARTUP_SCRIPT_ID ||
        "",
    );

    if (request.command) {
      const script = typeof request.command === "string"
        ? request.command
        : request.command.join(" ");
      const scriptResponse = await this.transport.request<any>({
        method: "POST",
        path: "/startup-scripts",
        body: {
          name: request.name || this.deterministicName("shortforge-render", request),
          script,
          isRunOnce: true,
        },
        retryMode: "NONE",
      });
      startupScriptId = String(
        scriptResponse.data?.id ||
          scriptResponse.data?.startupScriptId ||
          "",
      );
      if (!startupScriptId) {
        throw new ProviderApiError("Paperspace startup-script API did not return an id.", {
          providerRequestId: scriptResponse.requestId,
          payload: scriptResponse.data,
        });
      }
    }

    const body: Record<string, unknown> = {
      diskSize: request.diskGb || 50,
      machineType: request.gpuType || request.offerId || "",
      name: request.name || this.deterministicName("shortforge-api", request),
      region: request.region || String(request.providerOptions?.region || ""),
      templateId,
      startOnCreate: true,
      ...(startupScriptId ? { startupScriptId } : {}),
      ...(request.providerOptions || {}),
    };

    const response = await this.transport.request<any>({
      method: "POST",
      path: "/machines",
      body,
      retryMode: "NONE",
      idempotencyKey: request.idempotencyKey,
    });
    const resourceId = String(response.data?.id || response.data?.machineId || "");
    if (!resourceId) {
      throw new ProviderApiError("Paperspace API did not return a machine id.", {
        providerRequestId: response.requestId,
        payload: response.data,
      });
    }
    const status = String(response.data?.state || response.data?.status || "").toUpperCase();
    return {
      operationId: "",
      reference: this.ref("PAPERSPACE", resourceId, request.idempotencyKey),
      state: ["RUNNING", "READY"].includes(status) ? "READY" : "PROVISIONING",
      acceptedAt: new Date().toISOString(),
      providerRequestId: response.requestId,
      reconciliationRequired: false,
      rawResponse: {
        ...response.data,
        startupScriptId: startupScriptId || undefined,
      },
    };
  }

  async reconcileProvision(
    request: ProvisionRequest,
    operation: import("../ProviderApiContracts").ProviderOperationRecord,
  ): Promise<ProvisionAccepted | undefined> {
    const response = await this.transport.request<any>({
      method: "GET",
      path: "/machines",
      retryMode: "SAFE",
    });
    const rows = Array.isArray(response.data)
      ? response.data
      : response.data?.items || response.data?.machines || response.data?.data || [];
    const expectedName =
      request.name || this.deterministicName("shortforge-api", request);
    const match = rows.find((row: any) =>
      String(row.name || "").trim() === expectedName &&
      !["TERMINATED", "DELETED", "ERROR", "FAILED"].includes(
        String(row.state || row.status || "").toUpperCase(),
      ),
    );
    if (!match?.id) return undefined;

    return {
      operationId: operation.operationId,
      reference: this.ref("PAPERSPACE", String(match.id), request.idempotencyKey, operation.operationId),
      state: ["RUNNING", "READY"].includes(String(match.state || match.status || "").toUpperCase())
        ? "READY"
        : "PROVISIONING",
      acceptedAt: operation.requestedAt,
      reconciliationRequired: false,
      rawResponse: match,
    };
  }

  async getResource(resourceId: string): Promise<ProviderResource> {
    const response = await this.transport.request<any>({
      method: "GET",
      path: `/machines/${encodeURIComponent(resourceId)}`,
      retryMode: "SAFE",
    });
    const row = response.data || {};
    const status = String(row.state || row.status || "").toUpperCase();
    const stateMap: Record<string, ProviderResource["state"]> = {
      PROVISIONING: "PROVISIONING",
      CREATING: "PROVISIONING",
      READY: "READY",
      RUNNING: "RUNNING",
      STARTING: "BOOTING",
      STOPPING: "STOPPING",
      STOPPED: "STOPPED",
      TERMINATING: "TERMINATING",
      TERMINATED: "TERMINATED",
      DELETED: "TERMINATED",
      ERROR: "FAILED",
      FAILED: "FAILED",
    };
    const accelerator = Array.isArray(row.accelerator)
      ? row.accelerator[0]
      : row.accelerator || row.accelerators?.[0];
    return {
      reference: this.ref("PAPERSPACE", resourceId),
      state: stateMap[status] || "UNKNOWN",
      endpointUri: row.network?.publicIp || row.publicIp ? `ssh://${row.network?.publicIp || row.publicIp}` : undefined,
      startedAt: row.startedAt || row.createdAt,
      updatedAt: new Date().toISOString(),
      gpu: {
        type: accelerator?.name || row.machineType,
        count: n(accelerator?.count),
        vramMb: n(accelerator?.memory),
      },
      compute: {
        cpuCores: n(row.cpuCores || row.cores),
        memoryMb: n(row.memoryMb || row.memory),
      },
      providerMetadata: row,
    };
  }

  async terminate(request: TerminateRequest): Promise<TerminationResult> {
    const response = await this.transport.request<any>({
      method: "DELETE",
      path: `/machines/${encodeURIComponent(request.reference.resourceId)}`,
      retryMode: "SAFE",
    });
    return {
      operationId: request.operationId || "",
      reference: request.reference,
      state: "TERMINATED",
      completedAt: new Date().toISOString(),
      providerRequestId: response.requestId,
      reconciliationRequired: false,
    };
  }

  async reconcile(reference: ResourceReference): Promise<ReconciliationResult> {
    try {
      const resource = await this.getResource(reference.resourceId);
      return {
        reference,
        currentState: resource.state,
        found: resource.state !== "UNKNOWN",
        adopted: resource.state !== "UNKNOWN",
        terminal: ["TERMINATED", "FAILED"].includes(resource.state),
        reconciliationRequired: false,
        resource,
        evidence: ["Paperspace v1 GET /machines/{id} succeeded."],
      };
    } catch (error: any) {
      if (error?.status === 404) {
        return {
          reference,
          currentState: "TERMINATED",
          found: false,
          adopted: false,
          terminal: true,
          reconciliationRequired: false,
          evidence: ["Paperspace reports the machine does not exist."],
        };
      }
      return {
        reference,
        currentState: "UNKNOWN",
        found: false,
        adopted: false,
        terminal: false,
        reconciliationRequired: true,
        providerRequestId: error?.providerRequestId,
        evidence: [error?.message || String(error)],
      };
    }
  }

  async renderProbe(request: RenderProbeRequest): Promise<RenderProbeResult> {
    const offers = await this.discoverOffers({
      gpuType: request.gpuType,
      gpuCount: request.gpuCount,
      maxOffers: 10,
      acceleratorRequired: true,
      region: process.env.PAPERSPACE_REGION,
      regions: process.env.PAPERSPACE_REGION ? [process.env.PAPERSPACE_REGION] : undefined,
    });
    const offer = offers.find((candidate) => candidate.providerMetadata.available !== false) || offers[0];
    if (!offer) {
      throw new ProviderApiError(
        "Paperspace returned no configured machine availability for the render probe.",
        { providerCode: "PAPERSPACE_NO_AVAILABLE_MACHINE", retryable: false },
      );
    }

    const idempotencyKey = `render-probe:${Date.now()}`;
    const provisioned = await this.provision({
      idempotencyKey,
      image: request.image,
      gpuType: offer.accelerator?.type,
      gpuCount: request.gpuCount || offer.accelerator?.count || 1,
      cpuCores: request.cpuCores,
      memoryMb: request.memoryMb,
      diskGb: request.diskGb,
      region: offer.location?.region,
      command: request.renderCommand,
      maxDurationSeconds: Math.ceil(request.timeoutMs / 1000),
      providerOptions: {
        templateId: process.env.PAPERSPACE_TEMPLATE_ID,
      },
    });

    const ready = await this.waitForRunning(
      provisioned.reference.resourceId,
      request.timeoutMs,
    );

    try {
      await this.terminate({
        reference: provisioned.reference,
        wait: false,
        reason: "API render probe complete",
      });
    } catch {}

    return {
      providerId: this.metadata.providerId,
      providerType: "PAPERSPACE",
      verificationLevel: ready
        ? "RENDER_LAUNCH_VERIFIED"
        : "CONTROL_PLANE_VERIFIED",
      passed: ready,
      resourceId: provisioned.reference.resourceId,
      evidence: [
        "Paperspace v1 created a machine from the requested machine type and template.",
        "A one-time startup script containing the render command was attached before creation.",
        ready
          ? "The machine reached a running state."
          : "The machine did not reach a running state within the probe timeout.",
      ],
      limitation:
        "The current documented Paperspace control API does not provide a portable running-machine command/file-read surface. Full physical MP4 verification remains a later worker/SSH concern.",
    };
  }

  private async waitForRunning(resourceId: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const resource = await this.getResource(resourceId);
      if (resource.state === "RUNNING" || resource.state === "READY") return true;
      if (resource.state === "FAILED" || resource.state === "TERMINATED") return false;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return false;
  }
}
