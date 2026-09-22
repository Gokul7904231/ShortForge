# Repository Mapping: OpenHands/benchmarks

- **Repository**: `OpenHands/benchmarks` (formerly OpenDevin benchmarks)
- **URL**: `https://github.com/OpenHands/benchmarks`
- **Owner**: `OpenHands`
- **Reviewed Version**: `main` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `BENCHMARK_SOURCE + PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
Evaluating software engineering agents requires evaluating complete real-world tasks (multi-file edits, compiler errors, test executions) across realistic long horizons rather than evaluating single isolated function completions.

## 2. Important Mechanisms
- End-to-end task benchmarking against real repository states.
- Multi-dimensional scoring: task completion, action efficiency, token cost, duration, and regression prevention.
- Containerized/sandboxed task execution environments.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Long-Horizon Mission Benchmarking & Multi-Dimensional Evaluation.
- **FactoryOS Destination**:
  - `testing/contracts/mission.contract.ts` (Full-lifecycle mission definitions)
  - `testing/oracles/EfficiencyOracle.ts` (Measures duration, attempts, cost, and efficiency)
  - `testing/oracles/GoalOracle.ts` (Measures real-world goal completion)
- **Existing Agents/Capabilities Affected**:
  - `StrategicMetaThinker` & `AutonomousFactoryController`: Measures holistic mission success across all floors.

## 4. What Was Adopted
- Methodological principle: evaluate realistic end-to-end missions rather than fragmented isolated units.
- Multi-dimensional reporting separating technical validity from user-facing goal achievement.

## 5. What Was NOT Adopted
- Did NOT install OpenHands docker benchmarking harness.
- Phase 1 focuses on native FactoryOS short-form video creation missions.

## 6. Security & Licensing Considerations
- MIT License. Clean-room conceptual adoption.

## 7. Validation Performed
- Validated multi-dimensional metric reporting across floor execution, artifact verification, and delivery.
