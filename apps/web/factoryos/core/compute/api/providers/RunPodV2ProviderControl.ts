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

function gpuId(row: any): string | undefined {
  return row.id || row.gpuTypeId || row.gpu_type_id || row.displayName;
}

export class RunPodV2ProviderControl
  extends BaseProviderControlAdapter
  implements ProviderControlAdapter
{
  readonly metadata = {
    providerId: "api_runpod_v2",
    providerType: "RUNPOD" as const,
    apiVersion: "v2",
    discoveryKind: "CATALOG" as const,
    baseUrl: process.env.RUNPOD_API_BASE_URL || "https://api.runpod.io/v2",
    documentationUrl: "https://docs.runpod.io/api-reference-v2/overview",
    controlCapabilities: {
      canValidateCredentials: true,
      canDiscoverOffers: true,
      canReadResource: true,
      canProvision: true,
      canTerminate: true,
      canExecuteCommandByApi: true,
      canReadFilesByApi: false,
      canVerifyPhysicalRenderByApi: true,
    },
  };

  private readonly apiKey = process.env.RUNPOD_API_KEY;

  constructor() {
    super(this.metadata.baseUrl, this.apiKey);
  }

  async validateCredentials(): Promise<CredentialValidationResult> {
    const checkedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys: ["RUNPOD_API_KEY"],
        missingKeys: ["RUNPOD_API_KEY"],
        checkedAt,
      };
    }
    try {
      const response = await this.transport.request<any>({
        method: "GET",
        path: "/pods",
        retryMode: "SAFE",
      });
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys: ["RUNPOD_API_KEY"],
        missingKeys: [],
        providerRequestId: response.requestId,
        checkedAt,
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: error?.status !== 401,
        providerReachable: Boolean(error?.status),
        requiredKeys: ["RUNPOD_API_KEY"],
        missingKeys: [],
        providerRequestId: error?.providerRequestId,
        checkedAt,
        errorCode: error?.providerCode || String(error?.status || "RUNPOD_API_ERROR"),
        errorMessage: error?.message || String(error),
      };
    }
  }

  async getAccountContext(): Promise<ProviderAccountContext> {
    return {
      providerId: this.metadata.providerId,
      metadata: { apiVersion: "v2" },
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
    const response = await this.transport.request<any>({
      method: "GET",
      path: "/catalog/gpus",
      retryMode: "SAFE",
    });
    const rows = Array.isArray(response.data)
      ? response.data
      : response.data?.gpus || response.data?.data || [];
    return rows
      .filter((row: any) => !request.gpuType || String(gpuId(row)).toLowerCase().includes(request.gpuType.toLowerCase()))
      .slice(0, request.maxOffers || 50)
      .map((row: any) => ({
        offerId: String(gpuId(row)),
        providerId: this.metadata.providerId,
        providerType: "RUNPOD",
        discoveryKind: "CATALOG",
        capacityConfidence: "DECLARED",
        observedAt: new Date().toISOString(),
        compute: {
          cpuCores: n(row.coresPerGpu || row.vcpu),
          memoryMb: n(row.ramPerGpu || row.ram) ? n(row.ramPerGpu || row.ram)! * 1024 : undefined,
        },
        accelerator: {
          type: gpuId(row),
          count: request.gpuCount || 1,
          vramMb: n(row.memoryInGb || row.memory) ? n(row.memoryInGb || row.memory)! * 1024 : undefined,
        },
        location: { datacenter: row.dataCenterId || row.datacenterId },
        pricing: {
          hourly: n(row.securePrice || row.communityPrice || row.price),
          currency: "USD",
        },
        network: { publicIpAvailable: true, publicPortsAvailable: true },
        preemption: { interruptible: false },
        capabilities: {
          customImage: true,
          startupCommand: true,
          commandExecutionByApi: false,
          fileReadByApi: false,
        },
        providerMetadata: row,
      }))
      .filter((offer: ComputeOffer) => Boolean(offer.offerId));
  }

  async provision(request: ProvisionRequest): Promise<ProvisionAccepted> {
    const gpuType = request.gpuType || request.offerId;
    if (!gpuType) throw new Error("RunPod provisioning requires gpuType or offerId.");

    const name = request.name || this.deterministicName("shortforge-api", request);
    const args =
      Array.isArray(request.command)
        ? request.command.join(" ")
        : request.command || "sleep infinity";

    const body: Record<string, unknown> = {
      name,
      image: request.image,
      startSsh: true,
      gpu: {
        id: gpuType,
        count: request.gpuCount || 1,
        ...(request.minVramMb ? { minRamPerGpu: Math.ceil(request.minVramMb / 1024) } : {}),
        ...(request.cpuCores ? { minVcpuCountPerGpu: Math.ceil(request.cpuCores / (request.gpuCount || 1)) } : {}),
      },
      ...(request.diskGb ? { disk: request.diskGb } : {}),
      ...(request.environmentVariables ? { env: request.environmentVariables } : {}),
      ...(request.ports ? { ports: request.ports } : {}),
      ...(request.region ? { dataCenterIds: [request.region] } : {}),
      args,
      ...(request.providerOptions || {}),
    };

    const response = await this.transport.request<any>({
      method: "POST",
      path: "/pods",
      body,
      retryMode: "NONE",
      idempotencyKey: request.idempotencyKey,
    });
    const resourceId = String(response.data?.id || response.data?.pod?.id || "");
    if (!resourceId) {
      throw new ProviderApiError("RunPod v2 did not return a pod id.", {
        providerRequestId: response.requestId,
        payload: response.data,
      });
    }
    const rawStatus = String(response.data?.status || "PROVISIONING").toUpperCase();
    const state = rawStatus === "RUNNING" ? "RUNNING" : "PROVISIONING";
    return {
      operationId: "",
      reference: this.ref("RUNPOD", resourceId, request.idempotencyKey),
      state,
      acceptedAt: new Date().toISOString(),
      providerRequestId: response.requestId,
      reconciliationRequired: false,
      rawResponse: response.data,
    };
  }

  async getResource(resourceId: string): Promise<ProviderResource> {
    const response = await this.transport.request<any>({
      method: "GET",
      path: `/pods/${encodeURIComponent(resourceId)}`,
      retryMode: "SAFE",
    });
    const row = response.data?.pod || response.data || {};
    const status = String(row.status || "").toUpperCase();
    const stateMap: Record<string, ProviderResource["state"]> = {
      CREATED: "PROVISIONING",
      PROVISIONING: "PROVISIONING",
      STARTING: "BOOTING",
      RUNNING: "RUNNING",
      STOPPING: "STOPPING",
      STOPPED: "STOPPED",
      EXITED: "TERMINATED",
      TERMINATED: "TERMINATED",
      FAILED: "FAILED",
    };
    return {
      reference: this.ref("RUNPOD", resourceId),
      state: stateMap[status] || "UNKNOWN",
      endpointUri: row.publicIp ? `ssh://${row.publicIp}` : undefined,
      startedAt: row.startedAt || row.createdAt,
      updatedAt: new Date().toISOString(),
      gpu: {
        type: row.machine?.gpuType || row.gpu?.id || row.gpuType,
        count: n(row.machine?.gpuCount || row.gpu?.count || row.gpuCount),
        vramMb: n(row.machine?.gpuMemoryInGb || row.gpuMemoryInGb)
          ? n(row.machine?.gpuMemoryInGb || row.gpuMemoryInGb)! * 1024
          : undefined,
      },
      compute: {
        cpuCores: n(row.machine?.vcpu || row.vcpu),
        memoryMb: n(row.machine?.ramInGb || row.ramInGb)
          ? n(row.machine?.ramInGb || row.ramInGb)! * 1024
          : undefined,
      },
      providerMetadata: row,
    };
  }

  async terminate(request: TerminateRequest): Promise<TerminationResult> {
    const response = await this.transport.request<any>({
      method: "DELETE",
      path: `/pods/${encodeURIComponent(request.reference.resourceId)}`,
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
        evidence: ["RunPod v2 GET /pods/{id} succeeded."],
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
          evidence: ["RunPod reports the Pod does not exist."],
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
    });
    const offer = offers[0];
    if (!offer) {
      throw new ProviderApiError(
        "RunPod catalog returned no GPU matching the render probe.",
        { providerCode: "RUNPOD_NO_GPU_OFFER", retryable: false },
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
      gpuType: offer.accelerator?.type || offer.offerId,
      gpuCount: request.gpuCount || offer.accelerator?.count || 1,
      cpuCores: request.cpuCores,
      memoryMb: request.memoryMb,
      diskGb: request.diskGb,
      region: offer.location?.datacenter,
      command: `bash -lc ${JSON.stringify(wrappedCommand)}`,
      maxDurationSeconds: Math.ceil(request.timeoutMs / 1000),
    });

    let probePayload: any;
    let lastResource: ProviderResource | undefined;
    try {
      const deadline = Date.now() + request.timeoutMs;
      while (Date.now() < deadline) {
        lastResource = await this.getResource(provisioned.reference.resourceId);
        if (lastResource.state === "FAILED" || lastResource.state === "TERMINATED") break;

        try {
          const raw = await this.readRunPodLogsUntilMarker(
            provisioned.reference.resourceId,
            marker,
            Math.min(15000, Math.max(1000, deadline - Date.now())),
          );
          if (raw) {
            const match = raw.match(new RegExp(`${marker}(\\{.*\\})`));
            if (match) {
              probePayload = JSON.parse(match[1]);
              break;
            }
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } finally {
      try {
        await this.terminate({
          reference: provisioned.reference,
          wait: false,
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
      providerType: "RUNPOD",
      verificationLevel: passed ? "PHYSICAL_RENDER_VERIFIED" : "RENDER_LAUNCH_VERIFIED",
      passed,
      resourceId: provisioned.reference.resourceId,
      artifactSha256: probePayload?.sha256,
      artifactByteLength: probePayload?.byteLength,
      mediaProbe,
      evidence: [
        "RunPod REST v2 returned a matching GPU catalog entry.",
        "RunPod REST v2 accepted Pod creation with the render command supplied as container args.",
        lastResource
          ? `Last observed Pod state: ${lastResource.state}.`
          : "Pod state could not be observed.",
        passed
          ? "RunPod Pod logs contained provider-side proof that the render produced a non-empty artifact, SHA-256, byte length and ffprobe metadata."
          : "RunPod Pod logs did not expose a completed render-proof marker before timeout.",
      ],
      limitation: passed
        ? "The API proves physical rendering inside the Pod, but ShortForge has not yet independently downloaded and re-hashed the artifact. That remains the worker/F06 artifact-verification plane."
        : "Physical render proof was not observed. Later worker/SSH evidence is required.",
    };
  }
  private async readRunPodLogsUntilMarker(
    podId: string,
    marker: string,
    timeoutMs: number,
  ): Promise<string> {
    const response = await fetch(
      `https://api.runpod.io/v2/pods/${encodeURIComponent(podId)}/logs`,
      {
        headers: {
          Authorization: `Bearer ${process.env.RUNPOD_API_KEY || ""}`,
          Accept: "text/event-stream, application/json, text/plain",
        },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );

    const body = response.body;
    if (!response.ok) {
      throw new ProviderApiError(
        `RunPod logs endpoint returned HTTP ${response.status}`,
        { status: response.status, retryable: response.status >= 500, ambiguous: false },
      );
    }
    if (!body) return await response.text();

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes(marker)) break;
        // Bound memory even if a noisy container emits huge logs.
        if (buffer.length > 2_000_000) {
          buffer = buffer.slice(-1_000_000);
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
    }
    return buffer;
  }

}
