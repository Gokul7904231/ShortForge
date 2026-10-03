/**
 * ShortForge / FactoryOS — Treasury Price Registry
 *
 * Prices are data, not authority. The registry never selects providers or grants
 * execution capabilities. Unknown or expired prices are surfaced explicitly.
 */

import type { TreasuryResourceKind, TreasuryResourceRequest, TreasuryQuote } from "./TreasuryContracts";

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
