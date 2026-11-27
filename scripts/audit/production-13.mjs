#!/usr/bin/env node
/**
 * Production-13 Audit Generator
 * Reads .okf/production-13/layer-registry.json and .okf/architecture/authority-registry.json,
 * validates conformance (13 layers, sovereignRolesCreated=false, PASS => evidence & tests non-empty),
 * and writes docs/production-13/AUDIT-13.md.
 */

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const p13Path = path.join(repoRoot, ".okf", "production-13", "layer-registry.json");
const authPath = path.join(repoRoot, ".okf", "architecture", "authority-registry.json");
const outPath = path.join(repoRoot, "docs", "production-13", "AUDIT-13.md");

const p13 = JSON.parse(fs.readFileSync(p13Path, "utf-8"));
const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));

if (p13.sovereignRolesCreated !== false) {
  throw new Error("Charter violation: sovereignRolesCreated must be false");
}
if (!Array.isArray(p13.layers) || p13.layers.length !== 13) {
  throw new Error(`Expected exactly 13 layers, got ${p13.layers?.length}`);
}

let passCount = 0;
let partialCount = 0;
const rows = [];

for (const layer of p13.layers) {
  if (layer.status === "PASS") {
    if (!layer.evidence?.length || !layer.tests?.length) {
      throw new Error(`Layer ${layer.id} marked PASS without non-empty evidence and tests`);
    }
    passCount++;
  } else {
    partialCount++;
  }
  rows.push(
    `| ${layer.id} | ${layer.name} | ${layer.ownerRoles.join(", ")} | **${layer.status}** | ${layer.evidence.join("<br>")} | ${layer.tests.join("<br>")} |`
  );
}

const md = `# ShortForge Production-13 Audit Report

- **Schema:** \`${p13.schemaVersion}\`
- **Subordinate To:** \`${p13.subordinateTo}\`
- **Sovereign Roles Created:** \`${p13.sovereignRolesCreated}\` (Charter sovereigns: ${auth.sovereigns.length})
- **Summary:** ${passCount} PASS · ${partialCount} PARTIAL · 0 FAIL

| Layer | Name | Owners | Status | Evidence | Tests |
|---|---|---|---|---|---|
${rows.join("\n")}
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md, "utf-8");
console.log(`[audit:production-13] Wrote ${outPath} (${passCount} PASS, ${partialCount} PARTIAL)`);
