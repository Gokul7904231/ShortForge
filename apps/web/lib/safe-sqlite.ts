/**
 * Safe SQLite Wrapper (fail-closed)
 * =================================
 * Real better-sqlite3 when the native binding loads; otherwise a mock that is
 * ONLY reachable behind an explicit test/development opt-in. Production never
 * gets the mock: missing bindings throw instead of silently fake-succeeding.
 */

import fs from "fs";
import path from "path";

/** Thrown when native SQLite is required but its binding cannot load. */
export class SafeSqliteUnavailableError extends Error {
  constructor(dbFilePath: string, cause: string) {
    super(
      `[SafeSQLite] Native better-sqlite3 binding unavailable (${cause}); refusing to open ${dbFilePath} without real persistence. ` +
        `Fix: npm rebuild better-sqlite3 (Node runtime), or set SAFE_SQLITE_ALLOW_MOCK=1 outside production for explicitly dev-only stores.`
    );
    this.name = "SafeSqliteUnavailableError";
  }
}

/** Health/readiness probe: can native SQLite actually load in this runtime? */
export function getSqliteHealth(): { available: boolean; error?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3");
    const probe = new BetterSqlite3(":memory:");
    probe.close();
    return { available: true };
  } catch (err: any) {
    return { available: false, error: err?.message || String(err) };
  }
}

export interface SafeStatement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface SafeDatabase {
  exec(sql: string): this;
  pragma(pragma: string): any;
  prepare(sql: string): SafeStatement;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

class MockStatement implements SafeStatement {
  private store: Map<string, any[]>;
  private tableName: string;
  private sql: string;

  constructor(sql: string, store: Map<string, any[]>) {
    this.sql = sql.trim();
    this.store = store;
    
    // Extract table name heuristically
    const match = this.sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+([a-zA-Z0-9_]+)/i);
    this.tableName = match ? match[1] : "default";
    if (!this.store.has(this.tableName)) {
      this.store.set(this.tableName, []);
    }
  }

  get(...params: any[]): any {
    const records = this.store.get(this.tableName) || [];
    if (this.sql.toUpperCase().startsWith("SELECT")) {
      if (params.length === 0) return records[0] || undefined;
      // Simple lookup by first param
      const val = params[0];
      return records.find((r) => Object.values(r).some((v) => v === val)) || undefined;
    }
    return undefined;
  }

  all(...params: any[]): any[] {
    const records = this.store.get(this.tableName) || [];
    if (params.length === 0) return [...records];
    const val = params[0];
    return records.filter((r) => Object.values(r).some((v) => v === val));
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const records = this.store.get(this.tableName) || [];
    if (this.sql.toUpperCase().startsWith("INSERT")) {
      const record: Record<string, any> = { _id: Date.now() };
      params.forEach((p, idx) => {
        record[`col_${idx}`] = p;
        if (typeof p === "string" && p.length < 100) {
          record["id"] = p;
          record["key"] = p;
          record["job_id"] = p;
          record["text_hash"] = p;
        }
      });
      records.push(record);
      return { changes: 1, lastInsertRowid: Date.now() };
    }
    if (this.sql.toUpperCase().startsWith("UPDATE")) {
      return { changes: records.length, lastInsertRowid: 0 };
    }
    if (this.sql.toUpperCase().startsWith("DELETE")) {
      this.store.set(this.tableName, []);
      return { changes: 1, lastInsertRowid: 0 };
    }
    return { changes: 0, lastInsertRowid: 0 };
  }
}

class MockDatabase implements SafeDatabase {
  private store: Map<string, any[]> = new Map();
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  exec(_sql: string): this {
    return this;
  }

  pragma(_pragma: string): any {
    return [];
  }

  prepare(sql: string): SafeStatement {
    return new MockStatement(sql, this.store);
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return fn;
  }

  close(): void {}
}

/**
 * Creates or retrieves a SafeDatabase instance.
 *
 * Resolution order:
 *  1. Native better-sqlite3 — the only mode returned on production paths.
 *  2. In-memory mock — ONLY when explicitly opted in (allowMockFallback option or
 *     SAFE_SQLITE_ALLOW_MOCK=1) AND the process is not production. The mock loses
 *     all data on restart and its UPDATE/DELETE semantics are heuristic; callers
 *     that need durable or authoritative state must not enable it.
 *  3. Otherwise: throw SafeSqliteUnavailableError (fail closed).
 */
export function getSafeDatabase(
  dbFilePath: string,
  opts?: { allowMockFallback?: boolean }
): SafeDatabase {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3");
    const db = new BetterSqlite3(dbFilePath);
    return db;
  } catch (err: any) {
    const explicitDevOnly =
      (opts?.allowMockFallback === true || process.env.SAFE_SQLITE_ALLOW_MOCK === "1") &&
      process.env.NODE_ENV !== "production";
    if (!explicitDevOnly) {
      throw new SafeSqliteUnavailableError(dbFilePath, err.message);
    }
    console.warn(
      `[SafeSQLite] DEV-ONLY in-memory mock active for ${path.basename(dbFilePath)} (native binding missing: ${err.message}). Data is NOT durable and write results are fabricated.`
    );
    return new MockDatabase(dbFilePath);
  }
}

export default getSafeDatabase;
