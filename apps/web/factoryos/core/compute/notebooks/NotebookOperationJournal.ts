import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import getSafeDatabase, { type SafeDatabase } from "../../../../lib/safe-sqlite";
import type {
  NotebookProviderType,
  NotebookResourceState,
  NotebookRuntimeKind,
} from "./NotebookContracts";

export interface NotebookOperationRecord {
  operationId: string;
  providerId: string;
  providerType: NotebookProviderType;
  runtimeKind: NotebookRuntimeKind;
  operation: "PROVISION" | "EXECUTE" | "TERMINATE" | "RECONCILE";
  state: NotebookResourceState;
  idempotencyKey: string;
  requestHash: string;
  resourceId?: string;
  requestedAt: string;
  completedAt?: string;
  reconciliationRequired: boolean;
  metadata: Record<string, unknown>;
}

export class NotebookOperationJournal {
  private readonly db: SafeDatabase;

  constructor(dbPath?: string) {
    const dir = path.resolve(process.cwd(), "data", "factoryos_state");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = getSafeDatabase(
      dbPath ?? path.join(dir, "notebook_operations.db"),
    );
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.db.exec(
      "CREATE TABLE IF NOT EXISTS notebook_operations (" +
      "operation_id TEXT PRIMARY KEY," +
      "provider_id TEXT NOT NULL," +
      "provider_type TEXT NOT NULL," +
      "runtime_kind TEXT NOT NULL," +
      "operation TEXT NOT NULL," +
      "state TEXT NOT NULL," +
      "idempotency_key TEXT NOT NULL," +
      "request_hash TEXT NOT NULL," +
      "resource_id TEXT," +
      "requested_at TEXT NOT NULL," +
      "completed_at TEXT," +
      "reconciliation_required INTEGER NOT NULL DEFAULT 0," +
      "metadata_json TEXT NOT NULL" +
      ");" +
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_notebook_idempotency " +
      "ON notebook_operations(provider_id, idempotency_key);" +
      "CREATE INDEX IF NOT EXISTS idx_notebook_open " +
      "ON notebook_operations(provider_type, state);"
    );
  }

  start(
    input: Omit<
      NotebookOperationRecord,
      "operationId" | "requestHash" | "requestedAt" | "completedAt"
    > & { requestPayload: unknown },
  ): NotebookOperationRecord {
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input.requestPayload))
      .digest("hex");

    const existing = this.find(input.providerId, input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new Error(
          "NOTEBOOK_IDEMPOTENCY_KEY_REUSE_CONFLICT: " +
            input.providerId + ":" + input.idempotencyKey,
        );
      }
      return existing;
    }

    const record: NotebookOperationRecord = {
      operationId: "nop_" + randomUUID().replace(/-/g, "").slice(0, 20),
      providerId: input.providerId,
      providerType: input.providerType,
      runtimeKind: input.runtimeKind,
      operation: input.operation,
      state: input.state,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resourceId: input.resourceId,
      requestedAt: new Date().toISOString(),
      reconciliationRequired: input.reconciliationRequired,
      metadata: input.metadata || {},
    };

    this.db.prepare(
      "INSERT OR IGNORE INTO notebook_operations (" +
      "operation_id, provider_id, provider_type, runtime_kind, operation, " +
      "state, idempotency_key, request_hash, resource_id, requested_at, " +
      "completed_at, reconciliation_required, metadata_json) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      record.operationId,
      record.providerId,
      record.providerType,
      record.runtimeKind,
      record.operation,
      record.state,
      record.idempotencyKey,
      record.requestHash,
      record.resourceId || null,
      record.requestedAt,
      null,
      record.reconciliationRequired ? 1 : 0,
      JSON.stringify(record.metadata),
    );

    const persisted =
      this.get(record.operationId) ??
      this.find(record.providerId, record.idempotencyKey);

    if (!persisted) {
      throw new Error("Notebook operation journal insert was not persisted.");
    }
    return persisted;
  }

  find(providerId: string, idempotencyKey: string): NotebookOperationRecord | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM notebook_operations WHERE provider_id = ? AND idempotency_key = ?",
      )
      .get(providerId, idempotencyKey) as any;
    return row ? this.fromRow(row) : undefined;
  }

  get(operationId: string): NotebookOperationRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM notebook_operations WHERE operation_id = ?")
      .get(operationId) as any;
    return row ? this.fromRow(row) : undefined;
  }

  transition(
    operationId: string,
    state: NotebookResourceState,
    patch: Partial<NotebookOperationRecord> = {},
  ): NotebookOperationRecord {
    const current = this.get(operationId);
    if (!current) throw new Error("Notebook operation not found: " + operationId);

    const next = {
      ...current,
      ...patch,
      state,
      completedAt:
        ["SUCCEEDED", "FAILED", "TIMED_OUT", "TERMINATED"].includes(state)
          ? patch.completedAt || new Date().toISOString()
          : patch.completedAt || current.completedAt,
    };

    this.db.prepare(
      "UPDATE notebook_operations SET state = ?, resource_id = ?, " +
      "completed_at = ?, reconciliation_required = ?, metadata_json = ? " +
      "WHERE operation_id = ?"
    ).run(
      next.state,
      next.resourceId || null,
      next.completedAt || null,
      next.reconciliationRequired ? 1 : 0,
      JSON.stringify(next.metadata || {}),
      operationId,
    );

    return next;
  }

  close(): void {
    this.db.close();
  }

  private fromRow(row: any): NotebookOperationRecord {
    return {
      operationId: row.operation_id,
      providerId: row.provider_id,
      providerType: row.provider_type,
      runtimeKind: row.runtime_kind,
      operation: row.operation,
      state: row.state,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      resourceId: row.resource_id || undefined,
      requestedAt: row.requested_at,
      completedAt: row.completed_at || undefined,
      reconciliationRequired: Boolean(row.reconciliation_required),
      metadata: JSON.parse(row.metadata_json || "{}"),
    };
  }
}
