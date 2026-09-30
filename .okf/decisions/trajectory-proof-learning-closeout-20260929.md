# Production Trajectory Proof & Ascalon Learning Closeout — 2026-09-29

## Decision

ShortForge treats a production trajectory as a first-class evidence object built from floor-local closure receipts and independent verification facts. The trajectory evaluator does not mint execution authority and never stores model chain-of-thought.

## Architecture

TASK/LOOP evidence → trajectory evaluation → independent verification status → Ascalon learning eligibility

The learning boundary is intentionally strict:

1. Every canonical floor must have observed closure evidence.
2. Evidence must identify the floor, loop type, termination and evidence references.
3. No authority violation may exist.
4. A handoff contract alone is insufficient for training promotion.
5. Only a fully verified trajectory may become an Ascalon learning signal.
6. The learning signal records outcome/process metrics, not private reasoning.

## Current proof boundary

The repository now emits live runtime-closure receipts from F00-F05 Overseer task execution and physical-verifier receipts from F06/F07. The evaluator can therefore observe a real eight-floor production trajectory. Missing evidence is represented as PARTIAL/UNVERIFIED rather than promoted to success.

## Observability

Existing TraceContext, Run/Mission identifiers and DurableEventBus task events are the intended event sources. Future durable exporters may persist trajectory records to an external trace/evaluation backend without changing the local authority model.

## Learning boundary

TrajectoryLearningBridge passes only verified trajectory outcome data into CognitiveOutcomeLearner. The resulting memory is explicitly marked as REAL_OPERATIONAL, VERIFIED and AUTHORITATIVE, making it eligible for controlled training promotion.

## Evaluation basis

Trajectory-level evaluation follows recent agent-evaluation practice that distinguishes end-state success from the process by which agents reached it and recommends combining outcome and trajectory signals. This complements ShortForge's physical F07 verification and bounded execution model.


## Proof taxonomy

- F00-F05: RUNTIME_CLOSURE derived from actual canonical task execution results.
- F06-F07: PHYSICAL_VERIFICATION when independent physical artifact evidence is available.
- HANDOFF_CONTRACT never satisfies training eligibility.
- Training eligibility requires all eight floors, no authority violations, no weak handoff-only proof, and independent F07 physical verification.
