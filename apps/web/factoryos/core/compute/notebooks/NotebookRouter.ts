import type {
  NotebookPaymentRequirement,
  NotebookProviderAdapter,
  NotebookProviderType,
} from "./NotebookContracts";

export interface NotebookRoutingRequest {
  gpuRequired?: boolean;
  codeExecutionRequired?: boolean;
  persistenceRequired?: boolean;
  noCardOnly?: boolean;
  providerAllowlist?: NotebookProviderType[];
}

export interface NotebookRoutingCandidate {
  providerType: NotebookProviderType;
  admitted: boolean;
  reasons: string[];
}

export interface NotebookRoutingDecision {
  admitted: boolean;
  selectedProvider?: NotebookProviderType;
  candidates: NotebookRoutingCandidate[];
}

export class NotebookRouter {
  constructor(private readonly adapters: NotebookProviderAdapter[]) {}

  route(request: NotebookRoutingRequest = {}): NotebookRoutingDecision {
    const candidates = this.adapters.map((adapter) => {
      const reasons: string[] = [];
      const meta = adapter.metadata;

      if (
        request.providerAllowlist &&
        !request.providerAllowlist.includes(meta.providerType)
      ) {
        reasons.push("provider-not-allowlisted");
      }

      if (request.gpuRequired && !meta.capabilities.supportsGpu) {
        reasons.push("gpu-not-supported");
      }

      if (
        request.codeExecutionRequired &&
        !meta.capabilities.canExecuteCode
      ) {
        reasons.push("code-execution-not-supported");
      }

      if (
        request.persistenceRequired &&
        !meta.capabilities.supportsPersistence
      ) {
        reasons.push("persistence-not-supported");
      }

      if (
        request.noCardOnly &&
        !this.isNoCardEligible(meta.paymentRequirement)
      ) {
        reasons.push("no-card-not-established");
      }

      if (meta.capabilities.productionWorkerEligible) {
        reasons.push("worker-promotion-requires-separate-gate");
      }

      return {
        providerType: meta.providerType,
        admitted: reasons.length === 0,
        reasons,
      };
    });

    const selected = candidates.find((candidate) => candidate.admitted);

    return {
      admitted: Boolean(selected),
      selectedProvider: selected?.providerType,
      candidates,
    };
  }

  private isNoCardEligible(
    requirement: NotebookPaymentRequirement,
  ): boolean {
    return requirement === "NO_CARD_STATED";
  }
}
