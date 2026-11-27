import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function findRepoRoot(start: string): string {
  let cur = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(cur, ".okf", "charter.md")) &&
      fs.existsSync(path.join(cur, ".git"))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error("Could not locate repo root");
}

const REPO_ROOT = findRepoRoot(process.cwd());
const P13_DIR = path.join(REPO_ROOT, ".okf", "production-13");

describe("P4 Production-13 Conformance & Zero Sovereign Accretion", () => {
  it("index.md declares OPERATIONAL QUALITY FRAMEWORK subordinate to charter", () => {
    const idxPath = path.join(P13_DIR, "index.md");
    expect(fs.existsSync(idxPath)).toBe(true);
    const text = fs.readFileSync(idxPath, "utf-8");
    expect(text).toContain("OPERATIONAL QUALITY FRAMEWORK");
    expect(text).toContain(".okf/charter.md");
    expect(text.toLowerCase()).toContain("13 layers are audit lenses, not sovereign roles");
  });

  it("layer-registry.json has exactly 13 layers, sovereignRolesCreated=false, and zero charter conflict", () => {
    const regPath = path.join(P13_DIR, "layer-registry.json");
    expect(fs.existsSync(regPath)).toBe(true);
    const reg = JSON.parse(fs.readFileSync(regPath, "utf-8"));
    const authReg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".okf", "architecture", "authority-registry.json"), "utf-8")
    );

    expect(reg.schemaVersion).toBe("1.0.0-production-13");
    expect(reg.subordinateTo).toBe(".okf/charter.md");
    expect(reg.sovereignRolesCreated).toBe(false);
    expect(Array.isArray(reg.layers)).toBe(true);
    expect(reg.layers).toHaveLength(13);

    const validOwners = new Set<string>([
      ...authReg.sovereigns.map((s: any) => s.id),
      ...authReg.subsystems.map((s: any) => s.id),
      "f07",
      "cas",
      "renderfabric",
      "computerouter",
    ]);

    const expectedIds = Array.from({ length: 13 }, (_, i) => `L${String(i + 1).padStart(2, "0")}`);
    expect(reg.layers.map((l: any) => l.id)).toEqual(expectedIds);

    for (const layer of reg.layers) {
      expect(Array.isArray(layer.ownerRoles)).toBe(true);
      expect(layer.ownerRoles.length).toBeGreaterThan(0);
      for (const owner of layer.ownerRoles) {
        expect(validOwners.has(owner.toLowerCase())).toBe(true);
      }
      expect(typeof layer.definitionOfDone).toBe("string");
      expect(layer.definitionOfDone.trim().length).toBeGreaterThan(10);
      expect(fs.existsSync(path.join(REPO_ROOT, layer.docPath))).toBe(true);

      if (layer.status === "PASS") {
        expect(Array.isArray(layer.evidence) && layer.evidence.length > 0).toBe(true);
        expect(Array.isArray(layer.tests) && layer.tests.length > 0).toBe(true);
      }

      for (const evPath of layer.evidence || []) {
        const cleanPath = String(evPath).split("#")[0];
        expect(
          fs.existsSync(path.join(REPO_ROOT, cleanPath)),
          `Layer ${layer.id} cites nonexistent evidence path: ${cleanPath}`
        ).toBe(true);
      }
      for (const testPath of layer.tests || []) {
        const cleanPath = String(testPath).split("#")[0];
        expect(
          fs.existsSync(path.join(REPO_ROOT, cleanPath)),
          `Layer ${layer.id} cites nonexistent test path: ${cleanPath}`
        ).toBe(true);
      }
    }
  });

  it("scorecard.md, AUDIT-13.md, and role-usage-report.md exist with all 10 sovereigns enforced", () => {
    expect(fs.existsSync(path.join(P13_DIR, "scorecard.md"))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, "docs", "production-13", "AUDIT-13.md"))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, "scripts", "audit", "production-13.mjs"))).toBe(true);

    const reportPath = path.join(REPO_ROOT, "docs", "governance", "role-usage-report.md");
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = fs.readFileSync(reportPath, "utf-8");

    const authReg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".okf", "architecture", "authority-registry.json"), "utf-8")
    );
    expect(authReg.sovereigns).toHaveLength(10);
    for (const sov of authReg.sovereigns) {
      expect(report.toLowerCase()).toContain(sov.id.toLowerCase());
      for (const testRel of sov.enforcementTests || []) {
        expect(fs.existsSync(path.join(REPO_ROOT, testRel))).toBe(true);
      }
    }
  });
});
