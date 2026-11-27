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
const ENGINE_ROOT = path.join(REPO_ROOT, "services", "rendering-engine");
const CORE_DIR = path.join(ENGINE_ROOT, "core");

const SHIPPING_ENTRYPOINTS = [
  path.join(ENGINE_ROOT, "scripts", "create_short.py"),
  path.join(ENGINE_ROOT, "basic_render_worker.py"),
  path.join(ENGINE_ROOT, "worker_daemon.py"),
  path.join(ENGINE_ROOT, "main.py"),
];

describe("P5.1 No Orphan Core Modules Guard", () => {
  it("every services/rendering-engine/core/*.py is imported by at least one shipping-path entrypoint", () => {
    const coreModules = fs
      .readdirSync(CORE_DIR)
      .filter((f) => f.endsWith(".py") && f !== "__init__.py")
      .map((f) => f.replace(/\.py$/, ""))
      .sort();

    expect(coreModules.length).toBeGreaterThan(0);

    const shippingSources = SHIPPING_ENTRYPOINTS.map((p) => ({
      file: path.relative(REPO_ROOT, p),
      content: fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "",
    }));

    const orphans: string[] = [];
    for (const mod of coreModules) {
      const importRegex = new RegExp(
        `(?:from\\s+core\\.${mod}\\b|import\\s+core\\.${mod}\\b|from\\s+core\\s+import\\b[^\\n]*\\b${mod}\\b)`,
      );
      const isImported = shippingSources.some((src) => importRegex.test(src.content));
      if (!isImported) {
        orphans.push(`services/rendering-engine/core/${mod}.py`);
      }
    }

    expect(
      orphans,
      `Orphan core modules not imported by any shipping-path file: ${orphans.join(", ")}`,
    ).toEqual([]);
  });
});
