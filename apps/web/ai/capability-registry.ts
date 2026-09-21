export type AICapability =
  | "SCRIPT"
  | "IMAGE"
  | "SPEECH"
  | "VISION"
  | "EMBEDDING"
  | "RERANKING"
  | "METADATA"
  | "THUMBNAIL"
  | "TRANSLATION"
  | "MODERATION"
  | "SUMMARIZATION"
  | "CLASSIFICATION";

export type SpeechTask = "narration" | "conversation" | "character" | "podcast" | "announcement";

export type ProviderState =
  | "ONLINE"
  | "DEGRADED"
  | "RATE LIMITED"
  | "OFFLINE"
  | "QUOTA EXCEEDED"
  | "AUTH FAILED"
  | "DISCOVERING"
  | "INITIALIZING";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  dependencies: string[];
  capabilities: AICapability[];
}

export interface CapabilityDefinition {
  id: AICapability;
  version: string; // e.g. "v1", "v2"
  inputSchema: any;
  outputSchema: any;
  requiredCapabilities: AICapability[];
  optionalCapabilities: AICapability[];
}

export interface CostMetrics {
  tokensInput: number;
  tokensOutput: number;
  estimatedUSD: number;
  currency: string;
  pricingSource: "api" | "cache" | "fixed" | "free";
  lastUpdated: number; // Epoch ms
}

export interface ModelMeta {
  id: string; // e.g. "openai/gpt-4o-mini"
  name: string; // e.g. "GPT-4o Mini"
  provider: string; // e.g. "openrouter"
  capabilities: AICapability[];
  contextWindow: number;
  costInput: number; // Cost per 1M input tokens (USD)
  costOutput: number; // Cost per 1M output tokens (USD)
  speed: number; // Tokens per second (approx)
  health: number; // Health factor (0.0 to 1.0)
  availability: boolean;
  isLocal: boolean;
  tags?: string[];
}

export interface ProviderHealthMetrics {
  state: ProviderState;
  latency: number; // in milliseconds
  avgResponseTime: number; // Exponential moving average (ms)
  errorRate: number; // fraction of failed requests (0.0 to 1.0)
  totalCost: CostMetrics; // accumulated cost metrics object
  retries: number;
  retryRate: number; // Exponential moving average retry rate
  quotaRemaining: number; // -1 if unknown / infinite
  rateLimitLimit: number;
  rateLimitRemaining: number;
  rateLimitReset: number; // Epoch ms when resets
  jsonReliability: number; // fraction of successful JSON runs (0.0 to 1.0)
  lastChecked: number; // Epoch ms
}

export interface AIProviderPlugin {
  id: string;
  name: string;
  manifest: PluginManifest;
  discoverModels(): Promise<ModelMeta[]>;
  health(): Promise<boolean>;
  priority(): number;
  execute(capability: AICapability, params: any, signal?: AbortSignal): Promise<any>;
  status(): ProviderHealthMetrics;
  updateConfig?(config: { apiKey?: string; baseUrl?: string; options?: any }): void;
}

class AIProviderRegistryClass {
  private plugins = new Map<string, AIProviderPlugin>();
  private capabilityDefinitions = new Map<string, CapabilityDefinition>();

  registerPlugin(plugin: AIProviderPlugin): void {
    console.log(`[AICapabilityRegistry] Registering plugin: ${plugin.name} (${plugin.id})`);
    this.plugins.set(plugin.id, plugin);
  }

  getPlugin(id: string): AIProviderPlugin | undefined {
    if (this.plugins.has(id)) return this.plugins.get(id);
    const lower = (id || "").toLowerCase();
    if (lower === "gemini") return this.plugins.get("google") || this.plugins.get("gemini");
    if (lower === "google") return this.plugins.get("gemini") || this.plugins.get("google");
    return undefined;
  }

  getAllPlugins(): AIProviderPlugin[] {
    return Array.from(this.plugins.values());
  }

  registerCapabilityDefinition(def: CapabilityDefinition): void {
    const key = `${def.id}:${def.version}`;
    this.capabilityDefinitions.set(key, def);
  }

  getCapabilityDefinition(id: AICapability, version: string): CapabilityDefinition | undefined {
    return this.capabilityDefinitions.get(`${id}:${version}`);
  }

  async getPluginsForCapability(capability: AICapability): Promise<AIProviderPlugin[]> {
    const active: AIProviderPlugin[] = [];
    for (const plugin of this.plugins.values()) {
      try {
        const models = await plugin.discoverModels();
        const hasCapability = models.some((m) => m.capabilities.includes(capability));
        if (hasCapability && (await plugin.health())) {
          active.push(plugin);
        }
      } catch (err) {
        console.warn(`[AICapabilityRegistry] Error checking models/health for plugin ${plugin.id}:`, err);
      }
    }
    return active.sort((a, b) => b.priority() - a.priority());
  }
}

export const AIProviderRegistry = new AIProviderRegistryClass();
