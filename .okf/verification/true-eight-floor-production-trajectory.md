# True Eight-Floor Production Trajectory

Status: PROOF IN PROGRESS — NOT VERIFIED
Date: 2026-09-29

## Objective

Execute one real ShortForge mission through the canonical production topology:

F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07

using one mission identity and one Overseer run identity.

The trajectory must be admitted to Ascalon learning only after independent evidence proves the complete path.

## Acceptance Contract

A trajectory is VERIFIED only when all of the following are simultaneously true:

1. One missionId is preserved from F00 through F07.
2. One runId is preserved from F00 through F07.
3. All eight canonical floors emit authoritative TASK_COMPLETED evidence.
4. Every floor has qualifying closure evidence and a successful verification predicate.
5. F03 consumes the canonical F02 handoff.
6. F04 produces a physical audio artifact with explicit quality classification.
7. F05 produces the canonical composition intent.
8. F06 executes through RenderFabric/ComputeGateway and produces a physically present MP4.
9. F06 physical evidence includes non-zero bytes, SHA-256, duration, width and height.
10. F07 independently probes the physical artifact and records PHYSICAL_VERIFIER evidence.
11. F07 verifies the F06 artifact fingerprint.
12. ProductionTrajectoryEvaluator reports VERIFIED, 8/8 floors and SUCCESS.
13. No authority violation or handoff-only proof is present.
14. AscalonLearningSignal is emitted exactly once for the verified trajectory.
15. Main remains unchanged until the proof branch is independently validated.

## Architecture Invariants

Intelligence may propose.
Authority may authorize.
Runtime may execute.
Evidence must prove.

The proof harness must use canonical runtime adapters and real renderer execution. Test fixtures may only replace external dependencies that are explicitly non-deterministic, such as WAN research retrieval. They must not replace floor execution, rendering, or verification with synthetic receipts.

## Implemented Proof Components

- Mission/run propagation through Overseer floor events.
- Canonical F01 handoff persistence into the F02 production input.
- ProductionTrajectory evaluator final F07 physical verification predicate.
- Eight-floor single-mission Vitest e2e test.
- Blocking GitHub Actions workflow that boots F01/F02/F03 and the real local Render Fabric.
- Deterministic local research HTTP fixture.
- Physical F06/F07 assertions.
- Ascalon learning signal eligibility assertions.
- Repository proof artifact: artifacts/eight-floor-production-trajectory-proof.json.

## Observed Proof Attempts

### Attempt 1 — Run #1

Result: FAILED before the production floors started.

Observed cause: AIRuntime attempted CLASSIFICATION under the Balanced profile while no model was configured.

Resolution: Autonomous mission dispatch now provides deterministic operational-intent ground truth to DecisionEngine, so an advisory LLM cannot block an already-authorized autonomous production dispatch.

### Attempt 2 — Run #2

Result: TIMED OUT after 180 seconds without floor evidence.

Infrastructure and service boot passed. The test did not expose enough phase-level evidence to distinguish controller initialization from DAG execution.

Resolution: The proof test now logs construct → boot → mission create → mission start → dispatch and captures terminal RUN_CHECKPOINTED / MISSION_FAILED events.

## Current Proof State

The latest proof workflow is queued/running on the PR branch. No successful eight-floor physical trajectory has been claimed yet.

## Completion Rule

Do not change this document to VERIFIED until a GitHub Actions run produces the proof artifact and the assertions above pass from the same mission/run identity.

## Next Evidence

Record:

- GitHub Actions run ID
- missionId
- runId
- trajectoryId
- all eight floor execution IDs
- F06 artifact SHA-256 and measured media facts
- F07 verification evidence
- trajectory evaluator result
- Ascalon learning signal ID
- proof artifact path