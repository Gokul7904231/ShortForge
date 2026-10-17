#!/usr/bin/env node
/**
 * ShortForge — Botkeep release verification.
 *
 *   node scripts/botkeep/verify-release.mjs --zip <release.zip> --work <fresh-dir> [--report <file>]
 *
 * 1. checks the archive against its .sha256 sidecar
 * 2. extracts into a FRESH directory (refuses a non-empty one)
 * 3. loads the native/heavy runtime modules from the extracted tree
 * 4. checks launcher port/host resolution (SERVER_PORT / PORT / invalid)
 * 5. starts `node start.mjs` with a sanitized, secret-free environment
 * 6. runs HTTP smoke tests and scans the server log for missing modules
 * 7. measures the extracted filesystem footprint
 *
 * Exit code 0 only if every required check passes.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const MIB = 1024 * 1024;
const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const zipPath = path.resolve(arg("--zip", ""));
const work = path.resolve(arg("--work", ""));
const reportPath = arg("--report", null);
if (!arg("--zip") || !arg("--work")) {
  console.error("usage: verify-release.mjs --zip <file> --work <fresh-dir> [--report <file>]");
  process.exit(2);
}

const checks = [];
const record = (name, ok, detail = "", required = true) => {
  checks.push({ name, ok, required, detail });
  console.log(`${ok ? "PASS" : required ? "FAIL" : "WARN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function footprint(dir) {
  let files = 0;
  let bytes = 0;
  let allocated = 0;
  let haveBlocks = true;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) {
        stack.push(p);
        if (typeof st.blocks === "number") allocated += st.blocks * 512;
      } else if (st.isSymbolicLink()) {
        // Manifest sizes are content sizes: a symlink entry contributes 0 bytes
        // and is not a file, so it must not be counted on either axis.
        if (typeof st.blocks === "number") allocated += st.blocks * 512;
      } else {
        files++;
        bytes += st.size;
        if (typeof st.blocks === "number") allocated += st.blocks * 512;
        else haveBlocks = false;
      }
    }
  }
  return { files, bytes, allocated: haveBlocks ? allocated : null };
}

// 1. checksum ----------------------------------------------------------------
const expected = fs.readFileSync(`${zipPath}.sha256`, "utf8").trim().split(/\s+/)[0];
const h = crypto.createHash("sha256");
h.update(fs.readFileSync(zipPath));
const actual = h.digest("hex");
record("archive sha256 matches sidecar", actual === expected, actual);

// 2. fresh extraction --------------------------------------------------------
if (fs.existsSync(work) && fs.readdirSync(work).length) {
  console.error(`--work must be empty or absent: ${work}`);
  process.exit(2);
}
fs.mkdirSync(work, { recursive: true });
let ex = spawnSync("unzip", ["-q", zipPath, "-d", work], { encoding: "utf8" });
if (ex.error || ex.status !== 0) ex = spawnSync("tar", ["-xf", zipPath, "-C", work], { encoding: "utf8" });
record("extracted into fresh directory", ex.status === 0, ex.status === 0 ? work : ex.stderr?.slice(0, 300));
if (ex.status !== 0) process.exit(1);

const manifestPath = path.join(path.dirname(zipPath), "release-manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
const fp = footprint(work);
if (manifest) {
  record(
    "extracted file count matches manifest",
    fp.files === manifest.size.fileCount,
    `extracted=${fp.files} manifest=${manifest.size.fileCount}`,
  );
  record(
    "extracted bytes match manifest",
    fp.bytes === manifest.size.uncompressedBytes,
    `extracted=${fp.bytes} manifest=${manifest.size.uncompressedBytes}`,
  );
}
for (const required of ["server.js", "start.mjs", "package.json", ".next/server", ".next/static", "node_modules/next"]) {
  record(`contains ${required}`, fs.existsSync(path.join(work, required)));
}
const leaked = [];
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    const rel = path.relative(work, p).split(path.sep).join("/");
    if (/(^|\/)\.env(\.|$)/.test(rel) || /^(data|\.git|tests|testing)\//.test(rel) || /\.(db|db-wal|db-shm)$/.test(rel)) {
      if (!rel.startsWith("node_modules/")) leaked.push(rel);
    }
    if (fs.lstatSync(p).isDirectory() && !rel.startsWith("node_modules")) walk(p);
  }
})(work);
record("no env files / data / git / tests in extracted tree", leaked.length === 0, leaked.slice(0, 5).join(", "));

// sanitized environment: nothing inherited except PATH/locale basics ---------
const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "sf-verify-home-"));
const baseEnv = {
  PATH: process.env.PATH,
  HOME: sandboxHome,
  USERPROFILE: sandboxHome,
  TMPDIR: sandboxHome,
  TEMP: sandboxHome,
  SystemRoot: process.env.SystemRoot,
  NEXT_TELEMETRY_DISABLED: "1",
};
for (const k of Object.keys(baseEnv)) if (baseEnv[k] === undefined) delete baseEnv[k];

// 3. native / heavy runtime modules ------------------------------------------
const moduleCheck = `
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const out = {};
try { const D = require('better-sqlite3'); const db = new D(':memory:'); db.exec('create table t(a)'); db.prepare('insert into t values (?)').run(1); out.sqlite = db.prepare('select count(*) c from t').get().c === 1; db.close(); } catch (e) { out.sqlite = 'ERR ' + e.message.split('\\n')[0]; }
try { const sharp = require('sharp'); const b = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer(); out.sharp = b.length > 0; } catch (e) { out.sharp = 'ERR ' + e.message.split('\\n')[0]; }
try { const t = await import('@xenova/transformers'); out.transformers = typeof t.pipeline === 'function'; } catch (e) { out.transformers = 'ERR ' + e.message.split('\\n')[0]; }
try { const ort = require('onnxruntime-node'); out.ort = typeof ort.InferenceSession === 'function'; } catch (e) { out.ort = 'ERR ' + e.message.split('\\n')[0]; }
console.log(JSON.stringify(out));
`;
const mc = spawnSync(process.execPath, ["--input-type=module", "-e", moduleCheck], {
  cwd: work,
  env: baseEnv,
  encoding: "utf8",
  timeout: 120000,
});
let mods = {};
try {
  mods = JSON.parse(mc.stdout.trim().split("\n").pop());
} catch {
  mods = { error: (mc.stderr || mc.stdout || "no output").slice(0, 300) };
}
record("better-sqlite3 loads and executes SQL from extracted tree", mods.sqlite === true, String(mods.sqlite ?? mods.error));
record("sharp loads and encodes an image from extracted tree", mods.sharp === true, String(mods.sharp ?? mods.error));
record("@xenova/transformers (onnxruntime-node) imports", mods.transformers === true, String(mods.transformers ?? mods.error));
// Loading onnxruntime-node dlopens libonnxruntime.<so|dylib|dll> from a path the
// file tracer cannot follow; without this check a release missing that library
// would still pass.
record("onnxruntime-node native library loads (libonnxruntime present)", mods.ort === true, String(mods.ort ?? mods.error));

// 4. launcher port/host resolution -------------------------------------------
function printConfig(env) {
  const r = spawnSync(process.execPath, ["start.mjs", "--print-config"], { cwd: work, env: { ...baseEnv, ...env }, encoding: "utf8" });
  return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null };
}
let c = printConfig({ SERVER_PORT: "24567", PORT: "9999", HOSTNAME: "some-container-name" });
record("launcher: SERVER_PORT wins, host ignores container HOSTNAME", c.out?.port === 24567 && c.out?.host === "0.0.0.0", JSON.stringify(c.out));
c = printConfig({ PORT: "8123" });
record("launcher: falls back to PORT", c.out?.port === 8123 && c.out?.portSource === "PORT", JSON.stringify(c.out));
c = printConfig({ SERVER_PORT: "not-a-port" });
record("launcher: rejects invalid port", c.status === 1);

// 5. start server ------------------------------------------------------------
const port = await new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const serverEnv = {
  ...baseEnv,
  NODE_ENV: "production",
  SERVER_PORT: String(port),
  // Clearly fake, test-only values. No real credentials are ever passed.
  SESSION_SECRET_KEY: "verify-only-session-secret-0123456789abcdef",
  INTERNAL_API_SECRET_KEY: "verify-only-internal-secret-0123456789abcdef",
  BETTER_AUTH_SECRET: "verify-only-better-auth-secret-0123456789abcdef",
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  APP_ORIGIN: `http://127.0.0.1:${port}`,
  CONTROL_PLANE_URL: `http://127.0.0.1:${port}`,
};
const logFile = path.join(path.dirname(work), `${path.basename(work)}-server.log`);
const logFd = fs.openSync(logFile, "w");
const server = spawn(process.execPath, ["start.mjs"], { cwd: work, env: serverEnv, stdio: ["ignore", logFd, logFd] });
let exited = null;
server.on("exit", (code, sig) => (exited = { code, sig }));

const base = `http://127.0.0.1:${port}`;
async function get(p, opts = {}) {
  const res = await fetch(base + p, { redirect: "manual", signal: AbortSignal.timeout(30000), ...opts });
  const body = await res.text();
  return { status: res.status, type: res.headers.get("content-type") || "", location: res.headers.get("location"), body };
}
let up = false;
const t0 = Date.now();
while (Date.now() - t0 < 90000 && !exited) {
  try {
    await get("/api/health");
    up = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
record("server listens on Botkeep-style SERVER_PORT", up, up ? `port ${port}, ready in ${Date.now() - t0} ms` : `exited=${JSON.stringify(exited)}`);

if (up) {
  const h = await get("/api/health");
  let parsed = null;
  try { parsed = JSON.parse(h.body); } catch {}
  record("GET /api/health returns JSON", h.status < 500 && !!parsed, `status=${h.status} reported=${parsed?.status ?? "n/a"}`);

  const login = await get("/login");
  record("GET /login renders HTML", login.status === 200 && login.type.includes("text/html"), `status=${login.status}`);

  const root = await get("/");
  record("GET / (unauthenticated) is served or redirected to login", root.status === 200 || (root.status >= 300 && root.status < 400), `status=${root.status} -> ${root.location ?? ""}`);

  const chunkDir = path.join(work, ".next", "static", "chunks");
  const chunk = fs.existsSync(chunkDir) ? fs.readdirSync(chunkDir).find((f) => f.endsWith(".js")) : null;
  if (chunk) {
    const a = await get(`/_next/static/chunks/${chunk}`);
    record("static JS chunk served", a.status === 200 && /javascript/.test(a.type), `status=${a.status}`);
  } else record("static JS chunk served", false, "no chunk found in .next/static/chunks");
  const cssDir = path.join(work, ".next", "static");
  const cssFile = (function find(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { const r = find(p); if (r) return r; }
      else if (n.endsWith(".css")) return p;
    }
    return null;
  })(cssDir);
  if (cssFile) {
    const rel = path.relative(path.join(work, ".next", "static"), cssFile).split(path.sep).join("/");
    const a = await get(`/_next/static/${rel}`);
    record("static CSS served", a.status === 200 && /css/.test(a.type), `status=${a.status}`);
  } else record("static CSS served", false, "no css in .next/static");

  const fav = await get("/favicon.ico");
  record("public asset /favicon.ico served", fav.status === 200, `status=${fav.status}`);
  if (fs.existsSync(path.join(work, "public", "german-quiz-poster.jpg"))) {
    const poster = await get("/german-quiz-poster.jpg");
    record("public asset /german-quiz-poster.jpg served", poster.status === 200 && poster.type.includes("image"), `status=${poster.status}`);
  }

  const tmpl = await get("/api/templates");
  record("GET /api/templates (public API route)", tmpl.status === 200, `status=${tmpl.status}`);

  const guarded = await get("/api/models");
  record("protected API refuses unauthenticated access (fail-closed)", guarded.status === 401 || guarded.status === 403 || (guarded.status >= 300 && guarded.status < 400), `status=${guarded.status}`);

  const bad = await get("/api/admin/telemetry");
  record("protected admin API refuses unauthenticated access", bad.status === 401 || bad.status === 403 || (bad.status >= 300 && bad.status < 400), `status=${bad.status}`);

  // Route directories named after credential files were once mistaken for
  // credentials by the packager's name filter; this asserts they still resolve.
  const cred = await get("/api/user/credentials");
  record("credential-named route module resolves (not 5xx)", cred.status < 500, `status=${cred.status}`);
}

// 6. shut down, inspect logs -------------------------------------------------
server.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 1500));
if (!exited) server.kill("SIGKILL");
fs.closeSync(logFd);
const log = fs.readFileSync(logFile, "utf8");
const missing = log.split("\n").filter((l) => /Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(l));
record("server log has no missing-module errors", missing.length === 0, missing.slice(0, 3).join(" | "));
record("server log reports bind on the requested port", new RegExp(`:${port}\\b`).test(log), "");

// 7. footprint ---------------------------------------------------------------
const after = footprint(work);
const du = spawnSync("du", ["-sk", work], { encoding: "utf8" });
const duKiB = du.status === 0 ? Number(du.stdout.split(/\s+/)[0]) : null;
console.log(
  `footprint: extracted files=${fp.files} bytes=${(fp.bytes / MIB).toFixed(2)} MiB ` +
    `allocated=${fp.allocated === null ? "n/a" : (fp.allocated / MIB).toFixed(2) + " MiB"} ` +
    `du=${duKiB === null ? "n/a" : (duKiB / 1024).toFixed(2) + " MiB"} | after run bytes=${(after.bytes / MIB).toFixed(2)} MiB`,
);

function finish(code) {
  const failed = checks.filter((x) => x.required && !x.ok);
  const result = {
    zip: path.basename(zipPath),
    sha256: actual,
    port,
    passed: checks.filter((x) => x.ok).length,
    failed: failed.length,
    extractedFootprint: fp,
    duMiB: duKiB === null ? null : +(duKiB / 1024).toFixed(2),
    afterRunBytes: after?.bytes ?? null,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    checks,
  };
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`\n${result.passed} passed, ${failed.length} failed`);
  fs.rmSync(sandboxHome, { recursive: true, force: true });
  process.exit(code || (failed.length ? 1 : 0));
}
finish(0);
