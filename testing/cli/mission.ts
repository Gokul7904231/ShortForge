import { GOLDEN_SHORT_001 } from "../scenarios/golden/golden-short-001";
import { MissionRunner } from "../runtime/MissionRunner";
import { JSONSerializer } from "../reports/serializers/jsonSerializer";
import { MarkdownSerializer } from "../reports/serializers/markdownSerializer";

async function main() {
  const args = process.argv.slice(2);
  const scenarioId = args.find((a) => !a.startsWith("--")) || "golden-short-001";
  const jsonMode = args.includes("--json");

  let spec = GOLDEN_SHORT_001;
  if (scenarioId !== "golden-short-001") {
    console.error(`[TestCLI] Unknown scenario ID: ${scenarioId}. Defaulting to golden-short-001.`);
  }

  if (!jsonMode) {
    console.log(`\n======================================================`);
    console.log(` FACTORYOS CANONICAL TEST RUNNER — MISSION: ${spec.id}`);
    console.log(` Goal: ${spec.goal.description}`);
    console.log(` Topic: "${spec.goal.topic}"`);
    console.log(`======================================================\n`);
    console.log(`[1/3] Initializing FactoryOS Runtime & Attaching Execution Recorder...`);
  }

  try {
    const { report, exitCode } = await MissionRunner.executeMission(spec);

    if (jsonMode) {
      console.log(JSONSerializer.serialize(report, true));
    } else {
      console.log(MarkdownSerializer.serialize(report));
      console.log(`\nProcess exiting with code: ${exitCode}\n`);
    }

    process.exit(exitCode);
  } catch (err: any) {
    console.error(`\n[TestCLI Error] Unhandled mission execution failure: ${err?.message || err}`);
    if (err?.stack) console.error(err.stack);
    process.exit(2);
  }
}

main();
