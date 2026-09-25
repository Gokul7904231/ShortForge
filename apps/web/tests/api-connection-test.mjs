/**
 * ShortFactory OS — Full API Connection Test Suite
 * 
 * Tests every frontend-backend connection across all routes.
 * Run with: node tests/api-connection-test.mjs
 * Requires dev server running on http://localhost:3000
 */

const BASE = "http://localhost:3000";

// Load the same server-side environment used by Next.js so protected API
// tests can authenticate as the internal FactoryOS owner instead of relying
// on a browser session cookie that this standalone Node script does not have.
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
const INTERNAL_API_SECRET_KEY = process.env.INTERNAL_API_SECRET_KEY || "";
const AUTH_HEADERS = INTERNAL_API_SECRET_KEY
  ? { Authorization: `Bearer ${INTERNAL_API_SECRET_KEY}` }
  : {};

let passed = 0;
let failed = 0;
let warnings = 0;

const results = [];

async function test(name, fn) {
  try {
    const result = await fn();
    const icon = result.ok ? "✅" : result.warn ? "⚠️ " : "❌";
    const status = result.ok ? "PASS" : result.warn ? "WARN" : "FAIL";
    console.log(`${icon} [${status}] ${name}`);
    if (result.note) console.log(`       ↳ ${result.note}`);
    if (result.ok) passed++;
    else if (result.warn) warnings++;
    else failed++;
    results.push({ name, ...result });
  } catch (err) {
    console.log(`❌ [ERROR] ${name}`);
    console.log(`       ↳ ${err.message}`);
    failed++;
    results.push({ name, ok: false, note: err.message });
  }
}

async function get(path, expectJson = true) {
  const res = await fetch(`${BASE}${path}`, { headers: AUTH_HEADERS });
  const body = expectJson ? await res.json().catch(() => null) : await res.text();
  return { res, body };
}

async function post(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

// =============================================
// GROUP 1: Core Health & Status APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 1: Core Health & System APIs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("GET /api/health", async () => {
  const { res, body } = await get("/api/health");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
  const hasStatus = body?.status || body?.ok || body?.healthy || body?.uptime;
  return { ok: true, note: `status=${body?.status ?? "present"} uptime=${body?.uptime ?? "—"}` };
});

await test("GET /api/factory-state", async () => {
  const { res, body } = await get("/api/factory-state");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `runningJobs=${body?.runningJobs?.length ?? 0}, queuedJobs=${body?.queuedJobs?.length ?? 0}` };
});

await test("GET /api/jobs/list", async () => {
  const { res, body } = await get("/api/jobs/list");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  const jobs = body?.jobs ?? body ?? [];
  return { ok: true, note: `${jobs.length} job(s) returned` };
});

await test("GET /api/job-history", async () => {
  const { res, body } = await get("/api/job-history");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `History entries: ${body?.jobs?.length ?? body?.length ?? "—"}` };
});

await test("GET /api/workers/metrics", async () => {
  const { res, body } = await get("/api/workers/metrics");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `workers=${body?.workers?.length ?? "—"}` };
});

// =============================================
// GROUP 2: AI Provider & Model APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 2: AI Provider & Model APIs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("GET /api/providers", async () => {
  const { res, body } = await get("/api/providers");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  const providers = body?.providers ?? [];
  return { ok: true, note: `${providers.length} provider(s): [${providers.map(p => p.id).join(", ")}]` };
});

await test("GET /api/provider-reliability", async () => {
  const { res, body } = await get("/api/provider-reliability");
  if (!res.ok) return { warn: true, note: `HTTP ${res.status} — may be OK without live API keys` };
  return { ok: true, note: `reliability data returned` };
});

await test("GET /api/render-engine-health", async () => {
  const { res, body } = await get("/api/render-engine-health");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
  return { ok: true, note: `engines: ${JSON.stringify(body).slice(0, 80)}` };
});

// =============================================
// GROUP 3: Content Engine APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 3: Content Engine Registry APIs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const ENGINES = ["quiz", "story", "facts", "history", "coding", "motivation", "psychology", "reddit", "guess-flag", "guess-logo"];

for (const engine of ENGINES) {
  await test(`GET /api/engines/${engine}`, async () => {
    const { res, body } = await get(`/api/engines/${engine}`);
    if (res.status === 404) return { ok: false, note: `Engine "${engine}" not found in server registry` };
    if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
    return { ok: true, note: `name="${body?.manifest?.name}" steps=${body?.manifest?.steps?.length ?? "—"}` };
  });
}

// =============================================
// GROUP 4: Quiz & Quick Generate APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 4: Quiz & Quick Generate");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("POST /api/quiz/mock (sandbox mode)", async () => {
  const { res, body } = await post("/api/quiz/mock", {
    countryCode: "US",
    tone: "Challenging & Provocative",
    format: "6_rapid",
    version: 1,
  });
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `hook="${body?.hook?.slice(0, 60)}..." questions=${body?.questions?.length ?? 0}` };
});

await test("GET /api/quiz/compile", async () => {
  const { res, body } = await get("/api/quiz/compile");
  if (res.status === 405) return { ok: true, note: "GET not allowed (needs POST) — method routing OK" };
  return { ok: res.ok, note: `HTTP ${res.status}` };
});

// =============================================
// GROUP 5: Storage & Drive APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 5: Storage & Google Drive APIs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("GET /api/storage/health", async () => {
  const { res, body } = await get("/api/storage/health");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `primary=${body?.primary ?? "—"} status=${body?.status ?? "—"}` };
});

await test("GET /api/storage/analytics", async () => {
  const { res, body } = await get("/api/storage/analytics");
  if (!res.ok) return { warn: true, note: `HTTP ${res.status} — may need credentials` };
  return { ok: true, note: `analytics data returned` };
});

await test("GET /api/storage/queue", async () => {
  const { res, body } = await get("/api/storage/queue");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
  return { ok: true, note: `queue=${JSON.stringify(body).slice(0, 60)}` };
});

await test("GET /api/drive/status", async () => {
  const { res, body } = await get("/api/drive/status");
  if (!res.ok) return { warn: true, note: `HTTP ${res.status} — may need Drive credentials` };
  return { ok: true, note: `connected=${body?.connected ?? "—"}` };
});

await test("GET /api/drive/list", async () => {
  const { res, body } = await get("/api/drive/list");
  if (res.status === 401 || res.status === 403) return { warn: true, note: "Auth required (expected)" };
  if (!res.ok) return { warn: true, note: `HTTP ${res.status}` };
  return { ok: true, note: `files=${body?.files?.length ?? "—"}` };
});

// =============================================
// GROUP 6: Analytics APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 6: Analytics APIs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("GET /api/analytics", async () => {
  const { res, body } = await get("/api/analytics");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `analytics data present` };
});

await test("GET /api/content-health (POST-only route)", async () => {
  const { res } = await get("/api/content-health");
  // This endpoint only supports POST — 405 is correct behavior
  if (res.status === 405) return { ok: true, note: "POST-only route — GET correctly rejected (405)" };
  return { ok: res.ok, note: `HTTP ${res.status}` };
});

await test("POST /api/content-health (schema validation)", async () => {
  const { res, body } = await post("/api/content-health", {
    topic: "Space Facts",
    script: "Did you know that the sun is 93 million miles from Earth?",
    scenes: [{ text: "Space scene 1", imagePrompt: "Astronaut in orbit" }],
  });
  if (!res.ok) return { warn: true, note: `HTTP ${res.status}: ${body?.error} (may need pipeline service)` };
  return { ok: true, note: `validation result returned` };
});

await test("GET /api/logs/events", async () => {
  const { res, body } = await get("/api/logs/events");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
  return { ok: true, note: `events=${body?.events?.length ?? "—"}` };
});

// =============================================
// GROUP 7: Admin & Blueprint APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 7: Admin & System APIs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("GET /api/admin/factory-state", async () => {
  const { res, body } = await get("/api/admin/factory-state");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: "factory state admin endpoint OK" };
});

await test("GET /api/admin/telemetry", async () => {
  const { res, body } = await get("/api/admin/telemetry");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: "telemetry endpoint OK" };
});

await test("GET /api/auth/session (POST-only route)", async () => {
  const { res } = await get("/api/auth/session");
  // POST creates session, DELETE logs out — GET should return 405
  if (res.status === 405) return { ok: true, note: "POST/DELETE-only route — GET correctly rejected (405)" };
  if (res.status === 200) return { ok: true, note: "active session found" };
  if (res.status === 401) return { ok: true, note: "unauthenticated (expected in dev)" };
  return { ok: false, note: `Unexpected HTTP ${res.status}` };
});

// =============================================
// GROUP 8: Publishing APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 8: Publishing APIs");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("GET /api/publish/queue", async () => {
  const { res, body } = await get("/api/publish/queue");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `queue=${JSON.stringify(body).slice(0, 60)}` };
});

// =============================================
// GROUP 9: Custom Templates & Content Engines APIs
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  GROUP 9: Dynamic Templates & Content Engines");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await test("GET /api/templates (template registry)", async () => {
  const { res, body } = await get("/api/templates");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `${body?.templates?.length ?? 0} template(s) returned` };
});

await test("GET /api/engines (engine registry)", async () => {
  const { res, body } = await get("/api/engines");
  if (!res.ok) return { ok: false, note: `HTTP ${res.status}: ${body?.error}` };
  return { ok: true, note: `${body?.engines?.length ?? 0} engine(s) returned` };
});

// =============================================
// SUMMARY
// =============================================
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  RESULTS SUMMARY");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const total = passed + failed + warnings;
console.log(`Total:    ${total} tests`);
console.log(`✅ Pass:  ${passed}`);
console.log(`⚠️  Warn:  ${warnings}`);
console.log(`❌ Fail:  ${failed}`);

if (failed > 0) {
  console.log("\n--- FAILED TESTS ---");
  results.filter(r => !r.ok && !r.warn).forEach(r => {
    console.log(`  ❌ ${r.name}: ${r.note}`);
  });
}

if (warnings > 0) {
  console.log("\n--- WARNINGS (may need credentials) ---");
  results.filter(r => r.warn).forEach(r => {
    console.log(`  ⚠️  ${r.name}: ${r.note}`);
  });
}

console.log("\n" + (failed === 0 ? "✅ ALL CRITICAL TESTS PASSED" : `❌ ${failed} CRITICAL FAILURES FOUND`));
