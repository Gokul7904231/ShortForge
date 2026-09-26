# Project Ascalon: Training Readiness Charter & Principles

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

Floor 03 remains **NOT TRAINING-READY** on the hardening branch until the canonical runtime adapter, distributed handoff persistence, explicit F03→F05 join, repository-wide typecheck, and the dedicated post-merge F03 workflow all pass on the actual `main` commit.

Evidence from the earlier PR-scoped F03 run proves the scoped implementation tests, but it does not prove post-merge runtime integration or repository-wide health. The new admission evidence is therefore the post-merge workflow on `main`, plus the immutable F03 handoff record and canonical Overseer execution trace.
