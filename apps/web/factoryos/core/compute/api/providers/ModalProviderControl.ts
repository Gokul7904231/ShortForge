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

function modalModule(): any {
  try {
    // Optional dependency: Modal is loaded only when the Modal provider is invoked.
    // This keeps the main Next.js bundle independent from the provider SDK.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("modal");
  } catch (error: any) {
    throw new ProviderApiError(
      "Modal JavaScript SDK is not installed. Install modal@0.11.0 in the runtime that activates this provider.",
      { providerCode: "MODAL_SDK_MISSING", payload: error?.message },
    );
  }
}

export class ModalProviderControl
  extends BaseProviderControlAdapter
  implements ProviderControlAdapter
{
  readonly metadata = {
    providerId: "api_modal",
    providerType: "MODAL" as const,
    apiVersion: "js-sdk-0.11.0",
    discoveryKind: "SDK_SANDBOX" as const,
    baseUrl: "sdk://modal",
    documentationUrl: "https://modal.com/docs/sdk/js/latest/Sandbox",
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

  private readonly tokenId = process.env.MODAL_TOKEN_ID;
  private readonly tokenSecret = process.env.MODAL_TOKEN_SECRET;
  private readonly appName = process.env.MODAL_API_APP_NAME || "shortforge-api-probe";

  constructor() {
    // Modal is SDK based; ProviderApiTransport is intentionally unused.
    super("http://127.0.0.1");
  }

  async validateCredentials(): Promise<CredentialValidationResult> {
    const checkedAt = new Date().toISOString();
    if (!this.tokenId || !this.tokenSecret) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
        missingKeys: [
          ...(this.tokenId ? [] : ["MODAL_TOKEN_ID"]),
          ...(this.tokenSecret ? [] : ["MODAL_TOKEN_SECRET"]),
        ],
        checkedAt,
      };
    }

    try {
      const ModalClient = modalModule().ModalClient;
      const modal = new ModalClient();
      const listResult = await modal.sandboxes.list();
      if (listResult && listResult[Symbol.asyncIterator]) {
        const iterator = listResult[Symbol.asyncIterator]();
        await iterator.next();
      } else {
        await Promise.resolve(listResult);
      }
      return {
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
        missingKeys: [],
        checkedAt,
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
        missingKeys: [],
        checkedAt,
        errorCode: error?.providerCode || "MODAL_SDK_ERROR",
        errorMessage: error?.message || String(error),
      };
    }
  }

  async getAccountContext(): Promise<ProviderAccountContext> {
    return {
      providerId: this.metadata.providerId,
      metadata: {
        sdk: "modal@0.11.0",
        appName: this.appName,
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
    const types = request.gpuType
      ? [request.gpuType]
      : this.csvEnv("MODAL_GPU_TYPES");
    if (!types.length) {
      return [];
    }
    return types.slice(0, request.maxOffers || 20).map((gpuType) => ({
      offerId: `modal-gpu:${gpuType}`,
      providerId: this.metadata.providerId,
      providerType: "MODAL",
      discoveryKind: "SDK_SANDBOX",
      capacityConfidence: "UNKNOWN",
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
        source: "Modal SDK resource request",
        capacity: "not exposed as a provider-wide catalog in this adapter",
      },
    }));
  }

  async provision(request: ProvisionRequest): Promise<ProvisionAccepted> {
    const ModalClient = modalModule().ModalClient;
    const modal = new ModalClient();
    const app = await modal.apps.fromName(this.appName, { createIfMissing: true });
    const image = modal.images.fromRegistry(request.image);
    const command = request.command
      ? Array.isArray(request.command)
        ? request.command
        : ["bash", "-lc", request.command]
      : ["sleep", "infinity"];

    const params: Record<string, unknown> = {
      command,
      timeoutMs: Math.max(1000, (request.maxDurationSeconds || 3600) * 1000),
      ...(request.gpuType || request.offerId
        ? { gpu: request.gpuType || String(request.offerId).replace(/^modal-gpu:/, "") }
        : {}),
      ...(request.cpuCores ? { cpu: request.cpuCores } : {}),
      ...(request.memoryMb ? { memoryMiB: request.memoryMb } : {}),
      ...(request.environmentVariables ? { env: request.environmentVariables } : {}),
      ...(request.providerOptions || {}),
    };

    try {
      const sandbox = await modal.sandboxes.create(app, image, params);
      const state = (await sandbox.poll()) === null ? "READY" : "TERMINATED";
      return {
        operationId: "",
        reference: this.ref("MODAL", sandbox.sandboxId, request.idempotencyKey),
        state,
        acceptedAt: new Date().toISOString(),
        reconciliationRequired: false,
        rawResponse: { sandboxId: sandbox.sandboxId },
      };
    } catch (error: any) {
      throw new ProviderApiError(
        error?.message || "Modal sandbox creation failed.",
        {
          providerCode: error?.code || "MODAL_CREATE_ERROR",
          retryable: false,
          ambiguous: true,
          payload: { name: error?.name, message: error?.message },
        },
      );
    }
  }

  async getResource(resourceId: string): Promise<ProviderResource> {
    const modal = new (modalModule().ModalClient)();
    const sandbox = await modal.sandboxes.fromId(resourceId);
    const exitCode = await sandbox.poll();
    return {
      reference: this.ref("MODAL", resourceId),
      state: exitCode === null ? "RUNNING" : "TERMINATED",
      updatedAt: new Date().toISOString(),
      providerMetadata: { sandboxId: resourceId, exitCode },
    };
  }

  async terminate(request: TerminateRequest): Promise<TerminationResult> {
    const modal = new (modalModule().ModalClient)();
    const sandbox = await modal.sandboxes.fromId(request.reference.resourceId);
    await sandbox.terminate({ wait: request.wait !== false });
    return {
      operationId: request.operationId || "",
      reference: request.reference,
      state: "TERMINATED",
      completedAt: new Date().toISOString(),
      reconciliationRequired: false,
    };
  }

  async reconcile(reference: ResourceReference): Promise<ReconciliationResult> {
    try {
      const resource = await this.getResource(reference.resourceId);
      return {
        reference,
        currentState: resource.state,
        found: true,
        adopted: true,
        terminal: resource.state === "TERMINATED",
        reconciliationRequired: false,
        resource,
        evidence: ["Modal SDK reattached to the Sandbox by id."],
      };
    } catch (error: any) {
      return {
        reference,
        currentState: "UNKNOWN",
        found: false,
        adopted: false,
        terminal: false,
        reconciliationRequired: true,
        evidence: [error?.message || String(error)],
      };
    }
  }

  async renderProbe(request: RenderProbeRequest): Promise<RenderProbeResult> {
    const ModalClient = modalModule().ModalClient;
    const modal = new ModalClient();
    const app = await modal.apps.fromName(this.appName, { createIfMissing: true });
    const image = modal.images.fromRegistry(request.image);
    const command = Array.isArray(request.renderCommand)
      ? request.renderCommand
      : ["bash", "-lc", request.renderCommand];
    const outputPath = request.outputPath || "/tmp/shortforge-api-probe.mp4";
    const verifyCommand = [
      "bash",
      "-lc",
      [
        "set -e",
        ...[
          Array.isArray(request.renderCommand)
            ? request.renderCommand.join(" ")
            : request.renderCommand,
        ],
        `test -s ${outputPath}`,
        `sha256sum ${outputPath}`,
        `stat -c '%s' ${outputPath}`,
        `ffprobe -v error -show_format -show_streams -of json ${outputPath}`,
      ].join("; "),
    ];

    const sandbox = await modal.sandboxes.create(app, image, {
      gpu: request.gpuType,
      cpu: request.cpuCores,
      memoryMiB: request.memoryMb,
      timeoutMs: request.timeoutMs,
      command: verifyCommand,
    });

    const exitCode = await sandbox.wait();
    const stdout = await sandbox.stdout.readText();
    const stderr = await sandbox.stderr.readText();

    const hash = stdout.match(/([a-f0-9]{64})\s+/i)?.[1];
    const byteLengthMatch = stdout.match(/(?:^|\n)(\d+)\s*(?:$|\n)/m);
    const artifactByteLength = byteLengthMatch ? Number(byteLengthMatch[1]) : undefined;
    const passed = exitCode === 0 && Boolean(hash) && Boolean(artifactByteLength && artifactByteLength > 0);

    try {
      await sandbox.terminate({ wait: false });
    } catch {}

    return {
      providerId: this.metadata.providerId,
      providerType: "MODAL",
      verificationLevel: passed
        ? "PHYSICAL_RENDER_VERIFIED"
        : "CONTROL_PLANE_VERIFIED",
      passed,
      resourceId: sandbox.sandboxId,
      exitCode,
      artifactSha256: hash,
      artifactByteLength,
      stdout,
      stderr,
      evidence: [
        "Modal JS SDK created a GPU Sandbox.",
        "The Sandbox entrypoint executed the supplied render command.",
        passed
          ? "The API-executed command produced a non-empty artifact and exposed its SHA-256/size through the SDK output stream."
          : "The API-executed command did not produce a verifiable artifact.",
      ],
      limitation: passed
        ? undefined
        : "The configured Modal image must contain bash, ffmpeg, ffprobe and the requested render dependencies.",
    };
  }
}
