# Closed-Loop Milestone Wave — 2026-09-29

**Status:** Implementation wave on feat/closed-loop-milestone-wave-20260929.

## Decision

ShortForge uses one global closed-loop production architecture, but the loop semantics are floor-specific:

| Floor | Loop type | Closure signal |
|---|---|---|
| F00 | Bounded evidence feedback | verified claims + passport confidence |
| F01 | Cognitive + execution | worker result + domain verification |
| F02 | Cognitive + execution | worker result + domain verification |
| F03 | Cognitive + execution | worker result + domain verification |
| F04 | Cognitive + bounded recovery | physical media validation + worker result |
| F05 | Cognitive + execution | TimelineIR / render evidence + worker result |
| F06 | Deterministic operational | physical artifact verification + execution receipt |
| F07 | Verification/remediation | independent verification + policy gates |

The architecture intentionally does not create identical always-on cognitive loops for every floor.

## Implemented wave

### Common closure substrate

apps/web/factoryos/core/governance/FloorClosedLoop.ts provides:
- bounded iterations;
- explicit satisfaction predicates;
- output fingerprints;
- no-progress detection;
- terminal states: COMPLETED, EXHAUSTED, ESCALATED, NO_PROGRESS;
- per-iteration output/feedback history.

This is orchestration infrastructure only. It does not mint authority.

### F00

ResearchRuntime.executeResearchLoop() now performs:

research → evaluate evidence quality → expand/strengthen research → re-evaluate

The loop is capped at three iterations by default, increases the source target only up to the existing F00 source cap, upgrades refinement passes to FULL, and stops on no progress.

Closure requires at least one verified claim and passport confidence >= 0.70 in the production mission path. The loop returns a FloorClosedLoopReceipt and exposes feedback to the mission event stream.

### F01–F05

The existing Python Guardian architecture remains the domain cognitive/execution mechanism:

observe/propose → policy → authorize → execute → observe → verify → recover/replan

F04 and F05 Guardian adapters are now exported through factoryos.guardian.floors and the package root so their already-implemented loops are first-class imports rather than orphaned modules.

### F06

RenderFabric.executeRender() now returns an explicit DETERMINISTIC_OPERATIONAL loop receipt.

Closure is only emitted after the existing F06 chain has completed:

RenderIntent → ComputeGateway → ComputeRouter → provider → physical artifact verification → receipt

Provider failover count is captured as loop iterations. Evidence references include artifact SHA-256, execution receipt and provider admission when available.

No provider or Ascalon model can self-certify final release.

### F07

F07ReleaseGuardian.verifyReleaseLoop() now owns the bounded verification/remediation cycle:

verify → remediation case → authorized upstream remediation/rerun → verify again

F07 remains an independent verifier. Repair execution is deliberately injected through a typed callback so F07 cannot author or self-authorize its own repairs.

The loop terminates on verified publishability, exhaustion, explicit escalation, or no progress.

## Performance policy

Closed loops are bounded by design.
1. Prefer deterministic fast paths when the failure class is known.
2. Use cognitive reasoning only where it can change the chosen action.
3. Use physical verification as the final feedback signal for physical execution.
4. Reuse unchanged artifacts and invalidate only affected downstream evidence.
5. Stop when fingerprints show no progress.
6. Escalate rather than loop indefinitely.

## Authority invariants

- Overseer remains global authority.
- Floor Guardian remains local authority.
- Ascalon remains proposal/cognition only.
- Workers/providers remain capability-scoped executors.
- F07 remains the final independent release verifier.
- FloorClosedLoop is orchestration and evidence infrastructure, not an authority layer.

## Research basis

The wave follows current agent-engineering guidance that favors simple composable workflows where the path is predictable, and bounded evaluator/optimizer patterns where iterative refinement has a clear success criterion. Agent evaluations should use task-specific success criteria and be maintained as executable tests. Recent self-verification work also supports iterative verification/correction when the loop is bounded by explicit outcomes.

Primary references considered:
- Anthropic, Building effective agents (2024)
- Anthropic, Writing effective tools for agents (2025)
- Anthropic, Demystifying evals for AI agents (2026)
- S²R, Teaching LLMs to Self-verify and Self-correct via Reinforcement Learning (2025)
- Reflexion (2023)

No external runtime framework replaces the ShortForge authority model.