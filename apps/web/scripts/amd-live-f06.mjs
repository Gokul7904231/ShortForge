#!/usr/bin/env node
/**
 * One-command live AMD F06 proof harness.
 *
 * Usage:
 *   npm run factoryos:live:amd -- <ssh-target>
 *
 * The SSH target must already be usable from this machine (SSH config,
 * key-based auth, etc.). The harness:
 *   1. opens a local SSH tunnel to the remote AMD worker,
 *   2. retrieves AMD_WORKER_SECRET over SSH without printing it,
 *   3. runs the canonical amd-live-smoke.test.ts against the tunneled worker,
 *   4. closes the tunnel on exit.
 *
 * No secrets are written to disk.
 */
import { spawn, spawnSync } from "node:child_process";

const sshTarget = process.argv[2] || process.env.AMD_SSH_TARGET;
if (!sshTarget) {
  console.error("Usage: npm run factoryos:live:amd -- <ssh-target>");
  process.exit(2);
}

const localPort = Number(process.env.AMD_LIVE_LOCAL_PORT || 18101);
const remotePort = Number(process.env.AMD_REMOTE_PORT || 8101);
const remoteHost = "127.0.0.1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runSync(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function quoteBash(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

const tunnel = spawn(
  "ssh",
  [
    "-N",
    "-o", "ExitOnForwardFailure=yes",
    "-L", `${localPort}:127.0.0.1:${remotePort}`,
    sshTarget,
  ],
  { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
);

let tunnelError = "";
tunnel.stderr?.on("data", (chunk) => {
  tunnelError += chunk.toString();
});

const cleanup = () => {
  if (!tunnel.killed) tunnel.kill();
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

for (let i = 0; i < 20; i++) {
  if (tunnel.exitCode !== null) break;
  const probe = runSync("curl.exe", ["-fsS", `http://127.0.0.1:${localPort}/health`]);
  if (probe.status === 0) break;
  await sleep(500);
}

if (tunnel.exitCode !== null) {
  console.error("AMD SSH tunnel failed:");
  console.error(tunnelError.trim());
  process.exit(1);
}

const probe = runSync("curl.exe", ["-fsS", `http://127.0.0.1:${localPort}/health`]);
if (probe.status !== 0) {
  console.error("AMD worker tunnel did not become reachable.");
  console.error(tunnelError.trim());
  process.exit(1);
}

const secretCommand =
  'PID=$(ss -ltnp 2>/dev/null | sed -n "s/.*:8101 .*pid=\\([0-9]\\+\\).*/\\1/p" | head -1); ' +
  'test -n "$PID" || { echo "AMD worker PID not found" >&2; exit 1; }; ' +
  'tr "\0" "\n" < /proc/$PID/environ | sed -n "s/^AMD_WORKER_SECRET=//p"';

const secret = runSync("ssh", [sshTarget, "bash", "-lc", secretCommand], {
  maxBuffer: 1024 * 1024,
});

if (secret.status !== 0 || !secret.stdout.trim()) {
  console.error("Could not recover AMD_WORKER_SECRET from remote worker.");
  console.error(secret.stderr?.trim() || "");
  process.exit(1);
}

const env = {
  ...process.env,
  RUN_LIVE_AMD: "1",
  AMD_WORKER_URL: `http://127.0.0.1:${localPort}`,
  AMD_WORKER_SECRET: secret.stdout.trim(),
};

const test = spawnSync(
  "npx",
  ["vitest", "run", "factoryos/tests/amd-live-smoke.test.ts", "--config", "vitest.config.ts"],
  {
    stdio: "inherit",
    env,
    windowsHide: true,
    cwd: new URL("../..", import.meta.url).pathname,
  }
);

process.exit(test.status ?? 1);
