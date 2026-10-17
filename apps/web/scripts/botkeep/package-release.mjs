#!/usr/bin/env node
/**
 * ShortForge — Botkeep release packager.
 *
 * Run from apps/web AFTER `npm run build:botkeep`:
 *
 *   node scripts/botkeep/package-release.mjs --out ../../dist/botkeep
 *
 * Options:
 *   --out <dir>               output directory (default: dist/botkeep)
 *   --budget-mib <n>          uncompressed budget in MiB (default: 1300)
 *   --deny-values-from <file> optional local-only .env file; fails if any of its
 *                             values (len >= 12) appear in a packaged text file.
 *                             Values are never printed.
 *
 * Output (all in --out):
 *   shortforge-botkeep-<sha12>.zip        the release
 *   shortforge-botkeep-<sha12>.zip.sha256 checksum
 *   release-manifest.json                 commit, sizes, budget, scan, checksum
 *   release-inventory.json                every included path + bytes
 *   release-excluded.json                 excluded paths/classes + reason
 *
 * Exit codes: 0 ok, 2 build output missing / scan failure, 3 over budget.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeZip } from "./lib/zip.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");
const MIB = 1024 * 1024;

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outDir = path.resolve(projectRoot, arg("--out", "dist/botkeep"));
const budgetMiB = Number(arg("--budget-mib", "1300"));
const denyValuesFrom = arg("--deny-values-from", null);

// ── sources ────────────────────────────────────────────────────────────────
const STANDALONE = path.join(projectRoot, ".next", "standalone");
const STATIC_DIR = path.join(projectRoot, ".next", "static");
const PUBLIC_DIR = path.join(projectRoot, "public");

/**
 * Runtime files the server reads from its working directory by path
 * (fs.readFileSync(process.cwd()/…)), which file tracing may not capture.
 * Only data-type files are copied; sources are already in the server bundle.
 */
const RUNTIME_ASSET_SOURCES = [
  { dir: "config", ext: /\.json$/i },
  { dir: "prompts", ext: /\.(md|txt|json)$/i },
  { dir: "content-engines", ext: /\.(json|txt|md)$/i },
  { dir: "factoryos/skills", ext: /\.(md|json)$/i },
  { dir: "lib/shortforge-skills", ext: /\.md$/i },
  { dir: "factory", ext: /\.json$/i },
];

/** Project-level paths (directory or single file) that must never ship, even if traced. */
const EXCLUDED_PROJECT_PATHS = [
  ["data", "mutable application state (databases, keys, renders, CAS) — lives on the host"],
  [".factoryos_render_cache", "local render cache/checkpoint state from a developer machine"],
  ["generated", "generated local output"],
  ["scratch", "scratch/stability test output"],
  ["temp", "temporary files"],
  ["tests", "test sources"],
  ["testing", "test sources"],
  ["docs", "documentation"],
  ["local-ai", "local python generation scripts/venv (not part of the Node runtime)"],
  ["venv", "python virtualenv"],
  [".venv", "python virtualenv"],
  ["factoryos/tests", "test sources"],
  ["factoryos/reports", "audit reports"],
  [".next/cache", "build cache"],
  [".git", "version-control history"],
  [".okf", "developer knowledge base"],
  [".agents", "developer agent metadata"],
  // Release/build tooling only. `scripts/` itself must stay: the Colab notebook
  // adapter spawns scripts/colab-jupyter-exec.py relative to the server cwd.
  ["scripts/botkeep", "release tooling — not part of the server runtime"],
  ["scripts/check-cloudflare-free.mjs", "Cloudflare-only deploy audit; never invoked by the server"],
];

const SENSITIVE_NAME = [
  [/(^|\/)\.env(\.|$)/i, "environment file"],
  [/(^|\/)\.npmrc$/i, "npm credentials file"],
  [/\.(pem|p12|pfx|key)$/i, "key material"],
  [/(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i, "ssh key"],
  [/firebase-adminsdk.*\.json$/i, "firebase service account"],
  // Filename-scoped on purpose: a bare `credentials` path segment also matches
  // build output such as .next/server/app/api/user/credentials/route/*.json,
  // whose removal breaks that route.
  [/(^|\/)(client_secret|service[-_]account|credentials)[^/]*\.json$/i, "credential json"],
  [/\.(db|db-wal|db-shm|db-journal|sqlite|sqlite3)$/i, "database file"],
  [/\.tsbuildinfo$/i, "build cache"],
];

const SECRET_PATTERNS = [
  ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=\s]{100,}/],
  ["groq-key", /gsk_[A-Za-z0-9]{48,}/],
  ["openrouter-key", /sk-or-v1-[a-f0-9]{64}/],
  ["github-token", /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{36,}\b|github_pat_[A-Za-z0-9_]{60,}/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}/],
  ["stripe-live-key", /\bsk_live_[A-Za-z0-9]{20,}/],
  ["legacy-render-secret", /factoryos-render-worker-secret-key-2026/],
];
const TEXT_EXT = /\.(js|mjs|cjs|json|html|txt|md|css|map|ya?ml|ts|tsx|sh|py|xml|svg|env)$/i;
const MAX_SCAN_BYTES = 8 * MIB;

// ── helpers ─────────────────────────────────────────────────────────────────
const toPosix = (p) => p.split(path.sep).join("/");
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function git(...a) {
  try {
    return execFileSync("git", a, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function excludedPathReason(rel) {
  for (const [p, why] of EXCLUDED_PROJECT_PATHS) {
    if (rel === p || rel.startsWith(`${p}/`)) return `${p}: ${why}`;
  }
  return null;
}
// Inside node_modules only credential-style files are refused; package-owned
// fixtures (.pem CA bundles, .db test data) are left intact and covered by the
// content scan instead, so the dependency tree is never silently altered.
const NODE_MODULES_NAME_RULES = new Set(["environment file", "npm credentials file", "ssh key"]);
function sensitiveNameReason(rel) {
  const inNodeModules = rel.startsWith("node_modules/");
  for (const [re, why] of SENSITIVE_NAME) {
    if (inNodeModules && !NODE_MODULES_NAME_RULES.has(why)) continue;
    if (re.test(rel)) return why;
  }
  return null;
}

/** @type {Map<string, any>} */
const entries = new Map();
/** @type {Map<string, {count: number, bytes: number, examples: string[]}>} */
const excluded = new Map();
function noteExcluded(reason, rel, bytes, count = 1) {
  const e = excluded.get(reason) ?? { count: 0, bytes: 0, examples: [] };
  e.count += count;
  e.bytes += bytes;
  if (e.examples.length < 5) e.examples.push(rel);
  excluded.set(reason, e);
}

function addTree(srcRoot, destPrefix, { filter, source }) {
  const stack = [""];
  while (stack.length) {
    const relDir = stack.pop();
    const absDir = path.join(srcRoot, relDir);
    for (const name of fs.readdirSync(absDir)) {
      const relSrc = relDir ? `${relDir}/${name}` : name;
      const abs = path.join(absDir, name);
      const rel = destPrefix ? `${destPrefix}/${relSrc}` : relSrc;
      const st = fs.lstatSync(abs);

      if (st.isDirectory()) {
        const dirReason = excludedPathReason(rel);
        if (dirReason) {
          // Measure before skipping: an exclusion with no byte figure makes the
          // release-excluded inventory useless as evidence.
          const s = dirStats(abs);
          noteExcluded(dirReason, rel, s.bytes, s.files);
          continue;
        }
        stack.push(relSrc);
        if (!entries.has(rel)) entries.set(rel, { name: rel, type: "dir", mode: 0o755, source });
        continue;
      }
      const reason = excludedPathReason(rel) || (filter && filter(relSrc, name)) || sensitiveNameReason(rel);
      if (reason) {
        noteExcluded(reason, rel, st.size);
        continue;
      }
      if (entries.has(rel)) continue; // earlier source wins
      if (st.isSymbolicLink()) {
        const target = fs.readlinkSync(abs);
        const resolved = path.resolve(path.dirname(abs), target);
        const relToRoot = path.relative(srcRoot, resolved);
        if (path.isAbsolute(target) || relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
          throw new Error(`Refusing symlink that escapes the release tree: ${rel} -> ${target}`);
        }
        entries.set(rel, { name: rel, type: "symlink", target: toPosix(target), mode: 0o777, source, bytes: 0 });
      } else if (st.isFile()) {
        entries.set(rel, {
          name: rel,
          type: "file",
          abs,
          mode: st.mode & 0o111 ? 0o755 : 0o644,
          bytes: st.size,
          allocated: typeof st.blocks === "number" ? st.blocks * 512 : null,
          source,
        });
      }
    }
  }
}

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let names;
    try {
      names = fs.readdirSync(d);
    } catch {
      continue;
    }
    for (const n of names) {
      const p = path.join(d, n);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile()) {
        files++;
        bytes += st.size;
      }
    }
  }
  return { files, bytes };
}

// ── main ────────────────────────────────────────────────────────────────────
if (!fs.existsSync(path.join(STANDALONE, "server.js"))) {
  console.error(
    `[package] ${STANDALONE}/server.js not found. Run \`npm run build:botkeep\` first ` +
      `(SHORTFORGE_BUILD_PROFILE=botkeep must have been set for the build).`,
  );
  process.exit(2);
}
if (!fs.existsSync(STATIC_DIR)) {
  console.error("[package] .next/static not found — build output is incomplete.");
  process.exit(2);
}

// 1. traced server (server.js, .next/server, node_modules, package.json, …)
addTree(STANDALONE, "", { source: "next-standalone" });
// 2. client static assets (not copied by Next into standalone)
addTree(STATIC_DIR, ".next/static", { source: "next-static" });
// 3. public assets
if (fs.existsSync(PUBLIC_DIR)) addTree(PUBLIC_DIR, "public", { source: "public" });
// 4. runtime data files read by path
for (const { dir, ext } of RUNTIME_ASSET_SOURCES) {
  const abs = path.join(projectRoot, dir);
  if (!fs.existsSync(abs)) continue;
  addTree(abs, dir, {
    source: "runtime-assets",
    filter: (relSrc, name) => (ext.test(name) ? null : "runtime-assets: non-data file (source is bundled)"),
  });
}
// 5. launcher
const launcherPath = path.join(here, "start.mjs");
entries.set("start.mjs", {
  name: "start.mjs",
  type: "file",
  abs: launcherPath,
  mode: 0o644,
  bytes: fs.statSync(launcherPath).size,
  allocated: null,
  source: "launcher",
});

// ensure server.js sits at the root of the archive (flat layout)
if (!entries.has("server.js")) {
  console.error("[package] server.js is not at the archive root; check outputFileTracingRoot.");
  process.exit(2);
}

// ── scan ────────────────────────────────────────────────────────────────────
const findings = [];
let denyValues = [];
if (denyValuesFrom) {
  const raw = fs.readFileSync(path.resolve(denyValuesFrom), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, "");
    if (v.length >= 12) denyValues.push({ key: m[1], value: v });
  }
}
let scannedTextFiles = 0;
for (const e of entries.values()) {
  if (e.type !== "file") continue;
  if (!TEXT_EXT.test(e.name) || e.bytes > MAX_SCAN_BYTES) continue;
  const text = fs.readFileSync(e.abs, "utf8");
  scannedTextFiles++;
  const inNodeModules = e.name.startsWith("node_modules/");
  for (const [id, re] of SECRET_PATTERNS) {
    if (inNodeModules && id === "private-key-block") continue; // library-owned test fixtures
    if (re.test(text)) findings.push({ path: e.name, kind: id });
  }
  for (const d of denyValues) {
    if (text.includes(d.value)) findings.push({ path: e.name, kind: `value-of:${d.key}` });
  }
}

// ── generated release info (inside the zip) ───────────────────────────────
const sha = process.env.GITHUB_SHA || process.env.SHORTFORGE_SOURCE_SHA || git("rev-parse", "HEAD") || "unknown";
// SHORTFORGE_SOURCE_DIRTY lets an offline/containerized run (no .git available)
// state the truth instead of being silently reported as clean.
const dirty = process.env.SHORTFORGE_SOURCE_DIRTY
  ? process.env.SHORTFORGE_SOURCE_DIRTY === "1"
  : process.env.GITHUB_SHA ? false : (git("status", "--porcelain") || "").length > 0;
const sha12 = sha.slice(0, 12);
const epoch = Number(process.env.SOURCE_DATE_EPOCH || git("log", "-1", "--format=%ct") || 0);

const sortedNames = [...entries.keys()].sort(cmp);
const fileEntries = sortedNames.map((n) => entries.get(n)).filter((e) => e.type === "file");
const uncompressedBytes = fileEntries.reduce((s, e) => s + e.bytes, 0);

const releaseInfo = Buffer.from(
  JSON.stringify(
    {
      name: "shortforge-botkeep",
      commit: sha,
      dirtyWorkingTree: dirty,
      profile: "botkeep",
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      startCommand: "node start.mjs",
      fileCount: fileEntries.length,
      uncompressedBytesExcludingThisFile: uncompressedBytes,
    },
    null,
    2,
  ) + "\n",
);
entries.set("RELEASE-INFO.json", {
  name: "RELEASE-INFO.json",
  type: "file",
  data: releaseInfo,
  mode: 0o644,
  bytes: releaseInfo.length,
  allocated: null,
  source: "generated",
});

// ── write zip ──────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
const zipName = `shortforge-botkeep-${sha12}.zip`;
const zipPath = path.join(outDir, zipName);
const ordered = [...entries.keys()].sort(cmp).map((n) => entries.get(n));
writeZip(zipPath, ordered, { epochSeconds: epoch });

const hash = crypto.createHash("sha256");
{
  const fd = fs.openSync(zipPath, "r");
  const buf = Buffer.alloc(4 * MIB);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  fs.closeSync(fd);
}
const zipSha256 = hash.digest("hex");
fs.writeFileSync(`${zipPath}.sha256`, `${zipSha256}  ${zipName}\n`);

// ── reporting ──────────────────────────────────────────────────────────────
const totalBytes = uncompressedBytes + releaseInfo.length;
const topLevel = new Map();
const packages = new Map();
for (const e of fileEntries) {
  const parts = e.name.split("/");
  const top = parts[0] === "node_modules" || parts[0] === ".next" ? `${parts[0]}/${parts[1] ?? ""}` : parts[0];
  topLevel.set(top, (topLevel.get(top) ?? 0) + e.bytes);
  if (parts[0] === "node_modules") {
    const pkg = parts[1]?.startsWith("@") ? `${parts[1]}/${parts[2]}` : parts[1];
    packages.set(pkg, (packages.get(pkg) ?? 0) + e.bytes);
  }
}
const top = (m, n) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([p, bytes]) => ({ path: p, bytes, mib: +(bytes / MIB).toFixed(2) }));

const fullNodeModules = fs.existsSync(path.join(projectRoot, "node_modules"))
  ? dirStats(path.join(projectRoot, "node_modules"))
  : null;
const zipBytes = fs.statSync(zipPath).size;
const overBudget = totalBytes > budgetMiB * MIB;

const manifest = {
  status: findings.length ? "SECRET_SCAN_FAILED" : overBudget ? "OVER_BUDGET" : "WITHIN_BUDGET",
  note:
    "WITHIN_BUDGET is a size statement only. Deployment-ready additionally requires the " +
    "extracted-archive smoke test (verify-release.mjs) to pass.",
  commit: sha,
  dirtyWorkingTree: dirty,
  workflow: process.env.GITHUB_RUN_ID
    ? {
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        ref: process.env.GITHUB_REF,
      }
    : null,
  builder: { node: process.version, platform: `${process.platform}-${process.arch}` },
  archive: { file: zipName, sha256: zipSha256, compressedBytes: zipBytes, compressedMiB: +(zipBytes / MIB).toFixed(2) },
  size: {
    fileCount: fileEntries.length + 1,
    uncompressedBytes: totalBytes,
    uncompressedMiB: +(totalBytes / MIB).toFixed(2),
    budgetMiB,
    headroomMiB: +(budgetMiB - totalBytes / MIB).toFixed(2),
    allocatedBytesOnBuilder: fileEntries.every((e) => e.allocated !== null)
      ? fileEntries.reduce((s, e) => s + e.allocated, 0)
      : null,
  },
  comparison: fullNodeModules
    ? {
        fullInstallNodeModulesBytes: fullNodeModules.bytes,
        fullInstallNodeModulesMiB: +(fullNodeModules.bytes / MIB).toFixed(2),
        fullInstallNodeModulesFiles: fullNodeModules.files,
      }
    : null,
  largestTopLevel: top(topLevel, 15),
  largestPackages: top(packages, 20),
  sources: Object.fromEntries(
    [...new Set(ordered.map((e) => e.source))].map((s) => [
      s,
      ordered.filter((e) => e.source === s && e.type === "file").reduce((a, e) => a + e.bytes, 0),
    ]),
  ),
  secretScan: {
    scannedTextFiles,
    patterns: SECRET_PATTERNS.map(([id]) => id),
    denyValuesChecked: denyValues.length,
    findings,
  },
};

fs.writeFileSync(path.join(outDir, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(
  path.join(outDir, "release-inventory.json"),
  JSON.stringify(
    ordered.map((e) => ({ path: e.name, type: e.type, bytes: e.bytes ?? 0, source: e.source })),
    null,
    0,
  ) + "\n",
);
fs.writeFileSync(
  path.join(outDir, "release-excluded.json"),
  JSON.stringify(
    [...excluded.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.bytes - a.bytes),
    null,
    2,
  ) + "\n",
);

console.log(`[package] ${zipName}`);
console.log(`[package] files=${manifest.size.fileCount} uncompressed=${manifest.size.uncompressedMiB} MiB compressed=${manifest.archive.compressedMiB} MiB`);
console.log(`[package] budget=${budgetMiB} MiB headroom=${manifest.size.headroomMiB} MiB sha256=${zipSha256}`);
console.log(`[package] secret-scan findings=${findings.length} (paths only; values never printed)`);
for (const f of findings) console.log(`  ! ${f.kind}: ${f.path}`);
if (overBudget) {
  console.log("[package] OVER BUDGET. Largest packages:");
  for (const p of manifest.largestPackages.slice(0, 10)) console.log(`  ${p.mib} MiB  ${p.path}`);
}
if (dirty) console.log("[package] WARNING: git working tree is dirty; this build is not reproducible from the commit alone.");

if (findings.length) process.exit(2);
if (overBudget) process.exit(3);
