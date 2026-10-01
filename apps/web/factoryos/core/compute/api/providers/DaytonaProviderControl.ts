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

const DOCUMENTED_GPU_TYPES = [
  "H100",
  "H200",
  "RTX-PRO-6000",
  "RTX-4090",
  "RTX-5090",
  "MI355X",
];

export class DaytonaProviderControl
  extends BaseProviderControlAdapter
  implements ProviderControlAdapter
{
  readonly metadata = {
    providerId: "api_daytona",
    providerType: "DAYTONA" as const,
    apiVersion: "current",
    discoveryKind: "SANDBOX" as const,
    baseUrl: process.env.DAYTONA_API_BASE_URL || "https://app.daytona.io/api",
    documentationUrl: "https://www.daytona.io/docs/en/sandboxes/",
    controlCapabilities: {
      canValidateCredentials: true,
      canDiscoverOffers: false,
      canReadResource: true,
      canProvision: true,
      canTerminate: true,
      canExecuteCommandByApi: true,
      canReadFilesByApi: true,
      canVerifyPhysicalRenderByApi: true,
    },
  };

  private readonly apiKey = process.env.DAYTONA_API_KEY;
  private readonly proxyBase =
    process.env.DAYTONA_PROXY_BASE_URL || "https://proxy.app.daytona.io";

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
        requiredKeys: ["DAYTONA_API_KEY"],
        missingKeys: ["DAYTONA_API_KEY"],
        checkedAt,
      };
    }
    // Daytona's sandbox resource endpoint is the documented API boundary.
    // We avoid creating a sandbox merely to validate credentials.
    try {
      const response = await this.transport.request<any>({
        method: "GET",
        path: "/sandbox",
        retryMode: "SAFE",
      });
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys: ["DAYTONA_API_KEY"],
        missingKeys: [],
        providerRequestId: response.requestId,
        checkedAt,
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: error?.status !== 401,
        providerReachable: Boolean(error?.status),
        requiredKeys: ["DAYTONA_API_KEY"],
        missingKeys: [],
        providerRequestId: error?.providerRequestId,
        checkedAt,
        errorCode: error?.providerCode || String(error?.status || "DAYTONA_API_ERROR"),
        errorMessage: error?.message || String(error),
      };
    }
  }

  async getAccountContext(): Promise<ProviderAccountContext> {
    return {
      providerId: this.metadata.providerId,
      metadata: {
        apiBase: this.metadata.baseUrl,
        proxyBase: this.proxyBase,
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
    const requestedTypes = request.gpuType
      ? [request.gpuType]
      : this.csvEnv("DAYTONA_GPU_TYPES").length
        ? this.csvEnv("DAYTONA_GPU_TYPES")
        : DOCUMENTED_GPU_TYPES;

    return requestedTypes.map((gpuType) => ({
      offerId: `daytona-gpu:${gpuType}`,
      providerId: this.metadata.providerId,
      providerType: "DAYTONA",
      discoveryKind: "SANDBOX",
      capacityConfidence: "DECLARED",
      observedAt: new Date().toISOString(),
      compute: {
        cpuCores: request.minCpuCores,
        memoryMb: request.minMemoryMb,
      },
      accelerator: {
        type: gpuType,
        count: request.gpuCount || 1,
        vramMb: request.minVramMb,
      },
      capabilities: {
        customImage: true,
        startupCommand: true,
        commandExecutionByApi: true,
        fileReadByApi: true,
      },
      providerMetadata: {
        source: "Daytona documented GPU sandbox types",
        note: "Capacity is intentionally not claimed without a live quota/capacity API observation.",
      },
    }));
  }

  async provision(request: ProvisionRequest): Promise<ProvisionAccepted> {
    const options = request.providerOptions || {};
    const body: Record<string, unknown> = {
      name: request.name || this.deterministicName("shortforge-api", request),
      image: request.image,
      ephemeral: options.ephemeral ?? true,
      spot: options.spot ?? false,
      autoDeleteInterval:
        options.autoDeleteInterval ?? Math.max(0, Math.ceil((request.maxDurationSeconds || 3600) / 60)),
      gpu: request.gpuCount || 1,
      ...(request.gpuType || request.offerId
        ? { gpuType: [request.gpuType || String(request.offerId).replace(/^daytona-gpu:/, "")] }
        : {}),
      ...(request.environmentVariables
        ? { env: request.environmentVariables }
        : {}),
      ...(options.snapshot ? { snapshot: options.snapshot } : {}),
    };

    const response = await this.transport.request<any>({
      method: "POST",
      path: "/sandbox",
      body,
      retryMode: "NONE",
      idempotencyKey: request.idempotencyKey,
    });
    const resourceId = String(
      response.data?.id ||
        response.data?.sandboxId ||
        response.data?.sandbox_id ||
        "",
    );
    if (!resourceId) {
      throw new ProviderApiError("Daytona did not return a sandbox id.", {
        providerRequestId: response.requestId,
        payload: response.data,
      });
    }
    const status = String(response.data?.state || response.data?.status || "").toUpperCase();
    return {
      operationId: "",
      reference: this.ref("DAYTONA", resourceId, request.idempotencyKey),
      state: status === "READY" || status === "RUNNING" ? "READY" : "PROVISIONING",
      acceptedAt: new Date().toISOString(),
      providerRequestId: response.requestId,
      reconciliationRequired: false,
      rawResponse: response.data,
    };
  }

  async getResource(resourceId: string): Promise<ProviderResource> {
    const response = await this.transport.request<any>({
      method: "GET",
      path: `/sandbox/${encodeURIComponent(resourceId)}`,
      retryMode: "SAFE",
    });
    const row = response.data || {};
    const status = String(row.state || row.status || row.lifecycleState || "").toUpperCase();
    const stateMap: Record<string, ProviderResource["state"]> = {
      CREATING: "PROVISIONING",
      PROVISIONING: "PROVISIONING",
      STARTING: "BOOTING",
      READY: "READY",
      RUNNING: "RUNNING",
      STOPPING: "STOPPING",
      STOPPED: "STOPPED",
      TERMINATING: "TERMINATING",
      TERMINATED: "TERMINATED",
      DELETED: "TERMINATED",
      ERROR: "FAILED",
      FAILED: "FAILED",
    };
    return {
      reference: this.ref("DAYTONA", resourceId),
      state: stateMap[status] || "UNKNOWN",
      endpointUri: row.network?.endpoint || row.endpointUri,
      startedAt: row.createdAt,
      updatedAt: new Date().toISOString(),
      gpu: {
        type: row.gpuType || row.gpu?.type,
        count: n(row.gpuCount || row.gpu?.count),
        vramMb: n(row.gpuMemoryMb || row.gpu?.vramMb),
      },
      compute: {
        cpuCores: n(row.cpuCores || row.resources?.cpu),
        memoryMb: n(row.memoryMb || row.resources?.memory),
      },
      providerMetadata: row,
    };
  }

  async terminate(request: TerminateRequest): Promise<TerminationResult> {
    const query = request.wait ? "?wait=true" : "";
    const response = await this.transport.request<any>({
      method: "DELETE",
      path: `/sandbox/${encodeURIComponent(request.reference.resourceId)}${query}`,
      retryMode: "SAFE",
    });
    return {
      operationId: request.operationId || "",
      reference: request.reference,
      state: request.wait ? "TERMINATED" : "TERMINATING",
      completedAt: request.wait ? new Date().toISOString() : undefined,
      providerRequestId: response.requestId,
      reconciliationRequired: !request.wait,
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
        evidence: ["Daytona GET /sandbox/{id} succeeded."],
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
          evidence: ["Daytona reports the sandbox does not exist."],
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
    const provisioned = await this.provision({
      idempotencyKey: `render-probe:${Date.now()}`,
      image: request.image,
      gpuType: request.gpuType,
      gpuCount: request.gpuCount,
      cpuCores: request.cpuCores,
      memoryMb: request.memoryMb,
      diskGb: request.diskGb,
      maxDurationSeconds: Math.ceil(request.timeoutMs / 1000),
    });

    const ready = await this.waitForReady(
      provisioned.reference.resourceId,
      request.timeoutMs,
    );
    if (!ready) {
      return {
        providerId: this.metadata.providerId,
        providerType: "DAYTONA",
        verificationLevel: "CONTROL_PLANE_VERIFIED",
        passed: false,
        resourceId: provisioned.reference.resourceId,
        evidence: ["Daytona provisioning completed but readiness timed out."],
        limitation: "Render command was not started because the sandbox never reached READY.",
      };
    }

    const code = `
import json, os, subprocess, hashlib
command = ${JSON.stringify(
      Array.isArray(request.renderCommand)
        ? request.renderCommand.join(" ")
        : request.renderCommand,
    )}
out = ${JSON.stringify(request.outputPath || "/tmp/shortforge-api-probe.mp4")}
p = subprocess.run(["bash", "-lc", command], text=True, capture_output=True)
result = {"exitCode": p.returncode, "stdout": p.stdout[-12000:], "stderr": p.stderr[-12000:], "outputPath": out}
if p.returncode == 0 and os.path.isfile(out) and os.path.getsize(out) > 0:
    result["byteLength"] = os.path.getsize(out)
    with open(out, "rb") as f:
        h = hashlib.sha256()
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
        result["sha256"] = h.hexdigest()
result["probe"] = subprocess.run(["ffprobe","-v","error","-show_format","-show_streams","-of","json",out], text=True, capture_output=True).stdout if result.get("byteLength") else ""
print("SHORTFORGE_RENDER_PROBE="+json.dumps(result, separators=(",",":")))
`;

    const response = await fetch(
      `${this.proxyBase.replace(/\/+$/, "")}/toolbox/${encodeURIComponent(provisioned.reference.resourceId)}/process/code-run`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(request.timeoutMs),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      return {
        providerId: this.metadata.providerId,
        providerType: "DAYTONA",
        verificationLevel: "CONTROL_PLANE_VERIFIED",
        passed: false,
        resourceId: provisioned.reference.resourceId,
        stdout: text,
        evidence: [`Daytona code-run endpoint returned HTTP ${response.status}.`],
      };
    }

    const match = text.match(/SHORTFORGE_RENDER_PROBE=(\{.*\})/s);
    let evidencePayload: any = undefined;
    try {
      evidencePayload = match ? JSON.parse(match[1]) : undefined;
    } catch {}

    const passed =
      evidencePayload?.exitCode === 0 &&
      Number(evidencePayload?.byteLength) > 0 &&
      Boolean(evidencePayload?.sha256);

    try {
      await this.terminate({
        reference: provisioned.reference,
        wait: true,
        reason: "ShortForge API render probe complete",
      });
    } catch {}

    return {
      providerId: this.metadata.providerId,
      providerType: "DAYTONA",
      verificationLevel: passed
        ? "PHYSICAL_RENDER_VERIFIED"
        : "CONTROL_PLANE_VERIFIED",
      passed,
      resourceId: provisioned.reference.resourceId,
      exitCode: evidencePayload?.exitCode,
      artifactSha256: evidencePayload?.sha256,
      artifactByteLength: evidencePayload?.byteLength,
      mediaProbe: evidencePayload?.probe ? JSON.parse(evidencePayload.probe) : undefined,
      stdout: evidencePayload?.stdout || text,
      stderr: evidencePayload?.stderr,
      evidence: [
        "Daytona API created a GPU sandbox.",
        "Daytona process/code-run API executed the render command.",
        passed
          ? "The API-executed command produced a non-empty artifact and SHA-256 was computed inside the sandbox."
          : "The render command did not produce a verifiable artifact.",
      ],
      limitation: passed
        ? undefined
        : "The configured Daytona image must contain bash, ffmpeg, ffprobe, Python, and the requested render dependencies.",
    };
  }

  private async waitForReady(resourceId: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const resource = await this.getResource(resourceId);
      if (resource.state === "READY" || resource.state === "RUNNING") return true;
      if (resource.state === "FAILED" || resource.state === "TERMINATED") return false;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return false;
  }
}
