const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

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

console.log("Spawning Chrome:", chromePath, args.join(" "));
const child = spawn(chromePath, args, {
  detached: true,
  stdio: "ignore",
});
child.unref();

setTimeout(async () => {
  try {
    const res = await fetch("http://127.0.0.1:9222/json/version");
    const json = await res.json();
    console.log("Chrome CDP alive! Version:", json.Browser);
    process.exit(0);
  } catch (err) {
    console.error("Chrome CDP not ready yet:", err.message);
    process.exit(1);
  }
}, 2000);
