# Repository Mapping: temporalio/sdk-typescript

- **Repository**: `temporalio/sdk-typescript`
- **URL**: `https://github.com/temporalio/sdk-typescript`
- **Owner**: `temporalio`
- **Reviewed Version**: `v1.11.x` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
Distributed long-running workflows need resilient replayability from append-only event histories, enabling crash recovery, replay debugging, and detection of non-deterministic divergence across code versions.

## 2. Important Mechanisms
- Deterministic event replay from recorded workflow execution history.
- Divergence detection: replaying historical events through workflow logic to identify illegal branching or mutated state transitions.
- Separation of durable history events from side-effect-causing external activities.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Mission History Snapshotting & Replay Architecture.
- **FactoryOS Destination**:
  - `testing/replay/MissionHistory.ts`
  - `testing/replay/MissionSnapshot.ts`
  - `testing/runtime/ExecutionRecorder.ts`
- **Existing Agents/Capabilities Affected**:
  - `AutonomousFactoryController`: Boot recovery reclaims abandoned state from persisted worldstate and event records.
  - `HealerEngine` & `SlayerEngine`: Can inspect historic mission traces to analyze root causes without mutating production data.

## 4. What Was Adopted
- Clean event-driven history model: recorded events and state snapshots form the reproducible record of a mission.
- Replay interfaces (`MissionHistory`, `MissionSnapshot`) enabling future offline determinism verification.

## 5. What Was NOT Adopted
- Did NOT install the heavy Temporal server or Temporal TypeScript SDK daemon (which requires Go/Rust native binaries and external cluster orchestration).
- Reimplemented clean-room, native TypeScript history structures conforming directly to `DurableEventBus`.

## 6. Security & Licensing Considerations
- MIT License. Clean-room conceptual extraction.

## 7. Validation Performed
- Validated serialization and reloading of recorded `MissionEvent` histories and state snapshots.
