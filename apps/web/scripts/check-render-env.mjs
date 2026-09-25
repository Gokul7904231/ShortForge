#!/usr/bin/env node
// =============================================================================
// check-render-env.mjs
// Safe validation for apps/web/.env.render.production
//
// It NEVER prints secret values. It only prints status tokens:
//   PRESENT | MISSING | INVALID | LOCALHOST | CLOUDFLARE_ONLY | OPTIONAL
//
// Usage:
//   node scripts/check-render-env.mjs [path-to-env]
// Defaults to apps/web/.env.render.production (relative to repo root).
// =============================================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// A value is considered "secret" and must never be echoed.
const SECRET_KEYS = new Set([
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_2",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "FALLBACK_1_API_KEY",
  "FALLBACK_2_API_KEY",
  "ZAI_API_KEY",
  "OVERSEER_API_KEY",
  "NVIDIA_API_KEY",
  "ELEVENLABS_API_KEY",
  "POLLINATIONS_API_KEY",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "INTERNAL_API_SECRET_KEY",
  "BETTER_AUTH_SECRET",
  "SESSION_SECRET_KEY",
  "OAUTH_STATE_SECRET",
  "CRON_SECRET",
  "ENCRYPTION_KEY",
  "CREDENTIAL_ENCRYPTION_KEY",
  "FACTORYOS_ADMIN_TOKEN",
  "FACTORYOS_EXECUTION_SECRET",
  "RENDER_WORKER_SECRET",
  "RENDER_WORKER_SECRET",
  "SMTP_PASS",
  "SMTP_USER",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
  "GOOGLE_CLIENT_SECRET",
  "YOUTUBE_CLIENT_SECRET",
  "B2_APPLICATION_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "BOOTSTRAP_ADMIN_PASSWORD",
]);

// Cloudflare-only variables that must NOT exist in a Node/Render env.
const CLOUDFLARE_ONLY = new Set([
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "WRANGLER_",
  "CF_",
  "CLOUDFLARE_",
]);

// Variables that are required to be present (name only; value may be blank
// if it is environment-specific, but we still want it declared).
const REQUIRED_VARS = [
  "NODE_ENV",
  "NEXT_PUBLIC_APP_URL",
  "CONTROL_PLANE_URL",
  "BETTER_AUTH_URL",
  "BOOTSTRAP_OWNER_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "INTERNAL_API_SECRET_KEY",
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_STORAGE_BUCKET",
  "AI_PRIMARY_PROVIDER",
  "AI_PROVIDER_ORDER",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_PREFERRED_MODELS",
  "GEMINI_BASE_URL",
  "FALLBACK_1_API_KEY",
  "FALLBACK_2_API_KEY",
  "BASIC_GENERATION_LIMIT",
  "RENDER_WORKER_URL",
  "BASIC_RENDER_API_SECRET",
  "RENDER_WORKER_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "STORAGE_DRIVER",
];

// Keys whose values must be real (non-blank) URLs in production.
const REQUIRED_URL_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "CONTROL_PLANE_URL",
  "BETTER_AUTH_URL",
  "BASIC_RENDER_API_URL",
  "NEXT_PUBLIC_RENDER_ENGINE_URL",
];

const LOCALHOST_PATTERNS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
];

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function isBlank(v) {
  return v === undefined || v === "";
}

function classifyCloudflare(key) {
  for (const p of CLOUDFLARE_ONLY) {
    if (key === p || key.startsWith(p)) return true;
  }
  return false;
}

function containsLocalhost(v) {
  const lower = v.toLowerCase();
  return LOCALHOST_PATTERNS.some((p) => lower.includes(p));
}

function main() {
  const argPath = process.argv[2];
  const envPath = argPath
    ? resolve(process.cwd(), argPath)
    : resolve(ROOT, ".env.render.production");

  console.log(`== ShortForge Render Env Validation ==`);
  console.log(`File: ${envPath}`);

  if (!existsSync(envPath)) {
    console.log(`RESULT: FAIL`);
    console.log(`MISSING: ${envPath} does not exist.`);
    process.exit(1);
  }

  const text = readFileSync(envPath, "utf8");
  const env = parseEnv(text);

  let failed = false;
  const issues = [];

  // 1. Cloudflare-only variables present?
  for (const key of Object.keys(env)) {
    if (classifyCloudflare(key)) {
      console.log(`CLOUDFLARE_ONLY: ${key}`);
      issues.push(`Cloudflare-only variable present: ${key}`);
      failed = true;
    }
  }

  // 2. STORAGE_DRIVER must not be 'cloudflare-worker'
  if (
    env.STORAGE_DRIVER &&
    env.STORAGE_DRIVER.trim().toLowerCase() === "cloudflare-worker"
  ) {
    console.log(`CLOUDFLARE_ONLY: STORAGE_DRIVER=cloudflare-worker`);
    issues.push("STORAGE_DRIVER is set to cloudflare-worker (Cloudflare-only).");
    failed = true;
  }

  // 3. Required variables present?
  for (const key of REQUIRED_VARS) {
    if (!(key in env)) {
      console.log(`MISSING: ${key}`);
      issues.push(`Required variable not declared: ${key}`);
      failed = true;
    } else if (isBlank(env[key])) {
      console.log(`OPTIONAL/EMPTY: ${key} (declared but blank)`);
    } else if (SECRET_KEYS.has(key)) {
      console.log(`PRESENT: ${key} (secret hidden)`);
    } else {
      console.log(`PRESENT: ${key}`);
    }
  }

  // 4. Required URL variables must be non-blank and not localhost
  for (const key of REQUIRED_URL_KEYS) {
    if (!(key in env)) {
      // already reported as MISSING above
      continue;
    }
    const v = env[key];
    if (isBlank(v)) {
      console.log(`MISSING: ${key} (blank production URL)`);
      issues.push(`Production URL blank: ${key}`);
      failed = true;
    } else if (containsLocalhost(v)) {
      console.log(`LOCALHOST: ${key} -> ${v.replace(/./g, "*")}`);
      issues.push(`Production URL points to localhost: ${key}`);
      failed = true;
    }
  }

  // 5. Generic localhost scan across non-secret values
  for (const [key, val] of Object.entries(env)) {
    if (SECRET_KEYS.has(key)) continue;
    if (isBlank(val)) continue;
    if (containsLocalhost(val)) {
      console.log(`LOCALHOST: ${key}`);
      issues.push(`Value references localhost: ${key}`);
      failed = true;
    }
  }

  console.log("");
  if (failed) {
    console.log(`RESULT: FAIL (${issues.length} issue(s))`);
    process.exit(1);
  } else {
    console.log(`RESULT: PASS`);
    process.exit(0);
  }
}

main();
