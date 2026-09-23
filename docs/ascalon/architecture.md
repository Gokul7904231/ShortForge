# Project Ascalon: System Architecture & Data Generation Subsystem

## 1. Executive Overview

**Project Ascalon** is the foundational training readiness and operational trajectory infrastructure for **ShortForge / FactoryOS**. Its primary mandate is to eliminate all implementation anomalies, fake telemetry, unearned confidence scores, and simulation contamination from the runtime environment. In doing so, it ensures that every operational trajectory captured from the factory floor is authoritative, verifiable, and strictly suitable for training autonomous agents and large language models without teaching negative behaviors.

```
                              HUMAN OPERATOR / OVERSEER (L0/L1)
                                              │
                                              ▼
                                 COGNITIVE RUNTIME & LEDGER
                                 (LLM Decision / Shadow)
                                              │
                                              ▼
                                    GUARDIAN GATE (L2)
                               (Capability & Policy Control)
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
          SLAYER (Lease Reclaim)                           HEALER (Circuit Breaker)
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                                 WORKER AGENTS & EXECUTORS (L3)
                                 (Floor 00 through Floor 07)
                                              │
                                              ▼
                                 EVIDENCE & OUTCOME RECORDER
                                 (Claim <= Evidence Engine)
                                              │
                                              ▼
                                 ASCALON TRAJECTORY EXPORTER
                                 (Secret Scan, Split, Jsonl)
```

---

## 2. Decoupled Hierarchy: Control Plane vs. Production Pipeline

A foundational architectural requirement of Project Ascalon is the strict decoupling of the **Sovereign Control Hierarchy** from the **Sequential Production Pipeline**. Confusing an executive control agent with a production floor produces structural contamination in trajectory representations.

### 2.1 The 4-Tier Sovereign Control Hierarchy

The control hierarchy defines **authority, supervision, and execution rights**:

| Level | Tier | Role / Entity | Mandate & Capabilities |
| :--- | :--- | :--- | :--- |
| **Level 0** | **Human Authority** | Executive Operator | Ultimate policy authority; grants root approvals and manual overrides. |
| **Level 1** | **Overseer** | Factory Overseer | High-level goal decomposition, factory-wide state monitoring, mission lifecycle dispatch. |
| **Level 2** | **Guardian & Specialized Regulators** | Guardian, Slayer, Healer | **Guardian**: Pre-execution capability authorization and safety gating.<br>**Slayer**: Monotonic lease revocation, zombie worker eviction.<br>**Healer**: Autonomous fault recovery and circuit breaker mitigation. |
| **Level 3** | **Worker Fleet** | Floor Workers | Task execution within assigned pipeline floors under active capability leases. |

### 2.2 The 8-Stage Sequential Production Pipeline

The production pipeline is a directed acyclic graph (DAG) representing the **physical transformation of creative media assets**:

```
Floor 00: Research & Trend Ingestion
   │
   ▼
Floor 01: Directive & Creative Brief Formulation
   │
   ▼
Floor 02: Narrative Architecture & Script Synthesis
   │
   ▼
Floor 03: Asset Realization (Visuals, Frames, Keyframes)
   │
   ▼
Floor 04: Media Synthesis (Voiceover, Audio, SFX, Stem Mux)
   │
   ▼
Floor 05: Motion Integration & Video Assembly
   │
   ▼
Floor 06: Quality Evaluation & Policy Compliance Verification
   │
   ▼
Floor 07: Final Render Packaging, Outbox Delivery & Ingestion
```

> **Architectural Invariant**: Floor 03 is strictly **Asset Realization** (visual elements). Floor 04 is strictly **Media Synthesis** (audio and voice elements). The Guardian is **never** Floor 07; the Guardian is an authoritative Level 2 regulator that governs all capability executions, including the delivery floor.

---

## 3. Subsystem Architecture

### 3.1 Authoritative WorldState Subsystem (`WorldStateEngine`)
- **Isolation of Real vs. Simulation**: The runtime explicitly annotates snapshots with `AuthoritativeWorldState` vs. `SimulationWorldState`.
- **Deterministic Provenance**: Eliminated all unseeded non-deterministic pseudorandom numbers (`Math.random()`). Provenance IDs are derived from cryptographically strong monotonic tokens and UUIDs (`prov_${uuid}`).
- **Measurement Fidelity**: Every sensor, counter, or quota reading explicitly states its fidelity: `REAL_MEASURED`, `ESTIMATED`, `BOUNDED_ESTIMATE`, or `UNKNOWN`.

### 3.2 Decision Runtime & Ledger (`LLMDecisionAdapter`, `DecisionLedger`)
- **No Synthetic Confidence**: Replaced hardcoded heuristic numbers (`0.85`, `0.8/0.2`) with formal validation schemas.
- **Typed Decision Validation**: Decisions are parsed against strict schemas (`NOUL`, `CHOICE`, `SCORE`, `TEXT`). Unparsable or schema-violating outputs transition immediately to `INVALID` or `UNRESOLVED` states with explicit error codes (`INVALID_JSON`, `INVALID_ENUM`, `INVALID_DISTRIBUTION`, etc.).
- **Shadow Mode Labeling**: Heuristic shadow adapters (`HeuristicTypedDecisionShadowAdapter`) carry immutable metadata declaring `isProductionAuthority: false` and `isTrainingEligible: false`.
- **Label Source Tracking**: Every ledger record tags its provenance (`VERIFIED_OUTCOME`, `HUMAN_EXPERT`, `DETERMINISTIC_TEACHER`, `HEURISTIC_FALLBACK`, `SIMULATION_PSEUDO`).

### 3.3 Authorization & Safety Gate (`Guardian`)
- **Pre-execution Gate**: No worker or floor agent may invoke external capabilities (APIs, disk writes, cloud publishing) without a valid `AuthorizationGrant` issued by the Guardian.
- **Lease Monotonicity**: Worker leases possess monotonic fencing tokens managed by Slayer to prevent split-brain execution across distributed workers.

### 3.4 Verification & Evidence Engine (`Claim <= Evidence`)
- **Non-Negotiable Verification**: An operational outcome may not claim status `SUCCESS` unless backed by an explicit, verified `verificationEvidenceId`.
- **Contradiction Detection**: Trajectory validators reject any record claiming success with `verified: false`.

### 3.5 Trajectory Capture, Validation & Export Subsystem
- **AscalonTrajectoryValidator**: Scans for 9 classes of credentials and API keys, validates schema completeness, checks simulation labeling, and verifies authorization consistency.
- **AscalonReplayEngine**: Validates that deterministic operational trajectories reproduce identical decision-execution chains upon replay.
- **AscalonTrajectoryExporter**: Segregates trajectories by mission family into Train, Validation, and Test splits without cross-family data leakage.
