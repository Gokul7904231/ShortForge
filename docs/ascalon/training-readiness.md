# Project Ascalon: Training Readiness Charter & Principles

## Current readiness state — 2026-09-27

**Status:** READY_FOR_TRAINING_DATA_GENERATION_UNDER_PROPOSAL_LEARNING_ONLY

The earlier readiness artifacts are historical evidence, not current certification. Current training-data admission must be derived from executable mainline state and fresh CI evidence.

### Reconciled in this wave
- F04 canonical identity is aligned with executable Media Synthesis & Provider Execution behavior.
- F04 media-generation capabilities are bound to the F04 training ontology and Guardian-gated.
- Ascalon now has an explicit MEDIA_SYNTHESIZER domain worker identity for F04 execution.
- F07 admission validation now matches the committed CI_ADMISSION_PASS Team report contract.
- stale floor/readiness documentation is being refreshed.
- the branch inventory is documented from the live repository rather than historical counts.

### Promotion gate
The reconciliation branch is CI-verified and is eligible for merge. After merge, Ascalon production trajectory collection may begin under the standing proposal/learning-only boundary once the same evidence is visible on main:
1. Ascalon hierarchy/ontology tests pass.
2. F03/F04/F05/F06/F07 dedicated validation lanes pass.
3. Team Change Gate passes.
4. repository typecheck passes.
5. current Team report and documentation agree with the verified CI state.
6. no canonical floor has multiple meanings across runtime, ontology, .okf, and training contracts.

This charter does not authorize model-weight training. It authorizes only evidence-driven dataset preparation after the above gates pass.

## 1. Charter Mandate

The primary objective of Project Ascalon is to prepare ShortForge / FactoryOS for operational machine learning and autonomous agent training. Training an LLM or autonomous policy on contaminated telemetry, fabricated outcomes, unearned confidence scores, or ambiguous hierarchy labels causes severe operational drift, hallucinated safety compliance, and catastrophic runtime failure.

Project Ascalon enforces an absolute standard: **Every trajectory admitted into the training pipeline must reflect verifiable, reproducible, and authoritative reality.**

---

## 2. Core Operational Principles

### Principle 1: Claim <= Evidence (No Fabricated Success)
An agent or pipeline step may never assert an outcome of `SUCCESS` unless it is backed by concrete, verifiable evidence (e.g., artifact SHA-256 hash on persistent storage, HTTP 200 response payload, or cryptographically signed receipt).
- Outcomes marked `SUCCESS` without `verified: true` are rejected at the validator gate.
- Outbox deliveries without cryptographic digest verification are rejected.

### Principle 2: Complete Elimination of Synthetic Confidence
Statistical models and decision adapters must never emit hardcoded placeholder confidence values (e.g., `0.85` or `0.8/0.2`).
- If an LLM emits a decision, confidence must either reflect true calibrated model log-probabilities or be flagged with `calibrationStatus: "UNCALIBRATED"`.
- Missing or malformed decision fields must result in explicit `INVALID` or `UNRESOLVED` statuses with actionable error codes, not automatic fallbacks to `options[0]` or `rubric[0]`.

### Principle 3: Strict Simulation & Shadow Isolation
Simulated data and heuristic baselines serve valuable roles in system prototyping and testing, but must **never** be silently blended with production ground truth.
- All simulated executions are tagged `environmentType: "SIMULATION"`, `synthetic: true`, and `isTrainingEligible: false` unless explicitly targeted for synthetic curriculum training under an approved deterministic teacher.
- Heuristic fallback adapters are explicitly marked `isProductionAuthority: false` and isolated from training datasets.

### Principle 4: Zero Credential & PII Leakage
Training datasets must never contain runtime secrets, API keys, bearer tokens, or sensitive customer tokens.
- Every trajectory undergoes multi-regex automated secret scanning before ingestion or export.
- Leaked credentials trigger an immediate blocking error and abort the export pipeline.

### Principle 5: Deterministic Replayability
Any trajectory deemed authoritative must be replayable in an isolated verification sandbox:
- Initial WorldState + Action Sequence + Deterministic Tool Outputs = Identical Final WorldState.
- Non-deterministic calls (e.g., unseeded random numbers) are banned from core state transitions.

---

## 3. Remediation Scope & Audit Summary

Prior to Project Ascalon, the FactoryOS codebase contained several critical implementation anomalies that posed immediate contamination risks:

1. **Floor Topology Collisions**: Floor 03 and Floor 04 were inverted across multiple documentation files and contracts, and Floor 07 was erroneously conflated with the Guardian regulator.
2. **Heuristic Mock Decision Adapter**: `TypeSafeJevAdapter.ts` was masquerading as a true System-1 cognitive model while returning hardcoded `0.85` confidence and defaulting to `options[0]`.
3. **Synthetic Probability Distributions**: `LLMDecisionAdapter.ts` injected artificial `0.8/0.2` probabilities on invalid JSON or choice mismatches.
4. **Mock WorldState Injection**: Cognitive runtime routines bypassed live sensor state and evaluated decision branches against static mocked objects.
5. **Non-deterministic Provenance**: Provenance IDs relied on `Math.random()`, preventing deterministic trajectory replaying.
6. **Unvalidated Memory Ingestion**: The experience retriever lacked training eligibility flags, allowing simulated and failed experiences to influence live decision policies.

All 6 critical anomaly classes have been remediated in the `feat/ascalon-training-readiness` branch.


## Floor 03 post-merge admission gate — 2026-09-26

**STATUS: ADMITTED FOR ASCALON TRAINING DATA PREPARATION**

Final merged-main evidence:
- Main commit: `0fa169cae74c9b77def147df55dc4572b91769d2`
- Floor 03 Post-Merge Verification run: `36219665043`
- F03 canonical gate: **PASS**
- F03 suite: **37 passed**
- F03 Guardian contract: **1 passed**
- F03/F04/F05 typed handoff contract: **2 passed**
- Ascalon `floors.json` and `agents.json`: valid JSON
- Repository TypeScript typecheck: **PASS** (post-merge run `36219665043`)
- Main CI required checks: **PASS** for Floor 01 Python, TypeCheck/Contract, Security/Dependency Scan, and Production Container Smoke.

The remaining Web Regression Suite is explicitly informational and does not replace or invalidate the required F03/main verification evidence.

The admission claim is limited to the canonical F03 planning/runtime contracts and their governance evidence. It does not claim physical media generation authority or F07 release authority.


### Evidence refresh — 2026-09-26 11:10 IST
The admission record above was revalidated on the newer `main` commit `0fa169cae74c9b77def147df55dc4572b91769d2`. The dedicated Floor 03 Post-Merge Verification run `36219665043` passed both jobs: **F03 canonical post-merge gate = PASS** and **Repository TypeScript typecheck = PASS**. The repository CI run `36219665012` also completed with **PASS**.

## Fresh reconciliation evidence — 2026-09-27

- PR #40 reconciliation branch: CI verified.
- Team Change Gate: PASS.
- F03/F04/F05/F06/F07 dedicated gates: PASS.
- Repository CI: PASS.
- No model weights trained or modified.
- Ascalon authority remains proposal/learning-only.
