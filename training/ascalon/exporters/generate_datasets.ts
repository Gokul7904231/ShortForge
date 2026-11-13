/**
 * Project Ascalon — Generate an explicitly isolated synthetic curriculum.
 *
 * This command does not create or certify a production/operational corpus.
 * Operational trajectories must enter through the independently verified
 * production collector and evidence-admission workflow.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { GoldenTrajectoryBuilder } from "../generation/trajectory_generator/GoldenTrajectoryBuilder";
import { ScenarioGenerator } from "../generation/scenario_generator/ScenarioGenerator";
import { AscalonTrajectoryExporter } from "./AscalonTrajectoryExporter";
import { AscalonTrajectoryValidator } from "../validators/AscalonTrajectoryValidator";

const ROOT = path.resolve(__dirname, "../../..");
const CURRICULUM_DIR = path.resolve(ROOT, "training/ascalon/data/curriculum");
const REPORT_DIR = path.resolve(ROOT, "training/ascalon/reports");
fs.mkdirSync(CURRICULUM_DIR, { recursive: true });
fs.mkdirSync(REPORT_DIR, { recursive: true });

const generatedAt = new Date().toISOString();
const sourceCommit = process.env.GITHUB_SHA ?? "UNPINNED_LOCAL_SOURCE";

function buildScenarioTrajectory(
  scenario: ReturnType<typeof ScenarioGenerator.generateScenario>,
  family: string,
  index: number,
): Record<string, any> {
  const scenarioEvidenceId = "synthetic-evidence-" + scenario.scenarioId;
  return {
    trajectoryId: "traj_" + scenario.scenarioId,
    schemaVersion: "1.0.0",
    hierarchyVersion: "1.0.0",
    episode: {
      episodeId: "episode_" + scenario.scenarioId,
      missionId: "mission_" + family,
      missionFamily: family,
      taskId: "task_" + index,
    },
    environment: {
      environmentType: "SIMULATION",
      repositoryCommit: sourceCommit,
      runtimeVersion: "synthetic-curriculum-v1",
      timestamp: generatedAt,
    },
    observation: {
      observationId: "observation_" + scenario.scenarioId,
      timestamp: generatedAt,
      objective: "Synthetic curriculum scenario: " + scenario.failureModeCode,
      worldStateSummary: scenario.baseWorldState,
      relevantEvidence: [],
      availableCapabilities: [scenario.expectedRemediationAction],
      environmentType: "SIMULATION",
    },
    decision: {
      decisionId: "decision_" + scenario.scenarioId,
      decisionType: "CAPABILITY_SELECTION",
      selectedAction: {
        actionType: "PROPOSE_BOUNDED_REMEDIATION",
        targetEntity: scenario.scenarioId,
        capabilityId: scenario.expectedRemediationAction,
      },
      uncertainty: {
        epistemicConfidence: 1,
        calibrationStatus: "UNCALIBRATED",
      },
      reasoningSource: {
        mode: "DETERMINISTIC_RULE",
        provider: "scenario_engine",
        model: "seeded-scenario-teacher",
        trainingEligible: true,
      },
      status: "VALID",
    },
    authorization: {
      requested: true,
      authorized: true,
      guardianDecision: "APPROVED",
      policyChecks: ["synthetic_curriculum_only"],
    },
    execution: {
      tool: scenario.expectedRemediationAction,
      arguments: { scenarioId: scenario.scenarioId, seed: scenario.seed },
    },
    outcome: {
      outcomeId: "outcome_" + scenario.scenarioId,
      status: "SUCCESS",
      verified: true,
      verificationEvidenceId: scenarioEvidenceId,
      actualStateChange: {
        entityModified: "synthetic_scenario_state",
        priorState: "INJECTED_FAILURE",
        newState: "CURRICULUM_EXPECTED_STATE",
      },
      completedAt: generatedAt,
    },
    provenance: {
      labelSource: "SIMULATION_PSEUDO",
      trainingEligible: true,
      humanReviewed: false,
      simulation: true,
      synthetic: true,
      syntheticSeed: scenario.seed,
      generator: "ScenarioGenerator",
    },
  };
}

const curriculumTrajectories: any[] = [
  ...GoldenTrajectoryBuilder.generateGoldenDataset(),
];

for (let i = 1; i <= 10; i += 1) {
  const timeout = ScenarioGenerator.generateScenario("WORKER_TIMEOUT", 100 + i);
  const casMismatch = ScenarioGenerator.generateScenario("CAS_INTEGRITY_MISMATCH", 200 + i);
  curriculumTrajectories.push(
    buildScenarioTrajectory(timeout, "worker-timeout-family", i),
    buildScenarioTrajectory(casMismatch, "cas-integrity-family", i),
  );
}

const exportResult =
  AscalonTrajectoryExporter.exportCurriculumDataset(curriculumTrajectories);

const shards = {
  train: AscalonTrajectoryExporter.toJSONL(exportResult.train),
  validation: AscalonTrajectoryExporter.toJSONL(exportResult.validation),
  test: AscalonTrajectoryExporter.toJSONL(exportResult.test),
};
for (const [name, content] of Object.entries(shards)) {
  fs.writeFileSync(path.join(CURRICULUM_DIR, name + ".jsonl"), content, "utf8");
}

const sha256 = (content: string) =>
  createHash("sha256").update(content, "utf8").digest("hex");
const allJsonl = AscalonTrajectoryExporter.toJSONL(
  [...exportResult.train, ...exportResult.validation, ...exportResult.test]
    .sort((a, b) => a.trajectoryId.localeCompare(b.trajectoryId)),
);
const manifest = {
  schemaVersion: "1.0.0",
  datasetVersion: "ascalon-synthetic-curriculum-" + sha256(allJsonl).slice(0, 12),
  lane: "SYNTHETIC_CURRICULUM_ONLY",
  sourceCommit,
  generatedAt,
  generatorVersion: "generate_datasets.ts@lane-separation-v1",
  validatorVersion: "AscalonTrajectoryValidator@mainline",
  splitPolicy: exportResult.splitManifest,
  counts: {
    input: curriculumTrajectories.length,
    exported: exportResult.splitManifest.totalExported,
    rejected: exportResult.splitManifest.rejectedCount,
  },
  shardDigests: {
    train: sha256(shards.train),
    validation: sha256(shards.validation),
    test: sha256(shards.test),
  },
  datasetDigest: sha256(allJsonl),
  trajectoryIds: [...exportResult.train, ...exportResult.validation, ...exportResult.test]
    .map((item) => item.trajectoryId)
    .sort(),
};
fs.writeFileSync(
  path.join(CURRICULUM_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  "utf8",
);

const validationReports = curriculumTrajectories.map((trajectory) => ({
  trajectory,
  report: AscalonTrajectoryValidator.validate(trajectory),
}));
const issueCount = (code: string) =>
  validationReports.filter(({ report }) => report.issues.some((issue) => issue.code === code)).length;
const provenanceBreakdown = curriculumTrajectories.reduce(
  (counts: Record<string, number>, item) => {
    const source = String(item.provenance?.labelSource ?? "MISSING");
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  },
  {},
);
const syntheticMislabeledReal = curriculumTrajectories.filter(
  (item) =>
    (item.environment?.environmentType === "SIMULATION" ||
      item.provenance?.simulation === true ||
      item.provenance?.synthetic === true) &&
    item.provenance?.labelSource === "VERIFIED_OUTCOME",
).length;

const qualityReport = {
  schemaVersion: "1.0.0",
  generatedAt,
  status:
    exportResult.rejected.length === 0
      ? "SYNTHETIC_CURRICULUM_ONLY"
      : "SYNTHETIC_CURRICULUM_WITH_REJECTIONS",
  explicitNonProductionNotice:
    "This report does not certify a real operational corpus and does not authorize model-weight training.",
  datasetLane: exportResult.lane,
  sourceCommit,
  datasetDigest: manifest.datasetDigest,
  datasetSummary: {
    totalTrajectoriesEvaluated: curriculumTrajectories.length,
    validCount: exportResult.splitManifest.totalExported,
    trainCount: exportResult.splitManifest.trainCount,
    validationCount: exportResult.splitManifest.validationCount,
    testCount: exportResult.splitManifest.testCount,
    rejectedCount: exportResult.splitManifest.rejectedCount,
    familyCount: exportResult.splitManifest.familyCount,
  },
  qualityGates: {
    validatorPassRate:
      validationReports.length > 0
        ? validationReports.filter(({ report }) => report.valid).length /
          validationReports.length
        : null,
    secretLeakageRecords: issueCount("SECRET_LEAKAGE"),
    syntheticMislabeledReal,
    unverifiedSuccessClaims: issueCount("UNVERIFIED_SUCCESS_CLAIM"),
    missingVerificationEvidence: issueCount("MISSING_VERIFICATION_EVIDENCE"),
    replayStatus: "NOT_EVALUATED",
    replayEquivalenceRate: null,
  },
  provenanceBreakdown,
  splitManifest: exportResult.splitManifest,
  rejectionLog: exportResult.rejected.map(({ trajectory, reasons }) => ({
    trajectoryId: trajectory?.trajectoryId ?? "UNKNOWN",
    reasons,
  })),
};

fs.writeFileSync(
  path.join(REPORT_DIR, "dataset-quality-report.json"),
  JSON.stringify(qualityReport, null, 2),
  "utf8",
);
const qualityMarkdown = [
  "# Project Ascalon — Synthetic Curriculum Quality Report",
  "",
  "**Status:** " + qualityReport.status,
  "**Lane:** " + qualityReport.datasetLane,
  "**Dataset digest:** `" + qualityReport.datasetDigest + "`",
  "",
  "> Synthetic curriculum only. This report is not a production-corpus certificate and does not authorize model training.",
  "",
  "## Dataset partitions",
  "",
  "| Split | Count |",
  "|---|---:|",
  "| Train | " + qualityReport.datasetSummary.trainCount + " |",
  "| Validation | " + qualityReport.datasetSummary.validationCount + " |",
  "| Test | " + qualityReport.datasetSummary.testCount + " |",
  "| Rejected | " + qualityReport.datasetSummary.rejectedCount + " |",
  "",
  "Partitions are assigned by stable SHA-256 mission-family hashing. Actual counts depend on the corpus; 70/15/15 is a target band, not an asserted exact ratio.",
  "",
  "## Computed quality checks",
  "",
  "- Validator pass rate: " + String(qualityReport.qualityGates.validatorPassRate),
  "- Secret leakage records: " + qualityReport.qualityGates.secretLeakageRecords,
  "- Synthetic records mislabeled as real: " + qualityReport.qualityGates.syntheticMislabeledReal,
  "- Unverified success claims: " + qualityReport.qualityGates.unverifiedSuccessClaims,
  "- Missing verification evidence: " + qualityReport.qualityGates.missingVerificationEvidence,
  "- Replay evaluation: NOT EVALUATED",
  "",
  "Replay is intentionally not marked PASS: the current replay helper does not independently execute the recorded action sequence.",
  "",
].join("\n");
fs.writeFileSync(
  path.join(REPORT_DIR, "dataset-quality-report.md"),
  qualityMarkdown,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      status: qualityReport.status,
      datasetDigest: manifest.datasetDigest,
      counts: qualityReport.datasetSummary,
      qualityGates: qualityReport.qualityGates,
    },
    null,
    2,
  ),
);
