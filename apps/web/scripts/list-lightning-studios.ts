import { spawn } from "node:child_process";

function run(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("lightning", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const teamspace = process.env.LIGHTNING_TEAMSPACE;
  if (!teamspace) throw new Error("LIGHTNING_TEAMSPACE is required.");
  const [org, space] = teamspace.split("/", 2);
  if (!org || !space) throw new Error("LIGHTNING_TEAMSPACE must be <org>/<teamspace>.");
  const code = await run(["ls", "lit://" + org + "/" + space + "/studios/"]);
  if (code !== 0) process.exit(code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
