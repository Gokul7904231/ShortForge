import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("python-runner canonical script resolution (DUP-01)", () => {
  const repoRoot = path.join(__dirname, "..", "..", "..");
  const canonicalScript = path.join(
    repoRoot,
    "services",
    "rendering-engine",
    "scripts",
    "create_short.py"
  );
  const retiredScript = path.join(
    repoRoot,
    "hybrid-video",
    "scripts",
    "create_short.py"
  );

  it("confirms canonical create_short.py exists in services/rendering-engine", () => {
    expect(fs.existsSync(canonicalScript)).toBe(true);
    const stats = fs.statSync(canonicalScript);
    expect(stats.size).toBeGreaterThan(10000);
  });

  it("confirms deprecated duplicate in hybrid-video/scripts/create_short.py has been removed", () => {
    expect(fs.existsSync(retiredScript)).toBe(false);
  });

  it("verifies python-runner.ts points to canonical rendering-engine path", () => {
    const runnerSource = fs.readFileSync(
      path.join(__dirname, "..", "lib", "python-runner.ts"),
      "utf-8"
    );
    expect(runnerSource).toContain("services/rendering-engine/scripts/create_short.py");
    expect(runnerSource).not.toContain("hybrid-video/scripts/create_short.py");
  });
});
