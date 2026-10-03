/**
 * ShortForge / FactoryOS — Treasury Economic Admission
 *
 * Economic admission is separate from selection:
 *   Router evaluates capability, quality, latency and availability.
 *   Treasurer decides whether an economic candidate may consume resources.
 *
 * This service never selects providers or workers. It only prices, assesses,
 * reserves and returns economic permits.
 */

import type {
  TreasuryBudgetEnvelope,
  TreasuryEconomicPermit,
  TreasuryPriority,
  TreasuryResourceRequest,
  TreasuryReservation,
} from "./TreasuryContracts";
import type { TreasuryService } from "./TreasuryService";
import { computeTreasuryEconomicScopeDigest } from "./TreasuryScope";
import type {
  TreasuryPriceRegistry,
  TreasuryModelCostEstimate,
  TreasuryComputeCostEstimate,
} from "./TreasuryPriceRegistry";
import type { ComputeOffer } from "../compute/api/ProviderApiContracts";

export interface TreasuryAdmissionContext {
  readonly accountId: string;
  readonly overseerCommandId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly floorId?: string;
  readonly taskId: string;
  readonly attemptId?: string;
  readonly priority: TreasuryPriority;
  readonly expiresAt: string;
  readonly maxRetries?: number;
  readonly scopeFingerprint: string;
}

export interface TreasuryModelCandidate {
  readonly providerId: string;
  readonly modelId: string;
  readonly capability: string;
  readonly isPaid: boolean;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly pricingSource: string;
  readonly pricingVersion: string;
  readonly inputUsdPer1MTokens: number;
  readonly outputUsdPer1MTokens: number;
}

export interface TreasuryModelAdmission {
  readonly admissible: boolean;
  readonly reason?: string;
  readonly estimatedCostUsd: number;
  readonly estimatedTokens: number;
  readonly pricing: TreasuryModelCostEstimate;
}

export interface TreasuryComputeOfferAdmission {
  readonly admissible: boolean;
  readonly reason?: string;
  readonly estimate: TreasuryComputeCostEstimate;
}

export class TreasuryEconomicAdmission {
  constructor(
    private readonly service: TreasuryService,
    private readonly priceRegistry: TreasuryPriceRegistry = service.getPriceRegistry(),
  ) {}

  registerModelCandidatePricing(candidate: TreasuryModelCandidate, now = new Date()): void {
    this.priceRegistry.registerModelPricing({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      inputUsdPer1MTokens: Math.max(0, candidate.inputUsdPer1MTokens),
      outputUsdPer1MTokens: Math.max(0, candidate.outputUsdPer1MTokens),
      pricingSource: candidate.pricingSource,
      pricingVersion: candidate.pricingVersion,
      confidence: candidate.pricingSource === "PROVIDER_API" ? "HIGH" : "MEDIUM",
      now,
    });
  }

  assessModelCandidate(
    candidate: TreasuryModelCandidate,
    budget: TreasuryBudgetEnvelope,
    now = new Date(),
  ): TreasuryModelAdmission {
    const estimatedTokens =
      Math.max(0, candidate.inputTokens) + Math.max(0, candidate.outputTokens);

    if (candidate.isPaid === false) {
      return {
        admissible: true,
        estimatedCostUsd: 0,
        estimatedTokens,
        pricing: {
          priced: true,
          inputCostUsd: 0,
          outputCostUsd: 0,
          totalCostUsd: 0,
          pricingVersion: candidate.pricingVersion,
          confidence: "HIGH",
          assumptions: [
            "Candidate declared non-paid; monetary admission is zero, capacity remains token-bounded.",
          ],
        },
      };
    }

    this.registerModelCandidatePricing(candidate, now);
    const pricing = this.priceRegistry.estimateModelInvocation(
      candidate.providerId,
      candidate.modelId,
      candidate.inputTokens,
      candidate.outputTokens,
      now,
    );

    if (!pricing.priced) {
      return {
        admissible: false,
        reason: "Paid model has no active authoritative Treasury price.",
        estimatedCostUsd: 0,
        estimatedTokens,
        pricing,
      };
    }

    if (pricing.totalCostUsd > budget.maxCostUsd) {
      return {
        admissible: false,
        reason:
          "Estimated model cost $" +
          pricing.totalCostUsd.toFixed(6) +
          " exceeds Treasury envelope $" +
          budget.maxCostUsd.toFixed(6) +
          ".",
        estimatedCostUsd: pricing.totalCostUsd,
        estimatedTokens,
        pricing,
      };
    }

    return {
      admissible: true,
      estimatedCostUsd: pricing.totalCostUsd,
      estimatedTokens,
      pricing,
    };
  }

  async releaseReservation(
    reservationId: string,
    reason: string,
  ): Promise<TreasuryReservation> {
    return this.service.release(reservationId, reason);
  }

  async reserveModelInvocation(
    context: TreasuryAdmissionContext,
    candidate: TreasuryModelCandidate,
    budget: TreasuryBudgetEnvelope,
  ): Promise<{
    reservation: TreasuryReservation;
    permit: TreasuryEconomicPermit;
    admission: TreasuryModelAdmission;
  }> {
    const now = new Date();
    const admission = this.assessModelCandidate(candidate, budget, now);
    if (!admission.admissible) {
      throw new Error(
        "Treasury model admission denied: " + admission.reason,
      );
    }

    const attemptId =
      context.attemptId ||
      context.taskId +
        ":inference:" +
        candidate.providerId +
        ":" +
        candidate.modelId +
        ":" +
        Date.now();

    const scopeDigest = computeTreasuryEconomicScopeDigest({
      version: 1,
      kind: "INFERENCE",
      missionId: context.missionId,
      jobId: context.taskId,
      floorId: context.floorId || "inference",
      overseerCommandId: context.overseerCommandId,
      scopeFingerprint: context.scopeFingerprint,
      resourceId: candidate.providerId + ":" + candidate.modelId,
    });

    const resourceRequest: TreasuryResourceRequest = {
      kind: "INFERENCE",
      quantity: admission.estimatedTokens,
      unit: "TOKENS",
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      metadata: {
        capability: candidate.capability,
        pricingVersion: candidate.pricingVersion,
        estimatedCostUsd: admission.estimatedCostUsd,
      },
      scarcityUnits: admission.estimatedTokens,
      verificationRequired: false,
      paidRoute: candidate.isPaid,
    };

    const response = await this.service.reserve({
      commandId:
        "treasury-inference-" +
        context.taskId +
        "-" +
        Date.now(),
      overseerCommandId: context.overseerCommandId,
      issuer: {
        authority: "OVERSEER",
        issuerId: context.overseerCommandId,
      },
      accountId: context.accountId,
      missionId: context.missionId,
      runId: context.runId,
      floorId: context.floorId,
      taskId: context.taskId,
      attemptId,
      purpose:
        "Inference: " +
        candidate.capability +
        " via " +
        candidate.providerId +
        "/" +
        candidate.modelId,
      resourceRequest: [resourceRequest],
      budgetEnvelope: {
        ...budget,
        maxCostUsd: Math.min(
          budget.maxCostUsd,
          Math.max(admission.estimatedCostUsd, 0),
        ),
        maxTokens: budget.maxTokens ?? admission.estimatedTokens,
        maxCapacityUnits:
          budget.maxCapacityUnits ?? admission.estimatedTokens,
        maxRetries: budget.maxRetries ?? context.maxRetries ?? 0,
      },
      priority: context.priority,
      expiresAt: context.expiresAt,
      idempotencyKey:
        "inference:" +
        context.missionId +
        ":" +
        context.taskId +
        ":" +
        attemptId +
        ":" +
        context.scopeFingerprint,
      scopeDigest,
    });

    return {
      reservation: response.reservation,
      permit: response.permit,
      admission,
    };
  }

  assessComputeOffer(
    offer: ComputeOffer,
    durationSeconds: number,
    budget: TreasuryBudgetEnvelope,
    now = new Date(),
  ): TreasuryComputeOfferAdmission {
    const estimate = this.priceRegistry.estimateComputeOffer(
      offer,
      durationSeconds,
      now,
    );

    if (
      offer.expiresAt &&
      new Date(offer.expiresAt).getTime() <= now.getTime()
    ) {
      return {
        admissible: false,
        reason: "ComputeOffer is expired.",
        estimate,
      };
    }

    if (!estimate.priced) {
      return {
        admissible: false,
        reason: "ComputeOffer lacks an active USD price usable by Treasury.",
        estimate,
      };
    }

    if (estimate.totalCostUsd > budget.maxCostUsd) {
      return {
        admissible: false,
        reason:
          "Offer cost $" +
          estimate.totalCostUsd.toFixed(6) +
          " exceeds Treasury envelope $" +
          budget.maxCostUsd.toFixed(6) +
          ".",
        estimate,
      };
    }

    if (
      budget.maxCapacityUnits !== undefined &&
      estimate.capacityUnits > budget.maxCapacityUnits
    ) {
      return {
        admissible: false,
        reason:
          "Offer capacity " +
          estimate.capacityUnits +
          " exceeds Treasury envelope " +
          budget.maxCapacityUnits +
          ".",
        estimate,
      };
    }

    return {
      admissible: true,
      estimate,
    };
  }

  async reserveComputeOffer(
    context: TreasuryAdmissionContext,
    offer: ComputeOffer,
    durationSeconds: number,
    budget: TreasuryBudgetEnvelope,
  ): Promise<{
    reservation: TreasuryReservation;
    permit: TreasuryEconomicPermit;
    admission: TreasuryComputeOfferAdmission;
  }> {
    const now = new Date();
    const admission = this.assessComputeOffer(
      offer,
      durationSeconds,
      budget,
      now,
    );

    if (!admission.admissible) {
      throw new Error(
        "Treasury compute-offer admission denied: " + admission.reason,
      );
    }

    const scopeDigest = computeTreasuryEconomicScopeDigest({
      version: 1,
      kind: "COMPUTE_OFFER",
      missionId: context.missionId,
      jobId: context.taskId,
      floorId: context.floorId || "floor06_rendering",
      overseerCommandId: context.overseerCommandId,
      scopeFingerprint: context.scopeFingerprint,
      resourceId: offer.offerId,
    });

    const resourceRequest: TreasuryResourceRequest = {
      kind: "COMPUTE",
      quantity: admission.estimate.billableSeconds,
      unit: "SECONDS",
      providerId: offer.providerId,
      workloadType: "COMPUTE_OFFER",
      requiresGpu: Boolean(offer.accelerator?.count),
      scarcityUnits: admission.estimate.capacityUnits,
      verificationRequired: false,
      paidRoute: (offer.pricing?.hourly ?? 0) > 0,
      metadata: {
        offerId: offer.offerId,
        providerType: offer.providerType,
        pricingVersion: admission.estimate.pricingVersion,
        billableSeconds: admission.estimate.billableSeconds,
      },
    };

    const response = await this.service.reserve({
      commandId:
        "treasury-compute-offer-" +
        offer.offerId +
        "-" +
        context.taskId +
        "-" +
        Date.now(),
      overseerCommandId: context.overseerCommandId,
      issuer: {
        authority: "OVERSEER",
        issuerId: context.overseerCommandId,
      },
      accountId: context.accountId,
      missionId: context.missionId,
      runId: context.runId,
      floorId: context.floorId || "floor06_rendering",
      taskId: context.taskId,
      attemptId:
        context.attemptId ||
        context.taskId + ":compute:" + offer.offerId + ":" + Date.now(),
      purpose:
        "Provision compute offer " +
        offer.offerId +
        " on " +
        offer.providerId,
      resourceRequest: [resourceRequest],
      budgetEnvelope: {
        ...budget,
        maxCostUsd: Math.min(
          budget.maxCostUsd,
          admission.estimate.totalCostUsd,
        ),
        maxCapacityUnits:
          budget.maxCapacityUnits ?? admission.estimate.capacityUnits,
        maxDurationMs:
          budget.maxDurationMs ??
          Math.ceil(admission.estimate.billableSeconds * 1000),
      },
      priority: context.priority,
      expiresAt: context.expiresAt,
      idempotencyKey:
        "compute-offer:" +
        context.missionId +
        ":" +
        context.taskId +
        ":" +
        context.attemptId +
        ":" +
        offer.offerId +
        ":" +
        context.scopeFingerprint,
      scopeDigest,
    });

    return {
      reservation: response.reservation,
      permit: response.permit,
      admission,
    };
  }
}
