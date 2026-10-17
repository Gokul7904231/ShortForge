#!/usr/bin/env node
/**
 * Runs `next build` with the Botkeep profile enabled
 * (SHORTFORGE_BUILD_PROFILE=botkeep -> standalone output, see next.config.mjs).
 * Cross-platform replacement for `cross-env`; the normal `npm run build` and the
 * OpenNext/Cloudflare scripts are untouched.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const res = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    SHORTFORGE_BUILD_PROFILE: "botkeep",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
process.exit(res.status ?? 1);
