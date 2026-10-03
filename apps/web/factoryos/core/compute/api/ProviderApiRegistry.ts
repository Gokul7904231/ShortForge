import type {
  ApiProviderType,
  ComputeOffer,
  CredentialValidationResult,
  OfferDiscoveryRequest,
  ProviderAccountContext,
  ProviderApiMetadata,
  ProviderControlAdapter,
  ProviderQuota,
  ProviderResource,
  ProvisionAccepted,
  ProvisionRequest,
  ReconciliationResult,
  ResourceReference,
  TerminateRequest,
  TerminationResult,
} from "./ProviderApiContracts";
import { ProviderApiOperationJournal } from "./ProviderApiOperationJournal";
import { ProviderApiError } from "./ProviderApiTransport";
import type { TreasuryEconomicAdmission, TreasuryAdmissionContext } from "../../treasury/TreasuryEconomicAdmission";
import type { TreasuryBudgetEnvelope, TreasuryEconomicPermit, TreasuryReservation } from "../../treasury/TreasuryContracts";

export class ProviderApiRegistry {
  private readonly adapters = new Map<ApiProviderType, ProviderControlAdapter>();
  readonly journal: ProviderApiOperationJournal;

  constructor(journal = new ProviderApiOperationJournal()) {
    this.journal = journal;
  }

  register(adapter: ProviderControlAdapter): void {
    const type = adapter.metadata.providerType;
    if (this.adapters.has(type)) {
      throw new Error(`API provider already registered: ${type}`);
    }
    this.adapters.set(type, adapter);
  }

  registerOrReplace(adapter: ProviderControlAdapter): void {
    this.adapters.set(adapter.metadata.providerType, adapter);
  }

  get(type: ApiProviderType): ProviderControlAdapter | undefined {
    return this.adapters.get(type);
  }

  list(): ProviderControlAdapter[] {
    return [...this.adapters.values()];
  }

  metadata(): ProviderApiMetadata[] {
    return this.list().map((a) => a.metadata);
  }

  async validateAll(): Promise<Record<ApiProviderType, CredentialValidationResult>> {
    const result = {} as Record<ApiProviderType, CredentialValidationResult>;
    for (const adapter of this.adapters.values()) {
      result[adapter.metadata.providerType] =
        await adapter.validateCredentials();
    }
    return result;
  }

  async getAccountContext(type: ApiProviderType): Promise<ProviderAccountContext> {
    return this.require(type).getAccountContext();
  }

  async getQuota(type: ApiProviderType): Promise<ProviderQuota> {
    return this.require(type).getQuota();
  }

  async discoverOffers(
    type: ApiProviderType,
    request: OfferDiscoveryRequest = {},
  ): Promise<ComputeOffer[]> {
    const adapter = this.require(type);
    const operation = this.journal.start({
      providerId: adapter.metadata.providerId,
      providerType: type,
      operation: "DISCOVER_OFFERS",
      idempotencyKey: `discover:${type}:${JSON.stringify(request)}`,
      requestPayload: request,
    });
    this.journal.transition(operation.operationId, "ACCEPTED", {
      acceptedAt: new Date().toISOString(),
    });
    try {
      const offers = await adapter.discoverOffers(request);
      this.journal.transition(operation.operationId, "COMPLETED", {
        completedAt: new Date().toISOString(),
        metadata: { count: offers.length },
      });
      return offers;
    } catch (error: any) {
      this.journal.transition(operation.operationId, "FAILED", {
        providerErrorCode: error?.providerCode,
        providerErrorMessage: error?.message || String(error),
        providerRequestId: error?.providerRequestId,
        reconciliationRequired: false,
      });
      throw error;
    }
  }

  async provision(
    type: ApiProviderType,
    request: ProvisionRequest,
  ): Promise<ProvisionAccepted> {
    const adapter = this.require(type);
    const operation = this.journal.start({
      factoryExecutionId: request.factoryExecutionId,
      missionId: request.missionId,
      providerId: adapter.metadata.providerId,
      providerType: type,
      operation: "PROVISION",
      idempotencyKey: request.idempotencyKey,
      requestPayload: request,
      expiresAt: request.maxDurationSeconds
        ? new Date(Date.now() + request.maxDurationSeconds * 1000).toISOString()
        : undefined,
    });

    if (operation.state !== "REQUESTED") {
      if (operation.state === "UNKNOWN") {
        throw new Error(
          `PROVISION_RECONCILIATION_REQUIRED: ${operation.operationId}`,
        );
      }
      if (
        operation.state === "FAILED" ||
        operation.state === "TERMINATED"
      ) {
        throw new Error(
          `PROVISION_IDEMPOTENCY_KEY_ALREADY_COMPLETED: ${operation.operationId}`,
        );
      }
      if (operation.externalResourceId) {
        const resource = await adapter.getResource(operation.externalResourceId);
        const state =
          resource.state === "READY" || resource.state === "RUNNING"
            ? "READY"
            : resource.state === "TERMINATED"
              ? "TERMINATED"
              : "UNKNOWN";
        return {
          operationId: operation.operationId,
          reference: {
            providerId: adapter.metadata.providerId,
            providerType: type,
            resourceId: operation.externalResourceId,
            idempotencyKey: request.idempotencyKey,
            operationId: operation.operationId,
          },
          state,
          acceptedAt: operation.acceptedAt || operation.requestedAt,
          reconciliationRequired: state === "UNKNOWN",
        };
      }
    }

    try {
      const result = await adapter.provision(request);
      this.journal.transition(operation.operationId, "PROVISIONING", {
        acceptedAt: new Date().toISOString(),
        externalResourceId: result.reference.resourceId,
        providerRequestId: result.providerRequestId,
        reconciliationRequired: result.reconciliationRequired,
        metadata: result.rawResponse || {},
      });
      if (result.state === "READY") {
        this.journal.transition(operation.operationId, "READY", {
          readyAt: new Date().toISOString(),
          reconciliationRequired: false,
        });
      }
      return {
        ...result,
        operationId: operation.operationId,
        reference: {
          ...result.reference,
          operationId: operation.operationId,
          idempotencyKey: request.idempotencyKey,
        },
      };
    } catch (error: any) {
      const ambiguous = error instanceof ProviderApiError && error.ambiguous;
      if (ambiguous && adapter.reconcileProvision) {
        try {
          const recovered = await adapter.reconcileProvision(request, operation);
          if (recovered) {
            this.journal.transition(operation.operationId, "PROVISIONING", {
              externalResourceId: recovered.reference.resourceId,
              acceptedAt: new Date().toISOString(),
              reconciliationRequired: recovered.reconciliationRequired,
              metadata: recovered.rawResponse || {},
            });
            if (recovered.state === "READY") {
              this.journal.transition(operation.operationId, "READY", {
                readyAt: new Date().toISOString(),
                reconciliationRequired: false,
              });
            }
            return {
              ...recovered,
              operationId: operation.operationId,
              reference: {
                ...recovered.reference,
                operationId: operation.operationId,
                idempotencyKey: request.idempotencyKey,
              },
            };
          }
        } catch {}
      }
      this.journal.transition(
        operation.operationId,
        ambiguous ? "UNKNOWN" : "FAILED",
        {
          providerRequestId: error?.providerRequestId,
          providerErrorCode: error?.providerCode,
          providerErrorMessage: error?.message || String(error),
          reconciliationRequired: ambiguous,
        },
      );
      throw error;
    }
  }

  async renderProbe(
    type: ApiProviderType,
    request: import("./ProviderApiContracts").RenderProbeRequest,
    factoryExecutionId?: string,
    missionId?: string,
  ): Promise<import("./ProviderApiContracts").RenderProbeResult> {
    const adapter = this.require(type);
    if (!adapter.renderProbe) {
      throw new Error(`API provider ${type} does not expose a render probe.`);
    }
    const idempotencyKey = `render-probe:${type}:${Date.now()}:${request.gpuType || "default"}`;
    const operation = this.journal.start({
      factoryExecutionId,
      missionId,
      providerId: adapter.metadata.providerId,
      providerType: type,
      operation: "RENDER_PROBE",
      idempotencyKey,
      requestPayload: request,
    });

    try {
      const result = await adapter.renderProbe(request);
      this.journal.transition(operation.operationId, "COMPLETED", {
        completedAt: new Date().toISOString(),
        reconciliationRequired: false,
        metadata: {
          passed: result.passed,
          verificationLevel: result.verificationLevel,
          resourceId: result.resourceId,
          artifactSha256: result.artifactSha256,
          artifactByteLength: result.artifactByteLength,
          evidence: result.evidence,
          limitation: result.limitation,
        },
      });
      return result;
    } catch (error: any) {
      this.journal.transition(operation.operationId, "FAILED", {
        providerRequestId: error?.providerRequestId,
        providerErrorCode: error?.providerCode,
        providerErrorMessage: error?.message || String(error),
        reconciliationRequired: false,
      });
      throw error;
    }
  }

  /**
   * Economically gated provisioning seam.
   *
   * Offer selection remains outside this registry. Treasury admits the exact
   * offer first; this registry then performs the physical provider mutation.
   */
  async provisionWithTreasury(
    type: ApiProviderType,
    request: ProvisionRequest,
    offer: ComputeOffer,
    admission: TreasuryEconomicAdmission,
    context: TreasuryAdmissionContext,
    budget: TreasuryBudgetEnvelope,
    durationSeconds: number,
  ): Promise<{
    provision: ProvisionAccepted;
    reservation: TreasuryReservation;
    permit: TreasuryEconomicPermit;
    estimatedCostUsd: number;
  }> {
    if (offer.providerType !== type) {
      throw new Error(
        "Treasury compute admission provider type does not match provisioning target",
      );
    }
    if (offer.offerId !== request.offerId) {
      throw new Error(
        "Treasury compute admission offerId does not match provisioning request",
      );
    }

    const admitted = await admission.reserveComputeOffer(
      context,
      offer,
      durationSeconds,
      budget,
    );

    try {
      const provision = await this.provision({
        ...request,
        missionId: request.missionId ?? context.missionId,
      });

      return {
        provision,
        reservation: admitted.reservation,
        permit: admitted.permit,
        estimatedCostUsd: admitted.admission.estimate.totalCostUsd,
      };
    } catch (error) {
      const ambiguous =
        error instanceof ProviderApiError && error.ambiguous;
      if (!ambiguous) {
        await admission.releaseReservation(
          admitted.reservation.reservationId,
          "PROVISION_FAILED",
        ).catch(() => {});
      }
      throw error;
    }
  }

  async getResource(
    type: ApiProviderType,
    resourceId: string,
  ): Promise<ProviderResource> {
    return this.require(type).getResource(resourceId);
  }

  async terminate(
    type: ApiProviderType,
    request: TerminateRequest,
  ): Promise<TerminationResult> {
    const adapter = this.require(type);
    const operation = this.journal.start({
      providerId: adapter.metadata.providerId,
      providerType: type,
      operation: "TERMINATE",
      idempotencyKey:
        request.reference.idempotencyKey ||
        `terminate:${type}:${request.reference.resourceId}`,
      requestPayload: request,
    });
    this.journal.transition(operation.operationId, "TERMINATING");
    try {
      const result = await adapter.terminate({
        ...request,
        operationId: operation.operationId,
      });
      this.journal.transition(
        operation.operationId,
        result.state === "TERMINATED" ? "TERMINATED" : "TERMINATING",
        {
          completedAt: result.completedAt,
          reconciliationRequired: result.reconciliationRequired,
        },
      );
      return { ...result, operationId: operation.operationId };
    } catch (error: any) {
      // DELETE is semantically idempotent: an already-absent resource is
      // considered terminated rather than a failed destructive mutation.
      if (error?.status === 404) {
        this.journal.transition(operation.operationId, "TERMINATED", {
          completedAt: new Date().toISOString(),
          reconciliationRequired: false,
        });
        return {
          operationId: operation.operationId,
          reference: request.reference,
          state: "TERMINATED",
          completedAt: new Date().toISOString(),
          reconciliationRequired: false,
        };
      }
      const ambiguous = error instanceof ProviderApiError && error.ambiguous;
      this.journal.transition(
        operation.operationId,
        ambiguous ? "UNKNOWN" : "FAILED",
        {
          providerRequestId: error?.providerRequestId,
          providerErrorCode: error?.providerCode,
          providerErrorMessage: error?.message || String(error),
          reconciliationRequired: ambiguous,
        },
      );
      throw error;
    }
  }

  async reconcile(reference: ResourceReference): Promise<ReconciliationResult> {
    const adapter = this.require(reference.providerType);
    const result = await adapter.reconcile(reference);
    const op = reference.operationId ? this.journal.get(reference.operationId) : undefined;
    if (op) {
      const state =
        result.currentState === "READY" || result.currentState === "RUNNING"
          ? "READY"
          : result.currentState === "TERMINATED"
            ? "TERMINATED"
            : result.currentState === "FAILED"
              ? "FAILED"
              : "UNKNOWN";
      this.journal.transition(op.operationId, state, {
        externalResourceId: reference.resourceId,
        reconciliationRequired: result.reconciliationRequired,
        readyAt:
          state === "READY" ? op.readyAt || new Date().toISOString() : op.readyAt,
      });
    }
    return result;
  }

  private require(type: ApiProviderType): ProviderControlAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`API provider not registered: ${type}`);
    return adapter;
  }
}
