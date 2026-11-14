# Reverse Features — Domain Registry

> Status: PROPOSED BASELINE  
> Rule: These are investigation boundaries, not new runtime authorities. Revalidate the source paths and ownership against current code before each workstream.

| ID | Layer | Domain | Starting source paths | Dependencies / boundaries |
|---|---|---|---|---|
| RF-00 | A — Truth baseline | Repository reality, source-of-truth map, existing status and conflicts | `.okf/`, `AGENTS.md`, `CLAUDE.md`, `.agents/`, `docs/`, root package/workflows, active PRs | Must precede all non-trivial work; distinguish documented target from verified implementation |
| RF-01 | B — Product | User experience and UI | `apps/web/app/`, `apps/web/components/` | Keep presentation separate from domain contracts and editing semantics |
| RF-02 | B — Boundary | API, identity, authentication, authorization, quotas | `apps/web/app/api/`, `apps/web/middleware.ts`, `apps/web/lib/auth/`, quota services | Preserve least privilege, tenant isolation and existing security authorities |
| RF-03 | B — Governance | Policies, Guardian, permissions and safety | `apps/web/factoryos/core/guardian/`, `core/governance/`, `core/agent/execution/`, `.okf/security/`, `.okf/rules/` | Do not create a parallel policy/approval authority |
| RF-04 | B — Runtime | Missions, Overseer, orchestration, leases, checkpointing, event/work fabric | `apps/web/factoryos/core/overseer/`, `missions/`, `runtime/`, `leases/`, `events/`, `work/`, `orchestration/` | Human/Overseer authority; durable lifecycle, idempotency, fencing and bounded recovery |
| RF-05 | B — Intelligence | Agent cognition, ContextFabric, RAG, memory, Ascalon, AER and decision intelligence | `apps/web/factoryos/core/intelligence/`, `cognitive/`, `context/`, `memory/`, `rag/`, `training/`, `knowledge/` | Reasoning is not authority; preserve provenance, uncertainty and approval boundaries |
| RF-06 | C — Production | F00 research and information acquisition | `apps/web/factoryos/core/research/`, `integrations/AgentReachAdapter.ts`, research contracts/passports | Acquisition providers do not certify truth; honor query contracts and budget boundaries |
| RF-07 | C — Production | F01 strategy, trend and production planning | `services/pipeline/floor01_strategy/`, strategy agents and canonical floor contracts | Evaluate against the same objectives, input evidence and constraints |
| RF-08 | C — Production | F02 scripting, narrative, hooks and content engines | `services/pipeline/floor02_scripting/`, `apps/web/content-engines/`, `apps/web/agents/` | Compare factuality, originality, pacing, audience fit and downstream compatibility |
| RF-09 | C — Production | F03 visual assets, acquisition, conditioning and scene blueprints | `services/pipeline/floor03_asset_realization/`, visual assets, scene planning, visual providers | Preserve asset identity, licensing/rights evidence and scene/source lineage |
| RF-10 | C — Production | F04 audio, voice, TTS and media synthesis | `services/pipeline/floor04_media_synthesis/`, `apps/web/factoryos/core/voice/`, audio providers | Compare measured audio quality, duration, timing, availability, cost and license |
| RF-11 | C — Production | F05 TimelineIR, CompositionIR, editor and composition compiler | `services/pipeline/floor05_timeline_composition/`, `apps/web/factoryos/core/timeline/`, `core/editor/`, `core/render/`, Editor UI | Keep engine-neutral timeline semantics distinct from renderer/editor adapters |
| RF-12 | C — Production | F06 render compilation, rendering and artifact admission handoff | `services/pipeline/floor06_rendering/`, `apps/web/factoryos/core/fabric/`, `core/rendering/`, render workers | Physical output, digest and media probing required; provider assertions are insufficient |
| RF-13 | D — Infrastructure | Distributed compute, provider routing, notebooks, sandboxes and worker pool | `apps/web/factoryos/core/compute/`, compute router/pool, provider adapters and connection catalog | Hard eligibility before soft ranking; leases/fencing and real-provider qualification |
| RF-14 | D — Infrastructure | Storage, CAS, artifact identity, lineage, persistence and reconciliation | `apps/web/factoryos/core/compute/cas/`, `core/artifacts/`, database contracts, artifact lineage | Verify physical bytes; avoid competing stores/identities and false durability claims |
| RF-15 | E — Outcomes | F07 content quality, policy, physical verification and release authorization | `apps/web/factoryos/core/verification/`, YouTube gates and release contracts | Independent verification and current policy evidence; no bypass to publication |
| RF-16 | E — Outcomes | Publishing, outbox, queues and delivery confirmation | `apps/web/publishing/`, delivery/queue/outbox modules, relevant API routes | Authorization, idempotency, truthful external result and retry semantics |
| RF-17 | E — Economics | Treasurer, quotas, pricing, model/API costs, reservations and settlement | `apps/web/factoryos/core/treasury/`, `.okf/economics/`, treasury decisions | Treasurer remains the sole economic admission/settlement authority |
| RF-18 | E — Improvement | Skill contracts/evaluation/promotion, outcome learning, Ascalon training and Devourer | `apps/web/factoryos/core/evaluation/`, `core/evolution/`, `training/`, `.okf/devourer.md`, skills | Keep learning/promotion bounded, evaluated, authorized, reversible and non-sovereign |
| RF-19 | F — Operations | Observability, telemetry, watchdog, failure analysis, Slayer and Healer recovery | `apps/web/factoryos/core/observability/`, `telemetry/`, `watchdog/`, `recovery/`, `slayers/`, `healers/` | Failure classification, diagnosis, bounded retries, cleanup and safe remediation |
| RF-20 | F — Verification | Testing, benchmarks, browser/system/replay tests, CI, build and deployment | `testing/`, `tests/`, `apps/web/factoryos/tests/`, `.github/workflows/`, `production-helper/`, `tools/okf/` | Same candidate conditions, reproducible measurements, truthful gate status and Team Change Gate |

## How to use this registry

1. Choose one domain and bounded objective; identify adjacent dependencies rather than expanding scope to the whole repository.
2. Recheck exact paths against the current Git tree. The starting paths are navigation aids, not a claim of exhaustive ownership.
3. Map incoming/outgoing contracts and cross-cutting authority requirements. Shared contracts require coordinated changes across all affected RF domains.
4. A candidate may touch several domains; designate one primary owner and list all impacted domains in its decision record.
5. Investigations may run in parallel when evidence and code scopes are independent. Integration/promotion follows dependency order and repository governance.
