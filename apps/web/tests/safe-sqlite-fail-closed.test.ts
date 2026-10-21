/**
 * Fail-closed regression tests for SafeSQLite.
 *
 * Simulates a runtime where the better-sqlite3 native binding cannot load by
 * breaking the .node native extension loader in-process — the real failure
 * path safe-sqlite.ts catches — and proves that production-critical stores
 * fail loudly instead of silently receiving the in-memory mock that fabricates
 * write results and invents reads.
 *
 * The mock remains available only behind the explicit dev-only gate
 * (allowMockFallback option or SAFE_SQLITE_ALLOW_MOCK=1) and only outside
 * production.
 */
import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import Module from "node:module";
import path from "path";
import os from "os";

// Purge any natively-loaded copy, then make every subsequent native addon
// load fail, as on a machine without compiled bindings.
const realNodeExtension = (Module as any)._extensions[".node"];
const breakNativeAddons = () => {
  (Module as any)._extensions[".node"] = function simulatedMissingBinding() {
    throw new Error("Could not locate the bindings file (simulated missing native binding)");
  };
  for (const key of Object.keys((require as any).cache)) {
    if (key.includes(`better-sqlite3`)) delete (require as any).cache[key];
  }
};
breakNativeAddons();
afterAll(() => {
  (Module as any)._extensions[".node"] = realNodeExtension;
});

import getSafeDatabase, { SafeSqliteUnavailableError, getSqliteHealth } from "../lib/safe-sqlite";
import { SQLiteRenderQueue } from "../lib/core/SQLiteRenderQueue";

const TMP = path.join(os.tmpdir(), `safe-sqlite-fail-close-${Date.now()}.db`);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SafeSQLite fail-closed behavior (missing native binding)", () => {
  it("throws SafeSqliteUnavailableError by default (production paths never get the mock)", () => {
    expect(() => getSafeDatabase(TMP)).toThrow(SafeSqliteUnavailableError);
  });

  it("error message is actionable (rebuild / explicit dev opt-in)", () => {
    try {
      getSafeDatabase(TMP);
      expect.unreachable("must have thrown");
    } catch (err: any) {
      expect(err.message).toContain("npm rebuild better-sqlite3");
      expect(err.message).toContain("SAFE_SQLITE_ALLOW_MOCK");
    }
  });

  it("explicit dev-only opt-in returns the in-memory mock outside production", () => {
    process.env.NODE_ENV = "test";
    const db = getSafeDatabase(TMP, { allowMockFallback: true });
    // Writes "succeed" but only against the heuristic mock...
    db.exec("CREATE TABLE t (id TEXT)");
    db.prepare("INSERT INTO t VALUES (?)").run("row-1");
    expect(db.prepare("SELECT * FROM t").get("row-1")).toBeDefined();
  });

  it("the mock is non-durable: a second instance sees no data (no fake durability)", () => {
    process.env.NODE_ENV = "test";
    const db = getSafeDatabase(TMP, { allowMockFallback: true });
    db.exec("CREATE TABLE t2 (id TEXT)");
    db.prepare("INSERT INTO t2 VALUES (?)").run("payload-x");
    const db2 = getSafeDatabase(TMP, { allowMockFallback: true });
    expect(db2.prepare("SELECT * FROM t2").get("payload-x")).toBeUndefined();
  });

  it("the mock is NOT reachable in production even with the dev opt-in", () => {
    process.env.NODE_ENV = "production";
    expect(() => getSafeDatabase(TMP, { allowMockFallback: true })).toThrow(SafeSqliteUnavailableError);
  });

  it("SAFE_SQLITE_ALLOW_MOCK=1 enables the mock for dev machines (non-production only)", () => {
    process.env.NODE_ENV = "test";
    process.env.SAFE_SQLITE_ALLOW_MOCK = "1";
    expect(() => getSafeDatabase(TMP)).not.toThrow();
    delete process.env.SAFE_SQLITE_ALLOW_MOCK;
    process.env.NODE_ENV = "production";
    expect(() => getSafeDatabase(TMP)).toThrow(SafeSqliteUnavailableError);
  });

  it("SQLiteRenderQueue (production queue) fails closed at construction", () => {
    expect(() => new SQLiteRenderQueue()).toThrow(SafeSqliteUnavailableError);
  });

  it("module-level singleton stores (CheckpointDB) fail closed at import time", async () => {
    await expect(import("../lib/core/CheckpointDB")).rejects.toThrow(SafeSqliteUnavailableError);
  });

  it("health probe reports the missing binding instead of pretending", () => {
    const health = getSqliteHealth();
    expect(health.available).toBe(false);
    expect(health.error).toContain("bindings file");
  });
});
