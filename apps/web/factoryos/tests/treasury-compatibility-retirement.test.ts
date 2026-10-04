import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const productionRoots = [
  "app",
  "lib",
  "factoryos/core",
  "ai",
  "agents",
  "content-engines",
];

const excluded = new Set([
  "lib/quota/quota-service.ts",
  "factoryos/core/governor/CostGovernor.ts",
  "factoryos/core/missions/MissionBudgetManager.ts",
  "factoryos/core/index.ts",
  "factoryos/core/treasury/TreasuryQuotaAdmission.ts",
  "factoryos/core/treasury/TreasuryQuotaCompatibility.ts",
  "ai/factory.ts",
]);

const compatibilityBoundaries = new Set([
  "app/api/rendering/callback/route.ts",
  "app/api/jobs/[id]/route.ts",
  "factoryos/core/index.ts",
  "factoryos/core/treasury/TreasuryQuotaAdmission.ts",
  "factoryos/core/treasury/TreasuryQuotaCompatibility.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function legacyReferences(source: string): boolean {
  return (
    /from\s+["'][^"']*quota-service["']/.test(source) ||
    /require\(\s*["'][^"']*quota-service["']/.test(source) ||
    /from\s+["'][^"']*CostGovernor["']/.test(source) ||
    /from\s+["'][^"']*MissionBudgetManager["']/.test(source) ||
    /from\s+["'][^"']*AgentEconomicsEngine["']/.test(source) ||
    /new\s+MissionBudgetManager\b/.test(source) ||
    /new\s+AgentEconomicsEngine\b/.test(source) ||
    /CostGovernor\.(evaluateInvocation|recordSpend)\b/.test(source)
  );
}

describe("Treasury Wave 5 compatibility retirement", () => {
  it("has no production imports of legacy economic authorities", () => {
    const violations: string[] = [];
    for (const rootDir of productionRoots) {
      const absolute = path.join(root, rootDir);
      for (const file of walk(absolute)) {
        const rel = relative(file);
        if (excluded.has(rel)) continue;
        const source = fs.readFileSync(file, "utf8");
        if (legacyReferences(source)) violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it("isolates legacy quota-service imports to documented compatibility boundaries", () => {
    const violations: string[] = [];
    for (const rootDir of productionRoots) {
      const absolute = path.join(root, rootDir);
      for (const file of walk(absolute)) {
        const rel = relative(file);
        const source = fs.readFileSync(file, "utf8");
        if (
          (source.includes("quota-service") ||
            /from\s+["'][^"']*CostGovernor["']/.test(source) ||
            /from\s+["'][^"']*MissionBudgetManager["']/.test(source)) &&
          !excluded.has(rel) &&
          !compatibilityBoundaries.has(rel)
        ) {
          violations.push(rel);
        }
      }
    }

    expect(violations).toEqual([]);
  });
  });
});
