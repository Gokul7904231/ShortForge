/**
 * Project Ascalon — Generate Production-Grounding and Synthetic Curriculum Data
 *
 * Production-golden data and synthetic curriculum data are intentionally
 * separated. This script never represents controlled simulations as real
 * operational ground truth and never hard-codes quality claims.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { GoldenTrajectoryBuilder } from "../generation/trajectory_generator/GoldenTrajectoryBuilder";
import { ScenarioGenerator } from "../generation/scenario_generator/ScenarioGenerator";
import { AscalonTrajectoryExporter } from "./AscalonTrajectoryExporter";
import { AscalonTrajectoryValidator } from "../validators/AscalonTrajectoryValidator";

const ROOT = path.resolve(__dirname, "../../..");
const GOLDEN_DIR = path.resolve(ROOT, "training/ascalon/data/golden");
const CURRICULUM_DIR = path.resolve(
  ROOT,
  "training/ascalon/data/curriculum",
);
const NORM_DIR = path.resolve(ROOT, "training/ascalon/data/normalized");
const REPORT_DIR = path.resolve(ROOT, "training/ascalon/reports");

for (const directory of [
  GOLDEN_DIR,
  CURRICULUM_DIR,
  NORM_DIR,
  REPORT_DIR,
]) {
  fs.mkdirSync(directory, { recursive: true });
}

// 1. Build only production-grounding golden trajectories.
const goldenTrajectories =
  GoldenTrajectoryBuilder.generateGoldenDataset();

// 2. Build controlled synthetic curriculum separately.
const syntheticCurriculumTrajectories: any[] = [];

for (let i = 1; i <= 10; i++) {
  const scenario = ScenarioGenerator.generateScenario(
    "WORKER_TIMEOUT",
    100 + i,
  );

  syntheticCurriculumTrajectories.push({
    trajectoryId: \`traj_curriculum_timeout_\${i}\`,
    schemaVersion: "1.0.0",
    hierarchyVersion: "1.0.0",
    episode: {
      episodeId: \`ep_curriculum_\${i}\`,
      missionId: \`miss_curriculum_\${i}\`,
    },
    environment: {
      environmentType: "SIMULATION",
      repositoryCommit: "SCENARIO_GENERATOR",
      runtimeVersion: "1.0.0",
      timestamp: new Date().toISOString(),
    },
    observation: {
      observationId: \`obs_curriculum_\${i}\`,
      timestamp: new Date().toISOString(),
      objective: "Recover from a controlled worker timeout scenario",
      worldStateSummary: scenario.baseWorldState,
      availableCapabilities: [
        scenario.expectedRemediationAction,
      ],
      environmentType: "SIMULATION",
    },
    decision: {
      decisionId: \`dec_curriculum_\${i}\`,
      decisionType: "CAPABILITY_SELECTION",
      selectedAction: {
        actionType: "REMEDIATE_SIMULATED_TIMEOUT",
        targetEntity: "worker_gpu_sim",
        capabilityId: scenario.expectedRemediationAction,
      },
      uncertainty: {
        epistemicConfidence: 1.0,
        calibrationStatus: "CALIBRATED",
      },
      reasoningSource: {
        mode: "DETERMINISTIC_RULE",
        provider: "scenario_engine",
        model: "rule-engine",
        trainingEligible: false,
      },
      status: "VALID",
    },
    authorization: {
      requested: true,
      authorized: true,
      guardianDecision: "APPROVED",
      policyChecks: ["simulation_guard"],
    },
    execution: {
      tool: scenario.expectedRemediationAction,
      arguments: { scenarioId: scenario.scenarioId },
    },
    outcome: {
      outcomeId: \`out_curriculum_\${i}\`,
      status: "SUCCESS",
      verified: true,
      verificationEvidenceId: \`evi_curriculum_\${i}\`,
      actualStateChange: {
        entityModified: "simulation_state",
        priorState: "TIMEOUT",
        newState: "RESOLVED",
      },
      completedAt: new Date().toISOString(),
    },
    provenance: {
      labelSource: "SIMULATION",
      trainingEligible: false,
      humanReviewed: false,
      simulation: true,
      synthetic: true,
    },
  });
}

// Production-golden stream.
fs.writeFileSync(
  path.join(GOLDEN_DIR, "golden_trajectories.json"),
  JSON.stringify(goldenTrajectories, null, 2),
  "utf-8",
);
fs.writeFileSync(
  path.join(GOLDEN_DIR, "golden_dataset.jsonl"),
  AscalonTrajectoryExporter.toJSONL(goldenTrajectories),
  "utf-8",
);

// Synthetic curriculum stream; never passed to the production exporter.
fs.writeFileSync(
  path.join(CURRICULUM_DIR, "synthetic_scenarios.jsonl"),
  syntheticCurriculumTrajectories
    .map((item) => JSON.stringify(item))
    .join("\\n") +
    (syntheticCurriculumTrajectories.length ? "\\n" : ""),
  "utf-8",
);

// 3. Export only production-grounding trajectories.
const exportResult =
  AscalonTrajectoryExporter.exportDataset(
    goldenTrajectories,
  );

for (const [name, rows] of Object.entries({
  train: exportResult.train,
  validation: exportResult.validation,
  test: exportResult.test,
})) {
  fs.writeFileSync(
    path.join(NORM_DIR, \`\${name}.jsonl\`),
    AscalonTrajectoryExporter.toJSONL(rows),
    "utf-8",
  );
}

// 4. Validate production-golden trajectories and generate measured report.
const validationReports = goldenTrajectories.map(
  (trajectory) => ({
    trajectoryId: trajectory.trajectoryId,
    report:
      AscalonTrajectoryValidator.validate(
        trajectory,
      ),
  }),
);

const total = Math.max(
  1,
  goldenTrajectories.length,
);

const countIssues = (code: string) =>
  validationReports.reduce(
    (sum, item) =>
      sum +
      item.report.issues.filter(
        (issue) => issue.code === code,
      ).length,
    0,
  );

const qualityReport = {
  reportId: \`report_quality_\${Date.now()}\`,
  generatedAt: new Date().toISOString(),
  datasetSummary: {
    totalProductionGroundingTrajectories:
      goldenTrajectories.length,
    syntheticCurriculumCount:
      syntheticCurriculumTrajectories.length,
    validCount:
      exportResult.splitManifest.totalExported,
    trainCount:
      exportResult.splitManifest.trainCount,
    validationCount:
      exportResult.splitManifest.validationCount,
    testCount:
      exportResult.splitManifest.testCount,
    rejectedCount:
      exportResult.splitManifest.rejectedCount,
    datasetStatus:
      exportResult.splitManifest.trainCount > 0 &&
      exportResult.splitManifest.validationCount > 0 &&
      exportResult.splitManifest.testCount > 0
        ? "ELIGIBLE_FOR_MODEL_EVALUATION"
        : "INSUFFICIENT_FOR_MODEL_TRAINING",
  },
  qualityGates: {
    secretLeakageDetected:
      countIssues("SECRET_LEAKAGE") > 0,
    syntheticMislabeledReal:
      countIssues("SIMULATION_CONTAMINATION") > 0,
    unverifiedSuccessClaims:
      countIssues("UNVERIFIED_SUCCESS_CLAIM"),
    schemaCompletenessRate:
      validationReports.filter(
        (item) =>
          !item.report.issues.some(
            (issue) =>
              issue.code ===
              "MISSING_SCHEMA_FIELD",
          ),
      ).length / total,
    replayEquivalenceRate:
      "NOT_MEASURED_BY_DATASET_GENERATOR",
  },
  provenanceBreakdown:
    goldenTrajectories.reduce(
      (
        accumulator,
        trajectory,
      ) => {
        const source = String(
          trajectory.provenance?.labelSource ??
            "UNKNOWN",
        );
        accumulator[source] =
          (accumulator[source] ?? 0) + 1;
        return accumulator;
      },
      {} as Record<string, number>,
    ),
  rejectionLog: exportResult.rejected,
};

fs.writeFileSync(
  path.join(
    REPORT_DIR,
    "dataset-quality-report.json",
  ),
  JSON.stringify(
    qualityReport,
    null,
    2,
  ),
  "utf-8",
);

const qualityMarkdown = \`# Project Ascalon: Dataset Quality Report

**Generated At**: \${qualityReport.generatedAt}  
**Production-Grounding Trajectories**: \${qualityReport.datasetSummary.totalProductionGroundingTrajectories}  
**Synthetic Curriculum Trajectories**: \${qualityReport.datasetSummary.syntheticCurriculumCount}  
**Status**: \\\`\${qualityReport.datasetSummary.datasetStatus}\\\`

Synthetic curriculum data is intentionally excluded from the production-golden export.

---

## 1. Dataset Split Summary

| Split | Count | Target Ratio | Leakage Prevention |
| :--- | :--- | :--- | :--- |
| **Train** | \${qualityReport.datasetSummary.trainCount} | ~70% | SHA-256 grouped by mission/episode family |
| **Validation** | \${qualityReport.datasetSummary.validationCount} | ~15% | SHA-256 grouped by mission/episode family |
| **Test** | \${qualityReport.datasetSummary.testCount} | ~15% | SHA-256 grouped by mission/episode family |
| **Rejected** | \${qualityReport.datasetSummary.rejectedCount} | — | Validation/synthetic isolation |

---

## 2. Quality Gate Metrics

- **Secret Leakage Detected**: \${qualityReport.qualityGates.secretLeakageDetected ? "DETECTED" : "0"}
- **Synthetic Data Mislabeled as Real**: \${qualityReport.qualityGates.syntheticMislabeledReal ? "DETECTED" : "0"}
- **Unverified Claims of Success**: \${qualityReport.qualityGates.unverifiedSuccessClaims}
- **Schema Completeness Rate**: \${(qualityReport.qualityGates.schemaCompletenessRate * 100).toFixed(1)}%
- **Deterministic Replay Rate**: NOT MEASURED BY THIS GENERATOR; use the AscalonReplayEngine gate separately.

A dataset is not admitted to model training until train, validation, and test partitions are all non-empty and the independent admission gates pass.
\`;

fs.writeFileSync(
  path.join(
    REPORT_DIR,
    "dataset-quality-report.md",
  ),
  qualityMarkdown,
  "utf-8",
);

console.log(
  "Ascalon datasets and measured quality reports generated.",
);
