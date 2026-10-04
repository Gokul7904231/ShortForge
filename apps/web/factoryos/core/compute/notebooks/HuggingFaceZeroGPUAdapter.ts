import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
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
import { fileEvidence } from "./NotebookUtils";

type GradioFileData = {
  path?: string;
  url?: string;
  size?: number | null;
  orig_name?: string;
  mime_type?: string | null;
  is_stream?: boolean;
  meta?: Record<string, unknown>;
};

export class HuggingFaceZeroGPUAdapter implements NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata = {
    providerId: "notebook_hf_zerogpu",
    providerType: "HF_ZEROGPU",
    runtimeKind: "ZEROGPU_SPACE",
    apiVersion: "Gradio HTTP",
    documentationUrl: "https://huggingface.co/docs/hub/main/spaces-zerogpu",
    paymentRequirement: "NO_CARD_NOT_ESTABLISHED",
    capabilities: {
      canValidateCredentials: true,
      canProvision: false,
      canExecuteCode: false,
      canInvokeHostedFunction: true,
      canReadOutputs: true,
      canReadLogs: false,
      canTerminate: false,
      supportsGpu: true,
      supportsPersistence: false,
      productionWorkerEligible: false,
      note:
        "ZeroGPU is a shared function-execution substrate for Spaces, not a notebook VM. " +
        "Artifact ownership stays with ShortForge after authenticated retrieval.",
    },
    gpuTypes: ["RTX Pro 6000 Blackwell"],
  };

  private resolveCredentials(
    credentials?: NotebookCredentialBundle,
  ): Record<string, string> {
    return {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([, value]) => typeof value === "string",
        ),
      ),
      ...(credentials || {}),
    };
  }

  private resolveHost(space: string): string {
    const normalized = space.trim();
    if (!normalized) {
      throw new Error("HF_ZEROGPU_SPACE is empty.");
    }

    if (normalized.includes(".hf.space")) {
      return normalized
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
    }

    const parts = normalized.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(
        "HF_ZEROGPU_SPACE must be <owner>/<space> or a *.hf.space host.",
      );
    }

    return parts.join("-") + ".hf.space";
  }

  private authHeaders(token?: string): Record<string, string> {
    return token
      ? { Authorization: "Bearer " + token }
      : {};
  }

  private fileAuthHeaders(token?: string): Record<string, string> {
    return token
      ? { "x-hf-authorization": "Bearer " + token }
      : {};
  }

  async validateCredentials(
    credentials?: NotebookCredentialBundle,
  ): Promise<NotebookCredentialValidation> {
    const env = this.resolveCredentials(credentials);
    const requiredKeys = [
      "HF_ZEROGPU_SPACE",
      "HF_ZEROGPU_API_NAME",
      "HF_TOKEN",
    ];
    const missingKeys = requiredKeys.filter((key) => !env[key]);

    if (missingKeys.length) {
      return {
        configured: false,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys,
        checkedAt: new Date().toISOString(),
        evidence: ["ZeroGPU Space endpoint configuration or token is incomplete."],
      };
    }

    const space = env.HF_ZEROGPU_SPACE;
    const apiName = env.HF_ZEROGPU_API_NAME;
    const token = env.HF_TOKEN;
    const host = this.resolveHost(space);

    try {
      const response = await fetch(
        "https://" + host + "/gradio_api/openapi.json",
        {
          headers: this.authHeaders(token),
        },
      );

      return {
        configured: true,
        authenticated: response.ok,
        providerReachable: true,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: [
          response.ok
            ? "Authenticated Gradio Space OpenAPI endpoint is reachable for /" +
              apiName.replace(/^\//, "") +
              "."
            : "Gradio Space OpenAPI endpoint returned HTTP " +
              response.status +
              ".",
        ],
        errorMessage: response.ok
          ? undefined
          : "Unable to validate the configured private Gradio Space endpoint.",
      };
    } catch (error: any) {
      return {
        configured: true,
        authenticated: false,
        providerReachable: false,
        requiredKeys,
        missingKeys: [],
        checkedAt: new Date().toISOString(),
        evidence: ["Gradio Space endpoint validation failed."],
        errorMessage: error?.message || String(error),
      };
    }
  }

  async provision(
    _request: NotebookProvisionRequest,
    _credentials?: NotebookCredentialBundle,
  ): Promise<NotebookProvisionResult> {
    throw new Error(
      "HF_ZEROGPU_PROVISION_UNSUPPORTED: ZeroGPU allocates shared GPU time per Space function call.",
    );
  }

  async getRuntime(
    resourceId: string,
    _credentials?: NotebookCredentialBundle,
  ): Promise<NotebookRuntime> {
    return {
      providerId: this.metadata.providerId,
      providerType: "HF_ZEROGPU",
      resourceId,
      runtimeKind: "ZEROGPU_SPACE",
      state: "READY",
      updatedAt: new Date().toISOString(),
      providerMetadata: {
        executionModel: "shared-function-call",
      },
    };
  }

  async execute(
    request: NotebookExecutionRequest,
    credentials?: NotebookCredentialBundle,
  ): Promise<NotebookExecutionResult> {
    const env = this.resolveCredentials(credentials);
    const space = env.HF_ZEROGPU_SPACE;
    const apiName = env.HF_ZEROGPU_API_NAME;
    const token = env.HF_TOKEN;

    if (!space || !apiName || !token) {
      return {
        providerType: "HF_ZEROGPU",
        verificationLevel: "UNAVAILABLE",
        status: "UNAVAILABLE",
        evidence: [
          "HF ZeroGPU Space, API name, and HF token are required for live execution.",
        ],
      };
    }

    const host = this.resolveHost(space);
    const endpointName = apiName.replace(/^\//, "");

    if (!endpointName) {
      return {
        providerType: "HF_ZEROGPU",
        verificationLevel: "UNAVAILABLE",
        status: "UNAVAILABLE",
        evidence: ["HF_ZEROGPU_API_NAME must identify a non-empty Gradio endpoint."],
      };
    }

    const base =
      "https://" +
      host +
      "/gradio_api/call/" +
      encodeURIComponent(endpointName);

    const timeoutMs = Math.max(1, request.timeoutMs || 120_000);
    const destination = request.artifactDestinationPath;

    try {
      /*
       * The current ShortForge proof Space exposes /render with zero inputs.
       * Do not smuggle NotebookExecutionRequest.command into the endpoint as
       * a positional input; that would violate the real API contract.
       */
      const submit = await fetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders(token),
        },
        body: JSON.stringify({ data: [] }),
      });

      if (!submit.ok) {
        return {
          providerType: "HF_ZEROGPU",
          verificationLevel: "CONTROL_PLANE_VERIFIED",
          status: "FAILED",
          evidence: [
            "Gradio queue submission returned HTTP " +
              submit.status +
              ": " +
              (await submit.text()),
          ],
        };
      }

      const submitted = (await submit.json()) as { event_id?: string };
      const eventId = String(submitted.event_id || "");

      if (!eventId) {
        return {
          providerType: "HF_ZEROGPU",
          verificationLevel: "CONTROL_PLANE_VERIFIED",
          status: "FAILED",
          evidence: ["ZeroGPU/Gradio submission returned no event_id."],
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(base + "/" + encodeURIComponent(eventId), {
          headers: {
            Accept: "text/event-stream",
            ...this.authHeaders(token),
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            providerType: "HF_ZEROGPU",
            verificationLevel: "CONTROL_PLANE_VERIFIED",
            status: "FAILED",
            evidence: [
              "ZeroGPU event stream returned HTTP " +
                response.status +
                ": " +
                (await response.text()),
            ],
          };
        }

        const streamText = await response.text();
        const fileData = this.findFileData(this.parseCompletedSse(streamText));

        if (!fileData?.url) {
          return {
            providerType: "HF_ZEROGPU",
            verificationLevel: "CODE_EXECUTION_VERIFIED",
            status: "SUCCEEDED",
            stdout: streamText,
            evidence: [
              "Authenticated Gradio Space API call completed.",
              "The provider returned no downloadable FileData object.",
              "The current /render contract is expected to return one filepath.",
            ],
            limitation:
              "Physical artifact ownership requires artifactDestinationPath and a downloadable Gradio FileData response.",
          };
        }

        if (!destination) {
          return {
            providerType: "HF_ZEROGPU",
            verificationLevel: "CODE_EXECUTION_VERIFIED",
            status: "SUCCEEDED",
            stdout: JSON.stringify(fileData),
            evidence: [
              "Authenticated Gradio Space API call completed.",
              "A downloadable FileData object was returned.",
              "No caller-owned artifact destination was supplied.",
            ],
          };
        }

        await this.downloadArtifact(
          fileData.url,
          destination,
          token,
          timeoutMs,
        );

        const evidence = await fileEvidence(destination);

        return {
          providerType: "HF_ZEROGPU",
          verificationLevel: "PHYSICAL_ARTIFACT_VERIFIED",
          status: "SUCCEEDED",
          stdout: JSON.stringify(fileData),
          artifactPath: evidence.artifactPath,
          artifactSha256: evidence.artifactSha256,
          artifactByteLength: evidence.artifactByteLength,
          evidence: [
            "Authenticated Gradio Space API call completed.",
            "ZeroGPU function returned a downloadable FileData artifact.",
            "ShortForge downloaded the artifact through the authenticated HF Space file route.",
            "ShortForge recomputed SHA-256 and byte length outside the provider.",
          ],
        };
      } catch (error: any) {
        if (error?.name === "AbortError") {
          return {
            providerType: "HF_ZEROGPU",
            verificationLevel: "CONTROL_PLANE_VERIFIED",
            status: "TIMED_OUT",
            evidence: ["ZeroGPU event stream timed out."],
          };
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      return {
        providerType: "HF_ZEROGPU",
        verificationLevel: "CONTROL_PLANE_VERIFIED",
        status: "FAILED",
        evidence: [
          "HF ZeroGPU execution failed closed: " +
            (error?.message || String(error)),
        ],
      };
    }
  }

  private parseCompletedSse(streamText: string): unknown {
    const blocks = streamText.split(/\n\n+/);
    const completeBlock = [...blocks]
      .reverse()
      .find((block) => /(?:^|\n)event:\s*complete(?:\n|$)/.test(block));

    if (!completeBlock) {
      return streamText;
    }

    const dataLines = completeBlock
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!dataLines) {
      return streamText;
    }

    try {
      return JSON.parse(dataLines);
    } catch {
      return dataLines;
    }
  }

  private findFileData(value: unknown): GradioFileData | undefined {
    if (!value) return undefined;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findFileData(item);
        if (found) return found;
      }
      return undefined;
    }

    if (typeof value !== "object") return undefined;

    const record = value as Record<string, unknown>;
    if (
      typeof record.url === "string" &&
      typeof record.path === "string"
    ) {
      return record as GradioFileData;
    }

    for (const nested of Object.values(record)) {
      const found = this.findFileData(nested);
      if (found) return found;
    }

    return undefined;
  }

  private async downloadArtifact(
    url: string,
    destinationPath: string,
    token: string,
    timeoutMs: number,
  ): Promise<void> {
    const absoluteDestination = destinationPath;
    const parent = absoluteDestination.replace(/[\\/][^\\/]*$/, "");
    if (parent && parent !== absoluteDestination) {
      await fs.mkdir(parent, { recursive: true });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "video/mp4,application/octet-stream",
          ...this.fileAuthHeaders(token),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          "HF ZeroGPU file download returned HTTP " +
            response.status +
            ": " +
            (await response.text()),
        );
      }

      if (!response.body) {
        throw new Error("HF ZeroGPU file download returned an empty response body.");
      }

      await pipeline(
        Readable.fromWeb(response.body as any),
        createWriteStream(absoluteDestination),
      );
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("HF_ZEROGPU_ARTIFACT_DOWNLOAD_TIMEOUT");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async terminate(
    runtime: NotebookRuntime,
    _credentials?: NotebookCredentialBundle,
  ): Promise<NotebookRuntime> {
    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }
}
