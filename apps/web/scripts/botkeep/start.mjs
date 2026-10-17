/**
 * ShortForge — Botkeep release launcher.
 *
 * Start command (from the release directory):   node start.mjs
 *
 * Port resolution (never hard-coded to a live port):
 *   SERVER_PORT (Botkeep-provided) -> PORT -> 3000 (local default only)
 * Bind host:
 *   BIND_HOST -> 0.0.0.0. The container-provided HOSTNAME is deliberately
 *   ignored: Next's standalone server would otherwise bind to that name only.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
process.chdir(here);

function resolvePort() {
  for (const key of ["SERVER_PORT", "PORT"]) {
    const raw = process.env[key];
    if (raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      console.error(`[botkeep] ${key}="${raw}" is not a valid TCP port (1-65535).`);
      process.exit(1);
    }
    return { port: String(n), source: key };
  }
  return { port: "3000", source: "default" };
}

const { port, source } = resolvePort();
const host = process.env.BIND_HOST || "0.0.0.0";

process.env.PORT = port;
process.env.HOSTNAME = host;
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.NEXT_TELEMETRY_DISABLED = process.env.NEXT_TELEMETRY_DISABLED || "1";

if (process.argv.includes("--print-config")) {
  console.log(JSON.stringify({ host, port: Number(port), portSource: source, cwd: here }));
  process.exit(0);
}

console.log(`[botkeep] starting ShortForge on ${host}:${port} (port from ${source})`);
await import("./server.js");
