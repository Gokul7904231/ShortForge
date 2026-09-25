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
| Central Overseer report persistence | F01 emits the canonical report through the existing Overseer lifecycle/event path; F01 does not own a second report database | INTENTIONAL SYSTEM BOUNDARY |
| Shared semantic strategy memory | Current file store is bounded, lock-protected, and explicitly single-instance; a shared backend is a separate deployment capability | INTENTIONAL FUTURE CAPABILITY |
| True semantic embedding novelty | Dependency-free hybrid scorer remains the safe baseline; an embedding provider can be added behind the scorer boundary | INTENTIONAL FUTURE CAPABILITY |
| DELIBERATE/DEEP bounded deliberation | Reserved modes remain bounded and deterministic; no unbounded reflection loop is enabled | INTENTIONAL FUTURE CAPABILITY |

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
- Production CORS has no implicit browser origin; explicit origins must be configured when browser access is required.
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

## Intentional future capabilities and deployment boundaries

1. Multi-node shared strategy memory requires a separately approved backend and migration/test plan.
2. Semantic embedding novelty can be added behind the scorer interface without changing authority semantics.
3. Downstream outcome ingestion can connect F01 decisions to verified F02-F07 results without granting F01 new authority.
4. DELIBERATE/DEEP strategies can be enabled only as bounded workflows with explicit caps, deterministic validators, and escalation rules.

These are not blockers for the current single-instance production-gate baseline; they are deliberate capability boundaries.

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

## Verification Follow-up — 2026-09-25

After initial v2 branch verification exposed integration mismatches, the following compatibility/runtime issues were corrected without changing the F01 architecture:

- EngineJobSnapshot.effectiveConfig now declares audience and thumbnailStyle, matching the immutable ProductionSpec snapshot emitted by the control plane.
- Overseer preserves the historical strategyPayload event/return shape while sourcing it exclusively from the canonical Python F01 handoff.
- Removed an unsupported style-jsx block embedded inside the SVG status-ring tree.
- Declared the existing @travisvn/edge-tts runtime dependency in apps/web/package.json to match the lockfile and the actual VoiceFabric import.
- CI runtime moved from Node 20 to Node 22 because the current AI SDK dependency set declares Node >=22 engines.
- F01 service authentication now reads the declared FLOOR01_SERVICE_API_KEY setting; a regression test verifies correct-key acceptance and wrong-key rejection.
- CI now includes an explicit Python Floor 01 v2 test job covering the service/test tree. This closes the previous gap where F01's Python suite existed but was not executed by branch CI.

These are compatibility and verification corrections only. They do not expand F01 authority or create a second strategy implementation.

## Production Hardening Follow-up — 2026-09-25

The final hardening pass also made the following production-safety corrections:

- execution audit reports now fail the request if canonical persistence fails instead of returning a non-durable success;
- report artifacts are stored beside the configured strategy-memory file, matching the container writable persistent boundary;
- model-generated strategy text is sanitized before it can cross into the typed downstream handoff;
- model execution flags are derived from successful `MODEL_INFERENCE` provenance, not adapter configuration alone;
- the single-instance rate limiter is thread-safe under FastAPI synchronous worker execution;
- corruption recovery clears stale request reservations;
- request IDs are bounded to 128 characters;
- production browser CORS has no implicit localhost allow-origin;
- malformed request-size headers fail safely;
- the F01 runtime adapter uses only the dedicated `FLOOR01_SERVICE_API_KEY` and does not fall back to the broad control-plane secret;
- F01 compatibility imports use the canonical package identity to avoid duplicate Pydantic/enum class identities;
- production container smoke verifies that a canonical execution-report artifact is durably written under the memory storage boundary.

These corrections preserve F01's bounded authority model while closing concrete reliability and security gaps discovered during executable verification.
## Verification Follow-up — Namespace and Contract Corrections

- EngineJobSnapshot now declares audience, thumbnailStyle, retentionHours, and platforms fields emitted by the immutable production snapshot.
- Python CI explicitly sets PYTHONPATH to services/pipeline.
- The historical floors.floor01_strategy import contract is restored through a compatibility namespace that points to the canonical services/pipeline/floor01_strategy implementation. This is an import-path bridge only; it is not a second F01 implementation.

Final executable verification on the hardened code head is recorded by CI run #427 (`36144286795`): the Python suite, TypeScript/adapter contract tests, security scan, production wheel verification, and production-container smoke all passed.
