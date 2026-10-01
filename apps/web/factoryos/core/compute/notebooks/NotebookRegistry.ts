import type {
  NotebookExecutionRequest,
  NotebookExecutionResult,
  NotebookProviderAdapter,
  NotebookProviderType,
  NotebookProvisionRequest,
  NotebookProvisionResult,
  NotebookRuntime,
  NotebookCredentialValidation,
} from "./NotebookContracts";
import { NotebookOperationJournal } from "./NotebookOperationJournal";

export class NotebookRegistry {
  private readonly adapters = new Map<NotebookProviderType, NotebookProviderAdapter>();
  readonly journal: NotebookOperationJournal;

  constructor(journal = new NotebookOperationJournal()) {
    this.journal = journal;
  }

  register(adapter: NotebookProviderAdapter): void {
    const type = adapter.metadata.providerType;
    if (this.adapters.has(type)) {
      throw new Error("Notebook provider already registered: " + type);
    }
    this.adapters.set(type, adapter);
  }

  registerOrReplace(adapter: NotebookProviderAdapter): void {
    this.adapters.set(adapter.metadata.providerType, adapter);
  }

  get(type: NotebookProviderType): NotebookProviderAdapter | undefined {
    return this.adapters.get(type);
  }

  list(): NotebookProviderAdapter[] {
    return [...this.adapters.values()];
  }

  metadata() {
    return this.list().map((adapter) => adapter.metadata);
  }

  async validateAll(): Promise<Record<NotebookProviderType, NotebookCredentialValidation>> {
    const result = {} as Record<NotebookProviderType, NotebookCredentialValidation>;
    for (const adapter of this.adapters.values()) {
      result[adapter.metadata.providerType] = await adapter.validateCredentials();
    }
    return result;
  }

  async provision(
    type: NotebookProviderType,
    request: NotebookProvisionRequest,
  ): Promise<NotebookProvisionResult> {
    const adapter = this.require(type);
    const op = this.journal.start({
      providerId: adapter.metadata.providerId,
      providerType: type,
      runtimeKind: adapter.metadata.runtimeKind,
      operation: "PROVISION",
      state: "REQUESTED",
      idempotencyKey: request.idempotencyKey,
      reconciliationRequired: false,
      metadata: {},
      requestPayload: request,
    });

    if (op.state === "UNKNOWN") {
      throw new Error("NOTEBOOK_PROVISION_RECONCILIATION_REQUIRED: " + op.operationId);
    }

    if (op.resourceId && ["READY", "RUNNING", "QUEUED", "STARTING"].includes(op.state)) {
      return {
        runtime: await adapter.getRuntime(op.resourceId),
        reconciliationRequired: op.reconciliationRequired,
        evidence: ["Reused durable notebook provision operation " + op.operationId + "."],
      };
    }

    try {
      const result = await adapter.provision(request);
      this.journal.transition(op.operationId, result.runtime.state, {
        resourceId: result.runtime.resourceId,
        reconciliationRequired: result.reconciliationRequired,
        metadata: {
          evidence: result.evidence,
          notebookUrl: result.runtime.notebookUrl,
        },
      });
      return result;
    } catch (error: any) {
      this.journal.transition(op.operationId, "FAILED", {
        reconciliationRequired: false,
        metadata: { error: error?.message || String(error) },
      });
      throw error;
    }
  }

  async execute(
    type: NotebookProviderType,
    request: NotebookExecutionRequest,
    idempotencyKey = "execute:" + type + ":" + Date.now(),
  ): Promise<NotebookExecutionResult> {
    const adapter = this.require(type);
    const op = this.journal.start({
      providerId: adapter.metadata.providerId,
      providerType: type,
      runtimeKind: adapter.metadata.runtimeKind,
      operation: "EXECUTE",
      state: "REQUESTED",
      idempotencyKey,
      reconciliationRequired: false,
      metadata: {},
      requestPayload: request,
    });

    try {
      const result = await adapter.execute(request);
      this.journal.transition(
        op.operationId,
        result.status === "SUCCEEDED"
          ? "SUCCEEDED"
          : result.status === "TIMED_OUT"
            ? "FAILED"
            : result.status === "UNAVAILABLE"
              ? "UNKNOWN"
              : "FAILED",
        {
          resourceId: result.runtimeId,
          metadata: {
            verificationLevel: result.verificationLevel,
            artifactSha256: result.artifactSha256,
            artifactByteLength: result.artifactByteLength,
            evidence: result.evidence,
            limitation: result.limitation,
          },
        },
      );
      return result;
    } catch (error: any) {
      this.journal.transition(op.operationId, "FAILED", {
        metadata: { error: error?.message || String(error) },
      });
      throw error;
    }
  }

  async terminate(type: NotebookProviderType, runtime: NotebookRuntime): Promise<NotebookRuntime> {
    const adapter = this.require(type);
    const op = this.journal.start({
      providerId: adapter.metadata.providerId,
      providerType: type,
      runtimeKind: adapter.metadata.runtimeKind,
      operation: "TERMINATE",
      state: "REQUESTED",
      idempotencyKey: "terminate:" + type + ":" + runtime.resourceId,
      resourceId: runtime.resourceId,
      reconciliationRequired: false,
      metadata: {},
      requestPayload: runtime,
    });

    const terminated = await adapter.terminate(runtime);
    this.journal.transition(op.operationId, terminated.state, {
      resourceId: terminated.resourceId,
    });
    return terminated;
  }

  private require(type: NotebookProviderType): NotebookProviderAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error("Notebook provider not registered: " + type);
    return adapter;
  }
}
