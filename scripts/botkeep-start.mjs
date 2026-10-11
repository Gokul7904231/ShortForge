import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const webDir = path.join(root, "apps", "web");
const webPackage = path.join(webDir, "package.json");
const webLock = path.join(webDir, "package-lock.json");
const nextCli = path.join(webDir, "node_modules", "next", "dist", "bin", "next");
const stateDir = path.join(root, ".botkeep-runtime");
const statePath = path.join(stateDir, "build-state.json");
const excludedDirs = new Set([
  ".git", ".next", ".turbo", ".cache", "node_modules", "coverage",
  "data", "logs", "cache", "generated", "scratch", "runtime",
  "uploads", "telemetry", "benchmarks", "events", "output",
]);
const maxFingerprintFileBytes = 10 * 1024 * 1024;

function assertProjectLayout() {
  for (const file of [webPackage, webLock]) {
    if (!existsSync(file)) {
      throw new Error(`Expected ShortForge web project file is missing: ${path.relative(root, file)}`);
    }
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[botkeep] > ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...options.env },
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} exited with code ${code ?? "null"} (signal ${signal ?? "none"})`));
    });
  });
}

function fingerprintDependencies() {
  const hash = createHash("sha256");
  hash.update(readFileSync(webPackage));
  hash.update(readFileSync(webLock));
  return hash.digest("hex");
}

function fingerprintSource() {
  const hash = createHash("sha256");

  function visit(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory() && excludedDirs.has(entry.name)) continue;
      if (entry.name === ".env" || entry.name.startsWith(".env.")) continue;

      const absolute = path.join(dir, entry.name);
      const relative = path.relative(webDir, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        const stat = statSync(absolute);
        if (stat.size > maxFingerprintFileBytes) continue;
        hash.update(relative);
        hash.update(String(stat.size));
        hash.update(readFileSync(absolute));
      }
    }
  }

  visit(webDir);
  return hash.digest("hex");
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

async function installIfNeeded(dependencyFingerprint) {
  const state = readState();
  if (existsSync(nextCli) && state.dependencyFingerprint === dependencyFingerprint) {
    console.log("[botkeep] Web dependencies match the current lockfile; skipping npm ci.");
    return;
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(npm, ["ci", "--prefix", webDir]);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath, JSON.stringify({
    ...readState(),
    dependencyFingerprint,
  }, null, 2));
}

async function buildIfNeeded(dependencyFingerprint) {
  const sourceFingerprint = fingerprintSource();
  const state = readState();
  if (
    existsSync(path.join(webDir, ".next", "BUILD_ID")) &&
    state.dependencyFingerprint === dependencyFingerprint &&
    state.sourceFingerprint === sourceFingerprint
  ) {
    console.log("[botkeep] Existing production build matches the current source; skipping build.");
    return;
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(npm, ["run", "build", "--prefix", webDir], {
    env: {
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath, JSON.stringify({
    dependencyFingerprint,
    sourceFingerprint,
    builtAt: new Date().toISOString(),
  }, null, 2));
}

async function main() {
  assertProjectLayout();

  const dependencyFingerprint = fingerprintDependencies();
  await installIfNeeded(dependencyFingerprint);
  await buildIfNeeded(dependencyFingerprint);

  const rawPort = process.env.SERVER_PORT || process.env.PORT || "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid SERVER_PORT/PORT value: ${rawPort}`);
  }

  process.env.NODE_ENV = "production";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  process.env.PORT = String(port);
  process.env.HOSTNAME = "0.0.0.0";

  console.log(`[botkeep] Starting ShortForge web on 0.0.0.0:${port}`);
  const child = spawn(process.execPath, [
    nextCli,
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    String(port),
  ], {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
  });

  const shutdown = (signal) => {
    if (child.exitCode === null) child.kill(signal);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  child.once("error", (error) => {
    console.error("[botkeep] Failed to start Next.js:", error);
    process.exitCode = 1;
  });
  child.once("close", (code, signal) => {
    if (code !== 0) {
      console.error(`[botkeep] Next.js exited with code ${code ?? "null"} (signal ${signal ?? "none"}).`);
    }
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error("[botkeep] Startup failed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
