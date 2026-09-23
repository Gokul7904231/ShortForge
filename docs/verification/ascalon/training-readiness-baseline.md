# Project Ascalon: ShortForge Training-Readiness Baseline Audit

**Repository**: ShortForge / FactoryOS  
**Audit Standard**: CLAIM <= EVIDENCE | Zero tolerance for synthetic success or false confidence  
**Branch**: `feat/ascalon-training-readiness`  
**Base Commit**: `b70a4e5`  
**Audit Date**: 2026-09-23  

---

## 1. Executive Baseline Summary

This audit establishes the baseline technical state of ShortForge / FactoryOS prior to remediation for Project Ascalon. The objective is to identify and remediate all architectural anomalies, synthetic shortcuts, uncalibrated confidence values, and hierarchy ambiguities that could contaminate future LLM training data.

---

## 2. Environment & System Status

| Subsystem | Audit Status | Ground Truth Evidence |
| :--- | :--- | :--- |
| **Git Repository** | `TEST_VERIFIED` | Clean worktree on `feat/ascalon-training-readiness` branching off `main`. |
| **Control Plane Typecheck** | `TEST_VERIFIED` | `tsc --project tsconfig.factoryos.json --noEmit` exits with code 0 (Strict). |
| **Control Plane Unit Tests** | `TEST_VERIFIED` | 216 test suites passing (1,151 individual tests green). |
| **E2E Live Cloud Tests** | `BLOCKED` / `NOT_CONFIGURED` | 5 long-running / live cloud tests timed out or require active cloud credentials (Azure/Google Drive). |
| **Content-Addressed Storage** | `LIVE_VERIFIED` | Two-level prefix sharding under `data/cas_storage/{ab}/{hash}.ext` with physical SHA-256 validation. |
| **F07 Release Guardian** | `TEST_VERIFIED` | 58/58 unit tests passing; G00-G14 gates active. |

---

## 3. Discovered Implementation Anomalies & Training Risks

### Anomaly A-01: Factory Hierarchy & Floor Topology Collision (Severity: P0)
- **Problem**: Conflicting definitions of Floor 03 and Floor 04 between documentation (where F03 was labeled Audio and F04 Visuals) vs runtime source code (`services/pipeline/` and `testing/contracts/floor.contract.ts` where F03 is Asset Realization / Visuals and F04 is Media Synthesis / Voice).
- **Contamination Risk**: Training trajectories would learn mutually contradictory definitions of floor responsibilities.
- **Remediation**: Canonicalized in `training/ascalon/ontology/hierarchy.json` and `floors.json` (F03 = Visual Asset Realization, F04 = Voice & Media Synthesis).

### Anomaly A-02: LLM Decision Adapter Synthetic Fallbacks (Severity: P0)
- **Problem**: `LLMDecisionAdapter.ts` manufactures decisions when LLM outputs are malformed, such as hardcoding default confidence `0.85`, synthetic probabilities `0.8/0.2`, or silently selecting `q.options[0]` or `q.rubric[0]`.
- **Contamination Risk**: An LLM trained on these trajectories would learn that malformed outputs are successfully repaired into valid operational choices.
- **Remediation**: Implement strict typed validation rejecting invalid/malformed outputs with explicit error codes (`INVALID_PROBABILITY`, `INVALID_DISTRIBUTION`, etc.) and status `INVALID`/`UNRESOLVED`.

### Anomaly A-03: TypeSafeJevAdapter Heuristic Masquerading (Severity: P1)
- **Problem**: `TypeSafeJevAdapter.ts` was named after the Jev System One model but actually executes local heuristic decision rules with hardcoded confidence.
- **Contamination Risk**: Teaches the training dataset that heuristic rule outputs represent true System One intelligence.
- **Remediation**: Reclassify as `HeuristicTypedDecisionShadowAdapter` with `isProductionAuthority: false` and `isTrainingEligible: false`.

### Anomaly A-04: Cognitive Runtime Mock WorldState Injection (Severity: P1)
- **Problem**: `CognitiveRuntime.ts` constructs an internal mock world state, blurring the line between real operational state and simulation.
- **Contamination Risk**: An agent trained on this data would accept fabricated world state as ground truth.
- **Remediation**: Enforce explicit typing: `AuthoritativeWorldState` vs `SimulationWorldState`, tagging all simulation experiences with `experienceType = "SIMULATION"` and excluding them from production training sets.

### Anomaly A-05: Overseer Local Heuristic Reasoning (Severity: P1)
- **Problem**: `OverseerCognitionClient.ts` falls back to canned keyword matching and string heuristics without tagging the result as unlearned fallback.
- **Contamination Risk**: Canned responses might enter the training set as golden operational plans.
- **Remediation**: Introduce explicit reasoning sources (`REAL_MODEL`, `LOCAL_MODEL`, `TEST_HEURISTIC`, `DISABLED`) with `trainingEligible: false` on heuristics.

### Anomaly A-06: Uncalibrated Confidence Masquerading as Calibrated (Severity: P2)
- **Problem**: Hardcoded confidence figures (e.g. `0.92`, `0.95`) injected into decision ledgers without statistical calibration.
- **Contamination Risk**: Teaches models false overconfidence.
- **Remediation**: Separate `MODEL_PROBABILITY`, `EPISTEMIC_CONFIDENCE`, `VERIFICATION_CONFIDENCE`, and `SYSTEM_HEALTH_CONFIDENCE`. Set `calibrationStatus: "UNCALIBRATED"` unless mathematically verified.

---

## 4. Current Baseline Readiness Status

Current Status: **NOT_READY** (Remediation active).
Project Ascalon must not ingest operational trajectories until all P0 and P1 anomalies are fully resolved, verified by test suites, and audited.
