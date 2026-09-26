import { IntelligenceGateway } from "../intelligence/IntelligenceGateway";

const mode = process.argv[2] === "ascalon" ? "ASCALON" : "AGENT";
const query = process.argv.slice(3).join(" ");

const gateway = new IntelligenceGateway();
const projection = mode === "ASCALON"
  ? await gateway.memoryFabric.projectForAscalon(query)
  : await gateway.memoryFabric.projectForAgent(query);

console.log(JSON.stringify(projection, null, 2));
