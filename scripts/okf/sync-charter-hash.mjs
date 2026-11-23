import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const CHARTER = ".okf/charter.md";
const REGISTRY = ".okf/architecture/authority-registry.json";

const sha = createHash("sha256").update(readFileSync(CHARTER)).digest("hex");
const reg = JSON.parse(readFileSync(REGISTRY, "utf8"));
reg.charter.sha256 = sha;
writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + "\n");
console.log(`[okf] charter sha256 synced: ${sha}`);
