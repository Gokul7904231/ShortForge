import { describe, expect, it, vi } from "vitest";
import {
  InMemoryTreasuryLedger,
  TreasuryKernel,
  TreasuryService,
  createTreasuryAccount,
} from "../core/treasury";
import { TreasuryPriceRegistry } from "../core/treasury/TreasuryPriceRegistry";
import {
  TreasuryEconomicAdmission,
  type TreasuryAdmissionContext,
} from "../core/treasury/TreasuryEconomicAdmission";
import { ProviderApiError } from "../core/compute/api/ProviderApiTransport";
import {
  ProviderApiRegistry,
  type ProviderControlAdapter,
  type ComputeOffer,
  type ProvisionAccepted,
  type ProviderResource,
  type ReconciliationResult,
  type ResourceReference,
  type TerminationResult,
  type CredentialValidationResult,
  type ProviderAccountContext,
  type ProviderQuota,
} from "../core/compute/api";

function context(taskId = "task-economic-1"): TreasuryAdmissionContext {
  return {
    accountId: "factory",
    overseerCommandId: "ovr-economic-1",
    missionId: "mission-economic-1",
    runId: "run-economic-1",
    floorId: "floor06_rendering",
    taskId,
    priority: "HIGH",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    maxRetries: 0,
    scopeFingerprint: "scope-economic-1",
  };
}

function makeTreasury(): TreasuryService {
  const ledger = new InMemoryTreasuryLedger();
  ledger.seedAccount(createTreasuryAccount("factory", 10, 5000));
  return new TreasuryService(
    new TreasuryKernel(ledger, new TreasuryPriceRegistry()),
  );
}

function offer(): ComputeOffer {
  return {
    offerId: "offer-runpod-1",
    providerId: "provider-runpod",
    providerType: "RUNPOD",
    discoveryKind: "DYNAMIC_MARKETPLACE",
    capacityConfidence: "LIVE",
    observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    compute: { cpuCores: 8, memoryMb: 32768, diskGb: 50 },
    accelerator: { type: "A100", count: 1, vramMb: 40960 },
    pricing: { hourly: 0.36, currency: "USD", minimumBilledSeconds: 60 },
    capabilities: {
      customImage: true,
      startupCommand: true,
      commandExecutionByApi: true,
      fileReadByApi: true,
    },
    providerMetadata: {},
  };
}

function reference(): ResourceReference {
  return {
    providerId: "provider-runpod",
    providerType: "RUNPOD",
    resourceId: "resource-1",
    idempotencyKey: "provision-1",
    operationId: "op-1",
  };
}

function provisionAccepted(): ProvisionAccepted {
  return {
    operationId: "op-1",
    reference: reference(),
    state: "READY",
    acceptedAt: new Date().toISOString(),
    reconciliationRequired: false,
  };
}

function resource(): ProviderResource {
  return {
    reference: reference(),
    state: "READY",
    updatedAt: new Date().toISOString(),
  };
}

function reconciliation(): ReconciliationResult {
  return {
    reference: reference(),
    currentState: "READY",
    found: true,
    adopted: false,
    terminal: false,
    reconciliationRequired: false,
    evidence: [],
  };
}

describe("Treasury model/API and ComputeOffer admission", () => {
  it("admits a priced paid model and rejects it when the Treasury envelope is too small", async () => {
    const treasury = makeTreasury();
    const admission = new TreasuryEconomicAdmission(treasury);
    treasury.getPriceRegistry().registerModelPricing({
      providerId: "groq",
      modelId: "llama-test",
      inputUsdPer1MTokens: 0.5,
      outputUsdPer1MTokens: 1,
      pricingSource: "TEST_FIXTURE",
      pricingVersion: "provider-price-v1",
      confidence: "HIGH",
      ttlMs: 60_000,
    });

    const candidate = {
      providerId: "groq",
      modelId: "llama-test",
      capability: "SCRIPT",
      isPaid: true,
      inputTokens: 1000,
      outputTokens: 2000,
      pricingSource: "TEST_FIXTURE",
      pricingVersion: "provider-price-v1",
      inputUsdPer1MTokens: 0.5,
      outputUsdPer1MTokens: 1,
    };

    expect(
      admission.assessModelCandidate(candidate, {
        maxCostUsd: 0.01,
        maxTokens: 5000,
        maxCapacityUnits: 5000,
      }).admissible,
    ).toBe(true);

    expect(
      admission.assessModelCandidate(candidate, {
        maxCostUsd: 0.0001,
        maxTokens: 5000,
        maxCapacityUnits: 5000,
      }).admissible,
    ).toBe(false);

    const reserved = await admission.reserveModelInvocation(
      context(),
      candidate,
      {
        maxCostUsd: 0.01,
        maxTokens: 5000,
        maxCapacityUnits: 5000,
        maxRetries: 0,
      },
    );

    expect(reserved.permit.scopeDigest).toMatch(/^sha256:/);
    expect(reserved.permit.maxCostUsd).toBeCloseTo(0.0025, 8);
  });

  it("rejects reuse of a terminal model-attempt idempotency key", async () => {
    const treasury = makeTreasury();
    const admission = new TreasuryEconomicAdmission(treasury);
    treasury.getPriceRegistry().registerModelPricing({
      providerId: "groq",
      modelId: "llama-terminal",
      inputUsdPer1MTokens: 1,
      outputUsdPer1MTokens: 1,
      pricingSource: "TEST_FIXTURE",
      pricingVersion: "terminal-v1",
      confidence: "HIGH",
      ttlMs: 60_000,
    });

    const candidate = {
      providerId: "groq",
      modelId: "llama-terminal",
      capability: "SCRIPT",
      isPaid: true,
      inputTokens: 1000,
      outputTokens: 1000,
      pricingSource: "TEST_FIXTURE",
      pricingVersion: "terminal-v1",
      inputUsdPer1MTokens: 1,
      outputUsdPer1MTokens: 1,
    };
    const fixedAttemptContext = {
      ...context("task-terminal-idempotency"),
      attemptId: "task-terminal-idempotency:attempt:1",
    };
    const reserved = await admission.reserveModelInvocation(
      fixedAttemptContext,
      candidate,
      { maxCostUsd: 0.01, maxTokens: 5000, maxCapacityUnits: 0 },
    );

    await treasury.settle(reserved.reservation.reservationId, {
      reservationId: reserved.reservation.reservationId,
      actualCostUsd: 0.002,
      actualCapacityUnits: 0,
      actualTokens: 2000,
      executionEvidenceId: "evidence-terminal",
      verified: false,
      measuredAt: new Date().toISOString(),
    });

    await expect(
      admission.reserveModelInvocation(
        fixedAttemptContext,
        candidate,
        { maxCostUsd: 0.01, maxTokens: 5000, maxCapacityUnits: 0 },
      ),
    ).rejects.toThrow(/already finalized|finalized/);
  });

  it("treats a zero-priced compute offer as scarce capacity rather than unlimited", () => {
    const treasury = makeTreasury();
    const admission = new TreasuryEconomicAdmission(treasury);
    const candidate = {
      ...offer(),
      pricing: { hourly: 0, currency: "USD", minimumBilledSeconds: 60 },
    };

    const result = admission.assessComputeOffer(
      candidate,
      30,
      { maxCostUsd: 0, maxCapacityUnits: 30 },
    );

    expect(result.admissible).toBe(true);
    expect(result.estimate.totalCostUsd).toBe(0);
    expect(result.estimate.capacityUnits).toBe(30);
  });

  it("gates provider provisioning before the provider mutation and releases on normal failure", async () => {
    const treasury = makeTreasury();
    const admission = new TreasuryEconomicAdmission(treasury);
    const registry = new ProviderApiRegistry();

    const adapter: ProviderControlAdapter = {
      metadata: {
        providerId: "provider-runpod",
        providerType: "RUNPOD",
        apiVersion: "v1",
        discoveryKind: "DYNAMIC_MARKETPLACE",
        baseUrl: "https://example.invalid",
        documentationUrl: "https://example.invalid/docs",
        controlCapabilities: {
          canValidateCredentials: true,
          canDiscoverOffers: true,
          canReadResource: true,
          canProvision: true,
          canTerminate: true,
          canConfigureEntrypointByApi: true,
          canExecuteCommandByApi: true,
          canReadLogsByApi: true,
          canReadFilesByApi: true,
          canVerifyPhysicalRenderByApi: false,
        },
      },
      validateCredentials: vi.fn<() => Promise<CredentialValidationResult>>(async () => ({
        configured: true,
        authenticated: true,
        providerReachable: true,
        requiredKeys: [],
        missingKeys: [],
        checkedAt: new Date().toISOString(),
      })),
      getAccountContext: vi.fn<() => Promise<ProviderAccountContext>>(async () => ({
        providerId: "provider-runpod",
        metadata: {},
      })),
      getQuota: vi.fn<() => Promise<ProviderQuota>>(async () => ({
        known: true,
        observedAt: new Date().toISOString(),
        source: "PROVIDER_API",
      })),
      discoverOffers: vi.fn(async () => [offer()]),
      provision: vi.fn(async () => provisionAccepted()),
      getResource: vi.fn(async () => resource()),
      terminate: vi.fn(async (): Promise<TerminationResult> => ({
        operationId: "op-term",
        reference: reference(),
        state: "TERMINATED",
        reconciliationRequired: false,
      })),
      reconcile: vi.fn(async () => reconciliation()),
    };

    registry.register(adapter);

    const result = await registry.provisionWithTreasury(
      "RUNPOD",
      {
        factoryExecutionId: "factory-economic-1",
        missionId: "mission-economic-1",
        idempotencyKey: "provision-1",
        offerId: offer().offerId,
        image: "shortforge/worker:test",
        maxDurationSeconds: 60,
      },
      offer(),
      admission,
      context("task-provision-1"),
      { maxCostUsd: 0.1, maxCapacityUnits: 60, maxDurationMs: 60_000 },
      60,
    );

    expect(adapter.provision).toHaveBeenCalledTimes(1);
    expect(result.permit.reservationId).toBe(result.reservation.reservationId);
    expect((await treasury.report("factory")).activeReservations).toBe(1);

    (adapter.provision as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("provider rejected"),
    );

    await expect(
      registry.provisionWithTreasury(
        "RUNPOD",
        {
          factoryExecutionId: "factory-economic-2",
          missionId: "mission-economic-1",
          idempotencyKey: "provision-2",
          offerId: offer().offerId,
          image: "shortforge/worker:test",
          maxDurationSeconds: 60,
        },
        offer(),
        admission,
        context("task-provision-2"),
        { maxCostUsd: 0.1, maxCapacityUnits: 60, maxDurationMs: 60_000 },
        60,
      ),
    ).rejects.toThrow("provider rejected");

    expect((await treasury.report("factory")).activeReservations).toBe(1);
  });

  it("keeps an ambiguous provisioning reservation active for reconciliation", async () => {
    const treasury = makeTreasury();
    const admission = new TreasuryEconomicAdmission(treasury);
    const registry = new ProviderApiRegistry();

    const adapter: ProviderControlAdapter = {
      metadata: {
        providerId: "provider-runpod",
        providerType: "RUNPOD",
        apiVersion: "v1",
        discoveryKind: "DYNAMIC_MARKETPLACE",
        baseUrl: "https://example.invalid",
        documentationUrl: "https://example.invalid/docs",
        controlCapabilities: {
          canValidateCredentials: true,
          canDiscoverOffers: true,
          canReadResource: true,
          canProvision: true,
          canTerminate: true,
          canConfigureEntrypointByApi: true,
          canExecuteCommandByApi: true,
          canReadLogsByApi: true,
          canReadFilesByApi: true,
          canVerifyPhysicalRenderByApi: false,
        },
      },
      validateCredentials: vi.fn(async () => ({
        configured: true, authenticated: true, providerReachable: true,
        requiredKeys: [], missingKeys: [], checkedAt: new Date().toISOString(),
      })),
      getAccountContext: vi.fn(async () => ({ providerId: "provider-runpod", metadata: {} })),
      getQuota: vi.fn(async () => ({ known: true, observedAt: new Date().toISOString(), source: "PROVIDER_API" as const })),
      discoverOffers: vi.fn(async () => [offer()]),
      provision: vi.fn(async () => {
        throw new ProviderApiError("timeout", { ambiguous: true, retryable: false });
      }),
      getResource: vi.fn(async () => resource()),
      terminate: vi.fn(async (): Promise<TerminationResult> => ({
        operationId: "op-term",
        reference: reference(),
        state: "TERMINATED",
        reconciliationRequired: false,
      })),
      reconcile: vi.fn(async () => reconciliation()),
    };

    registry.register(adapter);

    await expect(
      registry.provisionWithTreasury(
        "RUNPOD",
        {
          factoryExecutionId: "factory-economic-3",
          missionId: "mission-economic-1",
          idempotencyKey: "provision-3",
          offerId: offer().offerId,
          image: "shortforge/worker:test",
          maxDurationSeconds: 60,
        },
        offer(),
        admission,
        context("task-provision-3"),
        { maxCostUsd: 0.1, maxCapacityUnits: 60, maxDurationMs: 60_000 },
        60,
      ),
    ).rejects.toThrow("timeout");

    expect((await treasury.report("factory")).activeReservations).toBe(1);
  });
});
