import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface BreakerSnapshot {
  state: BreakerState;
  windowSize: number;
  sampleCount: number;
  failureCount: number;
  failureRate: number;
  openedAtMs: number | null;
}

export class ControlPlaneCircuitBreaker {
  private readonly db: Database.Database;
  private readonly windowSize: number;
  private readonly failureThreshold: number;
  private readonly minSamples: number;
  private readonly cooldownMs: number;
  private readonly nowMs: () => number;

  public constructor(options?: {
    dbPath?: string;
    windowSize?: number;
    failureThreshold?: number;
    minSamples?: number;
    cooldownMs?: number;
    nowMs?: () => number;
  }) {
    const dbPath =
      options?.dbPath ||
      process.env.INSTABOX_BREAKER_DB ||
      path.join(process.cwd(), "data", "factoryos_state", "circuit_breaker.sqlite3");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.windowSize = options?.windowSize ?? 50;
    this.failureThreshold = options?.failureThreshold ?? 0.2;
    this.minSamples = options?.minSamples ?? 10;
    this.cooldownMs = options?.cooldownMs ?? 60_000;
    this.nowMs = options?.nowMs ?? (() => Date.now());

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS breaker_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ok INTEGER NOT NULL,
        ts_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS breaker_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state TEXT NOT NULL,
        opened_at_ms INTEGER,
        probe_in_flight INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO breaker_meta (id, state, opened_at_ms, probe_in_flight)
      VALUES (1, 'CLOSED', NULL, 0);
    `);
  }

  public static getInstance(dbPath?: string): ControlPlaneCircuitBreaker {
    const key = Symbol.for("factoryos.instabox.circuit_breaker");
    const g = globalThis as unknown as { [k: symbol]: ControlPlaneCircuitBreaker };
    if (!g[key]) {
      g[key] = new ControlPlaneCircuitBreaker({ dbPath });
    }
    return g[key];
  }

  public static resetInstanceForTesting(dbPath: string): ControlPlaneCircuitBreaker {
    const key = Symbol.for("factoryos.instabox.circuit_breaker");
    const g = globalThis as unknown as { [k: symbol]: ControlPlaneCircuitBreaker };
    if (g[key]) {
      try {
        g[key].db.close();
      } catch {
        // ignore
      }
    }
    g[key] = new ControlPlaneCircuitBreaker({ dbPath });
    return g[key];
  }

  public recordSuccess(): void {
    const ts = this.nowMs();
    this.db.prepare("INSERT INTO breaker_outcomes (ok, ts_ms) VALUES (1, ?)").run(ts);
    const meta = this.db
      .prepare("SELECT state FROM breaker_meta WHERE id = 1")
      .get() as { state: BreakerState };
    if (meta.state === "HALF_OPEN") {
      this.db
        .prepare("UPDATE breaker_meta SET state = 'CLOSED', opened_at_ms = NULL, probe_in_flight = 0 WHERE id = 1")
        .run();
    }
  }

  public recordFailure(): void {
    const ts = this.nowMs();
    this.db.prepare("INSERT INTO breaker_outcomes (ok, ts_ms) VALUES (0, ?)").run(ts);
    const meta = this.db
      .prepare("SELECT state FROM breaker_meta WHERE id = 1")
      .get() as { state: BreakerState };

    if (meta.state === "HALF_OPEN") {
      this.db
        .prepare("UPDATE breaker_meta SET state = 'OPEN', opened_at_ms = ?, probe_in_flight = 0 WHERE id = 1")
        .run(ts);
      return;
    }

    const rows = this.db
      .prepare("SELECT ok FROM breaker_outcomes ORDER BY id DESC LIMIT ?")
      .all(this.windowSize) as Array<{ ok: number }>;

    if (rows.length >= this.minSamples) {
      const failures = rows.filter((r) => r.ok === 0).length;
      if (failures / rows.length > this.failureThreshold) {
        this.db
          .prepare("UPDATE breaker_meta SET state = 'OPEN', opened_at_ms = ?, probe_in_flight = 0 WHERE id = 1")
          .run(ts);
      }
    }
  }

  public allowIntake(): { allowed: boolean; snapshot: BreakerSnapshot } {
    const meta = this.db
      .prepare("SELECT state, opened_at_ms, probe_in_flight FROM breaker_meta WHERE id = 1")
      .get() as { state: BreakerState; opened_at_ms: number | null; probe_in_flight: number };

    const now = this.nowMs();

    if (meta.state === "OPEN") {
      if (meta.opened_at_ms !== null && now - meta.opened_at_ms >= this.cooldownMs) {
        this.db
          .prepare("UPDATE breaker_meta SET state = 'HALF_OPEN', probe_in_flight = 1 WHERE id = 1")
          .run();
        return { allowed: true, snapshot: this.getSnapshot() };
      }
      return { allowed: false, snapshot: this.getSnapshot() };
    }

    if (meta.state === "HALF_OPEN") {
      if (meta.probe_in_flight) {
        return { allowed: false, snapshot: this.getSnapshot() };
      }
      this.db.prepare("UPDATE breaker_meta SET probe_in_flight = 1 WHERE id = 1").run();
      return { allowed: true, snapshot: this.getSnapshot() };
    }

    return { allowed: true, snapshot: this.getSnapshot() };
  }

  public getSnapshot(): BreakerSnapshot {
    const meta = this.db
      .prepare("SELECT state, opened_at_ms FROM breaker_meta WHERE id = 1")
      .get() as { state: BreakerState; opened_at_ms: number | null };

    const rows = this.db
      .prepare("SELECT ok FROM breaker_outcomes ORDER BY id DESC LIMIT ?")
      .all(this.windowSize) as Array<{ ok: number }>;

    const sampleCount = rows.length;
    const failureCount = rows.filter((r) => r.ok === 0).length;
    return {
      state: meta.state,
      windowSize: this.windowSize,
      sampleCount,
      failureCount,
      failureRate: sampleCount > 0 ? failureCount / sampleCount : 0,
      openedAtMs: meta.opened_at_ms,
    };
  }
}
