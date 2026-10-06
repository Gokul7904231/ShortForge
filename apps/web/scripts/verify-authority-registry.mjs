import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const registryPath = path.join(root, ".okf/architecture/authority-registry.json");

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

if (registry.status !== "ACTIVE") throw new Error("Authority registry must be ACTIVE");
if (!Array.isArray(registry.domains) || registry.domains.length < 10) {
  throw new Error("Authority registry must define the canonical authority domains");
}

const ids = new Set();
const owners = new Set();

for (const domain of registry.domains) {
  for (const field of ["domainId", "authorityType", "canonicalOwner", "persistence", "writeMode"]) {
    if (!domain[field]) throw new Error("Missing " + field + " on " + (domain.domainId ?? "unknown"));
  }
  if (ids.has(domain.domainId)) throw new Error("Duplicate domainId: " + domain.domainId);
  ids.add(domain.domainId);

  if (domain.domainId !== "knowledge_projection" && domain.domainId !== "user_projection") {
    if (owners.has(domain.canonicalOwner)) throw new Error("Duplicate sovereign owner: " + domain.canonicalOwner);
    owners.add(domain.canonicalOwner);
  }
}

const required = [
  "governance",
  "production_topology",
  "operational_state",
  "learned_memory",
  "working_context",
  "external_context",
  "artifacts",
  "physical_verification",
  "epistemic_state",
  "decisions",
  "reasoning",
  "execution",
  "economics",
  "knowledge_projection",
  "user_projection"
];

for (const id of required) {
  if (!ids.has(id)) throw new Error("Missing required authority domain: " + id);
}

console.log("Authority registry valid: " + registry.domains.length + " domains");
