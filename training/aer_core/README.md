# ShortForge AER Decision Core Training

This directory is the reproducible training/evaluation boundary for the AER Decision Core. It does not enable AER-Core in FactoryOS.

## Pipeline

verified decision records -> validation -> leakage-safe split -> supervised training -> validation-only calibration -> AER-Bench -> shadow replay -> promotion

The compact model is a dynamic candidate scorer. It receives sanitized epistemic context, the runtime question, and runtime candidates/rubric; it is not hard-coded to provider names.

## Training data contract

Each JSONL row must satisfy aer-core-dataset-v1:

- input.questions contains runtime NOUL, CHOICE, or SCORE questions.
- goldAnswers contains verified truth labels, never model/heuristic predictions.
- verificationStatus is VERIFIED.
- labelSource is VERIFIED_OUTCOME, AUTHORITATIVE_SYSTEM, HUMAN_REVIEW, or an approved deterministic teacher.
- evidenceRefs and/or outcomeRefs are present.
- synthetic and fallbackApplied are false.
- trainingEligible is true.
- missionId/trajectoryId (or an explicit provenance grouping key) is present so related examples cannot cross splits.

No secret-bearing or unredacted operational context may enter the dataset.

## Commands

Install dependencies:

~~~bash
python -m pip install -r training/aer_core/requirements.txt
~~~

Validate and partition:

~~~bash
python -m training.aer_core.prepare \
  --input training/aer_core/data/eligible.jsonl \
  --output-dir training/aer_core/data/normalized
~~~

Train:

~~~bash
python -m training.aer_core.train \
  --dataset training/aer_core/data/normalized/train.jsonl \
  --base-model <approved-base-model> \
  --output-dir training/aer_core/runs/aer-core-v1
~~~

Fit calibration using validation only:

~~~bash
python -m training.aer_core.calibrate \
  --dataset training/aer_core/data/normalized/validation.jsonl \
  --checkpoint-dir training/aer_core/runs/aer-core-v1 \
  --output training/aer_core/runs/aer-core-v1/calibration.json
~~~

Generate measured held-out predictions:

~~~bash
python -m training.aer_core.predict \
  --dataset training/aer_core/data/normalized/test.jsonl \
  --checkpoint-dir training/aer_core/runs/aer-core-v1 \
  --temperatures training/aer_core/runs/aer-core-v1/calibration.json \
  --output training/aer_core/runs/aer-core-v1/test-predictions.jsonl
~~~

Run AER-Bench:

~~~bash
python -m training.aer_core.run_bench \
  --dataset training/aer_core/data/normalized/test.jsonl \
  --predictions training/aer_core/runs/aer-core-v1/test-predictions.jsonl \
  --report training/aer_core/runs/aer-core-v1/aer-bench.json
~~~

Latency is measured around the predictor call. The benchmark validates prediction coverage, mode alignment, confidence, and measured latency; it never synthesizes them.

## Promotion gates

1. Dataset eligibility/provenance passes.
2. No train/validation/test group leakage.
3. Invariant and schema tests pass.
4. Calibration is fitted only on validation data.
5. AER-Bench passes the held-out policy thresholds.
6. Shadow replay records AER-Core beside JEV/GLiDE with zero authority impact.
7. Restricted canary preserves deterministic eligibility, fencing, authorization, and F07 invariants.
8. Governance review promotes the checkpoint.

The repository does not claim a trained or production-ready checkpoint until the gates are evidenced.
