#!/usr/bin/env node
/**
 * ShortForge — Cloudflare Workers Free Preflight & Zero-Bill Guard
 * =================================================================
 * Validates the .open-next/ OpenNext Worker artifacts against
 * Cloudflare Workers FREE tier limits.
 *
 * Checks:
 *  1. worker.js exists and is < 10 MiB (CF Workers Free script size)
 *  2. .open-next/assets: file count < 20,000 and no single file > 25 MiB
 *  3. .open-next/server-functions: NO forbidden file types bundled
 *     (.mp4 .mov .avi .wav .node .py .db .sqlite .c .h)
 *  4. Secret scanner: no leaked API keys in worker.js or JS bundles
 *  5. Banned paid-product bindings in wrangler.toml
 *     (kv_namespaces, d1_databases, r2_buckets, queues, durable_objects)
 *  6. nodejs_compat flag is present (required for Firebase Admin / Node.js APIs)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// ─── Paths ────────────────────────────────────────────────────────────────────
const OPEN_NEXT_DIR         = path.join(ROOT_DIR, ".open-next");
const WORKER_JS             = path.join(OPEN_NEXT_DIR, "worker.js");
const ASSETS_DIR            = path.join(OPEN_NEXT_DIR, "assets");
const SERVER_FUNCTIONS_DIR  = path.join(OPEN_NEXT_DIR, "server-functions");
const WRANGLER_TOML         = path.join(ROOT_DIR, "wrangler.toml");

// ─── Limits ───────────────────────────────────────────────────────────────────
const WORKER_SCRIPT_WARN_BYTES  = 3  * 1024 * 1024;  //  3 MiB warn
const WORKER_SCRIPT_MAX_BYTES   = 10 * 1024 * 1024;  // 10 MiB hard stop
const MAX_ASSET_COUNT           = 20000;
const WARN_ASSET_COUNT          = 15000;
const MAX_ASSET_BYTES           = 25 * 1024 * 1024;  // 25 MiB per CF CDN rules
const WARN_ASSET_BYTES          = 20 * 1024 * 1024;

// ─── Banned file types inside server-functions bundle ─────────────────────────
const BANNED_SERVER_EXTENSIONS = new Set([
  ".mp4", ".mov", ".avi", ".mkv", ".flv", ".wav",  // media files
  ".node",                                           // native addons
  ".py",                                             // Python scripts (render worker only)
  ".db", ".sqlite", ".sqlite3",                      // SQLite databases
  ".c", ".h",                                        // C source (sqlite3 deps)
]);

// ─── Secret patterns ─────────────────────────────────────────────────────────
// NOTE: These target actual secret values, not code that handles them.
// Library code (firebase-admin, jose, google-gax) legitimately parses PEM strings
// and will match if we scan node_modules — so node_modules is excluded below.
const SENSITIVE_PATTERNS = [
  /gsk_[a-zA-Z0-9]{48,64}/,                    // Groq API Key
  /sk-or-v1-[a-f0-9]{64}/,                     // OpenRouter API Key
  /factoryos-render-worker-secret-key-2026/,    // Render worker hard-coded secret
  // NOTE: AIza (Firebase client key) is INTENTIONALLY embedded in the bundle as
  // NEXT_PUBLIC_FIREBASE_API_KEY. It is not a secret — Firebase security uses Rules.
];

// Runtime secret values checked at audit time
const ENV_SECRETS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GROQ_API_KEY,
  process.env.FALLBACK_1_API_KEY,
  process.env.FALLBACK_2_API_KEY,
  process.env.RENDER_WORKER_SECRET,
  process.env.BASIC_RENDER_API_SECRET,
  process.env.CLOUDINARY_API_SECRET,
  process.env.FIREBASE_PRIVATE_KEY,
].filter((k) => k && k.length > 10 && !k.includes("mock") && !k.includes("placeholder"));

// ─── Paid CF product binding keys (none allowed on Free) ─────────────────────
const PAID_BINDING_KEYS = [
  "kv_namespaces",
  "d1_databases",
  "r2_buckets",
  "queues",
  "durable_objects",
  "hyperdrive",
  "vectorize",
  "ai",
  "browser",
  "workers_for_platforms",
];

// ─── State ────────────────────────────────────────────────────────────────────
const errors   = [];
const warnings = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MiB";
}

function scanDir(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git") continue;
      scanDir(full, visitor);
    } else if (entry.isFile()) {
      visitor(full, entry.name);
    }
  }
}

function scanSecrets(filePath, content) {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`[SECRET LEAK] Pattern ${pattern} matched in: ${filePath}`);
    }
  }
  for (const secret of ENV_SECRETS) {
    if (content.includes(secret)) {
      errors.push(`[SECRET LEAK] Env secret value detected in: ${filePath}`);
    }
  }
}

// ─── Banner ──────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════");
console.log("  ShortForge — Cloudflare Workers FREE Preflight Auditor");
console.log("═══════════════════════════════════════════════════════════\n");

// ─── Guard: .open-next must exist ────────────────────────────────────────────
if (!fs.existsSync(OPEN_NEXT_DIR)) {
  console.error("❌ .open-next/ directory not found.");
  console.error("   Run: npx opennextjs-cloudflare build   (or: npm run preview)");
  process.exit(1);
}

// ─── Check 1: worker.js size ──────────────────────────────────────────────────
console.log("── Check 1: worker.js ──────────────────────────────────────");
if (!fs.existsSync(WORKER_JS)) {
  errors.push("[MISSING] .open-next/worker.js not found. OpenNext build may be incomplete.");
} else {
  const workerSize = fs.statSync(WORKER_JS).size;
  console.log(`   worker.js size: ${fmt(workerSize)}`);
  if (workerSize > WORKER_SCRIPT_MAX_BYTES) {
    errors.push(`[WORKER TOO LARGE] worker.js is ${fmt(workerSize)} — exceeds ${fmt(WORKER_SCRIPT_MAX_BYTES)} hard limit.`);
  } else if (workerSize > WORKER_SCRIPT_WARN_BYTES) {
    warnings.push(`[WORKER LARGE] worker.js is ${fmt(workerSize)} — approaching compressed 3 MiB Worker script limit.`);
  } else {
    console.log("   ✅ worker.js size OK");
  }
  try {
    const wContent = fs.readFileSync(WORKER_JS, "utf8");
    scanSecrets(WORKER_JS, wContent);
  } catch {}
}

// ─── Check 2: assets/ count and size ─────────────────────────────────────────
console.log("\n── Check 2: .open-next/assets/ ─────────────────────────────");
let assetCount = 0;
let assetBytes = 0;
let largestAsset = { path: "", size: 0 };

if (!fs.existsSync(ASSETS_DIR)) {
  warnings.push("[MISSING] .open-next/assets/ not found — static assets will not be deployed.");
} else {
  scanDir(ASSETS_DIR, (fullPath) => {
    assetCount++;
    const size = fs.statSync(fullPath).size;
    assetBytes += size;
    if (size > largestAsset.size) largestAsset = { path: fullPath, size };
    if (size > MAX_ASSET_BYTES) {
      errors.push(`[ASSET TOO LARGE] ${fullPath} is ${fmt(size)} — exceeds 25 MiB Cloudflare limit.`);
    } else if (size > WARN_ASSET_BYTES) {
      warnings.push(`[ASSET LARGE] ${fullPath} is ${fmt(size)} — approaching 25 MiB limit.`);
    }
  });

  console.log(`   Asset count : ${assetCount.toLocaleString()}`);
  console.log(`   Total size  : ${fmt(assetBytes)}`);
  if (largestAsset.path) {
    console.log(`   Largest     : ${path.basename(largestAsset.path)} (${fmt(largestAsset.size)})`);
  }
  if (assetCount >= MAX_ASSET_COUNT) {
    errors.push(`[ASSET COUNT] ${assetCount} assets — exceeds Cloudflare 20,000 file limit.`);
  } else if (assetCount >= WARN_ASSET_COUNT) {
    warnings.push(`[ASSET COUNT] ${assetCount} assets — approaching 20,000 limit.`);
  } else {
    console.log("   ✅ Asset count OK");
  }
}

// ─── Check 3: server-functions/ banned file types ────────────────────────────
console.log("\n── Check 3: .open-next/server-functions/ banned files ──────");
let serverBundleBytes = 0;
const bannedFiles = [];

if (fs.existsSync(SERVER_FUNCTIONS_DIR)) {
  scanDir(SERVER_FUNCTIONS_DIR, (fullPath, name) => {
    const ext = path.extname(name).toLowerCase();
    const size = fs.statSync(fullPath).size;
    serverBundleBytes += size;
    if (BANNED_SERVER_EXTENSIONS.has(ext)) {
      bannedFiles.push({ path: fullPath, ext, size });
    }
  });

  if (bannedFiles.length === 0) {
    console.log("   ✅ No banned file types in server bundle");
  } else {
    for (const f of bannedFiles) {
      const label =
        [".mp4", ".mov", ".avi", ".wav"].includes(f.ext) ? "MEDIA IN WORKER" :
        f.ext === ".node"                                  ? "NATIVE ADDON IN WORKER" :
        f.ext === ".py"                                    ? "PYTHON SCRIPT IN WORKER" :
        [".db", ".sqlite", ".sqlite3"].includes(f.ext)    ? "DATABASE IN WORKER" :
                                                             "NATIVE SOURCE IN WORKER";
      errors.push(`[${label}] ${f.path} (${fmt(f.size)})`);
    }
  }
  console.log(`   Server bundle total: ${fmt(serverBundleBytes)}`);
}

// ─── Check 4: Secret scan JS bundles (application code only) ────────────────
console.log("\n── Check 4: Secret scan (server-functions JS) ──────────────");
let secretScanned = 0;
if (fs.existsSync(SERVER_FUNCTIONS_DIR)) {
  scanDir(SERVER_FUNCTIONS_DIR, (fullPath, name) => {
    const ext = path.extname(name).toLowerCase();
    if (ext !== ".js" && ext !== ".mjs" && ext !== ".json") return;
    // Skip: library code (false positives on PEM handling), audit script itself, debug data
    if (
      fullPath.includes("node_modules") ||
      fullPath.includes("\\scripts\\") ||
      fullPath.includes("/scripts/") ||
      fullPath.includes("\\data\\") ||
      fullPath.includes("/data/")
    ) return;
    const size = fs.statSync(fullPath).size;
    if (size > 50 * 1024 * 1024) return; // skip unreasonably large files
    try {
      const content = fs.readFileSync(fullPath, "utf8");
      scanSecrets(fullPath, content);
      secretScanned++;
    } catch {}
  });
}
console.log(`   Scanned ${secretScanned.toLocaleString()} JS/JSON files`);
if (!errors.some((e) => e.includes("[SECRET LEAK]"))) {
  console.log("   ✅ No secret leaks detected");
}

// ─── Check 5: wrangler.toml — paid bindings + nodejs_compat ──────────────────
console.log("\n── Check 5: wrangler.toml binding audit ────────────────────");
if (!fs.existsSync(WRANGLER_TOML)) {
  warnings.push("[MISSING] wrangler.toml not found — cannot validate bindings.");
} else {
  const toml = fs.readFileSync(WRANGLER_TOML, "utf8");
  const tomlLower = toml.toLowerCase();

  // Match TOML section headers [kv_namespaces] or standalone keys "kv_namespaces ="
  // Use word-boundary pattern to avoid matching substrings like "main" in "ai".
  const PAID_BINDING_PATTERNS = [
    /^\s*\[\[?kv_namespaces/m,
    /^\s*\[\[?d1_databases/m,
    /^\s*\[\[?r2_buckets/m,
    /^\s*\[\[?queues/m,
    /^\s*\[\[?durable_objects/m,
    /^\s*\[\[?hyperdrive/m,
    /^\s*\[\[?vectorize/m,
    /^\s*\[\[?workers_for_platforms/m,
    /\bworkers_ai\b/i,
    /\bbrowser_rendering\b/i,
  ];
  const PAID_LABELS = [
    "kv_namespaces", "d1_databases", "r2_buckets", "queues",
    "durable_objects", "hyperdrive", "vectorize", "workers_for_platforms",
    "workers_ai", "browser_rendering",
  ];

  const paidFound = PAID_BINDING_PATTERNS
    .map((re, i) => re.test(toml) ? PAID_LABELS[i] : null)
    .filter(Boolean);

  if (paidFound.length > 0) {
    for (const key of paidFound) {
      errors.push(`[PAID BINDING] wrangler.toml contains "${key}" — paid Cloudflare product. Remove it.`);
    }
  } else {
    console.log("   ✅ No paid Cloudflare bindings");
  }

  if (!tomlLower.includes("nodejs_compat")) {
    errors.push('[MISSING FLAG] compatibility_flags must include "nodejs_compat" for Firebase Admin / Node.js APIs.');
  } else {
    console.log('   ✅ nodejs_compat flag present');
  }
}

// ─── Final Summary ────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log("  AUDIT SUMMARY");
console.log("═══════════════════════════════════════════════════════════");

if (warnings.length > 0) {
  console.log("\n⚠️  WARNINGS:");
  warnings.forEach((w) => console.log(`   ${w}`));
}

if (errors.length > 0) {
  console.error("\n❌ CLOUDFLARE WORKERS FREE AUDIT FAILED:");
  errors.forEach((e) => console.error(`   ${e}`));
  console.error("\nDeployment blocked. Fix the issues above before running 'wrangler deploy'.\n");
  process.exit(1);
} else {
  console.log("\n✅ ALL CHECKS PASSED — Worker is Cloudflare Free tier compliant.");
  console.log("   Next: wrangler dev --remote   (or: wrangler deploy)\n");
  process.exit(0);
}
