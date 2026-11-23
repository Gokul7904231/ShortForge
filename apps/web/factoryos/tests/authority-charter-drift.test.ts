import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(): string {
  let dir = HERE;
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, ".okf", "charter.md")) && existsSync(path.join(dir, "package.json"))) return dir;
    if (existsSync(path.join(dir, ".git")) && existsSync(path.join(dir, ".okf"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Repo root not found (need .okf + package.json)");
}

const ROOT = findRepoRoot();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const has = (rel: string) => existsSync(path.join(ROOT, rel));

const CHARTER_PATH = ".okf/charter.md";
const REGISTRY_PATH = ".okf/architecture/authority-registry.json";

const CANONICAL_SOVEREIGNS = [
  "overseer", "treasurer", "slayer", "healer", "remaker",
  "comms", "guardian", "auditor", "advisor", "instructor",
] as const;

const charter = has(CHARTER_PATH) ? read(CHARTER_PATH) : "";
const registry = has(REGISTRY_PATH) ? JSON.parse(read(REGISTRY_PATH)) : null;

describe("Charter is enshrined (CANONICAL-FOUNDING)", () => {
  it("charter.md exists", () => expect(has(CHARTER_PATH)).toBe(true));
  it("is marked CANONICAL-FOUNDING", () => expect(charter).toContain("CANONICAL-FOUNDING"));
  it("outranks architecture.md", () => expect(charter).toMatch(/ABOVE\s+`?\.okf\/architecture\.md`?/));
  it("contains the absolute authority tree", () => {
    for (const marker of ["HUMAN CO-LEADS", "OVERSEER", "FACTORY-WIDE ROLES", "PER FLOOR", "GUARDIAN", "AUDITOR", "F07"]) {
      expect(charter).toContain(marker);
    }
  });
  it("states the fundamental separation", () => {
    expect(charter).toContain("Command ≠ Authorization ≠ Resource Allocation ≠ Execution ≠ Verification");
  });
  it("contains all 13 precedence laws", () => {
    for (let i = 1; i <= 13; i++) expect(charter).toContain(`**L${i}.**`);
  });
});

describe("Registry mirrors the charter", () => {
  it("registry exists and parses", () => expect(registry).not.toBeNull());
  it("declares charter schema", () => expect(registry.schemaVersion).toBe("2.0.0-charter"));
  it("references the charter", () => expect(registry.charter.path).toBe(CHARTER_PATH));

  it("charter hash is synced (run: node scripts/okf/sync-charter-hash.mjs)", () => {
    const actual = createHash("sha256").update(read(CHARTER_PATH)).digest("hex");
    expect(registry.charter.sha256).toBe(actual);
  });

  it("has EXACTLY the 10 canonical sovereigns — no accretion, no loss", () => {
    const ids = registry.sovereigns.map((s: any) => s.id).sort();
    expect(ids).toEqual([...CANONICAL_SOVEREIGNS].sort());
    expect(registry.sovereigns).toHaveLength(10);
    expect(registry.meta.sovereignCount).toBe(10);
  });

  it("every sovereign has a contract file that exists", () => {
    for (const s of registry.sovereigns) {
      expect(s.contract, `${s.id} missing contract field`).toBeTruthy();
      expect(has(s.contract), `${s.id} contract file missing: ${s.contract}`).toBe(true);
    }
  });

  it("every sovereign declares ≥1 enforcement test", () => {
    for (const s of registry.sovereigns) {
      expect(Array.isArray(s.enforcementTests), `${s.id} enforcementTests`).toBe(true);
      expect(s.enforcementTests.length, `${s.id} has no enforcement test`).toBeGreaterThan(0);
    }
  });

  it("carries all 13 laws", () => {
    const ids = registry.laws.map((l: any) => l.id);
    for (let i = 1; i <= 13; i++) expect(ids).toContain(`L${i}`);
  });
});

describe("DRIFT GUARDS — the boundaries the system previously forgot", () => {
  const by = (id: string) => registry.sovereigns.find((s: any) => s.id === id);
  const sub = (id: string) => registry.subsystems.find((s: any) => s.id === id);

  it("L4: Guardian is PER-FLOOR sovereign, not a global capability regulator", () => {
    const g = by("guardian");
    expect(g.scope).toBe("floor");
    expect(g.perFloor).toBe(true);
    expect(g.vetoes).toContain("capability-authorization");
  });

  it("L5: Auditor ≠ F07 — separate entities, Auditor independent of what it inspects", () => {
    const a = by("auditor");
    const f = sub("f07");
    expect(a).toBeTruthy();
    expect(f).toBeTruthy();
    expect(a.id).not.toBe(f.id);
    expect(a.scope).toBe("floor");
    expect(f.kind).toBe("release-boundary");
    expect(f.sovereign).toBe(false);
    expect(a.independentOf).toEqual(expect.arrayContaining(["guardian", "healer", "remaker", "f07"]));
    expect(a.doesNotOwn).toContain("release-verification");
    expect(f.replaceableBy).toEqual([]);
  });

  it("L6: Slayer INVESTIGATES first — not an executioner", () => {
    const s = by("slayer");
    expect(s.primaryVerb).toBe("investigate");
    expect(s.doesNotOwn).toEqual(expect.arrayContaining(["recovery-execution", "production-dispatch"]));
  });

  it("L7: Treasurer obeys only Overseer for discretionary commands", () => {
    expect(by("treasurer").discretionaryCommander).toBe("overseer");
  });

  it("L8: Ascalon is Guardian's per-floor cognition, never a second Overseer", () => {
    const a = sub("ascalon");
    expect(a.parent).toBe("guardian");
    expect(a.scope).toBe("floor");
    expect(a.sovereign).toBe(false);
    expect(a.mode).toBe("advisory");
  });

  it("L9: Comms transports, never commands", () => {
    const c = by("comms");
    expect(c.primaryVerb).toBe("transport");
    expect(c.doesNotOwn).toEqual(expect.arrayContaining(["command", "authorization", "spend", "verification"]));
  });

  it("Restored roles exist as sovereigns: Comms, Advisor, Instructor", () => {
    for (const id of ["comms", "advisor", "instructor"]) {
      expect(by(id), `${id} was dropped — restore it`).toBeTruthy();
      expect(has(`.okf/hierarchy/${id}.md`), `${id} contract missing`).toBe(true);
    }
  });

  it("Restored subsystems exist: BDA, FG-Healer", () => {
    for (const id of ["bda", "fg-healer"]) {
      expect(sub(id), `${id} was dropped — restore it`).toBeTruthy();
      expect(has(`.okf/hierarchy/${id}.md`), `${id} contract missing`).toBe(true);
    }
    expect(sub("bda").mode).toBe("records-to-auditor");
    expect(sub("fg-healer").mode).toBe("joints-with-global-healer");
  });

  it("ReMaker requires an explicit scoped capability", () => {
    expect(by("remaker").requiredCapability).toBe("CAP_REMAKER_REPAIR");
  });
});

describe("NO ACCRETION — subsystems are not sovereigns", () => {
  it("every subsystem is sovereign:false with a valid parent", () => {
    const sovereignIds = new Set(registry.sovereigns.map((s: any) => s.id));
    const subsystemIds = new Set(registry.subsystems.map((s: any) => s.id));
    for (const s of registry.subsystems) {
      expect(s.sovereign, `${s.id} must not be sovereign`).toBe(false);
      expect(s.parent, `${s.id} missing parent`).toBeTruthy();
      const ok = s.parent === "independent" || sovereignIds.has(s.parent) || subsystemIds.has(s.parent);
      expect(ok, `${s.id} has orphan parent ${s.parent}`).toBe(true);
    }
  });

  it("Devourer is propose-only under Instructor + Overseer", () => {
    const d = registry.subsystems.find((s: any) => s.id === "devourer");
    expect(d.mode).toBe("propose-only");
    expect(d.parent).toBe("instructor");
    expect(d.coGovernor).toBe("overseer");
  });

  it("AER / GLiDE / SCL live under Ascalon, advisory or shadow", () => {
    for (const id of ["aer", "glide", "scl"]) {
      const s = registry.subsystems.find((x: any) => x.id === id);
      expect(s.parent, `${id} must sit under ascalon`).toBe("ascalon");
      expect(["advisory", "shadow-only"]).toContain(s.mode);
    }
  });

  it("fencing / CAS / RenderFabric / ComputeRouter are infrastructure, not governors", () => {
    for (const id of ["fencing", "cas", "renderfabric", "computerouter"]) {
      const s = registry.subsystems.find((x: any) => x.id === id);
      expect(s.kind, `${id} must be infrastructure`).toBe("infrastructure");
      expect(s.sovereign).toBe(false);
    }
  });

  it("accretion policy is charter-amendment-required", () => {
    expect(registry.meta.accretionPolicy).toBe("charter-amendment-required");
  });
});

describe("Floor topology (L11)", () => {
  it("floor set is F00..F07", () => {
    expect(registry.floorSet).toEqual(["F00","F01","F02","F03","F04","F05","F06","F07"]);
  });
  it("F03 ∥ F04 converge at F05", () => {
    expect(registry.parallelBranches).toEqual([["F03","F04"]]);
    expect(registry.convergenceFloor).toBe("F05");
  });
  it("production command path ends at F07 via Auditor", () => {
    expect(registry.commandPaths.production).toEqual(
      ["human-co-leads","overseer","guardian","worker","auditor","f07"]
    );
  });
});
