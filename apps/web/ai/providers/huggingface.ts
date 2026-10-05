import {
  type ModelMeta,
  type PluginManifest,
  AIProviderRegistry,
  type AICapability,
} from "../capability-registry";
import { BaseProviderPlugin } from "./base-provider";
import type { LLMProviderAdapter } from "../provider";

type HuggingFaceModelRecord = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  providers?: Array<{
    provider?: string;
    status?: string;
    context_length?: number;
    pricing?: {
      input?: number | string;
      output?: number | string;
    };
    supports_tools?: boolean;
    supports_structured_output?: boolean;
  }>;
};

function normalizeModelId(model: string): string {
  const value = model.trim();
  return value.replace(/^huggingface\//i, "");
}

function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part === "object" &&
              part !== null &&
              "text" in part &&
              typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : "",
      )
      .filter(Boolean)
      .join("");
  }
  return "";
}

function parseUsage(data: any, prompt: string, text: string) {
  const usage = data?.usage;
  return {
    inputTokens:
      Number(usage?.prompt_tokens ?? usage?.input_tokens) ||
      Math.ceil(prompt.length / 4),
    outputTokens:
      Number(usage?.completion_tokens ?? usage?.output_tokens) ||
      Math.ceil(text.length / 4),
  };
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class HuggingFaceProviderPlugin extends BaseProviderPlugin {
  id = "huggingface";
  name = "Hugging Face Inference Providers";

  manifest: PluginManifest = {
    id: "huggingface",
    name: "Hugging Face Inference Providers",
    version: "1.0.0",
    author: "ShortForge Core Team",
    description:
      "OpenAI-compatible chat-completions access to Hugging Face Inference Providers with server-side provider selection policies.",
    dependencies: [],
    capabilities: ["SCRIPT", "VISION"],
  };

  protected apiKey =
    process.env.HF_API_KEY ||
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    "";
  protected baseUrl =
    process.env.HF_INFERENCE_BASE_URL ||
    "https://router.huggingface.co/v1";

  private cachedModels: ModelMeta[] = [];
  private lastDiscovery = 0;
  private readonly cacheTtl = 24 * 60 * 60 * 1000;

  constructor() {
    super();
    this.setupAdapters();
  }

  private setupAdapters(): void {
    this.chatAdapter = {
      id: "huggingface-chat",
      generateText: async (params, signal) => {
        const apiKey =
          (params as { apiKey?: string }).apiKey?.trim() || this.apiKey;
        if (!apiKey) {
          throw new Error(
            "Hugging Face Provider: HF_API_KEY is not configured.",
          );
        }

        const model = normalizeModelId(
          params.model ||
            process.env.HF_MODEL ||
            "openai/gpt-oss-120b:fastest",
        );

        const messages: Array<{
          role: "system" | "user";
          content: string;
        }> = [];

        if (params.system) {
          messages.push({
            role: "system",
            content: params.system,
          });
        }

        messages.push({
          role: "user",
          content: params.prompt,
        });

        const body: Record<string, unknown> = {
          model,
          messages,
          stream: false,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 2048,
        };

        if (params.responseFormat === "json_object") {
          body.response_format = { type: "json_object" };
        }

        const started = Date.now();
        const response = await fetch(
          this.baseUrl.replace(/\/+$/, "") + "/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + apiKey,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(body),
            signal,
          },
        );

        this.updateRateLimitMetrics(response.headers);

        const errorText = response.ok ? "" : await response.text();
        if (!response.ok) {
          let detail = errorText;
          try {
            const parsed = JSON.parse(errorText);
            detail =
              parsed?.error?.message ||
              parsed?.message ||
              errorText;
          } catch {
            // Preserve bounded provider text.
          }

          const error = new Error(
            "Hugging Face API returned HTTP " +
              response.status +
              (detail ? ": " + detail.slice(0, 500) : ""),
          );
          Object.assign(error, {
            isRetryable: retryableStatus(response.status),
          });
          throw error;
        }

        const data = await response.json();
        const text = responseText(
          data?.choices?.[0]?.message?.content,
        );

        if (!text) {
          throw new Error(
            "Hugging Face API returned no assistant message content.",
          );
        }

        const usage = parseUsage(data, params.prompt, text);
        console.debug(
          "[HuggingFace] Chat completion completed",
          JSON.stringify({
            model,
            durationMs: Date.now() - started,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          }),
        );

        return {
          text,
          usage,
        };
      },
    };
  }

  override async health(): Promise<boolean> {
    return Boolean(this.apiKey) && (await super.health());
  }

  async authenticateGuard(): Promise<void> {
    if (!this.apiKey) {
      this.metrics.state = "AUTH FAILED";
      throw new Error(
        "Hugging Face Provider: HF_API_KEY (or HF_TOKEN/HUGGINGFACE_API_KEY) is not configured.",
      );
    }
  }

  async discoverModels(): Promise<ModelMeta[]> {
    if (!this.apiKey) return [];

    const now = Date.now();
    if (
      this.cachedModels.length > 0 &&
      now - this.lastDiscovery < this.cacheTtl
    ) {
      return this.cachedModels;
    }

    const response = await fetch(
      this.baseUrl.replace(/\/+$/, "") + "/models",
      {
        headers: {
          Authorization: "Bearer " + this.apiKey,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      this.updateRateLimitMetrics(response.headers);
      return this.cachedModels;
    }

    this.updateRateLimitMetrics(response.headers);
    const payload = (await response.json()) as { data?: HuggingFaceModelRecord[] };
    const models = Array.isArray(payload.data) ? payload.data : [];

    this.cachedModels = models
      .filter((model) => typeof model?.id === "string" && model.id.trim())
      .slice(0, 100)
      .map((model) => {
        const modalities =
          model.architecture?.input_modalities ?? [];
        const capabilities: AICapability[] = ["SCRIPT"];
        if (modalities.includes("image")) {
          capabilities.push("VISION");
        }

        const providerSample = model.providers?.find(
          (provider) => provider?.status === "live",
        );
        const contextWindow = Number(
          providerSample?.context_length ??
            model.context_length ??
            4096,
        );

        return {
          id: "huggingface/" + model.id,
          name: model.name || model.id!,
          provider: "huggingface",
          capabilities,
          contextWindow: Number.isFinite(contextWindow)
            ? contextWindow
            : 4096,
          costInput: Number(providerSample?.pricing?.input) || 0,
          costOutput: Number(providerSample?.pricing?.output) || 0,
          speed: 0,
          health: 1,
          availability: providerSample
            ? providerSample.status === "live"
            : true,
          isLocal: false,
          tags: [
            "huggingface",
            providerSample?.provider
              ? "provider:" + providerSample.provider
              : "provider:auto",
            providerSample?.supports_tools ? "tools" : "",
            providerSample?.supports_structured_output
              ? "structured-output"
              : "",
          ].filter(Boolean),
        };
      });

    this.lastDiscovery = now;
    this.metrics.state = "ONLINE";
    return this.cachedModels;
  }
}

export function createHuggingFaceProvider(ctx: {
  apiKey?: string;
} = {}): LLMProviderAdapter {
  const provider = new HuggingFaceProviderPlugin();
  if (ctx.apiKey) {
    provider.updateConfig({ apiKey: ctx.apiKey });
  }

  return {
    generateText: async (params) =>
      (await provider.execute("SCRIPT", {
        ...params,
        apiKey: ctx.apiKey,
      })) as string,
  };
}

export const huggingFaceProvider = new HuggingFaceProviderPlugin();
AIProviderRegistry.registerPlugin(huggingFaceProvider);
