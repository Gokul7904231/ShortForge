# Project Ascalon: Component Training Readiness Matrix

## 1. Executive Summary

This matrix provides the exhaustive audit and verification status of all eighteen (18) core subsystems and modules comprising the ShortForge / FactoryOS cognitive and execution infrastructure. Each component has been inspected, remediated against data contamination vulnerabilities, validated for type safety, and integrated into the Ascalon training safety harness.

---

## 2. 18-Component Verification Matrix

| # | Subsystem / Component | Path | Pre-Ascalon Vulnerability / Anomaly | Remediation Applied | Training Eligibility | Readiness Status |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| **1** | **Floor Topology & Hierarchy** | `apps/web/factoryos/core/contracts/HierarchyConsistencyValidator.ts` | Inverted Floor 03/04 definitions; conflated Guardian with Floor 07. | Canonicalized 8-floor DAG; decoupled Control Hierarchy from Pipeline Floors. | **ELIGIBLE** | **READY** |
| **2** | **Decision Adapter** | `apps/web/factoryos/core/intelligence/decision/LLMDecisionAdapter.ts` | Synthetic confidence (0.85), artificial 0.8/0.2 distributions, silent fallback to `options[0]`. | Strict JSON/Schema validation; explicit INVALID/UNRESOLVED status; validation error codes. | **ELIGIBLE** | **READY** |
| **3** | **Heuristic Shadow Adapter** | `apps/web/factoryos/core/intelligence/decision/TypeSafeJevAdapter.ts` | Masqueraded as genuine System-1 neural model while running heuristics. | Rebranded as `HeuristicTypedDecisionShadowAdapter`; marked non-authority and training-ineligible. | **INELIGIBLE** (Shadow Only) | **READY** |
| **4** | **Overseer Cognition Client** | `apps/web/factoryos/core/intelligence/overseer/OverseerCognitionClient.ts` | Fallback heuristics silently recorded as real LLM decisions. | Explicit `ReasoningSource` modes (`REAL_MODEL`, `TEST_HEURISTIC`); fallback training disabled. | **CONDITIONAL** (Real Model Only) | **READY** |
| **5** | **Cognitive Runtime** | `apps/web/factoryos/core/cognitive/CognitiveRuntime.ts` | Mock worldstate bypassed real telemetry; hardcoded fidelity assumptions. | Authoritative worldstate binding; lifecycle states (`RECOMMENDED`, `ACCEPTED`); fidelity flags. | **ELIGIBLE** | **READY** |
| **6** | **Decision Context** | `apps/web/factoryos/core/cognitive/CognitiveDecisionContext.ts` | Lack of measurement fidelity and uncertainty boundaries in context payload. | Added lifecycle states, measurement fidelity contracts, and provenance source tracking. | **ELIGIBLE** | **READY** |
| **7** | **Decision Contracts** | `apps/web/factoryos/core/contracts/DecisionContracts.ts` | Missing typed validation status, error codes, and uncertainty contracts. | Formally defined `DecisionStatus`, `DecisionValidationErrorCode`, and `DecisionUncertainty`. | **ELIGIBLE** | **READY** |
| **8** | **Decision Ledger** | `apps/web/factoryos/core/intelligence/decision/DecisionLedger.ts` | Untagged decision logs; unable to filter out heuristic fallbacks during dataset export. | Added `DecisionLabelSource`, `isTrainingEligible` filtering, and audit digest verification. | **ELIGIBLE** | **READY** |
| **9** | **WorldState Engine** | `apps/web/factoryos/core/worldstate/WorldStateEngine.ts` | `Math.random()` used in provenance logs; no separation of simulation vs real state. | Replaced random with UUIDs; snapshot contracts with cryptographic digests; explicit env typing. | **ELIGIBLE** | **READY** |
| **10** | **WorldState Contracts** | `apps/web/factoryos/core/contracts/WorldStateContracts.ts` | Missing measurement fidelity taxonomy (`REAL_MEASURED`, `ESTIMATED`, etc.). | Added `MeasurementFidelity` and `WorldStateSnapshotContract` with cryptographic digest fields. | **ELIGIBLE** | **READY** |
| **11** | **Experience Retriever** | `apps/web/factoryos/core/cognitive/memory/ExperienceRetriever.ts` | Lack of pluggable retriever interface; unverified memories injected into prompts. | Created `ExperienceRetriever` interface with keyword, vector, and hybrid implementations. | **ELIGIBLE** | **READY** |
| **12** | **Indexed Experience Memory** | `apps/web/factoryos/core/cognitive/memory/IndexedExperienceMemory.ts` | Failed or simulated experiences lacked eligibility flags, corrupting memory retrieval. | Mandated default `trainingEligibility: "INELIGIBLE"` for unverified or simulated memories. | **ELIGIBLE** | **READY** |
| **13** | **Capability Contracts** | `apps/web/factoryos/core/contracts/CapabilityContracts.ts` | Capabilities lacked training eligibility annotations and safety fence requirements. | Added `trainingEligibility` flag to `CapabilityMetadata` and monotonic fencing specs. | **ELIGIBLE** | **READY** |
| **14** | **Deterministic Teacher** | `training/ascalon/generation/deterministic_teacher/DeterministicTeacher.ts` | Absence of authoritative ground truth generator for invariant curriculum. | Implemented axiomatic teacher verifying artifact hashes, leases, and capability boundaries. | **ELIGIBLE** | **READY** |
| **15** | **Scenario Generator** | `training/ascalon/generation/scenario_generator/ScenarioGenerator.ts` | Unseeded mock test generators creating ambiguous synthetic data. | Seeded deterministic scenarios explicitly labeled `SIMULATION` and `synthetic: true`. | **ELIGIBLE** (Curriculum Simulation) | **READY** |
| **16** | **Trajectory Validator** | `training/ascalon/validators/AscalonTrajectoryValidator.ts` | No automated secret scanning or Claim <= Evidence validation gates. | Enforces 9-pattern secret detection, schema completeness, and anti-hallucination rules. | **ELIGIBLE** | **READY** |
| **17** | **Trajectory Exporter** | `training/ascalon/exporters/AscalonTrajectoryExporter.ts` | Row-level random splitting risked cross-family evaluation data leakage. | Partitioned by `missionFamily` (~70/15/15) to guarantee zero leakage between train/val/test. | **ELIGIBLE** | **READY** |
| **18** | **Ascalon Replay Engine** | `training/ascalon/generation/trajectory_generator/AscalonReplayEngine.ts` | Trajectories were non-replayable due to unseeded non-determinism. | Verifies step-by-step state reconstruction and cryptographic digest equivalence upon replay. | **ELIGIBLE** | **READY** |

---

## 3. Certification

All eighteen (18) components have been audited, remediated, verified via the Ascalon test suite, and certified as **TRAINING_READY**.
