import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function runValidators(report) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "shortforge-team-report-"));
  const reportPath = path.join(tempDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  try {
    const node = spawnSync(process.execPath, ["Team/scripts/validate-team-report.mjs", reportPath], {
      cwd: root,
      encoding: "utf8",
    });
    const python = spawnSync("python3", ["-m", "tools.okf.validate_report", reportPath], {
      cwd: root,
      encoding: "utf8",
    });
    return {
      node: { status: node.status, output: node.stdout + node.stderr },
      python: { status: python.status, output: python.stdout + python.stderr },
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function report(sweepStatus, disposition) {
  const pass = disposition === "PASS";
  return {
    schemaVersion: "1.0",
    changeId: "team-report-partial-gate-test",
    okf: { sweepStatus, sourceRefs: [".okf/decision-protocol.md"] },
    classification: "extends existing rule",
    forgers: ["Evaluator"],
    security: {
      required: true,
      status: pass ? "PASS" : "UNPROVEN",
      semgrep: pass ? "PASS" : "NOT_RUN",
      strix: pass ? "PASS" : "UNAVAILABLE",
      zap: pass ? "PASS" : "NOT_RUN",
    },
    conflicts: [],
    disposition,
    evidenceRefs: ["Team/contracts/team-change-report.schema.json"],
  };
}

test("PARTIAL sweep reports are valid when disposition remains BLOCKED", () => {
  const result = runValidators(report("PARTIAL", "BLOCKED"));
  assert.equal(result.node.status, 0, result.node.output);
  assert.equal(result.python.status, 0, result.python.output);
});

test("both Team validators reject PASS when the OKF sweep is PARTIAL", () => {
  const result = runValidators(report("PARTIAL", "PASS"));
  assert.notEqual(result.node.status, 0, result.node.output);
  assert.match(result.node.output, /PARTIAL OKF sweep cannot produce PASS/);
  assert.notEqual(result.python.status, 0, result.python.output);
  assert.match(result.python.output, /PARTIAL OKF sweep cannot produce PASS/);
});

test("a COMPLETE sweep with valid evidence may pass both report validators", () => {
  const result = runValidators(report("COMPLETE", "PASS"));
  assert.equal(result.node.status, 0, result.node.output);
  assert.equal(result.python.status, 0, result.python.output);
});
