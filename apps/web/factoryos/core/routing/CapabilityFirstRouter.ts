/**
 * FactoryOS Frontier v3 — Capability-First Provider Router & Circuit Breakers
 *
 * Mental Model: Capability → Candidate Providers (scored by local preference, health, latency, context, cost).
 */

import { CostGovernor } from "../governor/CostGovernor";
import type { TreasuryService } from "../treasury/TreasuryService";
import { TreasuryEconomicAdmission, type TreasuryAdmissionContext } from "../treasury/TreasuryEconomicAdmission";

export type ProviderCircuitState = "ONLINE" | "DEGRADED" | "OPEN" | "HALF_OPEN" | "RATE_LIMITED";

export interface ProviderCandidate {
  readonly providerId: string;
  readonly name: string;
  readonly modelId: string;
  readonly isLocal: boolean;
  readonly isPaid: boolean;
  readonly supportedCapabilities: string[];
  readonly maxContextTokens: number;
  readonly costPer1kTokensUsd: number;
  readonly baselineLatencyMs: number;
  circuitState: ProviderCircuitState;
  consecutiveFailures: number;
  lastFailureTime?: number;
}

export interface CapabilityRoutingRequest {
  readonly capability: string;
  readonly estimatedTokens?: number;
  readonly minContextTokens?: number;
  readonly maxLatencyMs?: number;
  readonly requireStructuredOutput?: boolean;
}

export interface RoutingDecision {
  readonly capability: string;
  readonly selectedProviderId: string;
  readonly selectedModelId: string;
  readonly isLocal: boolean;
  readonly isPaid: boolean;
  readonly estimatedCostUsd: number;
  readonly estimatedLatencyMs: number;
  readonly reason: string;
  readonly fallbackChain: string[];
  readonly decisionTimestamp: string;
}

export class CapabilityFirstRouter {
  private static candidates: Map<string, ProviderCandidate> = new Map();

  static {
    this.registerDefaults();
  }

  static registerCandidate(candidate: ProviderCandidate): void {
    this.candidates.set(`${candidate.providerId}:${candidate.modelId}`, { ...candidate });
  }

  static getCandidate(providerId: string, modelId: string): ProviderCandidate | undefined {
    return this.candidates.get(`${providerId}:${modelId}`);
  }

  static getAllCandidates(): ProviderCandidate[] {
    return Array.from(this.candidates.values());
  }

  static setCircuitState(providerId: string, modelId: string, state: ProviderCircuitState): void {
    const key = `${providerId}:${modelId}`;
    const candidate = this.candidates.get(key);
    if (candidate) {
      candidate.circuitState = state;
      if (state === "OPEN" || state === "RATE_LIMITED") {
        candidate.consecutiveFailures += 1;
        candidate.lastFailureTime = Date.now();
      } else if (state === "ONLINE") {
        candidate.consecutiveFailures = 0;
      }
    }
  }

  /**
   * Treasury-backed asynchronous routing seam.
   *
   * CapabilityFirstRouter still ranks candidates, but Treasury owns the final
   * economic admission and reservation. The legacy synchronous method remains
   * compatibility-only and must not be used for production spend.
   */
  static async routeCapabilityWithTreasury(
    req: CapabilityRoutingRequest,
    context: TreasuryAdmissionContext,
    treasury: TreasuryService,
  ): Promise<{
    decision: RoutingDecision;
    reservationId: string;
    permitId: string;
  }> {
    const matching = Array.from(this.candidates.values()).filter((c) => {
      if (!c.supportedCapabilities.includes(req.capability)) return false;
      if (c.circuitState === "OPEN" || c.circuitState === "RATE_LIMITED") return false;
      if (req.minContextTokens && c.maxContextTokens < req.minContextTokens) return false;
      if (req.maxLatencyMs && c.baselineLatencyMs > req.maxLatencyMs) return false;
      return true;
    });

    if (matching.length === 0) {
      throw new Error(
        `[CapabilityRouter] No healthy provider available for capability: "${req.capability}"`,
      );
    }

    matching.sort((a, b) => {
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      if (!a.isPaid && b.isPaid) return -1;
      if (a.isPaid && !b.isPaid) return 1;
      if (a.costPer1kTokensUsd !== b.costPer1kTokensUsd) {
        return a.costPer1kTokensUsd - b.costPer1kTokensUsd;
      }
      return a.baselineLatencyMs - b.baselineLatencyMs;
    });

    const tokens = Math.max(1, req.estimatedTokens ?? 1000);
    const admission = new TreasuryEconomicAdmission(treasury);

    for (const candidate of matching) {
      const assessment = admission.assessModelCandidate(
        {
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          capability: req.capability,
          isPaid: candidate.isPaid,
          inputTokens: Math.ceil(tokens * 0.25),
          outputTokens: Math.ceil(tokens * 0.75),
          pricingSource: candidate.isPaid ? "CAPABILITY_ROUTER" : "ZERO_COST_DECLARATION",
          pricingVersion: "capability-router:v1",
          inputUsdPer1MTokens: Math.max(0, candidate.costPer1kTokensUsd * 1000),
          outputUsdPer1MTokens: Math.max(0, candidate.costPer1kTokensUsd * 1000),
        },
        {
          maxCostUsd: context.maxRetries !== undefined
            ? Number(process.env.FACTORYOS_MAX_INFERENCE_RESERVATION_USD ?? 0.10)
            : Number(process.env.FACTORYOS_MAX_INFERENCE_RESERVATION_USD ?? 0.10),
          maxTokens: tokens,
          maxCapacityUnits: tokens,
          maxRetries: 0,
        },
      );

      if (!assessment.admissible) continue;

      const reserved = await admission.reserveModelInvocation(
        context,
        {
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          capability: req.capability,
          isPaid: candidate.isPaid,
          inputTokens: Math.ceil(tokens * 0.25),
          outputTokens: Math.ceil(tokens * 0.75),
          pricingSource: candidate.isPaid ? "CAPABILITY_ROUTER" : "ZERO_COST_DECLARATION",
          pricingVersion: "capability-router:v1",
          inputUsdPer1MTokens: Math.max(0, candidate.costPer1kTokensUsd * 1000),
          outputUsdPer1MTokens: Math.max(0, candidate.costPer1kTokensUsd * 1000),
        },
        {
          maxCostUsd: Math.max(assessment.estimatedCostUsd, 0),
          maxTokens: tokens,
          maxCapacityUnits: tokens,
          maxRetries: 0,
        },
      );

      return {
        decision: {
          capability: req.capability,
          selectedProviderId: candidate.providerId,
          selectedModelId: candidate.modelId,
          isLocal: candidate.isLocal,
          isPaid: candidate.isPaid,
          estimatedCostUsd: assessment.estimatedCostUsd,
          estimatedLatencyMs: candidate.baselineLatencyMs,
          reason: "Capability-qualified candidate admitted by Treasury.",
          fallbackChain: matching
            .filter((item) => item !== candidate)
            .map((item) => item.providerId + ":" + item.modelId),
          decisionTimestamp: new Date().toISOString(),
        },
        reservationId: reserved.reservation.reservationId,
        permitId: reserved.permit.permitId,
      };
    }

    throw new Error(
      "[CapabilityRouter] No capability-qualified candidate was economically admissible in Treasury",
    );
  }

  /**
   * Capability-First Selection:
   * 1. Match candidates supporting capability
   * 2. Filter out open circuits / unhealthy providers
   * 3. Score hierarchy: Local/free/cost/latency is selection advice only.
   * 4. Production economic admission is delegated to routeCapabilityWithTreasury.
   * 5. Return RoutingDecision with explanation and fallback chain
   */
  static routeCapability(req: CapabilityRoutingRequest): RoutingDecision {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[CapabilityRouter] Production routing requires routeCapabilityWithTreasury; synchronous legacy routing cannot authorize spend",
      );
    }
    const matching = Array.from(this.candidates.values()).filter((c) => {
      if (!c.supportedCapabilities.includes(req.capability)) return false;
      if (c.circuitState === "OPEN" || c.circuitState === "RATE_LIMITED") return false;
      if (req.minContextTokens && c.maxContextTokens < req.minContextTokens) return false;
      return true;
    });

    if (matching.length === 0) {
      throw new Error(`[CapabilityRouter] No healthy provider available for capability: "${req.capability}"`);
    }

    // Sort: Local first, then zero cost, then lowest latency
    matching.sort((a, b) => {
      // Preference 1: Local
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;

      // Preference 2: Zero cost / Free API
      if (!a.isPaid && b.isPaid) return -1;
      if (a.isPaid && !b.isPaid) return 1;

      // Preference 3: Lowest cost
      if (a.costPer1kTokensUsd !== b.costPer1kTokensUsd) {
        return a.costPer1kTokensUsd - b.costPer1kTokensUsd;
      }

      // Preference 4: Latency
      return a.baselineLatencyMs - b.baselineLatencyMs;
    });

    const tokens = req.estimatedTokens || 1000;
    let selected: ProviderCandidate | null = null;
    let fallbackChain: string[] = [];

    for (const candidate of matching) {
      const estimatedCost = (tokens / 1000) * candidate.costPer1kTokensUsd;
      const evalResult = CostGovernor.evaluateInvocation(candidate.isPaid, estimatedCost);

      if (evalResult.allowed) {
        if (!selected) {
          selected = candidate;
        } else {
          fallbackChain.push(`${candidate.providerId}:${candidate.modelId}`);
        }
      }
    }

    if (!selected) {
      // If none was allowed due to CostGovernor policy, take the top candidate and let caller handle approval
      const topCandidate = matching[0];
      const estimatedCost = (tokens / 1000) * topCandidate.costPer1kTokensUsd;
      return {
        capability: req.capability,
        selectedProviderId: topCandidate.providerId,
        selectedModelId: topCandidate.modelId,
        isLocal: topCandidate.isLocal,
        isPaid: topCandidate.isPaid,
        estimatedCostUsd: estimatedCost,
        estimatedLatencyMs: topCandidate.baselineLatencyMs,
        reason: `Paid provider required for "${req.capability}" (approval needed under FREE_FIRST).`,
        fallbackChain: matching.slice(1).map((m) => `${m.providerId}:${m.modelId}`),
        decisionTimestamp: new Date().toISOString(),
      };
    }

    const estimatedCost = (tokens / 1000) * selected.costPer1kTokensUsd;
    const reason = selected.isLocal
      ? `Selected local inference (${selected.name}) for $0 zero-cost execution.`
      : !selected.isPaid
      ? `Selected free provider (${selected.name}) under FREE_FIRST policy.`
      : `Selected provider (${selected.name}) within authorized budget.`;

    return {
      capability: req.capability,
      selectedProviderId: selected.providerId,
      selectedModelId: selected.modelId,
      isLocal: selected.isLocal,
      isPaid: selected.isPaid,
      estimatedCostUsd: estimatedCost,
      estimatedLatencyMs: selected.baselineLatencyMs,
      reason,
      fallbackChain,
      decisionTimestamp: new Date().toISOString(),
    };
  }

  private static registerDefaults(): void {
    // Local Ollama
    this.registerCandidate({
      providerId: "ollama_local",
      name: "Ollama Local (Qwen 2.5 / Llama 3)",
      modelId: "qwen2.5-coder",
      isLocal: true,
      isPaid: false,
      supportedCapabilities: ["script_generation", "trend_analysis", "json_parsing", "qa_evaluation"],
      maxContextTokens: 32768,
      costPer1kTokensUsd: 0.0,
      baselineLatencyMs: 120,
      circuitState: "ONLINE",
      consecutiveFailures: 0,
    });

    // LM Studio Local
    this.registerCandidate({
      providerId: "lm_studio_local",
      name: "LM Studio Local",
      modelId: "local-model",
      isLocal: true,
      isPaid: false,
      supportedCapabilities: ["script_generation", "trend_analysis"],
      maxContextTokens: 16384,
      costPer1kTokensUsd: 0.0,
      baselineLatencyMs: 140,
      circuitState: "ONLINE",
      consecutiveFailures: 0,
    });

    // Google Gemini (Free / Cloud)
    this.registerCandidate({
      providerId: "gemini",
      name: "Google Gemini 2.5 Flash",
      modelId: "gemini-2.5-flash",
      isLocal: false,
      isPaid: false, // Free tier
      supportedCapabilities: ["script_generation", "trend_analysis", "visual_planning", "multimodal_vision", "qa_evaluation"],
      maxContextTokens: 1000000,
      costPer1kTokensUsd: 0.0,
      baselineLatencyMs: 180,
      circuitState: "ONLINE",
      consecutiveFailures: 0,
    });

    // Groq (Ultra-fast Cloud)
    this.registerCandidate({
      providerId: "groq",
      name: "Groq Llama 3.3 70B",
      modelId: "llama-3.3-70b-versatile",
      isLocal: false,
      isPaid: false,
      supportedCapabilities: ["script_generation", "fast_triage", "trend_analysis"],
      maxContextTokens: 128000,
      costPer1kTokensUsd: 0.0,
      baselineLatencyMs: 75,
      circuitState: "ONLINE",
      consecutiveFailures: 0,
    });

    // OpenAI Paid Fallback
    this.registerCandidate({
      providerId: "openai",
      name: "OpenAI GPT-4o",
      modelId: "gpt-4o",
      isLocal: false,
      isPaid: true,
      supportedCapabilities: ["script_generation", "complex_reasoning", "visual_planning"],
      maxContextTokens: 128000,
      costPer1kTokensUsd: 0.005,
      baselineLatencyMs: 320,
      circuitState: "ONLINE",
      consecutiveFailures: 0,
    });
  }
}
