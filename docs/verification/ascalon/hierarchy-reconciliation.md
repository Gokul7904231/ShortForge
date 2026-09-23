# Project Ascalon: Factory Hierarchy & Topology Reconciliation

**Standard**: CLAIM <= EVIDENCE | Single Canonical Machine-Readable Authority  
**Ontology Authority**: `training/ascalon/ontology/hierarchy.json`  
**Date**: 2026-09-23  

---

## 1. Executive Summary

During the initial repository audit, multiple conflicting representations of the ShortForge / FactoryOS hierarchy and floor topology were identified across documentation, contracts, and services. This document provides the authoritative reconciliation, establishing a single ground-truth hierarchy for runtime services and Project Ascalon training trajectories.

---

## 2. Floor Identity Reconciliation Table

| Floor Number | Historical Inconsistency / Collision | Canonical ID | Canonical Name | Source Authority |
| :--- | :--- | :--- | :--- | :--- |
| **Floor 00** | Omitted in some 6-floor DAG docs | `floor00_analyst` | Analyst & Research Ingestion | `testing/contracts/floor.contract.ts`, `WorldStateEngine.ts` |
| **Floor 01** | None | `floor01_strategy` | Strategic Direction & Research | `services/pipeline/floor01_strategy/` |
| **Floor 02** | None | `floor02_scripting` | Cognitive Scripting & Structure | `services/pipeline/floor02_scripting/`, `script-agent.ts` |
| **Floor 03** | Collided with Audio in some README sections | `floor03_asset_realization` | Visual Asset Realization & Blueprints | `services/pipeline/floor03_asset_realization/`, `scene-agent.ts` |
| **Floor 04** | Collided with Visuals in some README sections | `floor04_media_synthesis` | Voice & Audio Synthesis | `services/pipeline/floor04_media_synthesis/`, `voice/` |
| **Floor 05** | None | `floor05_timeline_composition` | Timeline Composition & Motion | `services/pipeline/floor05_timeline_composition/` |
| **Floor 06** | None | `floor06_rendering` | GPU Video Rendering Engine | `services/rendering-engine/`, `TaskDAGPlanner.ts` |
| **Floor 07** | Conflated with Guardian in some architecture diagrams | `floor07_compliance` | QA Gate & Social Compliance | `apps/web/factoryos/core/verification/youtube/` |

---

## 3. Resolving Crucial Architectural Ambiguities

### 3.1 Guardian vs Floor 07
- **The Ambiguity**: Historical documentation frequently wrote `Guardian == F07`.
- **The Ground Truth**: Guardian is an authoritative governance, safety, and policy body operating at Level 2 of the control hierarchy. It governs cross-floor capability execution, revokes invalid leases, and enforces the final release boundary. Floor 07 is the pipeline execution floor where compliance evaluations and 15 verification gates (G00–G14) occur.
- **Canonical Decision**: **Guardian GOVERNS Floor 07**. They are separate entities.

### 3.2 Overseer / Slayer / Healer vs Floors
- **The Ambiguity**: Some diagrams placed Overseer or Slayers as pipeline floors.
- **The Ground Truth**: Floors are domain execution stages. Overseer is the strategic planner; Slayer is the anomaly terminator; Healer is the repair coordinator.
- **Canonical Decision**: Separate the **Control Hierarchy** (Human -> Overseer -> Guardian -> Slayer/Healer -> Workers) from the **Production Pipeline** (F00 -> F01 -> F02 -> F03/F04 -> F05 -> F06 -> F07).

---

## 4. Migration & Training Impact

1. **Training Trajectories**: Every Ascalon trajectory must reference canonical IDs (`floor03_asset_realization`, `floor04_media_synthesis`). Trajectories containing ambiguous shorthand ("floor 3 = voice") are marked `LEGACY_AMBIGUOUS` and quarantined from training sets.
2. **Runtime Consistency**: `HierarchyConsistencyValidator.ts` will validate runtime compliance against `training/ascalon/ontology/hierarchy.json` at build and test time.
