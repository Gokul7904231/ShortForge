# Floor 01 v2 Improvement Audit

Date: 2026-09-25
Branch: feat/floor01-strategy-v2
Canonical floor ID: floor01_strategy
Version: 2.0.0

## Purpose

This audit records the architecture and implementation changes made to Floor 01 after comparing the existing implementation with durable workflow, typed-agent, bounded planning, evidence-gating, parallel planning, and strategic-memory patterns.

## Source-of-truth constraints

F01 does not outrank .okf, Guardian, Overseer, F07, or executable floor contracts.

Authority remains:

Human -> Overseer -> Guardian/Slayer/Healer -> Worker runtime -> Floors.

F01 owns strategy-artifact construction, not factory-wide lifecycle authority.

## Implementation changes

| Finding | v2 response | Status |
|---|---|---|
| F01 lacked first-class F00 evidence | ResearchContext contract | IMPLEMENTED |
| Topic novelty used token/Jaccard only | Hybrid token + sequence + character-bigram scorer | IMPLEMENTED |
| Model adapter could claim inference without a real call | Real provider-neutral HTTP adapter; fallback provenance otherwise | IMPLEMENTED |
| Strategy was a single direct result | Bounded StrategyCandidate + deterministic evaluator | IMPLEMENTED |
| Quality score mixed provenance confidence with strategy quality | Independent QualityDimensions | IMPLEMENTED |
| Content planner ignored F00 hook evidence | Evidence-aware hook selection | IMPLEMENTED |
| Independent preparation was serial | Model preparation and curriculum mapping run concurrently | IMPLEMENTED |
| Overseer created a second F01 strategy implementation | Floor01RuntimeAdapter delegates to canonical Python F01 | IMPLEMENTED |
| F01 identity conflicted with factory canonical ID | floor01_strategy is canonical in v2 | IMPLEMENTED |
| Guardian input hash used process-dependent hash() | SHA-256 over normalized input JSON | IMPLEMENTED |
| API security used model credential field | Dedicated service_api_key | IMPLEMENTED |
| API CORS allowed every origin/method | Explicit origin/method/header allowlist | IMPLEMENTED |
| Central Overseer report persistence | Existing integration remains | PENDING |
| Shared semantic strategy memory | Current file store retained; backend boundary documented | PENDING |
| True semantic embedding novelty | Current scorer is dependency-free baseline | PENDING |
| DELIBERATE/DEEP bounded deliberation | Reserved but not enabled as an unbounded loop | PENDING |

## v2 workflow

F00 ResearchPassport
  -> ResearchContext
  -> Topic Intelligence + hybrid novelty
  -> F00 Evidence Gate
  -> parallel model/curriculum preparation
  -> Strategy Candidate Engine
  -> deterministic Candidate Evaluator
  -> selected candidate
  -> Content Planner
  -> typed Floor01HandoffPayload
  -> F02

Only the compiled handoff is authoritative.

## Evidence boundary

F00 remains responsible for retrieval, claim extraction, claim verification, ResearchPassport signing, and source provenance.

F01 consumes only a compact ResearchContext projection.

integrity_verified is an upstream assertion populated only after F00/bridge verification. F01 does not re-sign the passport.

Strict execution rejects missing or insufficient research evidence. Compatibility execution can return DEGRADED instead of pretending evidence existed.

## Candidate architecture

A model output is a candidate, never an authoritative handoff.

Candidate generation sources:

- deterministic platform/category policy
- F00 recommended-hook evidence
- real provider model inference when configured

Candidate evaluation dimensions:

- evidence adequacy
- novelty
- audience fit
- platform fit
- curriculum coherence
- downstream feasibility
- constraint compliance

The resulting score is a heuristic quality signal, not a probability.

## Complexity model

Settings reserve FAST, DELIBERATE, and DEEP modes.

The current v2 implementation stays bounded and deterministic. It does not implement an unbounded reflection loop.

Future deliberation must keep maximum candidates, maximum refinement cycles, deterministic validators, explicit escalation, and no capability/authority expansion.

## Performance design

F01 overlaps independent preparation stages:

- model preparation, when enabled
- curriculum mapping

This follows the general pattern described by LLMCompiler: identify independent work and execute it in parallel.

No external benchmark number is claimed as a ShortForge measurement.

## Reliability design

v2 adds:

- explicit evidence gate
- typed candidate contract
- deterministic candidate evaluator
- strict-mode rejection
- canonical floor identity
- stable SHA-256 input contract hashing
- idempotent payload reuse through the existing memory store
- truthful model provenance
- fail-closed Overseer adapter when the canonical Python F01 service is not configured

## Overseer boundary

The TypeScript Overseer now:

1. receives the F00 AnalystReport
2. verifies the ResearchPassport through ResearchRuntime
3. converts it to a Floor01RuntimeRequest
4. calls the canonical Python F01 /v1/plan endpoint
5. uses the returned Floor01HandoffPayload as the F01 strategy artifact

If FLOOR01_SERVICE_URL is missing, the adapter fails with an explicit configuration error rather than generating a parallel synthetic strategy.

## Security changes

F01 service authentication is separate from model credentials.

- FLOOR01_SERVICE_API_KEY controls service authentication.
- FLOOR01_LLM_API_KEY and FLOOR01_LLM_BASE_URL control optional model execution.
- CORS defaults to localhost:3000 and can be configured explicitly.
- Supported API methods and headers are explicit.

This does not replace Guardian authorization or the existing worker capability model.

## Ascalon readiness

v2 produces training-friendly signals:

- candidate_id
- selected candidate
- candidate evaluation dimensions
- evidence provenance
- research passport reference
- blockers and warnings
- execution mode
- handoff status

Future training data should link these records to downstream F02-F07 outcomes and follow .okf/intelligence/training.md.

Ascalon must not learn or receive authority to mint capabilities, bypass Guardian, alter leases/fencing, certify F07, publish, or rewrite .okf law.

## Remaining gaps before autonomous production use

1. Configure and runtime-verify the F01 Python service endpoint used by Overseer.
2. Run the complete F01 Python suite and full TypeScript CI on the v2 branch.
3. Reconcile older tests/fixtures that still use floor01 instead of floor01_strategy.
4. Replace file-based strategy memory with a shared backend for multi-node execution.
5. Add a real semantic/embedding novelty provider behind the scorer boundary.
6. Add downstream outcome ingestion so strategic memory can learn from verified production results.
7. Implement bounded DELIBERATE/DEEP strategies only after deterministic gates are proven.

## External design sources

- Temporal: https://docs.temporal.io/
- LLMCompiler: https://arxiv.org/abs/2312.04511
- CRAG: https://arxiv.org/abs/2401.15884
- STORM: https://arxiv.org/abs/2402.14207
- GraphRAG: https://arxiv.org/abs/2404.16130
- DSPy: https://github.com/stanfordnlp/dspy
- GEPA: https://arxiv.org/abs/2507.19457

External sources are architecture references only. They do not outrank .okf, executable contracts, tests, or production-helper evidence.


## Compatibility note

The canonical production floor identity is `floor01_strategy`, matching the FactoryOS floor registry and F01 service contract.

The Guardian execution kernel retains the historical `floor01` namespace because its domain-verification and existing safety tests are still keyed to that execution alias. This is intentional compatibility behavior, not a second F01 implementation.

A future cross-system ID reconciliation can replace the alias only after a dedicated Guardian/Overseer migration and regression sweep.

## Autonomous F00 prerequisite

The existing Overseer DAG planner still conditionally inserts F00 for certain command classes. This v2 change makes the F01 service itself evidence-aware and strict-capable, but it does not silently rewrite the global DAG policy.

Before autonomous production training, reconcile the repository's existing `.okf` rule that autonomous F01 execution requires F00 evidence with the current TaskDAG planning behavior.
