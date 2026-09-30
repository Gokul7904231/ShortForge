import { randomUUID } from "node:crypto";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";
import {
  ReachResearchCache,
  canonicalizeSourceUrl,
  deduplicateEvidenceSources,
} from "./ReachCache";
import {
  DecodoBudgetGovernor,
  type BudgetReservation,
  type DecodoBudgetCapability,
} from "./ReachBudgetGovernor";
import {
  inferReachResearchMode,
  ReachProviderError,
  type ReachFetchRequest,
  type ReachProvider,
  type ReachProviderId,
  type ReachProviderResponse,
  type ReachResearchMode,
  type ReachTelemetrySink,
} from "./ReachContracts";
import {
  DecodoFastSearchProvider,
  DecodoWebScrapingProvider,
  SearXNGProvider,
} from "./ReachProviders";

interface ProviderHealth {
  consecutiveFailures: number;
  openedUntil: number;
  lastLatencyMs?: number;
  lastError?: string;
  requests: number;
  successes: number;
}

export interface ReachRouterOptions {
  readonly providers?: readonly ReachProvider[];
  readonly cache?: ReachResearchCache;
  readonly budgetGovernor?: DecodoBudgetGovernor;
  readonly telemetry?: ReachTelemetrySink;
  readonly retryCount?: number;
  readonly circuitFailureThreshold?: number;
  readonly circuitOpenMs?: number;
}

export interface ReachRouterResult {
  readonly sources: readonly EvidenceSource[];
  readonly providersUsed: readonly ReachProviderId[];
  readonly cacheHit: boolean;
  readonly fallbackCount: number;
  readonly requestTraceId: string;
}

class NullTelemetry implements ReachTelemetrySink {
  record(): void {}
}

export class InMemoryReachTelemetry implements ReachTelemetrySink {
  private readonly events: any[] = [];

  record(event: any): void {
    this.events.push(Object.freeze({ ...event }));
  }

  list(): readonly any[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}

function providerSupports(
  provider: ReachProvider,
  capability: "SEARCH" | "WEB_RETRIEVE",
): boolean {
  return provider.capabilities.includes(capability);
}

function budgetFromEnv(
  explicitBudgetEnv: string,
  credentialEnv: string,
): number {
  const explicitRaw = process.env[explicitBudgetEnv]?.trim();

  if (explicitRaw) {
    const explicit = Number(explicitRaw);
    if (Number.isFinite(explicit) && explicit >= 0) {
      return explicit;
    }
  }

  return process.env[credentialEnv]?.trim() ? 100 : 0;
}

function defaultBudgetCapacity(): Partial<
  Record<DecodoBudgetCapability, number>
> {
  return {
    DECODO_FAST_SEARCH: budgetFromEnv(
      "DECODO_FAST_SEARCH_BUDGET",
      "DECODO_FAST_SEARCH_API_KEY",
    ),
    DECODO_WEB_STANDARD: budgetFromEnv(
      "DECODO_WEB_STANDARD_BUDGET",
      "DECODO_WEB_SCRAPING_API_KEY",
    ),
    DECODO_WEB_JS: budgetFromEnv(
      "DECODO_WEB_JS_BUDGET",
      "DECODO_WEB_SCRAPING_API_KEY",
    ),
    DECODO_WEB_PREMIUM: budgetFromEnv(
      "DECODO_WEB_PREMIUM_BUDGET",
      "DECODO_WEB_SCRAPING_API_KEY",
    ),
    DECODO_WEB_PREMIUM_JS: budgetFromEnv(
      "DECODO_WEB_PREMIUM_JS_BUDGET",
      "DECODO_WEB_SCRAPING_API_KEY",
    ),
  };
}

function mergeDeepEvidenceSources(
  baseline: readonly EvidenceSource[],
  enriched: readonly EvidenceSource[],
): EvidenceSource[] {
  const byUrl = new Map<string, EvidenceSource>();

  for (const source of baseline) {
    byUrl.set(canonicalizeSourceUrl(source.url), source);
  }

  for (const source of enriched) {
    const key = canonicalizeSourceUrl(source.url);
    const existing = byUrl.get(key);

    if (
      !existing ||
      source.extractionMethod === "HTTP_SCRAPE"
    ) {
      byUrl.set(key, source);
    }
  }

  return deduplicateEvidenceSources([...byUrl.values()]);
}

function capCorroborationSources(
  sources: readonly EvidenceSource[],
  target: number,
): EvidenceSource[] {
  const deduped = deduplicateEvidenceSources(sources);
  if (deduped.length <= target) return deduped;

  const selected: EvidenceSource[] = [];
  const selectedIds = new Set<string>();

  const add = (source?: EvidenceSource) => {
    if (!source || selected.length >= target) return;
    if (selectedIds.has(source.id)) return;
    selectedIds.add(source.id);
    selected.push(source);
  };

  const providers = [
    ...new Set(deduped.map((source) => source.provider).filter(Boolean)),
  ];

  for (const provider of providers) {
    add(deduped.find((source) => source.provider === provider));
  }

  for (const source of deduped) {
    add(source);
    if (selected.length >= target) break;
  }

  return selected;
}

function budgetForProvider(
  provider: ReachProvider,
): DecodoBudgetCapability | null {
  switch (provider.id) {
    case "DECODO_FAST_SEARCH":
      return "DECODO_FAST_SEARCH";
    case "DECODO_WEB_SCRAPE":
      if (provider instanceof DecodoWebScrapingProvider) {
        return provider.budgetCapability();
      }
      return "DECODO_WEB_STANDARD";
    default:
      return null;
  }
}

export class ReachProviderRouter {
  private readonly providers: readonly ReachProvider[];
  private readonly cache: ReachResearchCache;
  private readonly budgetGovernor: DecodoBudgetGovernor;
  private readonly telemetry: ReachTelemetrySink;
  private readonly retryCount: number;
  private readonly circuitFailureThreshold: number;
  private readonly circuitOpenMs: number;
  private readonly health = new Map<ReachProviderId, ProviderHealth>();

  constructor(options: ReachRouterOptions = {}) {
    this.providers = options.providers ?? [
      new SearXNGProvider(),
      new DecodoFastSearchProvider(),
      new DecodoWebScrapingProvider(),
    ];

    this.cache = options.cache ?? new ReachResearchCache();
    this.budgetGovernor =
      options.budgetGovernor ??
      new DecodoBudgetGovernor(defaultBudgetCapacity());

    this.telemetry = options.telemetry ?? new NullTelemetry();
    this.retryCount = Math.min(
      3,
      Math.max(0, Math.floor(options.retryCount ?? 2)),
    );
    this.circuitFailureThreshold = Math.max(
      1,
      Math.floor(options.circuitFailureThreshold ?? 3),
    );
    this.circuitOpenMs = Math.max(
      1000,
      Math.floor(options.circuitOpenMs ?? 30000),
    );

    for (const provider of this.providers) {
      this.health.set(provider.id, {
        consecutiveFailures: 0,
        openedUntil: 0,
        requests: 0,
        successes: 0,
      });
    }
  }

  private isOpen(provider: ReachProvider): boolean {
    const state = this.health.get(provider.id);
    return !!state && state.openedUntil > Date.now();
  }

  private markSuccess(
    provider: ReachProvider,
    latencyMs: number,
  ): void {
    const state = this.health.get(provider.id);
    if (!state) return;

    state.consecutiveFailures = 0;
    state.openedUntil = 0;
    state.lastLatencyMs = latencyMs;
    state.lastError = undefined;
    state.requests += 1;
    state.successes += 1;

    this.telemetry.record({
      type: "PROVIDER_SUCCESS",
      at: new Date().toISOString(),
      provider: provider.id,
      metadata: { latencyMs },
    });
  }

  private markFailure(provider: ReachProvider, error: unknown): void {
    const state = this.health.get(provider.id);
    if (!state) return;

    state.consecutiveFailures += 1;
    state.requests += 1;
    state.lastError =
      error instanceof Error ? error.message : String(error);

    if (state.consecutiveFailures >= this.circuitFailureThreshold) {
      state.openedUntil = Date.now() + this.circuitOpenMs;
    }

    this.telemetry.record({
      type: "PROVIDER_FAILURE",
      at: new Date().toISOString(),
      provider: provider.id,
      metadata: {
        consecutiveFailures: state.consecutiveFailures,
        openedUntil: state.openedUntil || null,
        error: state.lastError,
      },
    });
  }

  healthSnapshot() {
    return this.providers.map((provider) => {
      const state = this.health.get(provider.id)!;
      const stateName =
        state.openedUntil > Date.now()
          ? "OPEN"
          : state.consecutiveFailures > 0
            ? "DEGRADED"
            : "HEALTHY";

      const failurePenalty = Math.min(
        0.8,
        state.consecutiveFailures * 0.2,
      );

      return {
        provider: provider.id,
        state: stateName,
        healthScore: Number(
          Math.max(0, 1 - failurePenalty).toFixed(2),
        ),
        consecutiveFailures: state.consecutiveFailures,
        lastLatencyMs: state.lastLatencyMs,
        lastError: state.lastError,
        openedUntil:
          state.openedUntil > Date.now()
            ? new Date(state.openedUntil).toISOString()
            : undefined,
      };
    });
  }

  budgetSnapshot() {
    return this.budgetGovernor.snapshot();
  }

  private orderedSearchProviders(
    mode: ReachResearchMode,
  ): ReachProvider[] {
    const searchers = this.providers.filter((provider) =>
      providerSupports(provider, "SEARCH"),
    );

    const byId = (id: string) =>
      searchers.find((provider) => provider.id === id);

    const searx = byId("SEARXNG");
    const decodo = byId("DECODO_FAST_SEARCH");

    const future = searchers.filter(
      (provider) =>
        provider.id !== "SEARXNG" &&
        provider.id !== "DECODO_FAST_SEARCH",
    );

    const ordered: ReachProvider[] = [];

    const add = (provider?: ReachProvider) => {
      if (provider && !ordered.includes(provider)) {
        ordered.push(provider);
      }
    };

    if (mode === "PRECISION") {
      add(decodo);
      add(searx);
    } else {
      add(searx);
      add(decodo);
    }

    future.forEach(add);
    return ordered;
  }

  private async invokeSearch(
    provider: ReachProvider,
    request: ReachFetchRequest,
    renderedQuery: string,
  ): Promise<ReachProviderResponse> {
    if (!provider.search) {
      throw new ReachProviderError(
        "Provider " + provider.id + " does not implement search.",
      );
    }

    let reservation: BudgetReservation | null = null;
    const budgetCapability = budgetForProvider(provider);

    if (budgetCapability) {
      reservation = this.budgetGovernor.reserve(
        budgetCapability,
        provider.id,
        1,
      );

      if (!reservation) {
        this.telemetry.record({
          type: "PROVIDER_SKIPPED",
          at: new Date().toISOString(),
          provider: provider.id,
          metadata: {
            reason: "BUDGET_EXHAUSTED",
            budgetCapability,
          },
        });

        throw new ReachProviderError(
          "Provider budget exhausted for " + budgetCapability + ".",
        );
      }

      this.telemetry.record({
        type: "BUDGET_RESERVED",
        at: new Date().toISOString(),
        provider: provider.id,
        metadata: { reservationId: reservation.reservationId },
      });
    }

    try {
      const response = await provider.search({
        request,
        renderedQuery,
      });

      if (reservation) {
        this.budgetGovernor.commit(reservation);
        this.telemetry.record({
          type: "BUDGET_COMMITTED",
          at: new Date().toISOString(),
          provider: provider.id,
          metadata: { reservationId: reservation.reservationId },
        });
      }

      return response;
    } catch (error) {
      if (reservation) {
        this.budgetGovernor.release(reservation);
        this.telemetry.record({
          type: "BUDGET_RELEASED",
          at: new Date().toISOString(),
          provider: provider.id,
          metadata: { reservationId: reservation.reservationId },
        });
      }

      throw error;
    }
  }

  private async retrySearch(
    provider: ReachProvider,
    request: ReachFetchRequest,
    renderedQuery: string,
  ): Promise<ReachProviderResponse> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.retryCount) {
      try {
        return await this.invokeSearch(
          provider,
          request,
          renderedQuery,
        );
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof ReachProviderError ? error.retryable : true;

        if (!retryable || attempt >= this.retryCount) {
          throw error;
        }

        const delay = Math.min(1000, 150 * 2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
      }
    }

    throw lastError;
  }

  private async deepRetrieve(
    provider: DecodoWebScrapingProvider,
    request: ReachFetchRequest,
    renderedQuery: string,
    source: EvidenceSource,
  ): Promise<ReachProviderResponse | null> {
    const budgetCapability = provider.budgetCapability();
    const reservation = this.budgetGovernor.reserve(
      budgetCapability,
      provider.id,
      1,
    );

    if (!reservation) {
      this.telemetry.record({
        type: "PROVIDER_SKIPPED",
        at: new Date().toISOString(),
        provider: provider.id,
        metadata: {
          reason: "BUDGET_EXHAUSTED",
          budgetCapability,
        },
      });
      return null;
    }

    this.telemetry.record({
      type: "BUDGET_RESERVED",
      at: new Date().toISOString(),
      provider: provider.id,
      metadata: { reservationId: reservation.reservationId },
    });

    try {
      const response = await provider.retrieve!({
        request,
        renderedQuery,
        sourceUrl: source.url,
      });

      this.budgetGovernor.commit(reservation);
      this.telemetry.record({
        type: "BUDGET_COMMITTED",
        at: new Date().toISOString(),
        provider: provider.id,
        metadata: { reservationId: reservation.reservationId },
      });

      return response;
    } catch {
      this.budgetGovernor.release(reservation);
      this.telemetry.record({
        type: "BUDGET_RELEASED",
        at: new Date().toISOString(),
        provider: provider.id,
        metadata: { reservationId: reservation.reservationId },
      });
      return null;
    }
  }

  async acquire(
    request: ReachFetchRequest,
    renderedQuery: string,
  ): Promise<ReachRouterResult> {
    const requestTraceId = "reach_" + randomUUID().slice(0, 8);
    const cached = this.cache.get(request, renderedQuery);

    if (cached && cached.length > 0) {
      this.telemetry.record({
        type: "CACHE_HIT",
        at: new Date().toISOString(),
        requestId: requestTraceId,
        metadata: { sourceCount: cached.length },
      });

      return {
        sources: cached,
        providersUsed: [
          ...new Set(
            cached.map((source) => source.provider || "CACHE"),
          ),
        ],
        cacheHit: true,
        fallbackCount: 0,
        requestTraceId,
      };
    }

    this.telemetry.record({
      type: "CACHE_MISS",
      at: new Date().toISOString(),
      requestId: requestTraceId,
    });

    const mode = inferReachResearchMode(request);
    const target = Math.min(
      Math.max(Math.floor(request.maxSources ?? 5), 1),
      20,
    );
    const needed = Math.min(
      target,
      Math.max(1, request.researchContract.minSources ?? 2),
    );

    const providersUsed: ReachProviderId[] = [];
    const collected: EvidenceSource[] = [];
    let fallbackCount = 0;

    for (const provider of this.orderedSearchProviders(mode)) {
      if (this.isOpen(provider)) {
        this.telemetry.record({
          type: "PROVIDER_SKIPPED",
          at: new Date().toISOString(),
          provider: provider.id,
          metadata: { reason: "CIRCUIT_OPEN" },
        });
        continue;
      }

      this.telemetry.record({
        type: "PROVIDER_SELECTED",
        at: new Date().toISOString(),
        provider: provider.id,
        requestId: requestTraceId,
        metadata: { mode },
      });

      try {
        const response = await this.retrySearch(
          provider,
          request,
          renderedQuery,
        );

        this.markSuccess(provider, response.durationMs);
        providersUsed.push(provider.id);
        collected.push(...response.sources);

        const deduped = deduplicateEvidenceSources(collected);
        if (deduped.length < collected.length) {
          this.telemetry.record({
            type: "EVIDENCE_DEDUPED",
            at: new Date().toISOString(),
            provider: provider.id,
            requestId: requestTraceId,
            metadata: {
              before: collected.length,
              after: deduped.length,
            },
          });
        }

        if (
          mode !== "CORROBORATION" &&
          deduped.length >= needed
        ) {
          collected.splice(0, collected.length, ...deduped);
          break;
        }

        if (
          mode === "CORROBORATION" &&
          providersUsed.length >= 2
        ) {
          collected.splice(
            0,
            collected.length,
            ...capCorroborationSources(
              deduped,
              Math.min(target, Math.max(needed, providersUsed.length)),
            ),
          );
          break;
        }
      } catch (error) {
        const budgetExhausted =
          error instanceof ReachProviderError &&
          error.message.startsWith("Provider budget exhausted for ");

        if (budgetExhausted) {
          this.telemetry.record({
            type: "PROVIDER_SKIPPED",
            at: new Date().toISOString(),
            provider: provider.id,
            requestId: requestTraceId,
            metadata: { reason: "BUDGET_EXHAUSTED" },
          });
        } else {
          this.markFailure(provider, error);
        }

        fallbackCount += 1;
        this.telemetry.record({
          type: "FALLBACK",
          at: new Date().toISOString(),
          provider: provider.id,
          requestId: requestTraceId,
          metadata: {
            reason: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    let dedupedSources = deduplicateEvidenceSources(collected);

    if (mode === "DEEP" && dedupedSources.length > 0) {
      const webProvider = this.providers.find(
        (provider): provider is DecodoWebScrapingProvider =>
          provider instanceof DecodoWebScrapingProvider,
      );

      if (webProvider && !this.isOpen(webProvider)) {
        const deepCount = Math.min(2, dedupedSources.length);

        for (const source of dedupedSources.slice(0, deepCount)) {
          const retrieved = await this.deepRetrieve(
            webProvider,
            request,
            renderedQuery,
            source,
          );

          if (retrieved) {
            collected.push(...retrieved.sources);
          }
        }

        dedupedSources = deduplicateEvidenceSources(collected);
      }
    }

    dedupedSources =
      mode === "CORROBORATION"
        ? capCorroborationSources(dedupedSources, target)
        : dedupedSources.slice(0, target);
    this.cache.set(request, renderedQuery, dedupedSources);

    return {
      sources: dedupedSources,
      providersUsed,
      cacheHit: false,
      fallbackCount,
      requestTraceId,
    };
  }
}
