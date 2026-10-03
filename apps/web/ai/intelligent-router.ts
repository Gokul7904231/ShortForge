import { createHash } from "node:crypto";
import {
  classifyProviderError,
  ProviderAuthenticationError,
  ProviderBadRequestError,
} from "../lib/ai-provider/errors";
import { AICapability, AIProviderRegistry, ModelMeta } from "./capability-registry";
import type { TreasuryService } from "../factoryos/core/treasury/TreasuryService";
import {
  TreasuryEconomicAdmission,
  type TreasuryAdmissionContext,
  type TreasuryModelCandidate,
} from "../factoryos/core/treasury/TreasuryEconomicAdmission";
import type { TreasuryModelExecutionContext } from "./provider";
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
  preferredProviderId?: string;
  treasuryContext?: TreasuryModelExecutionContext;
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
    params: {
      prompt: string;
      system?: string;
      maxTokens?: number;
      temperature?: number;
      [key: string]: any;
    },
  ): Promise<any> {
    AIConfigManager.loadAll();

    const treasuryContext = context.treasuryContext;

    if (treasuryContext && this.treasuryService !== treasuryContext.treasuryService) {
      this.bindTreasury(
        treasuryContext.treasuryService,
        process.env.NODE_ENV === "production",
      );
    }

    const normalizedContext: RoutingTaskContext = treasuryContext
      ? {
          ...context,
          maxCostLimit:
            context.maxCostLimit ?? treasuryContext.maxCostUsd,
          maxRetries:
            context.maxRetries ?? treasuryContext.maxRetries ?? 0,
          overseerCommandId:
            context.overseerCommandId ??
            treasuryContext.overseerCommandId,
          accountId:
            context.accountId ?? treasuryContext.accountId,
          missionId:
            context.missionId ?? treasuryContext.missionId,
          runId:
            context.runId ?? treasuryContext.runId,
          floorId:
            context.floorId ?? treasuryContext.floorId,
          taskId:
            context.taskId ?? treasuryContext.taskId,
          scopeFingerprint:
            context.scopeFingerprint ??
            treasuryContext.scopeFingerprint,
          priority:
            context.priority ?? treasuryContext.priority,
          preferredProviderId:
            context.preferredProviderId ??
            treasuryContext.preferredProviderId,
        }
      : context;

    const treasuryManaged =
      process.env.NODE_ENV === "production" ||
      this.treasuryRequired ||
      Boolean(this.treasuryAdmission && normalizedContext.overseerCommandId);

    if (
      this.treasuryRequired &&
      (!this.treasuryAdmission ||
        !this.treasuryService ||
        !normalizedContext.overseerCommandId ||
        !normalizedContext.accountId ||
        !normalizedContext.missionId ||
        !normalizedContext.taskId)
    ) {
      throw new Error(
        "[IntelligentRouter] Production model execution requires complete Overseer/Treasury admission context",
      );
    }

    const candidates = this.getCandidatesSorted(normalizedContext);
    if (candidates.length === 0) {
      throw new Error(
        "[IntelligentRouter] No models found matching capability \"" +
          context.capability +
          "\" under profile \"" +
          this.activeProfile +
          "\"",
      );
    }

    const inputTokens = Math.max(0, Math.ceil(params.prompt.length / 4));
    const outputTokenCeiling = Math.max(1, params.maxTokens ?? 2048);
    const maxAttempts = Math.max(1, (normalizedContext.maxRetries ?? 0) + 1);

    const scopeFingerprint =
      normalizedContext.scopeFingerprint ??
      createHash("sha256")
        .update(
          JSON.stringify({
            capability: normalizedContext.capability,
            subtask: normalizedContext.subtask,
            prompt: params.prompt,
            system: params.system,
          }),
        )
        .digest("hex");

    const taskId =
      normalizedContext.taskId ??
      "ai_" +
        createHash("sha256")
          .update(scopeFingerprint)
          .digest("hex")
          .slice(0, 16);

    const missionId =
      normalizedContext.missionId ?? normalizedContext.runId ?? "ai-runtime";
    const accountId =
      normalizedContext.accountId ??
      process.env.FACTORYOS_TREASURY_ACCOUNT_ID ??
      "factoryos";

    const maxCostUsd = Math.max(
      0,
      normalizedContext.maxCostLimit ??
        Number(process.env.FACTORYOS_MAX_INFERENCE_RESERVATION_USD ?? "0.10"),
    );
    const treasuryBudget = {
      maxCostUsd,
      maxTokens: inputTokens + outputTokenCeiling,
      maxDurationMs: Math.max(
        60_000,
        Number(process.env.AI_EXECUTION_TIMEOUT_MS ?? "30000"),
      ),
      maxCapacityUnits: 0,
      maxRetries: 0,
    } as const;

    const treasuryAdmissionContext: TreasuryAdmissionContext = {
      accountId,
      overseerCommandId: normalizedContext.overseerCommandId ?? "",
      missionId,
      runId: normalizedContext.runId,
      floorId: normalizedContext.floorId ?? "inference",
      taskId,
      priority: normalizedContext.priority ?? "NORMAL",
      expiresAt: new Date(
        Date.now() +
          Math.max(
            60_000,
            Number(process.env.AI_EXECUTION_TIMEOUT_MS ?? "30000"),
          ),
      ).toISOString(),
      maxRetries: 0,
      scopeFingerprint,
    };

    let lastError: unknown = null;
    let attemptNumber = 0;

    for (const candidate of candidates) {
      if (attemptNumber >= maxAttempts) break;

      const pluginId =
        candidate.provider.id === "google-ai"
          ? "google"
          : candidate.provider.id;
      const plugin = AIProviderRegistry.getPlugin(pluginId);
      if (!plugin) continue;

      const health = plugin.status();
      if (health.errorRate > 0.85) continue;

      const pricing = AIConfigManager.pricing[candidate.modelId];
      const isLocal =
        candidate.modelId.toLowerCase().includes("local") ||
        candidate.modelId.toLowerCase().includes("ollama");
      const isPaid = !(pricing?.free === true || isLocal);

      if (treasuryManaged) {
        if (!this.treasuryAdmission) {
          throw new Error(
            "[IntelligentRouter] Treasury admission is not bound",
          );
        }

        const modelCandidate: TreasuryModelCandidate = {
          providerId: pluginId,
          modelId: candidate.modelId,
          capability: String(normalizedContext.capability),
          isPaid,
          inputTokens,
          outputTokens: outputTokenCeiling,
          pricingSource: pricing
            ? "AI_CONFIG_BOOTSTRAP"
            : isPaid
              ? "UNPRICED"
              : "ZERO_COST_DECLARATION",
          pricingVersion: pricing
            ? "ai-config:" +
              candidate.modelId +
              ":" +
              pricing.input +
              ":" +
              pricing.output +
              ":" +
              (pricing.free ? "free" : "paid")
            : isPaid
              ? "UNPRICED"
              : "zero-cost",
          inputUsdPer1MTokens: pricing?.input ?? 0,
          outputUsdPer1MTokens: pricing?.output ?? 0,
        };

        const assessment = this.treasuryAdmission.assessModelCandidate(
          modelCandidate,
          treasuryBudget,
        );
        if (!assessment.admissible) {
          continue;
        }

        attemptNumber += 1;
        const attemptContext: TreasuryAdmissionContext = {
          ...treasuryAdmissionContext,
          attemptId:
            taskId +
            ":attempt:" +
            String(attemptNumber) +
            ":" +
            candidate.provider.id +
            ":" +
            candidate.modelId,
        };

        let reservation:
          | Awaited<
              ReturnType<
                TreasuryEconomicAdmission["reserveModelInvocation"]
              >
            >
          | undefined;
        let executionId: string | undefined;

        try {
          reservation =
            await this.treasuryAdmission.reserveModelInvocation(
              attemptContext,
              modelCandidate,
              treasuryBudget,
            );

          executionId =
            "treasury-model-exec-" +
            createHash("sha256")
              .update(
                scopeFingerprint +
                  ":" +
                  attemptNumber +
                  ":" +
                  pluginId +
                  ":" +
                  candidate.modelId,
              )
              .digest("hex")
              .slice(0, 24);

          const startedAt = Date.now();
          const result = await plugin.execute(normalizedContext.capability, {
            ...params,
            model: candidate.modelId,
            __treasuryExecutionId: executionId,
            __treasuryManagedRetries: true,
          });
          const duration = Date.now() - startedAt;

          const usage = plugin.getExecutionUsage?.(executionId) ?? {
            inputTokens,
            outputTokens: Math.max(
              0,
              Math.ceil(
                typeof result === "string"
                  ? result.length / 4
                  : JSON.stringify(result ?? "").length / 4,
              ),
            ),
          };

          const measuredPricing = isPaid
            ? this.treasuryService!
                .getPriceRegistry()
                .estimateModelInvocation(
                  pluginId,
                  candidate.modelId,
                  usage.inputTokens,
                  usage.outputTokens,
                )
            : {
                priced: true,
                totalCostUsd: 0,
              };

          if (!measuredPricing.priced) {
            throw new Error(
              "[IntelligentRouter] Treasury could not price measured model usage for settlement",
            );
          }

          const actualTokens =
            Math.max(0, usage.inputTokens) +
            Math.max(0, usage.outputTokens);

          await this.treasuryService!.settle(
            reservation.reservation.reservationId,
            {
              reservationId: reservation.reservation.reservationId,
              actualCostUsd: Math.max(
                0,
                measuredPricing.totalCostUsd,
              ),
              actualCapacityUnits: 0,
              actualTokens,
              actualDurationMs: duration,
              executionEvidenceId: executionId,
              verified: false,
              measuredAt: new Date().toISOString(),
            },
          );

          health.latency =
            health.latency * 0.8 + duration * 0.2;
          health.errorRate = health.errorRate * 0.9;
          health.lastChecked = Date.now();
          health.totalCost.estimatedUSD += Math.max(
            0,
            measuredPricing.totalCostUsd,
          );

          this.updateDynamicBenchmarks(
            candidate.modelId,
            normalizedContext.capability,
            duration,
          );

          try {
            MetricsDB.record("success", "engine", 1, {
              provider: pluginId,
              model: candidate.modelId,
              capability: context.capability,
              treasuryManaged: "true",
              treasuryReservationId:
                reservation.reservation.reservationId,
            });
            MetricsDB.record(
              "model_cost_usd",
              "engine",
              Math.max(0, measuredPricing.totalCostUsd),
              {
                provider: pluginId,
                model: candidate.modelId,
                capability: context.capability,
              },
            );
          } catch {}

          return result;
        } catch (err: any) {
          lastError = err;

          if (
            reservation?.reservation?.reservationId &&
            this.treasuryService
          ) {
            const usage = executionId
              ? plugin.getExecutionUsage?.(executionId)
              : undefined;

            if (usage) {
              const actualTokens =
                Math.max(0, usage.inputTokens) +
                Math.max(0, usage.outputTokens);

              const measured = isPaid
                ? this.treasuryService
                    .getPriceRegistry()
                    .estimateModelInvocation(
                      pluginId,
                      candidate.modelId,
                      usage.inputTokens,
                      usage.outputTokens,
                    )
                : {
                    priced: true,
                    totalCostUsd: 0,
                  };

              if (measured.priced) {
                await this.treasuryService
                  .settle(reservation.reservation.reservationId, {
                    reservationId:
                      reservation.reservation.reservationId,
                    actualCostUsd: Math.max(
                      0,
                      measured.totalCostUsd,
                    ),
                    actualCapacityUnits: 0,
                    actualTokens,
                    actualDurationMs: undefined,
                    executionEvidenceId:
                      executionId ??
                      "treasury-model-failure:" +
                        taskId +
                        ":" +
                        attemptNumber,
                    verified: false,
                    measuredAt: new Date().toISOString(),
                  })
                  .catch(() => {});
              }
            } else {
              // No physical usage measurement exists. A definitive auth/bad-request
              // rejection is non-billable and can release safely. Network/server/
              // timeout/unknown failures remain held for reconciliation because the
              // provider may have accepted work before the caller lost the response.
              const classified = classifyProviderError(
                err,
                pluginId,
              );
              if (
                classified instanceof ProviderAuthenticationError ||
                classified instanceof ProviderBadRequestError
              ) {
                await this.treasuryService
                  .release(
                    reservation.reservation.reservationId,
                    "MODEL_REQUEST_REJECTED_BEFORE_ACCEPTANCE",
                  )
                  .catch(() => {});
              }
            }
          }

          health.errorRate = health.errorRate * 0.9 + 0.1;
          health.retries += 1;
          health.lastChecked = Date.now();

          AIDoctor.triggerFailureDiagnosis(
            candidate.provider.id,
            err?.message || String(err),
          );

          try {
            MetricsDB.record("failure", "engine", 1, {
              provider: pluginId,
              model: candidate.modelId,
              capability: context.capability,
              error: err?.message || String(err),
              treasuryManaged: "true",
            });
          } catch {}
        }
      } else {
        // Compatibility execution path remains for non-Treasury development callers.
        try {
          return await plugin.execute(context.capability, {
            ...params,
            model: candidate.modelId,
            __treasuryManagedRetries: false,
          });
        } catch (err: any) {
          lastError = err;
        }
        attemptNumber += 1;
      }
    }

    // Non-Treasury compatibility fallback for callers that have not supplied a command.
    if (!treasuryManaged) {
      for (const candidate of candidates) {
        const pluginId =
          candidate.provider.id === "google-ai"
            ? "google"
            : candidate.provider.id;
        const plugin = AIProviderRegistry.getPlugin(pluginId);
        if (!plugin) continue;
        try {
          return await plugin.execute(context.capability, {
            ...params,
            model: candidate.modelId,
            __treasuryManagedRetries: false,
          });
        } catch (err: any) {
          lastError = err;
        }
      }
    }

    throw new Error(
      "[IntelligentRouter] All economically admissible candidate models failed. Last error: " +
        (lastError instanceof Error ? lastError.message : String(lastError ?? "unknown")),
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

    // Sort descending by suitability. A legacy caller's preferred provider
    // is only a ranking preference; Treasury still admits the resulting attempt.
    const preferred =
      context.preferredProviderId === "gemini"
        ? "google"
        : context.preferredProviderId;
    return candidates.sort((a, b) => {
      const aPreferred =
        preferred && (a.provider.id === preferred || (preferred === "google" && a.provider.id === "google-ai"))
          ? 1
          : 0;
      const bPreferred =
        preferred && (b.provider.id === preferred || (preferred === "google" && b.provider.id === "google-ai"))
          ? 1
          : 0;
      if (aPreferred !== bPreferred) return bPreferred - aPreferred;
      return b.score - a.score;
    });
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
