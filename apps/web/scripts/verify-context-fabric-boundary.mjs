#!/usr/bin/env node
/**
 * Context Fabric Wave D boundary verifier.
 *
 * Production FactoryOS code must not import or instantiate the legacy
 * ActiveContextManager or ContextOS directly. ContextFabric is the sole
 * active working-context boundary.
 *
 * The legacy implementation files remain allowed as primitives until a
 * later retirement wave proves they can be removed safely.
 */

import fs from "node:fs";
import path from "node:path";

const coreRoot = path.resolve(process.cwd(), "factoryos", "core");
const allowed = new Set([
  path.normalize("cognitive/context/ContextFabric.ts"),
  path.normalize("cognitive/context/ActiveContextManager.ts"),
  path.normalize("memory/ContextOS.ts"),
]);

const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) continue;

    const relative = path.normalize(path.relative(coreRoot, absolute));
    if (allowed.has(relative)) continue;

    const source = fs.readFileSync(absolute, "utf8");
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (/\bActiveContextManager\b/.test(line) || /\bContextOS\b/.test(line)) {
        violations.push({
          file: relative.replaceAll(path.sep, "/"),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
}

walk(coreRoot);

if (violations.length > 0) {
  console.error("Context Fabric boundary violation(s) detected:");
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} ${violation.text}`,
    );
  }
  process.exit(1);
}

console.log(
  "Context Fabric boundary valid: no direct production references to ActiveContextManager or ContextOS outside canonical primitive files.",
);
