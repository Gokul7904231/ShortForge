import { GOLDEN_SHORT_001 } from "../scenarios/golden/golden-short-001";
import { MissionRunner } from "../runtime/MissionRunner";
import { runHardeningRegressionSuite } from "../tests/hardening-regressions.test";
import { runBrowserEvidenceTestSuite } from "../tests/browser-evidence.test";
import { runSituationRecordCommsTestSuite } from "../tests/situation-record-comms.test";
import { runSituationRecordComms001 } from "../scenarios/comms/situation-record-comms-001";
import { runGraphPresentationTestSuite } from "../tests/graph-presentation.test";
import { runGraphRenderingTestSuite } from "../tests/graph-rendering.test";
import { runGraphDiffVisualTestSuite } from "../tests/graph-diff-visual.test";
import { runGraphInteractionTestSuite } from "../tests/graph-interaction.test";
import { runGraphInteractionCorrectnessTestSuite } from "../tests/graph-interaction-correctness.test";
import { runVisualDemos } from "../scripts/render-visual-demos";

async function runAll() {
  console.log(`[TestCLI] Running FactoryOS Hardening Regression Suite...`);
  const regRes = await runHardeningRegressionSuite();
  if (!regRes.passed) {
    console.error(`[TestCLI] Hardening regression suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running FactoryOS Browser Evidence V1 Suite...`);
  const browserRes = await runBrowserEvidenceTestSuite();
  if (!browserRes.passed) {
    console.error(`[TestCLI] Browser evidence suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running FactoryOS SituationRecord Comms Suite (Tests A -> L)...`);
  const commsRes = await runSituationRecordCommsTestSuite();
  if (!commsRes.passed) {
    console.error(`[TestCLI] SituationRecord Comms suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running Live SituationRecord Handoff Proof (situation-record-comms-001)...`);
  const handoffRes = await runSituationRecordComms001();
  if (!handoffRes.success) {
    console.error(`[TestCLI] Live SituationRecord handoff proof failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running Graph Presentation Suite (Archify & Diagram-Design Principles)...`);
  const presRes = await runGraphPresentationTestSuite();
  if (!presRes.passed) {
    console.error(`[TestCLI] Graph presentation suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running Graph Rendering & Visual Verification Suite...`);
  const renderRes = await runGraphRenderingTestSuite();
  if (!renderRes.passed) {
    console.error(`[TestCLI] Graph rendering suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running Graph Diff & Visual Delta Suite...`);
  const diffRes = await runGraphDiffVisualTestSuite();
  if (!diffRes.passed) {
    console.error(`[TestCLI] Graph diff visual suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running Visualization V2 Evidence Interaction Suite (Tests A -> T)...`);
  const interactionRes = await runGraphInteractionTestSuite();
  if (!interactionRes.passed) {
    console.error(`[TestCLI] Visualization V2 interaction suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running Visualization V2 Correctness Hardening Suite (Tests A1 -> J4)...`);
  const correctnessRes = await runGraphInteractionCorrectnessTestSuite();
  if (!correctnessRes.passed) {
    console.error(`[TestCLI] Visualization V2 correctness hardening suite failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running FactoryOS Visual Demonstrations (Demo 1 & 2)...`);
  const demosRes = await runVisualDemos();
  if (!demosRes.success) {
    console.error(`[TestCLI] Visual demonstrations failed!`);
    process.exit(1);
  }

  console.log(`[TestCLI] Running Canonical Golden Mission Suite...`);
  const { report, exitCode } = await MissionRunner.executeMission(GOLDEN_SHORT_001);

  console.log(`[TestCLI] Golden mission run result: ${report.finalVerdict} (Exit: ${exitCode})`);
  process.exit(exitCode);
}



runAll();
