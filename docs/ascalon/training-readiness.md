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
The reconciliation work is merged into `main` at `9c27c7e75652c2cc04ebe41d41eed299cc88ce91`. Ascalon trajectory collection may begin only under the standing proposal/learning-only boundary and only from mainline-verified evidence:
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

The six historical anomaly classes are retained as audit history. Their current remediation state is governed by the merged mainline ontology, runtime consistency tests, admission workflow, and fresh CI evidence; the old branch name is historical and must not be treated as an active readiness authority.


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


## Mainline closure — 2026-09-27

The cross-floor reconciliation PR #40 is merged to `main` as `9c27c7e75652c2cc04ebe41d41eed299cc88ce91`. Fresh required gates on that main commit pass: F03 canonical post-merge, F04+F05, F05, F06, F07, repository TypeScript typecheck, Team Change Gate, Obsidian Memory Validation, Google Drive MCP, and the required Floor 01 checks. Web Regression remains informational and failed on this commit; it does not replace the dedicated admission lanes.


## Blender MCP training domain — 2026-09-30

Blender integration is admitted as a **semantic decision-training domain**, not as an unrestricted execution-learning domain.

### Canonical artifacts

- `training/ascalon/ontology/blender-capabilities.json` — semantic Blender action vocabulary and decision rules.
- `training/ascalon/curriculum/blender-decision-seeds.jsonl` — deterministic-teacher curriculum seeds, isolated from production ground truth.
- `docs/ascalon/blender-integration.md` — runtime and governance contract.
- `apps/web/factoryos/core/comms/BlenderMcpContracts.ts` — runtime semantic action contract.
- `apps/web/factoryos/core/comms/BlenderMcpAdapter.ts` — Node-side MCP session, live tool discovery and execution adapter.

### Training boundary

Ascalon should learn:
1. visual intent → semantic Blender action;
2. action preconditions;
3. provider selection where multiple asset providers exist;
4. inspection-before-mutation behavior;
5. mutation → independent observation;
6. render → physical artifact verification;
7. failure classification and recovery;
8. when arbitrary Python is necessary and when it is prohibited.

Ascalon should NOT learn:
- a fixed MCP tool list as permanent truth;
- tool names as authority;
- successful tool response as physical truth;
- arbitrary Python as a default solution;
- provider order as a decision shortcut.

### Trajectory admission

A production Blender trajectory is eligible only when:
- runtime tool discovery confirms the resolved MCP tool;
- authorization and Guardian state agree;
- semantic action is known;
- outcome is independently verified;
- provenance is complete;
- secrets/credentials/PII are absent;
- nondeterministic/provider behavior is explicitly labeled.

### Current upstream boundary

The third-party integration currently exposes Blender through an MCP server and a Blender addon; current package release is 2.1.1. The addon socket is unauthenticated, so the transport must stay inside a trusted worker/network boundary. Safe mode should remain enabled for ShortForge workers. The training contract therefore treats network/process/filesystem operations reachable through arbitrary Python as privileged and non-default.


## AER Decision Core training wave — 2026-10-04

The AER Decision Core is now separated from Ascalon deep cognition and has a dedicated offline training/evaluation boundary at `training/aer_core/`.

**AER-Core infrastructure status:** READY  
**Verified AER-Core corpus:** REQUIRED  
**Checkpoint:** NOT TRAINED / NOT PROMOTED  
**Production authority:** DISABLED  
**Shadow path:** NON-AUTHORITATIVE, ready for an injected trained provider

The AER-Core boundary enforces verified gold labels, provenance, leakage-safe splits, calibration, held-out AER-Bench evaluation, and shadow replay against the existing decision baselines.

Ascalon and AER-Core must continue to use separate training objectives and separate promotion gates.