# AER Decision Core Training Program

**Status:** PIPELINE IMPLEMENTED; NO TRAINED/PROMOTED CHECKPOINT CLAIMED

## Objective

Train a separate compact decision model for ShortForge instead of forcing Ascalon to perform every high-frequency bounded decision.

## Input

Each example contains:

~~~text
epistemic state
+ verified evidence references
+ runtime question(s)
+ runtime options/rubric
+ policy/context slice
~~~

## Targets

### CHOICE

Selected option plus a candidate distribution where statistically defensible.

### NOUL

Truth value plus probability of true and calibration target.

### SCORE

Rubric level plus score/distribution and calibration target.

## Training data eligibility

Only examples that are provenance-bound, independently verified, schema-valid, policy-valid, free of synthetic fallback decisions, free of fabricated confidence/probabilities, and explicitly training-eligible may enter the training set.

Never train on the historical heuristic JEV shadow behavior as if it were a learned model.

## Implemented pipeline

The repository now provides:

- verified training-record contract;
- dataset validator;
- deterministic mission/trajectory grouped partitioning;
- reproducible trainer;
- validation-only temperature calibration;
- held-out prediction generation;
- AER-Bench metrics;
- shadow comparison telemetry;
- promotion evidence manifest.

The canonical offline training boundary is `training/aer_core/`.

## Stages

### Stage 0 — deterministic teacher set

Build a clean seed set from verified FactoryOS outcomes and human-reviewed decisions.

### Stage 1 — supervised fine-tuning

Train the compact model to reproduce typed decisions and valid uncertainty representation.

### Stage 2 — calibration

Fit calibration only on a held-out calibration split. Never calibrate on the test set.

### Stage 3 — selective prediction

Evaluate abstention so the model can return UNRESOLVED when evidence is insufficient.

### Stage 4 — hard-negative mining

Add near-tied providers, conflicting telemetry, stale evidence, unavailable capabilities, misleading historical outcomes, contradictory hypotheses, and threshold-boundary cases.

### Stage 5 — shadow deployment

Run beside deterministic logic, GLiDE/JEV/Laya where available, and Ascalon. Record disagreements without changing execution.

### Stage 6 — restricted promotion

Promote only if benchmark, calibration, latency, replay, security, and authority gates pass.

## Dataset record

The runtime-to-training handoff is explicit. A DecisionLedger transaction is **not** automatically golden; a training capture must provide sanitized input, independently verified gold answers, evidence/outcome references, provenance, and eligibility.

~~~json
{
  "exampleId": "immutable-id",
  "datasetVersion": "aer-core-v1",
  "state": {},
  "questions": [],
  "goldAnswers": [],
  "evidenceRefs": [],
  "outcomeRefs": [],
  "policyRefs": [],
  "trainingEligible": true,
  "provenance": {}
}
~~~

## Metrics

Do not use a single accuracy number.

Track:

- CHOICE accuracy;
- NOUL accuracy;
- SCORE MAE / ordinal quality;
- Brier;
- ECE;
- selective risk;
- abstention coverage;
- malformed response rate;
- p50/p95 latency;
- batch throughput;
- CPU/GPU memory.

## Separation from Ascalon

AER-Core learns **bounded decisions**.

Ascalon learns **deep cognition and generation**.

Shared examples are allowed only when each example independently satisfies the relevant model's training-eligibility and labeling requirements.


## Training readiness gate

The engineering layer is ready for the first real training run. Before that run, the corpus must contain enough independent verified examples to populate non-empty train, validation, and test partitions after group isolation.

The first promoted checkpoint must have:

- checkpoint fingerprint;
- dataset manifest;
- validation calibration artifact;
- held-out AER-Bench report;
- authority-invariant test evidence;
- shadow replay evidence against the live deterministic/JEV/GLiDE baselines.

Until those artifacts exist, AER-Core remains a research/shadow component.
