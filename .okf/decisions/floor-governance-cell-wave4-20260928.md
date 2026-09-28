# Floor Governance Cell Wave 4 — Cognitive Council Integration — 2026-09-28

**Classification:** extends existing rule + new governed-deliberation capability
**Status:** Wave 4 validated on executable head `7473c5c12e93bc365a2b487f6e5244a84358bc9c`.

## Decision

Introduce a typed Floor Council between Ascalon proposal generation and the Floor Governance Cell action boundary.

The Council is deliberately not a second authority. It is a structured counsel layer composed of:

- Instructor: deterministic contract/action-graph validation.
- Advisor: bounded cognitive assessment using the existing CognitiveRuntime.
- Auditor: deterministic evidence and trust-boundary verification.
- Synthesis: deterministic conflict resolution.

The decision remains with the existing Floor Guardian/action gate.

## OKF sweep

OKF_SWEEP = COMPLETE
ROOT_RULES = reviewed
HIERARCHY = reviewed
SECURITY = reviewed
COGNITION = reviewed
MEMORY = reviewed
RESEARCH_MAPPINGS = reviewed
RENDERING = reviewed
ARTIFACTS = reviewed
WORKFLOWS = reviewed
AUDITS = reviewed
PRODUCTION_HELPER = considered; no new production-side-effect surface added beyond governance telemetry
IMPLEMENTATION = reviewed
TESTS = reviewed
CONTRADICTIONS = none

## Existing rules preserved

- Overseer remains global authority.
- Floor Guardian remains floor authority.
- SCL/Ascalon remains cognition, not sovereignty.
- Intelligence may propose; authority authorizes; runtime executes; evidence proves.
- BDA remains a boundary/data-integrity mechanism, not authority.
- Auditor remains independent from mutation.
- ResolutionGate remains required for case closure.
- F07 remains final production verification/release authority.
- Low-risk legacy healer paths remain backward compatible.

## Research-derived rationale

A 2026 structured multi-agent debate study reports benefits from an explicit moderator plus specialized experts and describes a protocol-first deliberation state machine. ShortForge therefore uses a typed Instructor → Advisor → Auditor → Synthesis sequence instead of free-form agent chat.

The same study reports stronger strategic performance from heterogeneous agent configurations, supporting ShortForge's mixed deterministic/cognitive evidence model rather than duplicating one LLM role three times.

AgentDojo remains relevant as an adversarial reference for stateful tool-using agents and indirect prompt injection. Its benchmark structure reinforces the rule that untrusted operational text must not become executable authority.

LangGraph's standalone supervisor repository is archived as of September 20, 2026 and its README recommends a tool-based supervisor pattern for many cases. ShortForge therefore does not add a dependency on that archived package; the Council is implemented as native typed TypeScript.

OpenAI's current evaluation guidance emphasizes structured evaluations for nondeterministic AI systems. The OpenAI Evals platform is in a 2026 deprecation transition, reinforcing ShortForge's existing decision to keep deterministic evaluation infrastructure native and repository-owned.

## Wave 4 implementation boundary

### Implemented in code

- FloorCouncil typed deliberation runtime.
- Deterministic Instructor contract validation.
- Bounded Advisor hook using CognitiveRuntime.
- Deterministic Auditor evidence/trust validation.
- Explicit phase trace: Instructor → Advisor → Auditor → Synthesis → Closed.
- Fail-closed behavior on Advisor unavailability.
- Conflict escalation when Advisor challenges or lacks confidence.
- Council review telemetry event.
- Council recommendation/conflict entries persisted into the floor Blackboard.
- Production GuardianManager attachment path.
- AutonomousFactoryController wiring of the existing CognitiveRuntime as Advisor.
- Focused Wave-4 tests.

### Deliberate non-claims

Wave 4 does not claim:

- live fine-tuned Ascalon inference;
- multiple heavyweight LLM advisors;
- automatic authority transfer from Council consensus;
- Council ability to mint capabilities or execute actions;
- replacement of the existing CognitiveRuntime;
- adversarial robustness merely because the Council exists.

## Verification plan

1. Wave-4 dedicated typecheck.
2. Wave-4 council/fail-closed tests.
3. Existing cognitive simulation/contradiction/fallback suites.
4. Combined Wave 2–4 governance validation.
5. Team Change Gate.
6. Final .okf / Team synchronization to the verified executable SHA.