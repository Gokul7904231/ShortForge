import fs from "fs";
import path from "path";
import { AIProviderRegistry } from "./capability-registry";

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  type: string;
  baseUrl: string;
  apiKey: string;
  priority: number;
  health: {
    status: string;
    latency: number;
    successRate: number;
  };
  rateLimits: {
    rpm: number;
    rpd: number;
  };
  supportedModels: string[];
}

export interface ModelConfig {
  id: string;
  type: string;
  capabilities: string[];
  providers: string[];
}

export interface RoutingConfig {
  strategy: string;
  fallback: boolean;
  retry: number;
  healthThreshold: number;
  latencyWeight: number;
  qualityWeight: number;
  costWeight: number;
  availabilityWeight: number;
}

class AIConfigManagerClass {
  private configDir = path.resolve(process.cwd(), "config");

  providers: ProviderConfig[] = [];
  models: ModelConfig[] = [];
  capabilities: Record<string, string[]> = {};
  routing: RoutingConfig = {
    strategy: "best",
    fallback: true,
    retry: 2,
    healthThreshold: 0.8,
    latencyWeight: 0.3,
    qualityWeight: 0.45,
    costWeight: 0.15,
    availabilityWeight: 0.1
  };
  benchmarks: Record<string, Record<string, number>> = {};
  pricing: Record<string, { input: number; output: number; free: boolean }> = {};

  private loaded = false;

  constructor() {
    this.loadAll();
  }

  loadAll() {
    try {
      this.loadProviders();
      this.loadModels();
      this.loadCapabilities();
      this.loadRouting();
      this.loadBenchmarks();
      this.loadPricing();

      this.loaded = true;
      this.syncProvidersToPlugins();
      console.log("[AIConfigManager] Dynamic AI layer configuration loaded and synced successfully.");
    } catch (e: any) {
      console.error("[AIConfigManager] Error loading configurations:", e.message);
    }
  }

  private loadProviders() {
    const file = path.join(this.configDir, "providers.json");
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      this.providers = data.providers || [];
    }
  }

  private loadModels() {
    const file = path.join(this.configDir, "models.json");
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      this.models = data.models || [];
    }
  }

  private loadCapabilities() {
    const file = path.join(this.configDir, "capabilities.json");
    if (fs.existsSync(file)) {
      this.capabilities = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  }

  private loadRouting() {
    const file = path.join(this.configDir, "routing.json");
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      this.routing = data.routing || this.routing;
    }
  }

  private loadBenchmarks() {
    const file = path.join(this.configDir, "benchmarks.json");
    if (fs.existsSync(file)) {
      this.benchmarks = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  }

  private loadPricing() {
    const file = path.join(this.configDir, "pricing.json");
    if (fs.existsSync(file)) {
      this.pricing = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  }

  saveBenchmarks() {
    try {
      const file = path.join(this.configDir, "benchmarks.json");
      fs.writeFileSync(file, JSON.stringify(this.benchmarks, null, 2), "utf-8");
    } catch (e: any) {
      console.error("[AIConfigManager] Failed to save benchmarks:", e.message);
    }
  }

  syncProvidersToPlugins() {
    for (const provConfig of this.providers) {
      // Map google-ai config id to google plugin ID
      const pluginId = provConfig.id === "google-ai" ? "google" : provConfig.id;
      const plugin = AIProviderRegistry.getPlugin(pluginId);
      if (plugin && plugin.updateConfig) {
        // Fall back to environment variable API keys if empty in config
        const apiKey = provConfig.apiKey || this.getEnvKeyForProvider(pluginId);
        plugin.updateConfig({
          apiKey,
          baseUrl: provConfig.baseUrl
        });
      }
    }
  }

  private getEnvKeyForProvider(id: string): string {
    switch (id) {
      case "google":
      case "google-ai":
        return process.env.GEMINI_API_KEY || "";
      case "groq":
        return process.env.GROQ_API_KEY || "";
      case "nvidia":
        return process.env.NVIDIA_API_KEY || "";
      case "openrouter":
        return process.env.OPENROUTER_API_KEY || "";
      case "pollinations":
        return process.env.POLLINATIONS_API_KEY || "";
      case "zai":
        return process.env.ZAI_API_KEY || "";
      case "huggingface":
        return process.env.HF_API_KEY || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || "";
      default:
        return "";
    }
  }
}

export const AIConfigManager = new AIConfigManagerClass();
