import { createHash } from "node:crypto";
import { AICapability, AIProviderRegistry, ModelMeta } from "./capability-registry";
import type { TreasuryService } from "../factoryos/core/treasury/TreasuryService";
import {
  TreasuryEconomicAdmission,
  type TreasuryAdmissionContext,
  type TreasuryModelCandidate,
} from "../factoryos/core/treasury/TreasuryEconomicAdmission";
import { AIConfigManager, type ProviderConfig, type ModelConfig } from "./ai-config-manager";
import { MetricsDB } from "../lib/queue-db";
import { AIDoctor } from "../lib/core/AIDoctor";

export type AIProfile =
  | "Maximum Quality"
  | "Maximum Speed"
  | "Lowest Cost"
  | "Privacy"
  | "Coding"
  | "Content Creator"
  | "Balanced"
  | "Offline Mode";

export interface RoutingTaskContext {
  capability: AICapability;
  subtask?: "reasoning" | "speed" | "coding" | "json" | "creativity" | string;
  maxCostLimit?: number;
  maxLatencyLimit?: number;
  requireLocal?: boolean;
  maxRetries?: number;
  overseerCommandId?: string;
  accountId?: string;
  missionId?: string;
  runId?: string;
  floorId?: string;
  taskId?: string;
  scopeFingerprint?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
}

export interface ScoredCandidate {
  modelId: string;
  modelConfig: ModelConfig;
  provider: ProviderConfig;
  score: number;
}

class IntelligentRouterClass {
  private activeProfile: AIProfile = "Balanced";
  private treasuryService?: TreasuryService;
  private treasuryAdmission?: TreasuryEconomicAdmission;
  private treasuryRequired = false;

  setProfile(profile: AIProfile) {
    console.log(`[IntelligentRouter] Setting active profile to: ${profile}`);
    this.activeProfile = profile;
  }

  getProfile(): AIProfile {
    return this.activeProfile;
  }

  bindTreasury(
    service: TreasuryService,
    required = process.env.NODE_ENV === "production",
  ): void {
    if (this.treasuryService && this.treasuryService !== service) {
      throw new Error(
        "[IntelligentRouter] Treasury service is already bound; refusing to replace economic authority",
      );
    }
    this.treasuryService = service;
    this.treasuryAdmission = new TreasuryEconomicAdmission(service);
    this.treasuryRequired = this.treasuryRequired || required;
  }

  /**
   * Routes a capability task to the most suitable candidate model, executes it,
   * and handles failover retries automatically.
   */
  async routeExecute(
    context: RoutingTaskContext,
    params: { prompt: string; system?: string; maxTokens?: number; temperature?: number; [key: string]: any }
  ): Promise<any> {
    // Force refresh config files
    AIConfigManager.loadAll();

    const candidates = this.getCandidatesSorted(context);

    if (candidates.length === 0) {
      throw new Error(
        `[IntelligentRouter] No models found matching capability "${context.capability}" under profile "${this.activeProfile}"`
      );
    }

    let lastError: any = null;

    // Iterate through scored Provider + Model candidate combinations
    const skippedCandidates: typeof candidates = [];

    for (const candidate of candidates) {
      const { modelId, provider } = candidate;

      // Map "google-ai" config id to actual plugin "google"
      const pluginId = provider.id === "google-ai" ? "google" : provider.id;
      const plugin = AIProviderRegistry.getPlugin(pluginId);
      
      if (!plugin) {
        console.warn(`[IntelligentRouter] Provider plugin "${pluginId}" is registered in config but missing from memory registry. skipping...`);
        continue;
      }

      const health = plugin.status();
      if (health.errorRate > 0.85) {
        console.warn(
          `[IntelligentRouter] Skipping model ${modelId} on provider ${provider.id} due to high error rate: ${health.errorRate.toFixed(2)}`
        );
        skippedCandidates.push(candidate);
        continue;
      }

      console.log(
        `[IntelligentRouter] Routing capability "${context.capability}" -> Model: "${modelId}" | Provider: "${provider.id}" (Score: ${candidate.score.toFixed(1)})`
      );
      const start = Date.now();

      try {
        const result = await plugin.execute(context.capability, {
          ...params,
          model: modelId,
        });

        // Update runtime analytics inside plugin
        const duration = Date.now() - start;
        health.latency = health.latency * 0.8 + duration * 0.2;
        health.errorRate = health.errorRate * 0.9 + 0.0 * 0.1;
        health.lastChecked = Date.now();

        // Cost estimation tracking
        const numTokens = (params.prompt.length + (result?.length || 0)) / 4;
        const pricing = AIConfigManager.pricing[modelId] || { input: 0.15, output: 0.60 };
        const costEst = (numTokens / 1000000) * (pricing.input + pricing.output);
        health.totalCost.estimatedUSD += costEst;

        // Record performance feedback back to benchmarks dynamically
        this.updateDynamicBenchmarks(modelId, context.capability, duration);

        // Record telemetry to SQLite metrics
        try {
          MetricsDB.record("success", "engine", 1, {
            provider: pluginId,
            model: modelId,
            capability: context.capability,
          });
          MetricsDB.record("render_duration_ms", "engine", duration, {
            provider: pluginId,
            model: modelId,
            capability: context.capability,
          });
        } catch {}

        return result;
      } catch (err: any) {
        console.warn(
          `[IntelligentRouter] Execution failed on model ${modelId} via provider ${provider.id}: ${err.message}. Cascading fallback...`
        );
        lastError = err;

        health.errorRate = health.errorRate * 0.9 + 1.0 * 0.1;
        health.retries += 1;
        health.lastChecked = Date.now();

        // Trigger AI Doctor diagnostic daemon asynchronously on failure
        AIDoctor.triggerFailureDiagnosis(provider.id, err.message);

        // Record failure telemetry to SQLite metrics
        try {
          MetricsDB.record("failure", "engine", 1, {
            provider: pluginId,
            model: modelId,
            capability: context.capability,
            error: err.message || String(err),
          });
        } catch {}
      }
    }

    // Fallback: If all candidates were skipped due to errorRate, try them anyway
    if (skippedCandidates.length > 0) {
      console.warn(`[IntelligentRouter] All candidates skipped due to errorRate. Retrying skipped candidates: ${skippedCandidates.map(c => c.modelId).join(", ")}`);
      for (const candidate of skippedCandidates) {
        const { modelId, provider } = candidate;
        const pluginId = provider.id === "google-ai" ? "google" : provider.id;
        const plugin = AIProviderRegistry.getPlugin(pluginId);
        if (!plugin) continue;
        console.log(`[IntelligentRouter] Fallback routing capability "${context.capability}" -> Model: "${modelId}" | Provider: "${provider.id}"`);
        const start = Date.now();
        try {
          const result = await plugin.execute(context.capability, {
            ...params,
            model: modelId,
          });
          const duration = Date.now() - start;
          const health = plugin.status();
          health.latency = health.latency * 0.8 + duration * 0.2;
          health.errorRate = 0.0; // Reset errorRate on success!
          health.lastChecked = Date.now();
          return result;
        } catch (err: any) {
          console.warn(`[IntelligentRouter] Fallback execution failed on model ${modelId}: ${err.message}`);
          lastError = err;
        }
      }
    }

    throw new Error(
      `[IntelligentRouter] All candidate models & fallback providers failed. Last error: ${lastError?.message || lastError}`
    );
  }

  /**
   * Resolves capability keys and scores candidate model+provider combinations
   */
  getCandidatesSorted(context: RoutingTaskContext): ScoredCandidate[] {
    const capKey = context.capability.toLowerCase();
    const candidateModelIds = AIConfigManager.capabilities[capKey] || [];
    const candidates: ScoredCandidate[] = [];

    for (const modelId of candidateModelIds) {
      const modelConfig = AIConfigManager.models.find((m) => m.id === modelId);
      if (!modelConfig) continue;

      // Filter local models if Privacy / Offline is active
      const isLocal = modelId.toLowerCase().includes("local") || modelId.toLowerCase().includes("ollama");
      if (this.activeProfile === "Offline Mode" && !isLocal) continue;

      // Resolve available and enabled providers for this model
      const providers = modelConfig.providers
        .map((pId) => AIConfigManager.providers.find((p) => p.id === pId))
        .filter((p): p is ProviderConfig => !!p && p.enabled);

      for (const provider of providers) {
        const score = this.calculateSuitability(modelId, provider, isLocal, context);
        candidates.push({
          modelId,
          modelConfig,
          provider,
          score,
        });
      }
    }

    // Sort descending by suitability score
    return candidates.sort((a, b) => b.score - a.score);
  }

  private calculateSuitability(
    modelId: string,
    provider: ProviderConfig,
    isLocal: boolean,
    context: RoutingTaskContext
  ): number {
    let score = 50;

    const weights = AIConfigManager.routing;
    const benchmarks = AIConfigManager.benchmarks[modelId] || {};
    const pricing = AIConfigManager.pricing[modelId] || { input: 0.15, output: 0.60, free: false };

    // 1. Quality Component
    const qualityScore = benchmarks[context.capability.toLowerCase()] || benchmarks["reasoning"] || 75;
    score += qualityScore * weights.qualityWeight;

    // 2. Speed / Latency Component (uses average provider response latency if available)
    const pluginId = provider.id === "google-ai" ? "google" : provider.id;
    const plugin = AIProviderRegistry.getPlugin(pluginId);
    const health = plugin?.status();
    
    const latencyVal = health && health.latency > 0 ? health.latency : (benchmarks["speed"] ? (5000 - benchmarks["speed"] * 45) : 1500);
    const speedScore = Math.max(0, Math.min(100, Math.round((5000 - latencyVal) / 45)));
    score += speedScore * weights.latencyWeight;

    // 3. Cost Component
    const isFree = pricing.free || isLocal;
    const costRating = isFree ? 100 : Math.max(0, 100 - (pricing.input + pricing.output) * 10);
    score += costRating * weights.costWeight;

    // 4. Availability / Success rate component
    const successRate = health ? (1.0 - health.errorRate) * 100 : 98;
    score += successRate * weights.availabilityWeight;

    // 5. Task-specific overrides
    const subtask = context.subtask;
    const modelIdLower = modelId.toLowerCase();

    if (subtask === "reasoning" && (modelIdLower.includes("llama-3.3") || modelIdLower.includes("glm-4.5"))) {
      score += 15;
    } else if (subtask === "coding" && modelIdLower.includes("coder")) {
      score += 25;
    } else if (subtask === "speed" && (modelIdLower.includes("flash") || speedScore > 90)) {
      score += 20;
    }

    // 5.5 Enforce suggested fallback sequences precisely
    const capabilityUpper = context.capability.toUpperCase();
    const subtaskLower = subtask?.toLowerCase() || "";

    if (capabilityUpper === "CODING" || subtaskLower === "coding") {
      if (modelId === "glm-4.7-flash") score += 500;
      else if (modelId === "gemini-2.5-flash") score += 400;
      else if (provider.id === "groq") score += 300;
      else if (provider.id === "openrouter") score += 200;
    } else if (capabilityUpper === "REASONING" || subtaskLower === "reasoning") {
      if (modelId === "gemini-2.5-flash") score += 500;
      else if (modelId === "glm-4.7-flash") score += 400;
      else if (provider.id === "groq") score += 300;
      else if (provider.id === "openrouter") score += 200;
    } else if (capabilityUpper === "JSON" || subtaskLower === "json") {
      if (modelId === "meta-llama/llama-3.1-8b-instruct") score += 600;
      else if (modelId === "gemini-2.5-flash") score += 500;
      else if (modelId === "glm-4.7-flash") score += 400;
      else if (provider.id === "groq") score += 300;
    } else if (capabilityUpper === "SCRIPT" || capabilityUpper === "SCRIPT_GENERATION") {
      if (modelId === "meta-llama/llama-3.1-8b-instruct") score += 600;
      else if (modelId === "gemini-2.5-flash") score += 500;
      else if (modelId === "glm-4.7-flash") score += 400;
      else if (provider.id === "openrouter") score += 300;
    }

    // 6. Active Profile matching overrides
    switch (this.activeProfile) {
      case "Maximum Quality":
        if (modelIdLower.includes("pro") || modelIdLower.includes("glm-4.5")) score += 30;
        break;
      case "Maximum Speed":
        score += speedScore * 0.5;
        break;
      case "Lowest Cost":
        if (isFree) score += 40;
        break;
      case "Offline Mode":
      case "Privacy":
        if (isLocal) score += 50;
        else score -= 100;
        break;
    }

    // Provider priority discount (lower priority number = preferred)
    score -= (provider.priority - 1) * 3;

    return score;
  }

  /**
   * Automatically updates dynamic benchmark speed metrics based on actual execution durations.
   */
  private updateDynamicBenchmarks(modelId: string, capability: AICapability, durationMs: number) {
    try {
      if (!AIConfigManager.benchmarks[modelId]) {
        AIConfigManager.benchmarks[modelId] = {};
      }

      // Convert duration to speed rating (0 to 100, where under 500ms = 100, 5000ms = 0)
      const currentSpeed = Math.max(0, Math.min(100, Math.round((5000 - durationMs) / 45)));
      
      const previousSpeed = AIConfigManager.benchmarks[modelId].speed || 70;
      // Exponential moving average for benchmarks update
      AIConfigManager.benchmarks[modelId].speed = Math.round(previousSpeed * 0.8 + currentSpeed * 0.2);

      AIConfigManager.saveBenchmarks();
      console.log(`[IntelligentRouter] Dynamic benchmark for model "${modelId}" updated (speed: ${AIConfigManager.benchmarks[modelId].speed})`);
    } catch (e: any) {
      console.warn(`[IntelligentRouter] Failed to update dynamic benchmarks:`, e.message);
    }
  }
}

export const IntelligentRouter = new IntelligentRouterClass();
