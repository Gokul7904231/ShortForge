import { IntelligenceGateway } from "../core/intelligence/IntelligenceGateway";

const mode = process.argv[2] === "ascalon" ? "ASCALON" : "AGENT";
const query = process.argv.slice(3).join(" ");

const gateway = new IntelligenceGateway();
const scopeEnv = process.env.MEMORY_FABRIC_SCOPE_KEYS || process.env.MEMORY_FABRIC_ASCALON_SCOPE_KEYS || "";
const scopeKeys = scopeEnv.split(",").map((value) => value.trim()).filter(Boolean);
if (scopeKeys.length === 0) {
  throw new Error("MEMORY_FABRIC_SCOPE_KEYS is required; memory projection is fail-closed.");
}
const accessContext = {
  principalId: mode === "ASCALON" ? "cli-ascalon" : "cli-agent",
  allowedScopeKeys: scopeKeys,
  allowGlobalScope: scopeKeys.includes("GLOBAL"),
};
const projection = mode === "ASCALON"
  ? await gateway.memoryFabric.projectForAscalon(query, 32, 24000, accessContext)
  : await gateway.memoryFabric.projectForAgent(query, 12, 12000, accessContext);

console.log(JSON.stringify(projection, null, 2));
