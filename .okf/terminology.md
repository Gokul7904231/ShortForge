# FactoryOS Lexicon & Canonical Terminology

> **Status**: AUTHORITATIVE SPECIFICATION  

---

## 1. Actor Roles & Authorities

- **Overseer**: The supreme cognitive authority and orchestrator. Dispatches runs, coordinates task DAGs across floors, and assesses operational decisions via the Decision Ledger.
- **Guardian**: The floor-level authority. Evaluates inputs and outputs for compliance, safety, and correctness before execution passes across floor boundaries.
- **Slayer**: The single factory-wide diagnostic investigator. Monitors anomalous events, inspects failed tasks, and opens forensic Cases.
- **Healer**: The single factory-wide recovery agent. Receives triage cases from the Slayer and applies corrective actions to workers and leases.
- **ReMaker**: The asset reconstruction agent. Repairs and rebuilds damaged or rejected media artifacts using preserved timeline blueprints.
- **Auditor**: A floor-level verification specialist (e.g. Floor 07) confirming container format, subtitle sync, audio fidelity, and policy compliance.
- **Worker**: A bounded executor executing a specific stage task (e.g. TTS generation, image synthesis, timeline assembly).

---

## 2. Core Primitives

- **Mission**: A top-level operational goal (e.g. "Generate Video: Top 5 Space Mysteries") tracked through a strict state machine (`CREATED` -> `PLANNING` -> `RUNNING` -> `COMPLETED` / `FAILED`).
- **Run**: A concrete execution lifecycle of an Overseer command or mission containing an active DAG.
- **Task DAG**: A Directed Acyclic Graph representing the dependency chain of stage nodes required to fulfill a mission.
- **Case**: A forensic incident record opened by a Slayer when an anomaly or degradation is detected.
- **Lease**: A time-bounded lock granting an agent or worker temporary execution rights over a task or resource.
- **World State**: The unified, real-time status representation of all floors, workers, missions, and factory metrics.
- **Render Fabric**: The decoupled rendering subsystem bridging local FFmpeg composition and cloud-based Azure VM GPU rendering.
