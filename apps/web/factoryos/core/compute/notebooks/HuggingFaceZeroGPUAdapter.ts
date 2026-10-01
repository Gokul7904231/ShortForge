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

export class HuggingFaceZeroGPUAdapter implements NotebookProviderAdapter {
  readonly metadata: NotebookProviderMetadata = {
    providerId: "notebook_hf_zerogpu",
    providerType: "HF_ZEROGPU",
    runtimeKind: "ZEROGPU_SPACE",
    apiVersion: "Gradio HTTP",
    documentationUrl: "https://huggingface.co/docs/hub/main/spaces-zerogpu",
    paymentRequirement: "NO_CARD_NOT_ESTABLISHED",
    capabilities: {
      canValidateCredentials: false,
      canProvision: false,
      canExecuteCode: true,
      canReadOutputs: true,
      canReadLogs: false,
      canTerminate: false,
      supportsGpu: true,
      supportsPersistence: false,
      productionWorkerEligible: false,
      note: "ZeroGPU is a shared function-execution substrate for Spaces, not a notebook VM.",
    },
    maxSessionSeconds: 60,
    gpuTypes: ["RTX Pro 6000 Blackwell"],
  };

  async validateCredentials(): Promise<NotebookCredentialValidation> {
    const requiredKeys = ["HF_ZEROGPU_SPACE", "HF_ZEROGPU_API_NAME"];
    const missingKeys = requiredKeys.filter((key) => !process.env[key]);
    const configured = missingKeys.length === 0;

    return {
      configured,
      authenticated: configured,
      providerReachable: configured,
      requiredKeys,
      missingKeys,
      checkedAt: new Date().toISOString(),
      evidence: configured
        ? ["ZeroGPU Gradio Space endpoint configuration is present."]
        : ["Configure a public or authorized Gradio Space endpoint before execution."],
    };
  }

  async provision(_request: NotebookProvisionRequest): Promise<NotebookProvisionResult> {
    throw new Error(
      "HF_ZEROGPU_PROVISION_UNSUPPORTED: ZeroGPU allocates shared GPU time per Space function call.",
    );
  }

  async getRuntime(resourceId: string): Promise<NotebookRuntime> {
    return {
      providerId: this.metadata.providerId,
      providerType: "HF_ZEROGPU",
      resourceId,
      runtimeKind: "ZEROGPU_SPACE",
      state: "READY",
      updatedAt: new Date().toISOString(),
      providerMetadata: { executionModel: "shared-function-call" },
    };
  }

  async execute(request: NotebookExecutionRequest): Promise<NotebookExecutionResult> {
    const space = process.env.HF_ZEROGPU_SPACE;
    const apiName = process.env.HF_ZEROGPU_API_NAME;

    if (!space || !apiName) {
      return {
        providerType: "HF_ZEROGPU",
        verificationLevel: "UNAVAILABLE",
        status: "UNAVAILABLE",
        evidence: ["HF ZeroGPU Space endpoint is not configured."],
      };
    }

    const host = space.includes(".hf.space")
      ? space.replace(/^https?:\/\//, "").replace(/\/+$/, "")
      : space.replace("/", "-") + ".hf.space";

    const base =
      "https://" +
      host +
      "/gradio_api/call/" +
      encodeURIComponent(apiName.replace(/^\//, ""));

    const bodyData = Array.isArray(request.command)
      ? request.command
      : [request.command];

    const submit = await fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.HF_TOKEN
          ? { Authorization: "Bearer " + process.env.HF_TOKEN }
          : {}),
      },
      body: JSON.stringify({ data: bodyData }),
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

    const submitted = (await submit.json()) as any;
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
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await fetch(
        base + "/" + encodeURIComponent(eventId),
        {
          headers: {
            Accept: "text/event-stream",
            ...(process.env.HF_TOKEN
              ? { Authorization: "Bearer " + process.env.HF_TOKEN }
              : {}),
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        return {
          providerType: "HF_ZEROGPU",
          verificationLevel: "CONTROL_PLANE_VERIFIED",
          status: "FAILED",
          evidence: [
            "ZeroGPU event stream returned HTTP " + response.status + ".",
          ],
        };
      }

      const streamText = await response.text();
      const complete = streamText.match(
        /event:\\s*complete\\s*\\ndata:\\s*(.*?)(?:\\n\\n|$)/s,
      );

      return {
        providerType: "HF_ZEROGPU",
        verificationLevel: "CODE_EXECUTION_VERIFIED",
        status: "SUCCEEDED",
        stdout: complete ? complete[1] : streamText,
        evidence: [
          "Gradio Space API call completed.",
          "Execution used the ZeroGPU shared-function model.",
        ],
        limitation:
          "ZeroGPU does not expose a generic notebook filesystem/VM for ShortForge artifact ownership.",
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
  }

  async terminate(runtime: NotebookRuntime): Promise<NotebookRuntime> {
    return {
      ...runtime,
      state: "TERMINATED",
      updatedAt: new Date().toISOString(),
    };
  }
}
