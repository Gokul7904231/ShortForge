/**
 * Source-audit regression test: locks the SafeSQLite call-site classification
 * so a silent mock fallback cannot be re-introduced into production paths.
 *
 * Production-critical stores (authoritative, durable state) must call
 * getSafeDatabase WITHOUT the dev-only mock opt-in. Only explicitly
 * degradation-tolerant caches/tools may opt in.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const web = path.resolve(__dirname, "..");

const PRODUCTION_CRITICAL = [
  "lib/core/SQLiteRenderQueue.ts",
  "lib/core/CheckpointDB.ts",
  "lib/queue-db.ts",
  "lib/audit-logger.ts",
  "lib/voice/voice-benchmark.ts",
  "publishing/authorization/DurableAuthorizationStore.ts",
  "factoryos/core/compute/api/ProviderApiOperationJournal.ts",
  "factoryos/core/compute/notebooks/NotebookOperationJournal.ts",
  "factoryos/core/intelligence/epistemic/EpistemicBudgetReservation.ts",
];

const DEV_ONLY_MOCK_ALLOWED = ["lib/visual-assets/SceneIntentAnalyzer.ts"];

describe("SafeSQLite call-site classification (fail-closed by default)", () => {
  it.each(PRODUCTION_CRITICAL)("production-critical store %s has no mock opt-in", (rel) => {
    const src = fs.readFileSync(path.join(web, rel), "utf8");
    expect(src).toContain("getSafeDatabase(");
    expect(src).not.toContain("allowMockFallback");
  });

  it.each(DEV_ONLY_MOCK_ALLOWED)("dev-only store %s opts in explicitly", (rel) => {
    const src = fs.readFileSync(path.join(web, rel), "utf8");
    expect(src).toContain("allowMockFallback: true");
  });

  it("the wrapper never falls back silently (fail-closed wording enforced)", () => {
    const src = fs.readFileSync(path.join(web, "lib/safe-sqlite.ts"), "utf8");
    expect(src).toContain("SafeSqliteUnavailableError");
    expect(src).not.toMatch(/Using resilient in-memory storage fallback/);
  });
});
