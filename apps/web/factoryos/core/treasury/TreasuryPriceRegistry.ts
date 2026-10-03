/**
 * ShortForge / FactoryOS — Treasury Price Registry
 *
 * Prices are data, not authority. The registry never selects providers or grants
 * execution capabilities. Unknown or expired prices are surfaced explicitly.
 */

import type {
  TreasuryResourceKind,
  TreasuryResourceRequest,
  TreasuryQuote,
} from "./TreasuryContracts";

export interface TreasuryPrice {
  readonly priceId: string;
  readonly resourceKind: TreasuryResourceKind;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly unit: string;
  readonly priceUsd: number;
  readonly pricingSource: string;
  readonly effectiveFrom: string;
  readonly expiresAt: string;
  readonly pricingVersion: string;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW";
  readonly observedAt: string;
}

export interface TreasuryModelCostEstimate {
  readonly priced: boolean;
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly totalCostUsd: number;
  readonly pricingVersion: string;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNPRICED";
  readonly assumptions: readonly string[];
}

export interface TreasuryComputeCostEstimate {
  readonly priced: boolean;
  readonly totalCostUsd: number;
  readonly billableSeconds: number;
  readonly capacityUnits: number;
  readonly pricingVersion: string;
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNPRICED";
  readonly assumptions: readonly string[];
}

export class TreasuryPriceRegistry {
  private readonly prices = new Map<string, TreasuryPrice>();

  register(price: TreasuryPrice): void {
    if (!price.priceId) throw new Error("TreasuryPriceRegistry: priceId is required");
    if (!Number.isFinite(price.priceUsd) || price.priceUsd < 0) {
      throw new Error("TreasuryPriceRegistry: priceUsd must be finite and >= 0");
    }
    if (new Date(price.expiresAt).getTime() <= new Date(price.effectiveFrom).getTime()) {
      throw new Error("TreasuryPriceRegistry: expiresAt must be after effectiveFrom");
    }
    this.prices.set(price.priceId, structuredClone(price));
  }

  get(priceId: string): TreasuryPrice | undefined {
    const price = this.prices.get(priceId);
    return price ? structuredClone(price) : undefined;
  }

  listActive(now = new Date()): TreasuryPrice[] {
    const at = now.getTime();
    return [...this.prices.values()]
      .filter((price) => {
        const start = new Date(price.effectiveFrom).getTime();
        const end = new Date(price.expiresAt).getTime();
        return start <= at && at < end;
      })
      .map((price) => structuredClone(price));
  }

  registerModelPricing(input: {
    providerId: string;
    modelId: string;
    inputUsdPer1MTokens: number;
    outputUsdPer1MTokens: number;
    pricingSource: string;
    pricingVersion: string;
    confidence?: "HIGH" | "MEDIUM" | "LOW";
    ttlMs?: number;
    now?: Date;
  }): void {
    const now = input.now ?? new Date();
    const ttlMs = Math.max(60_000, input.ttlMs ?? 10 * 60_000);
    const common = {
      resourceKind: "INFERENCE" as const,
      providerId: input.providerId,
      modelId: input.modelId,
      pricingSource: input.pricingSource,
      pricingVersion: input.pricingVersion,
      confidence: input.confidence ?? "MEDIUM",
      observedAt: now.toISOString(),
      effectiveFrom: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    this.register({
      ...common,
      priceId: `model:${input.providerId}:${input.modelId}:input:${input.pricingVersion}`,
      unit: "1M_INPUT_TOKENS",
      priceUsd: input.inputUsdPer1MTokens,
    });
    this.register({
      ...common,
      priceId: `model:${input.providerId}:${input.modelId}:output:${input.pricingVersion}`,
      unit: "1M_OUTPUT_TOKENS",
      priceUsd: input.outputUsdPer1MTokens,
    });
  }

  estimateModelInvocation(
    providerId: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    now = new Date(),
  ): TreasuryModelCostEstimate {
    const assumptions: string[] = [];
    const active = this.listActive(now);
    const input = active.find(
      (p) => p.resourceKind === "INFERENCE" &&
        p.providerId === providerId &&
        p.modelId === modelId &&
        p.unit === "1M_INPUT_TOKENS",
    );
    const output = active.find(
      (p) => p.resourceKind === "INFERENCE" &&
        p.providerId === providerId &&
        p.modelId === modelId &&
        p.unit === "1M_OUTPUT_TOKENS",
    );

    if (!input || !output) {
      if (!input) assumptions.push("Missing active model input-token price");
      if (!output) assumptions.push("Missing active model output-token price");
      return {
        priced: false,
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
        pricingVersion: "UNPRICED",
        confidence: "UNPRICED",
        assumptions,
      };
    }

    const inputCostUsd = (Math.max(0, inputTokens) / 1_000_000) * input.priceUsd;
    const outputCostUsd = (Math.max(0, outputTokens) / 1_000_000) * output.priceUsd;
    const confidence = input.confidence === "LOW" || output.confidence === "LOW"
      ? "LOW"
      : input.confidence === "MEDIUM" || output.confidence === "MEDIUM"
        ? "MEDIUM"
        : "HIGH";

    return {
      priced: true,
      inputCostUsd,
      outputCostUsd,
      totalCostUsd: inputCostUsd + outputCostUsd,
      pricingVersion: [input.pricingVersion, output.pricingVersion].sort().join("|"),
      confidence,
      assumptions,
    };
  }

  estimateComputeOffer(
    offer: import("../compute/api/ProviderApiContracts").ComputeOffer,
    durationSeconds: number,
    now = new Date(),
  ): TreasuryComputeCostEstimate {
    const seconds = Math.max(0, durationSeconds);
    const minimumBilledSeconds = Math.max(
      0,
      offer.pricing?.minimumBilledSeconds ?? 0,
    );
    const billableSeconds = Math.max(seconds, minimumBilledSeconds);
    const hourly = offer.pricing?.currency === undefined || offer.pricing.currency === "USD"
      ? offer.pricing?.hourly
      : undefined;
    const assumptions: string[] = [];

    if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= now.getTime()) {
      assumptions.push("Compute offer is expired");
      return {
        priced: false,
        totalCostUsd: 0,
        billableSeconds,
        capacityUnits: 0,
        pricingVersion: "EXPIRED_OFFER",
        confidence: "UNPRICED",
        assumptions,
      };
    }

    if (hourly === undefined || !Number.isFinite(hourly) || hourly < 0) {
      assumptions.push("Compute offer has no active USD hourly price");
      return {
        priced: false,
        totalCostUsd: 0,
        billableSeconds,
        capacityUnits: 0,
        pricingVersion: "UNPRICED",
        confidence: "UNPRICED",
        assumptions,
      };
    }

    const gpuCount = Math.max(0, offer.accelerator?.count ?? 0);
    const capacityUnits = Math.max(
      1,
      Math.ceil(seconds * Math.max(1, gpuCount)),
    );
    const confidence = offer.capacityConfidence === "LIVE" ? "HIGH"
      : offer.capacityConfidence === "DECLARED" ? "MEDIUM"
      : "LOW";

    return {
      priced: true,
      totalCostUsd: (billableSeconds / 3600) * hourly,
      billableSeconds,
      capacityUnits,
      pricingVersion: `offer:${offer.offerId}`,
      confidence,
      assumptions,
    };
  }

  /**
   * Produces an advisory quote from known prices. This does not authorize or reserve.
   * Callers should prefer an explicit worst-case budget envelope when price coverage is incomplete.
   */
  quote(
    commandId: string,
    expiresAt: string,
    requests: readonly TreasuryResourceRequest[],
    upperBoundCostUsd: number,
    upperBoundCapacityUnits: number,
    now = new Date(),
  ): TreasuryQuote {
    const active = this.listActive(now);
    const assumptions: string[] = [];
    let pricingConfidence: TreasuryQuote["pricingConfidence"] = "HIGH";

    for (const request of requests) {
      const matches = active.filter(
        (price) =>
          price.resourceKind === request.kind &&
          (!request.providerId || !price.providerId || price.providerId === request.providerId) &&
          (!request.modelId || !price.modelId || price.modelId === request.modelId),
      );

      if (matches.length === 0) {
        assumptions.push(`No active price for ${request.kind}${request.providerId ? `/${request.providerId}` : ""}`);
        pricingConfidence = "UNPRICED";
      } else if (matches.some((price) => price.confidence === "LOW")) {
        pricingConfidence = pricingConfidence === "HIGH" ? "LOW" : pricingConfidence;
      }
    }

    return {
      quoteId: `tquote_${commandId}`,
      commandId,
      quotedAt: now.toISOString(),
      expiresAt,
      upperBoundCostUsd,
      upperBoundCapacityUnits,
      pricingVersion: active.length > 0
        ? [...new Set(active.map((price) => price.pricingVersion))].sort().join(",")
        : "UNPRICED",
      pricingConfidence,
      assumptions,
    };
  }
}
