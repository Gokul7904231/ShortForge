#!/usr/bin/env node
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const continuous = args.includes("--continuous");
const vaultPath = process.env.MEMORY_FABRIC_VAULT_PATH || "knowledge";

const obArgs = [
  "sync",
  "--path",
  vaultPath,
  ...(continuous ? ["--continuous"] : []),
];

const child = spawn("ob", obArgs, {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error("OBSIDIAN_HEADLESS_SYNC: FAILED");
  console.error("Install Obsidian Headless and authenticate with ob login before using this adapter.");
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error("OBSIDIAN_HEADLESS_SYNC: terminated by " + signal);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
