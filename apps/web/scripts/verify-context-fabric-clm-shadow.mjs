#!/usr/bin/env node
/**
 * Context Fabric Wave F CLM shadow boundary verifier.
 *
 * CLM context-policy code may propose typed ContextEdit values, but it must
 * not directly mutate ContextFabric, persist context, or touch other
 * authority domains. This is a static fail-closed guard.
 */

import fs from "node:fs";
import path from "node:path";

const coreRoot = path.resolve(process.cwd(), "factoryos", "core");
const fabricPath = path.resolve(coreRoot, "cognitive", "context", "ContextFabric.ts");
const contractsPath = path.resolve(coreRoot, "cognitive", "context", "ContextFabricContracts.ts");
const proposalRoot = path.resolve(coreRoot, "intelligence", "context");

const violations = [];

function add(file, line, text) {
  violations.push({ file, line, text: text.trim() });
}

function scan(dir, matcher) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(absolute, matcher);
      continue;
    }
    if (!/.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) continue;
    const source = fs.readFileSync(absolute, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => matcher(absolute, relative(absolute), line, index + 1));
  }
}

function relative(absolute) {
  return path.relative(coreRoot, absolute).replaceAll(path.sep, "/");
}

const fabricSource = fs.readFileSync(fabricPath, "utf8");
const contractsSource = fs.readFileSync(contractsPath, "utf8");

for (const required of [
  "CLMContextProposalPort",
  "CLMContextProposal",
  "CLMShadowProposalResult",
  "ContextProposalValidationResult",
  "CONTEXT_CLM_PROPOSAL_SCHEMA_VERSION",
]) {
  if (!contractsSource.includes(required)) {
    add(relative(contractsPath), 1, "missing required Wave F contract " + required);
  }
}

if (!/async\s+proposeCLMShadowEdits\s*\(/.test(fabricSource)) {
  add(relative(fabricPath), 1, "ContextFabric is missing proposeCLMShadowEdits");
}

const proposalMethod = fabricSource.match(
  /async\s+proposeCLMShadowEdits\s*\([\s\S]*?\n  \}\n\n  \/\*\*/,
)?.[0] ?? "";
if (/\.applyEdits\s*\(|\.commitEdits\s*\(/.test(proposalMethod)) {
  add(relative(fabricPath), 1, "CLM shadow proposal method directly invokes a context mutator");
}

scan(coreRoot, (_absolute, file, line, lineNo) => {
  if (file === "cognitive/context/ContextFabric.ts") return;

  if (/\.applyEdits\s*\(|\.commitEdits\s*\(/.test(line)) {
    add(file, lineNo, "direct ContextFabric mutation call outside canonical facade: " + line);
  }
});

scan(proposalRoot, (_absolute, file, line, lineNo) => {
  if (!/CLMContextProposal/.test(file)) return;

  if (
    /(?:\.applyEdits\s*\(|\.commitEdits\s*\(|MongoContextFabricRepository|IContextFabricRepository|Treasury|Guardian|ContentAddressedStore|F07|grantCapability|issueLease|publish|modelPromotion)/i.test(line)
  ) {
    add(file, lineNo, "forbidden CLM shadow authority/persistence reference: " + line);
  }
});

if (violations.length > 0) {
  console.error("Context Fabric CLM shadow boundary violation(s) detected:");
  for (const violation of violations) {
    console.error("- " + violation.file + ":" + violation.line + " " + violation.text);
  }
  process.exit(1);
}

console.log(
  "Context Fabric CLM shadow boundary valid: proposals remain typed, proposal-only, and isolated from context mutation/persistence/authority paths.",
);
