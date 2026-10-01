import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import getSafeDatabase, { type SafeDatabase } from "../../../lib/safe-sqlite";
import type {
  ApiProviderType,
  ProviderOperationRecord,
  ProviderOperationState,
  ProviderOperationType,
} from "./ProviderApiContracts";

export interface StartOperationRequest {
  factoryExecutionId?: string;
  missionId?: string;
  providerId: string;
  providerType: ApiProviderType;
  operation: ProviderOperationType;
  idempotencyKey: string;
  requestPayload: unknown;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export class ProviderApiOperationJournal {
  private readonly db: SafeDatabase;

  constructor(dbPath?: string) {
    const dir = path.resolve(process.cwd(), "data", "factoryos_state");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = getSafeDatabase(
      dbPath ?? path.join(dir, "provider_api_operations.db"),
    );
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_api_operations (
        operation_id TEXT PRIMARY KEY,
        factory_execution_id TEXT,
        mission_id TEXT,
        provider_id TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        operation TEXT NOT NULL,
        state TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        external_operation_id TEXT,
        external_resource_id TEXT,
        requested_at TEXT NOT NULL,
        accepted_at TEXT,
        ready_at TEXT,
        completed_at TEXT,
        expires_at TEXT,
        provider_status TEXT,
        provider_request_id TEXT,
        provider_error_code TEXT,
        provider_error_message TEXT,
        reconciliation_required INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_api_idempotency
        ON provider_api_operations(provider_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_provider_api_open
        ON provider_api_operations(provider_type, state);
    `);
  }

  start(request: StartOperationRequest): ProviderOperationRecord {
    const existing = this.findByIdempotencyKey(
      request.providerId,
      request.idempotencyKey,
    );
    if (existing) return existing;

    const record: ProviderOperationRecord = {
      operationId: `pop_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      factoryExecutionId: request.factoryExecutionId,
      missionId: request.missionId,
      providerId: request.providerId,
      providerType: request.providerType,
      operation: request.operation,
      state: "REQUESTED",
      idempotencyKey: request.idempotencyKey,
      requestHash: createHash("sha256")
        .update(JSON.stringify(request.requestPayload))
        .digest("hex"),
      attempt: 1,
      requestedAt: new Date().toISOString(),
      expiresAt: request.expiresAt,
      reconciliationRequired: false,
      metadata: request.metadata || {},
    };

    this.db.prepare(`
      INSERT OR IGNORE INTO provider_api_operations (
        operation_id, factory_execution_id, mission_id, provider_id,
        provider_type, operation, state, idempotency_key, request_hash,
        attempt, requested_at, expires_at, reconciliation_required, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.operationId,
      record.factoryExecutionId || null,
      record.missionId || null,
      record.providerId,
      record.providerType,
      record.operation,
      record.state,
      record.idempotencyKey,
      record.requestHash,
      record.attempt,
      record.requestedAt,
      record.expiresAt || null,
      0,
      JSON.stringify(record.metadata),
    );

    const persisted = this.get(record.operationId);
    if (persisted) return persisted;
    // Another process won the provider/idempotency key race.
    const raced = this.findByIdempotencyKey(
      request.providerId,
      request.idempotencyKey,
    );
    if (raced) return raced;
    throw new Error("Provider operation journal insert was not persisted.");
  }

  findByIdempotencyKey(
    providerId: string,
    idempotencyKey: string,
  ): ProviderOperationRecord | undefined {
    const row = this.db.prepare(
      "SELECT * FROM provider_api_operations WHERE provider_id = ? AND idempotency_key = ?",
    ).get(providerId, idempotencyKey) as any;
    return row ? this.fromRow(row) : undefined;
  }

  get(operationId: string): ProviderOperationRecord | undefined {
    const row = this.db.prepare(
      "SELECT * FROM provider_api_operations WHERE operation_id = ?",
    ).get(operationId) as any;
    return row ? this.fromRow(row) : undefined;
  }

  transition(
    operationId: string,
    state: ProviderOperationState,
    patch: Partial<ProviderOperationRecord> = {},
  ): ProviderOperationRecord {
    const current = this.get(operationId);
    if (!current) throw new Error(`Provider operation not found: ${operationId}`);

    const next: ProviderOperationRecord = {
      ...current,
      ...patch,
      state,
      completedAt:
        state === "COMPLETED" || state === "FAILED" || state === "TERMINATED"
          ? patch.completedAt || new Date().toISOString()
          : patch.completedAt || current.completedAt,
    };

    this.db.prepare(`
      UPDATE provider_api_operations
      SET state = ?, accepted_at = ?, ready_at = ?, completed_at = ?,
          external_operation_id = ?, external_resource_id = ?,
          provider_status = ?, provider_request_id = ?,
          provider_error_code = ?, provider_error_message = ?,
          reconciliation_required = ?, metadata_json = ?
      WHERE operation_id = ?
    `).run(
      next.state,
      next.acceptedAt || null,
      next.readyAt || null,
      next.completedAt || null,
      next.externalOperationId || null,
      next.externalResourceId || null,
      next.providerStatus || null,
      next.providerRequestId || null,
      next.providerErrorCode || null,
      next.providerErrorMessage || null,
      next.reconciliationRequired ? 1 : 0,
      JSON.stringify(next.metadata || {}),
      operationId,
    );

    return next;
  }

  listOpen(providerType?: ApiProviderType): ProviderOperationRecord[] {
    const rows = providerType
      ? this.db.prepare(
          "SELECT * FROM provider_api_operations WHERE provider_type = ? AND state IN ('REQUESTED','ACCEPTED','PROVISIONING','UNKNOWN','TERMINATING') ORDER BY requested_at ASC",
        ).all(providerType)
      : this.db.prepare(
          "SELECT * FROM provider_api_operations WHERE state IN ('REQUESTED','ACCEPTED','PROVISIONING','UNKNOWN','TERMINATING') ORDER BY requested_at ASC",
        ).all();
    return (rows as any[]).map((row) => this.fromRow(row));
  }

  close(): void {
    this.db.close();
  }

  private fromRow(row: any): ProviderOperationRecord {
    return {
      operationId: row.operation_id,
      factoryExecutionId: row.factory_execution_id || undefined,
      missionId: row.mission_id || undefined,
      providerId: row.provider_id,
      providerType: row.provider_type,
      operation: row.operation,
      state: row.state,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      attempt: Number(row.attempt),
      externalOperationId: row.external_operation_id || undefined,
      externalResourceId: row.external_resource_id || undefined,
      requestedAt: row.requested_at,
      acceptedAt: row.accepted_at || undefined,
      readyAt: row.ready_at || undefined,
      completedAt: row.completed_at || undefined,
      expiresAt: row.expires_at || undefined,
      providerStatus: row.provider_status || undefined,
      providerRequestId: row.provider_request_id || undefined,
      providerErrorCode: row.provider_error_code || undefined,
      providerErrorMessage: row.provider_error_message || undefined,
      reconciliationRequired: Boolean(row.reconciliation_required),
      metadata: JSON.parse(row.metadata_json || "{}"),
    };
  }
}
