import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import getSafeDatabase, { type SafeDatabase } from "../../../../lib/safe-sqlite";
import type { EpistemicBudget, EpistemicUsage } from "./EpistemicContracts";

export interface EpistemicBudgetReservationRequest {
  readonly scopeKey: string;
  readonly budget: EpistemicBudget;
  readonly usage: EpistemicUsage;
  readonly mode: "MICRO" | "DEEP";
  readonly costUnits: number;
  readonly estimatedTimeMs: number;
  readonly ttlMs?: number;
}

export interface EpistemicBudgetReservation {
  readonly reservationId: string;
  readonly scopeKey: string;
  readonly mode: "MICRO" | "DEEP";
  readonly costUnits: number;
  readonly estimatedTimeMs: number;
  readonly expiresAt: number;
}

export interface EpistemicBudgetReservationStore {
  reserve(request: EpistemicBudgetReservationRequest, now?: number): EpistemicBudgetReservation | null;
  release(reservationId: string): boolean;
  commit(reservationId: string): boolean;
  list(scopeKey?: string, now?: number): readonly EpistemicBudgetReservation[];
  clear(): void;
}

function normalizeRequest(request: EpistemicBudgetReservationRequest) {
  if (!request.scopeKey.trim()) throw new Error("[AER budget] scopeKey is required");
  return {
    scopeKey: request.scopeKey.trim(),
    costUnits: Math.max(0, request.costUnits),
    estimatedTimeMs: Math.max(0, request.estimatedTimeMs),
    ttlMs: Math.max(1000, request.ttlMs ?? 30000),
  };
}

function available(request: EpistemicBudgetReservationRequest, reserved: readonly EpistemicBudgetReservation[]): boolean {
  const normalized = normalizeRequest(request);
  const reservedCost = reserved.reduce((sum, item) => sum + item.costUnits, 0);
  const reservedTimeMs = reserved.reduce((sum, item) => sum + item.estimatedTimeMs, 0);
  const reservedDeep = reserved.filter((item) => item.mode === "DEEP").length;
  const reservedMicro = reserved.filter((item) => item.mode === "MICRO").length;
  return (
    request.usage.costUnits + reservedCost + normalized.costUnits <= request.budget.maxCostUnits &&
    request.usage.elapsedMs + reservedTimeMs + normalized.estimatedTimeMs <= request.budget.maxEpistemicTimeMs &&
    request.usage.deepCalls + reservedDeep + (request.mode === "DEEP" ? 1 : 0) <= request.budget.maxDeepCalls &&
    request.usage.microCalls + reservedMicro + (request.mode === "MICRO" ? 1 : 0) <= request.budget.maxMicroCalls
  );
}

function pruneExpired(map: Map<string, EpistemicBudgetReservation>, now: number): void {
  for (const [id, reservation] of map) {
    if (reservation.expiresAt <= now) map.delete(id);
  }
}

export class InMemoryEpistemicBudgetReservationStore implements EpistemicBudgetReservationStore {
  private readonly reservations = new Map<string, EpistemicBudgetReservation>();

  public reserve(request: EpistemicBudgetReservationRequest, now = Date.now()): EpistemicBudgetReservation | null {
    const normalized = normalizeRequest(request);
    pruneExpired(this.reservations, now);
    const active = [...this.reservations.values()].filter((item) => item.scopeKey === normalized.scopeKey);
    if (!available(request, active)) return null;
    const reservation: EpistemicBudgetReservation = {
      reservationId: "aer_resv_" + randomUUID().replace(/-/g, "").slice(0, 16),
      scopeKey: normalized.scopeKey,
      mode: request.mode,
      costUnits: normalized.costUnits,
      estimatedTimeMs: normalized.estimatedTimeMs,
      expiresAt: now + normalized.ttlMs,
    };
    this.reservations.set(reservation.reservationId, reservation);
    return { ...reservation };
  }

  public release(reservationId: string): boolean { return this.reservations.delete(reservationId); }
  public commit(reservationId: string): boolean { return this.reservations.delete(reservationId); }

  public list(scopeKey?: string, now = Date.now()): readonly EpistemicBudgetReservation[] {
    pruneExpired(this.reservations, now);
    return [...this.reservations.values()].filter((item) => !scopeKey || item.scopeKey === scopeKey).map((item) => ({ ...item }));
  }

  public clear(): void { this.reservations.clear(); }
}

/**
 * SQLite-backed reservation store for multi-process deployments.
 * Uses one SQLite transaction for expiry cleanup, budget calculation, and insert.
 */
export class DurableEpistemicBudgetReservationStore implements EpistemicBudgetReservationStore {
  private readonly db: SafeDatabase;

  public constructor(dbPath?: string) {
    const defaultDir = path.resolve(process.cwd(), "data", "factoryos_state");
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    this.db = getSafeDatabase(dbPath ?? path.join(defaultDir, "aer_budget_reservations.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS aer_budget_reservations (" +
      "reservation_id TEXT PRIMARY KEY," +
      "scope_key TEXT NOT NULL," +
      "mode TEXT NOT NULL," +
      "cost_units REAL NOT NULL," +
      "estimated_time_ms REAL NOT NULL," +
      "expires_at INTEGER NOT NULL," +
      "created_at INTEGER NOT NULL" +
      ")"
    );
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_aer_budget_scope ON aer_budget_reservations(scope_key)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_aer_budget_expiry ON aer_budget_reservations(expires_at)");
  }

  public reserve(request: EpistemicBudgetReservationRequest, now = Date.now()): EpistemicBudgetReservation | null {
    const normalized = normalizeRequest(request);
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM aer_budget_reservations WHERE expires_at <= ?").run(now);
      const rows = this.db.prepare(        "SELECT reservation_id, scope_key, mode, cost_units, estimated_time_ms, expires_at " +        "FROM aer_budget_reservations WHERE scope_key = ? AND expires_at > ?"      ).all(normalized.scopeKey, now) as Array<{ reservation_id: string; scope_key: string; mode: "MICRO" | "DEEP"; cost_units: number; estimated_time_ms: number; expires_at: number; }>;
      const active: EpistemicBudgetReservation[] = rows.map((row) => ({
        reservationId: row.reservation_id,
        scopeKey: row.scope_key,
        mode: row.mode,
        costUnits: row.cost_units,
        estimatedTimeMs: row.estimated_time_ms,
        expiresAt: row.expires_at,
      }));
      if (!available(request, active)) return null;
      const reservation: EpistemicBudgetReservation = {
        reservationId: "aer_resv_" + randomUUID().replace(/-/g, "").slice(0, 16),
        scopeKey: normalized.scopeKey,
        mode: request.mode,
        costUnits: normalized.costUnits,
        estimatedTimeMs: normalized.estimatedTimeMs,
        expiresAt: now + normalized.ttlMs,
      };
      this.db.prepare(        "INSERT INTO aer_budget_reservations (" +        "reservation_id, scope_key, mode, cost_units, estimated_time_ms, expires_at, created_at) " +        "VALUES (?, ?, ?, ?, ?, ?, ?)"      ).run(reservation.reservationId, reservation.scopeKey, reservation.mode, reservation.costUnits, reservation.estimatedTimeMs, reservation.expiresAt, now);
      return reservation;
    });
    return transaction() as EpistemicBudgetReservation | null;
  }

  public release(reservationId: string): boolean {
    return this.db.prepare("DELETE FROM aer_budget_reservations WHERE reservation_id = ?").run(reservationId).changes === 1;
  }
  public commit(reservationId: string): boolean { return this.release(reservationId); }

  public list(scopeKey?: string, now = Date.now()): readonly EpistemicBudgetReservation[] {
    this.db.prepare("DELETE FROM aer_budget_reservations WHERE expires_at <= ?").run(now);
    const rows = scopeKey
      ? this.db.prepare(          "SELECT reservation_id, scope_key, mode, cost_units, estimated_time_ms, expires_at " +          "FROM aer_budget_reservations WHERE scope_key = ? AND expires_at > ? ORDER BY created_at ASC"        ).all(scopeKey, now)
      : this.db.prepare(          "SELECT reservation_id, scope_key, mode, cost_units, estimated_time_ms, expires_at " +          "FROM aer_budget_reservations WHERE expires_at > ? ORDER BY created_at ASC"        ).all(now);
    return (rows as Array<{ reservation_id: string; scope_key: string; mode: "MICRO" | "DEEP"; cost_units: number; estimated_time_ms: number; expires_at: number; }>).map((row) => ({
      reservationId: row.reservation_id,
      scopeKey: row.scope_key,
      mode: row.mode,
      costUnits: row.cost_units,
      estimatedTimeMs: row.estimated_time_ms,
      expiresAt: row.expires_at,
    }));
  }

  public clear(): void { this.db.exec("DELETE FROM aer_budget_reservations"); }
  public close(): void { this.db.close(); }
}