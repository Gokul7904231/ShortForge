#!/usr/bin/env node
/**
 * ContextBench Wave G boundary verifier.
 *
 * The benchmark is evaluation infrastructure only. It must not become a
 * production authority, persist ContextFabric state, or invoke commit paths.
 */

import fs from "node:fs";
import path from "node:path";

const coreRoot = path.resolve(process.cwd(), "factoryos", "core");
const benchPath = path.resolve(coreRoot, "intelligence", "context", "ContextBench.ts");
const testRoot = path.resolve(process.cwd(), "factoryos", "tests", "context");
const source = fs.readFileSync(benchPath, "utf8");

const failures = [];
const requireText = (pattern, name) => {
  if (!pattern.test(source)) failures.push("missing benchmark invariant: " + name);
};

requireText(/CONTEXT_BENCH_VERSION\s*=\s*"1\.0\.0"/, "bench version");
requireText(/CONTEXT_BENCH_DATASET_VERSION\s*=\s*"wave-g-context-policy-v1"/, "dataset version");
requireText(/split:\s*ContextBenchSplit/, "development/held-out split");
requireText(/criticalAnchorRetention/, "critical anchor retention metric");
requireText(/usefulDeletionPrecision/, "useful deletion metric");
requireText(/contextCompression/, "compression metric");
requireText(/retrievalRecovery/, "retrieval recovery metric");
requireText(/decisionQuality/, "decision quality metric");
requireText(/mutationSafetyRate/, "mutation safety metric");
requireText(/maxAuthorityViolationCount/, "authority safety criterion");
requireText(/minHeldOutCases/, "held-out admission criterion");
requireText(/minCompressionUplift/, "compression uplift criterion");
requireText(/buildContextBenchDataset/, "fixed benchmark dataset");
requireText(/buildDeterministicShadowPolicy/, "deterministic shadow benchmark policy");

if (/\.commitEdits\s*\(|\.commitWorkspace\s*\(|MongoContextFabricRepository|Treasury|Guardian|ContentAddressedStore|F07/i.test(source)) {
  failures.push("ContextBench directly references a production mutation/persistence/authority path");
}

if (!fs.existsSync(path.join(testRoot, "context-bench.test.ts"))) {
  failures.push("ContextBench test suite is missing");
}

const packagePath = path.resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (!packageJson.scripts?.["factoryos:test:context-bench"]) failures.push("missing factoryos:test:context-bench script");
if (!packageJson.scripts?.["factoryos:verify:context-bench"]) failures.push("missing factoryos:verify:context-bench script");

if (failures.length) {
  console.error("CONTEXT_BENCH_GATE: BLOCKED");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("CONTEXT_BENCH_GATE: VALID — evaluation-only boundary and required metric/gate contracts are present.");
