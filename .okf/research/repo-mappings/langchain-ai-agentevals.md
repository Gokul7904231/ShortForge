# Repository Mapping: langchain-ai/agentevals

- **Repository**: `langchain-ai/agentevals`
- **URL**: `https://github.com/langchain-ai/agentevals`
- **Owner**: `langchain-ai`
- **Reviewed Version**: `main` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
Evaluating multi-step agent trajectories is notoriously fragile when tests expect a single rigid sequence of actions, failing to accommodate independent parallel operations, tool argument flexibility, and graph-based execution dependencies.

## 2. Important Mechanisms
- Multi-mode trajectory comparison: strict sequence, unordered set, subset match, superset match.
- Tool call argument matching with tolerance for optional parameters.
- Graph-aware trajectory evaluation: comparing planned graph vs executed trace.
- Trajectory LLM-as-judge pattern (used strictly as secondary evaluative evidence, not ground truth).

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Native Trajectory Oracle & Graph Trajectory Judge.
- **FactoryOS Destination**:
  - `testing/oracles/TrajectoryOracle.ts`
  - `testing/judges/trajectory/trajectoryMatch.ts`
  - `testing/judges/trajectory/graphTrajectory.ts`
- **Existing Agents/Capabilities Affected**:
  - `TaskDAGExecutor`: Trajectory validation verifies that DAG executions respected dependency constraints without assuming a single linear order.

## 4. What Was Adopted
- FactoryOS-native trajectory evaluator supporting exact sequence, order-insensitive independent operations, and DAG reachability.
- Explicit detection of bypassed stages, unexpected nodes, and missing dependencies.

## 5. What Was NOT Adopted
- Did NOT install python `agentevals` package or LangChain dependencies.
- Did NOT make LLM-as-judge mandatory for Phase 1; prioritized deterministic graph trajectory evaluation.

## 6. Security & Licensing Considerations
- MIT License. Reimplemented cleanly in native TypeScript.

## 7. Validation Performed
- Tested trajectory matching with unordered concurrent floors (e.g. F0 and independent research), order-dependent floors (F5 after F4), and invalid reverse orders.
