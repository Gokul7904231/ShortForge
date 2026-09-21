# Repository Mapping: openai/evals

- **Repository**: `openai/evals`
- **URL**: `https://github.com/openai/evals`
- **Owner**: `openai`
- **Reviewed Version**: `main` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `BENCHMARK_SOURCE + PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
Ad-hoc, unversioned prompt testing fails to catch regressions across model versions or system updates. Evaluation requires structured datasets, standardized graders, repeatable metrics, and versioned benchmark baselines.

## 2. Important Mechanisms
- Dataset-driven evaluation runs: separating eval test cases (inputs, expectations) from grader code.
- Deterministic graders: exact string match, regex match, JSON schema match, token distance.
- Versioned benchmark comparison: baseline vs candidate scores.
- Metric aggregation: pass rates, error distributions, cost and duration statistics.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Benchmark Datasets & Deterministic Evaluation Harness.
- **FactoryOS Destination**:
  - `testing/contracts/mission.contract.ts` (Machine-readable mission test specifications)
  - `testing/judges/deterministic/` (Deterministic floor, contract, and artifact judges)
  - `testing/reports/EvaluationReport.ts` (Structured evaluation metrics)
- **Existing Agents/Capabilities Affected**:
  - `GuardianManager` and `VerificationEngine`: Evaluates floor quality against repeatable thresholds.

## 4. What Was Adopted
- Separation of test scenarios (`testing/scenarios/golden/golden-short-001.ts`) from evaluation judges.
- Deterministic graders first (physical artifact existence, SHA-256 match, 8 hard media gates).
- Machine-readable evaluation report schema.

## 5. What Was NOT Adopted
- Did NOT install the OpenAI evals CLI or Python evaluation framework.
- Did NOT adopt OpenAI-specific evaluation models; all evaluations run locally and deterministically.

## 6. Security & Licensing Considerations
- MIT License. Clean-room TypeScript implementation.

## 7. Validation Performed
- Evaluated deterministic grader passes and metric reporting on `golden-short-001`.
