import {
  BaseProviderControlAdapter,
} from "../BaseProviderControlAdapter";
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

export class VastProviderControl
  extends BaseProviderControlAdapter
  implements ProviderControlAdapter
{
  readonly metadata = {
    providerId: "api_vast",
    providerType: "VAST" as const,
    apiVersion: "v0",
    discoveryKind: "DYNAMIC_MARKETPLACE" as const,
    baseUrl: process.env.VAST_API_BASE_URL || "https://console.vast.ai/api/v0",
    documentationUrl: "https://docs.vast.ai/api-reference/introduction",
    controlCapabilities: {
      canValidateCredentials: true,
      canDiscoverOffers: true,
      canReadResource: true,
      canProvision: true,
      canTerminate: true,
      canConfigureEntrypointByApi: true,
      canExecuteCommandByApi: false,
      canReadLogsByApi: true,
      canReadFilesByApi: false,
      canVerifyPhysicalRenderByApi: true,
    },
  };

  private readonly apiKey = process.env.VAST_API_KEY;

  constructor() {
    super(this.metadata.baseUrl, process.env.VAST_API_KEY);
  }

  async validateCredentials(): Promise<CredentialValidationResult> {
    const checkedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys: ["VAST_API_KEY"],
        missingKeys: ["VAST_API_KEY"],
        checkedAt,
      };
    }
    try {
      const response = await this.transport.request<any>({
        method: "GET",
        path: "/instances/",
        retryMode: "SAFE",
      });
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys: ["VAST_API_KEY"],
        missingKeys: [],
        providerRequestId: response.requestId,
        checkedAt,
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: error?.status !== 401,
        providerReachable: Boolean(error?.status),
        requiredKeys: ["VAST_API_KEY"],
        missingKeys: [],
        providerRequestId: error?.providerRequestId,
        checkedAt,
        errorCode: error?.providerCode || String(error?.status || "VAST_API_ERROR"),
        errorMessage: error?.message || String(error),
      };
    }
  }

  async getAccountContext(): Promise<ProviderAccountContext> {
    return {
      providerId: this.metadata.providerId,
      metadata: {
        accountSource: "GET /instances/",
        apiVersion: this.metadata.apiVersion,
      },
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
    const payload: Record<string, unknown> = {
      limit: request.maxOffers || 20,
      order: "dph_total",
      rentable: true,
      verified: true,
      type: request.onDemandOnly === false ? undefined : "ondemand",
    };
    if (request.gpuType) payload.gpu_name = request.gpuType;
    if (request.gpuCount) payload.num_gpus = request.gpuCount;
    // Keep the provider request limited to documented, portable offer filters.
    // Additional resource constraints are applied after normalization so an API
    // schema change in a marketplace filter cannot break discovery.

    const response = await this.transport.request<any>({
      method: "POST",
      path: "/bundles/",
      body: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)),
      retryMode: "SAFE",
    });

    const rows = Array.isArray(response.data)
      ? response.data
      : response.data?.offers || response.data?.bundles || response.data?.data || [];

    return rows.map((row: any) => {
      const gpuType = row.gpu_name || row.gpu?.name || row.gpu_type;
      const gpuCount = n(row.num_gpus || row.gpu_count) || 1;
      return {
        offerId: String(row.id || row.offer_id || row.ask_contract_id),
        providerId: this.metadata.providerId,
        providerType: "VAST",
        discoveryKind: "DYNAMIC_MARKETPLACE",
        capacityConfidence: Boolean(row.rentable) === false ? "UNKNOWN" : "LIVE",
        observedAt: new Date().toISOString(),
        compute: {
          cpuCores: n(row.cpu_cores),
          memoryMb: n(row.cpu_ram) ? n(row.cpu_ram)! * 1024 : undefined,
          diskGb: n(row.disk_space),
        },
        accelerator: {
          type: gpuType,
          count: gpuCount,
          vramMb: n(row.gpu_ram) ? n(row.gpu_ram)! * 1024 : undefined,
          hardwareVideoEncode: undefined,
        },
        location: {
          region: row.geolocation || row.location || undefined,
          datacenter: row.datacenter || undefined,
        },
        pricing: {
          hourly: n(row.dph_total || row.dph),
          currency: "USD",
        },
        network: {
          publicIpAvailable: Boolean(row.public_ipaddr || row.public_ip),
          publicPortsAvailable: n(row.direct_port_count) ? n(row.direct_port_count)! > 0 : undefined,
          bandwidthMbps: n(row.net_down),
        },
        preemption: {
          interruptible: String(row.type || "").toLowerCase() !== "ondemand",
        },
        capabilities: {
          customImage: true,
          startupCommand: true,
          commandExecutionByApi: false,
          fileReadByApi: false,
        },
        providerMetadata: row,
      } satisfies ComputeOffer;
    })
    .filter((offer: ComputeOffer) => {
      if (!offer.offerId) return false;
      if (request.maxHourlyPrice !== undefined && (offer.pricing?.hourly ?? Infinity) > request.maxHourlyPrice) return false;
      if (request.minVramMb !== undefined && (offer.accelerator?.vramMb ?? 0) < request.minVramMb) return false;
      if (request.minCpuCores !== undefined && (offer.compute.cpuCores ?? 0) < request.minCpuCores) return false;
      if (request.minMemoryMb !== undefined && (offer.compute.memoryMb ?? 0) < request.minMemoryMb) return false;
      if (request.region && String(offer.location?.region || "").toLowerCase() !== request.region.toLowerCase()) return false;
      if (request.regions?.length && !request.regions.some((region) => String(offer.location?.region || "").toLowerCase() === region.toLowerCase())) return false;
      return true;
    });
  }

  async provision(request: ProvisionRequest): Promise<ProvisionAccepted> {
    if (!request.offerId) {
      throw new Error("Vast.ai provisioning requires offerId.");
    }

    const label = request.name || this.deterministicName("shortforge-api", request);
    const body: Record<string, unknown> = {
      image: request.image,
      label,
      disk: request.diskGb ?? 20,
      onstart: typeof request.command === "string" ? request.command : request.command?.join(" "),
      args_str: typeof request.command === "string" ? request.command : request.command?.join(" "),
      target_state: "running",
      runtype: "ssh",
      cancel_unavail: true,
      env: request.environmentVariables,
    };

    const response = await this.transport.request<any>({
      method: "PUT",
      path: `/asks/${encodeURIComponent(request.offerId)}/`,
      body,
      retryMode: "NONE",
      idempotencyKey: request.idempotencyKey,
    });

    const resourceId = String(
      response.data?.new_contract ||
        response.data?.instance_id ||
        response.data?.id ||
        "",
    );
    if (!resourceId) {
      throw new ProviderApiError("Vast.ai API did not return an instance identifier.", {
        providerRequestId: response.requestId,
        payload: response.data,
      });
    }

    return {
      operationId: "",
      reference: this.ref("VAST", resourceId, request.idempotencyKey),
      state: "PROVISIONING",
      acceptedAt: new Date().toISOString(),
      providerRequestId: response.requestId,
      reconciliationRequired: false,
      rawResponse: response.data,
    };
  }

  async reconcileProvision(
    request: ProvisionRequest,
    operation: import("../ProviderApiContracts").ProviderOperationRecord,
  ): Promise<ProvisionAccepted | undefined> {
    const response = await this.transport.request<any>({
      method: "GET",
      path: "/instances/",
      retryMode: "SAFE",
    });
    const rows = Array.isArray(response.data)
      ? response.data
      : response.data?.instances || response.data?.data || [];
    const expectedName =
      request.name || this.deterministicName("shortforge-api", request);
    const match = rows.find((row: any) =>
      String(row.label || row.name || "").trim() === expectedName &&
      ["running", "loading", "starting"].includes(
        String(row.actual_status || row.status || "").toLowerCase(),
      ),
    );
    if (!match?.id) return undefined;

    return {
      operationId: operation.operationId,
      reference: this.ref("VAST", String(match.id), request.idempotencyKey, operation.operationId),
      state: String(match.actual_status || match.status).toLowerCase() === "running"
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
      path: `/instances/${encodeURIComponent(resourceId)}/`,
      retryMode: "SAFE",
    });
    const row = response.data || {};
    const status = String(row.actual_status || row.status || "").toLowerCase();
    let state: ProviderResource["state"] = "UNKNOWN";
    if (status === "running") state = "RUNNING";
    else if (status === "loading" || status === "starting" || status === "null" || !status) state = "PROVISIONING";
    else if (status === "exited" || status === "offline") state = "FAILED";
    else if (status === "destroyed" || status === "terminated") state = "TERMINATED";

    return {
      reference: this.ref("VAST", resourceId),
      state,
      endpointUri: row.public_ipaddr ? `ssh://${row.public_ipaddr}` : undefined,
      startedAt: row.start_date ? new Date(Number(row.start_date) * 1000).toISOString() : undefined,
      updatedAt: new Date().toISOString(),
      gpu: {
        type: row.gpu_name,
        count: n(row.num_gpus),
        vramMb: n(row.gpu_ram) ? n(row.gpu_ram)! * 1024 : undefined,
      },
      compute: {
        cpuCores: n(row.cpu_cores),
        memoryMb: n(row.cpu_ram) ? n(row.cpu_ram)! * 1024 : undefined,
      },
      providerMetadata: row,
    };
  }

  async terminate(request: TerminateRequest): Promise<TerminationResult> {
    const response = await this.transport.request<any>({
      method: "DELETE",
      path: `/instances/${encodeURIComponent(request.reference.resourceId)}/`,
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
        previousState: undefined,
        currentState: resource.state,
        found: resource.state !== "UNKNOWN",
        adopted: resource.state !== "UNKNOWN",
        terminal: ["TERMINATED", "FAILED"].includes(resource.state),
        reconciliationRequired: false,
        resource,
        evidence: [`Vast.ai GET /instances/${reference.resourceId}/ succeeded.`],
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
          evidence: ["Vast.ai reports the resource does not exist."],
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
      maxOffers: 5,
      acceleratorRequired: true,
      onDemandOnly: true,
    });
    const offer = offers[0];
    if (!offer) {
      throw new ProviderApiError(
        "Vast.ai has no live rentable GPU offer matching the render probe.",
        { providerCode: "VAST_NO_RENTABLE_OFFER", retryable: false },
      );
    }

    const outputPath = request.outputPath || "/tmp/shortforge-api-probe.mp4";
    const marker = "SHORTFORGE_RENDER_PROBE=";
    const wrappedCommand = [
      "set -e",
      request.renderCommand,
      `test -s ${outputPath}`,
      `SHA=\$(sha256sum ${outputPath} | awk '{print \$1}')`,
      `BYTES=\$(stat -c '%s' ${outputPath})`,
      `PROBE=\$(ffprobe -v error -show_format -show_streams -of json ${outputPath} | base64 -w0)`,
      `echo "${marker}{\\\"sha256\\\":\\"${SHA}\\\",\\\"byteLength\\\":${BYTES},\\\"probeBase64\\\":\\"${PROBE}\\\"}"`,
    ].join("; ");

    const idempotencyKey = `render-probe:${Date.now()}`;
    const provisioned = await this.provision({
      idempotencyKey,
      image: request.image,
      offerId: offer.offerId,
      command: `bash -lc ${JSON.stringify(wrappedCommand)}`,
      gpuType: offer.accelerator?.type,
      gpuCount: offer.accelerator?.count,
      cpuCores: request.cpuCores,
      memoryMb: request.memoryMb,
      diskGb: request.diskGb,
      maxDurationSeconds: Math.ceil(request.timeoutMs / 1000),
      name: this.deterministicName("shortforge-probe", {
        idempotencyKey,
        image: request.image,
      }),
    });

    let probePayload: any;
    let lastResource: ProviderResource | undefined;
    try {
      const deadline = Date.now() + request.timeoutMs;
      while (Date.now() < deadline) {
        lastResource = await this.getResource(provisioned.reference.resourceId);
        if (lastResource.state === "FAILED" || lastResource.state === "TERMINATED") break;

        try {
          const logsResponse = await this.transport.request<any>({
            method: "GET",
            path: `/instances/${encodeURIComponent(provisioned.reference.resourceId)}/logs/`,
            retryMode: "SAFE",
            timeoutMs: 10000,
          });
          const raw = typeof logsResponse.data === "string"
            ? logsResponse.data
            : JSON.stringify(logsResponse.data || "");
          const match = raw.match(new RegExp(`${marker}(\\{.*\\})`));
          if (match) {
            probePayload = JSON.parse(match[1]);
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } finally {
      try {
        await this.terminate({
          reference: provisioned.reference,
          wait: true,
          reason: "ShortForge API render probe cleanup",
        });
      } catch {}
    }

    const passed = Boolean(
      probePayload?.sha256 &&
      Number(probePayload?.byteLength) > 0 &&
      probePayload?.probeBase64,
    );

    let mediaProbe: Record<string, unknown> | undefined;
    if (probePayload?.probeBase64) {
      try {
        mediaProbe = JSON.parse(Buffer.from(probePayload.probeBase64, "base64").toString("utf8"));
      } catch {}
    }

    return {
      providerId: this.metadata.providerId,
      providerType: "VAST",
      verificationLevel: passed ? "PHYSICAL_RENDER_VERIFIED" : "RENDER_LAUNCH_VERIFIED",
      passed,
      resourceId: provisioned.reference.resourceId,
      artifactSha256: probePayload?.sha256,
      artifactByteLength: probePayload?.byteLength,
      mediaProbe,
      evidence: [
        "Vast.ai returned a live rentable GPU offer.",
        "Vast.ai accepted the GPU instance creation request and configured the render entrypoint.",
        lastResource
          ? `Last observed provider resource state: ${lastResource.state}.`
          : "Provider resource state could not be observed.",
        passed
          ? "Vast.ai instance logs contained provider-side proof that the render produced a non-empty artifact, SHA-256, byte length and ffprobe metadata."
          : "The provider logs did not expose a completed render-proof marker before timeout.",
      ],
      limitation: passed
        ? "The API proves physical rendering inside the remote instance, but ShortForge has not yet independently downloaded and re-hashed the artifact. That remains the worker/F06 artifact-verification plane."
        : "Physical render proof was not observed. Later worker/SSH evidence is required.",
    };
  }
}
