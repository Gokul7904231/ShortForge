# FactoryOS Architectural Principles

> **Document Class**: Foundational Engineering Principles  
> **Status**: AUTHORITATIVE & ENFORCED IN TESTS  

---

## 1. Schedule-Derived Autonomous Execution
Autonomous video production quantities, cadence, target niches, and freshness windows are strictly derived from the active schedule directive.
- **Invariant**: The production pipeline never assumes or hardcodes business quantities (e.g. "always create 5 videos").
- **Unmet Capacity Transparency**: If the research candidate pool has fewer valid opportunities than requested, the system reports explicit unmet capacity with clear reasons; it never fabricates synthetic trends or relabels evergreen topics as breaking news.

---

## 2. Decoupled Hierarchy: Control Plane vs. Production Pipeline
The sovereign control hierarchy (authority, supervision, lease management, circuit breaking) is strictly segregated from the physical production pipeline (sequential media generation).
- **Control Entities**: Overseer (L1), Guardian (L2 Gate), Slayer (L2 Eviction), Healer (L2 Circuit Doctor).
- **Production Floors**: Floors 00 through 07.
- **Invariant**: Control entities are never pipeline floors. Guardian is not Floor 07.

---

## 3. Single Authoritative Source of Truth
Every architectural entity must possess exactly one canonical source of truth.
- **Topology**: All floor definitions, numbers, categories, and parallel branch relationships are defined solely in `apps/web/factoryos/core/hierarchy/FloorRegistry.ts`.
- **DAG Generation & Verification**: `TaskDAGPlanner`, `HierarchyConsistencyValidator`, and `FactoryStateService` derive from `FloorRegistry.ts` rather than maintaining duplicate arrays.

---

## 4. Claim <= Evidence (Forensic Grounding)
An autonomous agent or pipeline floor may never assert an outcome of `SUCCESS` unless it is supported by concrete, independently verifiable evidence.
- Physical artifacts must be verified on storage with cryptographic SHA-256 digests.
- Subtitle synchronization must be verified against physical audio sample durations via forensic ffprobe analysis.
- Outcomes claiming success without verification evidence are blocked at the validator gate.

---

## 5. Absolute Telemetry & Error Honesty
The system strictly prohibits synthetic success, uncalibrated confidence scores, or fake 200 HTTP responses.
- **Failure Transparency**: If external web retrieval, voice synthesis, or rendering fails, the subsystem returns explicit `503` / `UNAVAILABLE` statuses and error records, never synthetic mock successes.
- **Fidelity Tagging**: Heuristic baselines, model inferences, and observed sensor readings carry explicit fidelity annotations (`HEURISTIC_ESTIMATE`, `MODEL_INFERENCE`, `OBSERVED_MEASUREMENT`, `VERIFIED_FACT`).

---

## 6. Deterministic Replayability & Monotonic Fencing
All state transitions and capability leases are deterministic and replayable.
- Distributed workers execute under time-bounded leases with strictly increasing monotonic fencing tokens. Stale tokens are rejected at the capability gate to prevent split-brain collisions.
- Operational trajectories record complete input digests, tool parameters, and cryptographic outcome digests, enabling deterministic re-simulation in sandboxes.

---

## 7. Bounded Repair & Last-Known-Good Baseline Preservation
Automated healing operates under strict, finite budgets.
- **Bounded Loops**: Repair attempts are strictly capped (default: 2 attempts) to prevent infinite retry loops and runaway compute spend.
- **Baseline Preservation**: The system retains the last-known-good verified baseline. If a repair attempt fails or the budget is exhausted, the pipeline rolls back to the baseline rather than overwriting it with an unverified candidate.

---

## 8. Capability-First Abstraction & Provider Neutrality
Autonomous agents declare the *capability requirements* of a task rather than hardcoding specific model or provider strings.
- **Model Routing**: Tasks declare `ModelCapability` (e.g. `TEXT_REASONING`, `STRUCTURED_JSON`, `AUDIO_TTS`). The router evaluates candidate models based on context limits, latency, cost governance, and real-time circuit breaker health.
- **Compute Routing**: Video rendering jobs declare hardware constraints (GPU type, memory, duration). The router assigns the job to the most utility-optimal provider (`LOCAL`, `AMD`, `KAGGLE`, `COLAB`, `RUNPOD`).

---

## 9. Domain-Isolated Typed Memory
Memory is organized into domain-specific, typed stores rather than an undifferentiated vector bucket.
- **Memory Classes**: Source Store, Claim Store, Evidence Store, Topic Memory, Channel Profile Memory, and Performance Attribution Memory.
- **Promotion Gate**: Runtime working memory is isolated per mission and only promoted to long-term memory after verification evidence is confirmed.

---

## 10. Least-Privilege Capability Sandboxing
Agents execute within the `AgentRuntime` harness with strictly scoped capability grants.
- An agent assigned to Floor 02 (Scripting) cannot invoke rendering or cloud publishing capabilities.
- Untrusted web content retrieved during research is treated strictly as raw data, never as executable system instructions.
