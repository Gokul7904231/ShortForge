import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contracts = fs.readFileSync(
  path.join(root, "factoryos/core/compute/sandboxes/SandboxContracts.ts"),
  "utf8",
);
const index = fs.readFileSync(
  path.join(root, "factoryos/core/compute/sandboxes/index.ts"),
  "utf8",
);
const service = fs.readFileSync(
  path.join(root, "factoryos/core/compute/connections/SandboxConnectionService.ts"),
  "utf8",
);
const catalog = fs.readFileSync(
  path.join(root, "factoryos/core/compute/connections/ComputeConnectionCatalog.ts"),
  "utf8",
);
const gateway = fs.readFileSync(
  path.join(root, "factoryos/core/compute/gateway/ComputeGateway.ts"),
  "utf8",
);
const provider = fs.readFileSync(
  path.join(root, "factoryos/core/compute/providers/HostedSandboxComputeProvider.ts"),
  "utf8",
);

const requiredFiles = [
  "factoryos/core/compute/sandboxes/OpenComputerSandboxAdapter.ts",
  "factoryos/core/compute/sandboxes/BlaxelSandboxAdapter.ts",
];
const failures = [];
for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push("missing required adapter: " + relativePath);
  }
}

for (const token of [
  '"OPENCOMPUTER"',
  '"BLAXEL"',
  'OPENCOMPUTER_API_KEY',
  'BL_API_KEY',
  'BL_WORKSPACE',
  'sandbox_opencomputer',
  'sandbox_blaxel',
]) {
  const combined = contracts + index + service + catalog + gateway + provider;
  if (!combined.includes(token)) failures.push("missing provider contract token: " + token);
}

if (!index.includes("new OpenComputerSandboxAdapter()")) failures.push("OpenComputer adapter is not registered");
if (!index.includes("new BlaxelSandboxAdapter()")) failures.push("Blaxel adapter is not registered");
if (!service.includes('sandbox_opencomputer: "OPENCOMPUTER"')) failures.push("OpenComputer connection mapping missing");
if (!service.includes('sandbox_blaxel: "BLAXEL"')) failures.push("Blaxel connection mapping missing");
if (!catalog.includes('providerId: "sandbox_opencomputer"') || !catalog.includes("implemented: true")) {
  failures.push("OpenComputer catalog implementation is not active");
}
if (!catalog.includes('providerId: "sandbox_blaxel"') || !catalog.includes("implemented: true")) {
  failures.push("Blaxel catalog implementation is not active");
}
if (!provider.includes('OPENCOMPUTER: [["OPENCOMPUTER_API_KEY"]]')) failures.push("OpenComputer credential group missing");
if (!provider.includes('BLAXEL: [["BL_API_KEY", "BL_WORKSPACE"]]')) failures.push("Blaxel credential group missing");
if ((index.match(/productionWorkerEligible:\s*true/g) || []).length > 0) {
  failures.push("sandbox registry unexpectedly enables production worker eligibility");
}
for (const adapterPath of requiredFiles) {
  const source = fs.readFileSync(path.join(root, adapterPath), "utf8");
  if (!source.includes("productionWorkerEligible: false")) {
    failures.push("productionWorkerEligible=false missing: " + adapterPath);
  }
  if (/(console\.log|console\.error)\([^\n]*(API_KEY|TOKEN_SECRET|BL_API_KEY|OPENCOMPUTER_API_KEY)/i.test(source)) {
    failures.push("possible secret logging in adapter: " + adapterPath);
  }
}

if (failures.length) {
  console.error("SANDBOX_PROVIDER_GATE: BLOCKED");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("SANDBOX_PROVIDER_GATE: VALID — OpenComputer and Blaxel are registered, connected, and remain outside F06 authority.");
