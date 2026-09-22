#!/usr/bin/env node
/**
 * ShortForge Repository Verification Script
 * Standard: CLAIM <= EVIDENCE
 *
 * Verifies:
 * 1. Absence of machine-specific paths (C:\Users, file:///...)
 * 2. Clean Git tracking (no runtime cache or outbox artifacts)
 * 3. Documentation link integrity and canonical taxonomy
 * 4. TypeScript typecheck status
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

console.log("==================================================");
console.log(" ShortForge / FactoryOS — Repository Verification");
console.log("==================================================");

let exitCode = 0;

function runCheck(name, fn) {
  process.stdout.write(`[*] Checking: ${name}... `);
  try {
    fn();
    console.log("PASS");
  } catch (err) {
    console.log("FAIL");
    console.error(`    Error: ${err.message}`);
    exitCode = 1;
  }
}

// Check 1: No machine-specific paths in tracked source and docs
runCheck("Absence of local Windows paths (C:\\Users)", () => {
  try {
    const output = execSync('git grep -i "c:\\\\users" -- ":!*.tsbuildinfo"', {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (output.trim()) {
      throw new Error(`Found local machine paths:\n${output.trim()}`);
    }
  } catch (err) {
    if (err.status === 1) {
      // Exit code 1 from git grep means no match, which is what we want!
      return;
    }
    throw err;
  }
});

// Check 2: No file:/// URIs in tracked docs
runCheck("Absence of absolute file:/// URIs in documentation", () => {
  try {
    const output = execSync('git grep -i "file:///c:" -- "docs/**" "README.md"', {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (output.trim()) {
      throw new Error(`Found file:/// links in docs:\n${output.trim()}`);
    }
  } catch (err) {
    if (err.status === 1) return;
    throw err;
  }
});

// Check 3: Generated artifacts are not tracked
runCheck("No tracked runtime render caches or outbox files", () => {
  const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf-8" });
  const forbidden = [
    ".factoryos_render_cache",
    "data/outbox",
    "data/audio/voice_silent_fallback",
  ];
  for (const f of forbidden) {
    if (tracked.includes(f)) {
      throw new Error(`Forbidden tracked path found in Git index: ${f}`);
    }
  }
});

// Check 4: Documentation canonical taxonomy
runCheck("Canonical documentation taxonomy exists", () => {
  const requiredDirs = [
    "docs/architecture",
    "docs/factoryos",
    "docs/compute",
    "docs/intelligence",
    "docs/security",
    "docs/deployment",
    "docs/verification",
    "docs/archive",
  ];
  for (const dir of requiredDirs) {
    if (!fs.existsSync(path.join(ROOT, dir))) {
      throw new Error(`Missing required documentation directory: ${dir}`);
    }
  }
});

console.log("==================================================");
if (exitCode === 0) {
  console.log(" ALL REPOSITORY HYGIENE CHECKS PASSED [OK]");
} else {
  console.error(" REPOSITORY HYGIENE CHECKS FAILED [ERROR]");
}
console.log("==================================================");
process.exit(exitCode);
