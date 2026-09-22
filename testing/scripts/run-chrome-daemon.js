const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const profileDir = path.join(os.tmpdir(), "chrome-cdp-profile");
try {
  fs.mkdirSync(profileDir, { recursive: true });
} catch {}

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const args = [
  "--headless=new",
  "--remote-debugging-port=9222",
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${profileDir}`,
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
];

console.log("[ChromeDaemon] Starting Chrome on 127.0.0.1:9222...");
const proc = spawn(chromePath, args, { stdio: "inherit" });

proc.on("exit", (code) => {
  console.log(`[ChromeDaemon] Chrome exited with code ${code}`);
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  proc.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  proc.kill();
  process.exit(0);
});
