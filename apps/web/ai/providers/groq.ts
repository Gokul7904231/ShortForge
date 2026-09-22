import {
  ModelMeta,
  ProviderHealthMetrics,
  PluginManifest,
  AIProviderRegistry,
  AICapability,
} from "../capability-registry";
import { BaseProviderPlugin } from "./base-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export class GroqProviderPlugin extends BaseProviderPlugin {
  id = "groq";
  name = "Groq Provider";

  manifest: PluginManifest = {
    id: "groq",
    name: "Groq Provider",
    version: "1.0.0",
    author: "ShortFactory Core Team",
    description: "Provider plugin routing requests to Groq ultra-low latency inference engines",
    dependencies: [],
    capabilities: ["SCRIPT"],
  };

  protected apiKey = process.env.GROQ_API_KEY || "";
  protected baseUrl = "https://api.groq.com/openai/v1";

  constructor() {
    super();
    this.setupAdapters();
  }

  private setupAdapters() {
    this.chatAdapter = {
      id: "groq-chat",
      generateText: async (params, signal) => {
        let rawModelName = params.model || process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
        let modelName = rawModelName.replace("groq/", "");
        if (
          modelName.includes("llama3-8b") ||
          modelName.includes("llama3-70b") ||
          modelName.includes("llama-3.1") ||
          modelName.includes("llama-3.3") ||
          modelName.includes("gpt-oss")
        ) {
          modelName = "qwen/qwen3.8-27b";
        }

        const groq = createOpenAI({
          apiKey: (params as any).apiKey || this.apiKey,
          baseURL: this.baseUrl,
        });

        const { text, usage } = await generateText({
          model: groq(modelName),
          prompt: params.prompt,
          system: params.system,
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens ?? 2048,
          abortSignal: signal,
        });

        return {
          text,
          usage: {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          },
        };
      },
    };
  }

  async authenticateGuard(): Promise<void> {
    if (!this.apiKey) {
      this.metrics.state = "AUTH FAILED";
      throw new Error("Groq Provider: GROQ_API_KEY is not configured in process environment.");
    }
  }

  async discoverModels(): Promise<ModelMeta[]> {

    return [
      {
        id: "groq/llama3-8b-8192",
        name: "Llama 3 8B (Groq)",
        provider: "groq",
        capabilities: ["SCRIPT"],
        contextWindow: 8192,
        costInput: 0.05, // $0.05 per 1M tokens
        costOutput: 0.10, // $0.10 per 1M tokens
        speed: 250, // extremely fast tokens/sec
        health: 1.0,
        availability: true,
        isLocal: false,
        tags: ["groq", "fast", "json"],
      },
      {
        id: "groq/llama3-70b-8192",
        name: "Llama 3 70B (Groq)",
        provider: "groq",
        capabilities: ["SCRIPT"],
        contextWindow: 8192,
        costInput: 0.59,
        costOutput: 0.79,
        speed: 180,
        health: 1.0,
        availability: true,
        isLocal: false,
        tags: ["groq", "reasoning", "json"],
      },
      {
        id: "groq/mixtral-8x7b-32768",
        name: "Mixtral 8x7B (Groq)",
        provider: "groq",
        capabilities: ["SCRIPT"],
        contextWindow: 32768,
        costInput: 0.27,
        costOutput: 0.27,
        speed: 150,
        health: 1.0,
        availability: true,
        isLocal: false,
        tags: ["groq", "json"],
      },
    ];
  }
}

// Auto-register plugin
export const groqProvider = new GroqProviderPlugin();
AIProviderRegistry.registerPlugin(groqProvider);
