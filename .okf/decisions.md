# ShortForge / FactoryOS — Locked Architectural Decisions

> **Document Class:** Canonical Decision Record  
> **Location:** .okf root  
> **Status:** LOCKED DIRECTION  
> **Scope:** Overseer, ShortForge Cognitive Layer, worker cognition, performance architecture, and Devourer.

## 1. Purpose

This file is the root-level decision ledger for the current locked direction of ShortForge cognition and performance.

These are architecture decisions and target states. They are not implementation claims. The repository source-of-truth hierarchy remains authoritative: executable implementation and tests outrank this document.

## 2. Authority hierarchy

Human Authority
↓
OVERSEER — sovereign authority
↓
SHORTFORGE COGNITIVE LAYER (SCL) — factory cognitive substrate
↓
Worker cognition / bounded decisions / context / templates
↓
Guardian / Slayer / Healer
↓
F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07
↓
Artifacts + verification + telemetry

Locked interpretation:

- Overseer decides what the factory should do.
- SCL decides how specialized workers should think and operate within delegated boundaries.
- Workers execute.
- Guardian, Slayer, Healer, and F07 enforce and verify.
- SCL is not a replacement for the Overseer and has no sovereign authority.
- Control entities remain separate from production floors.

## 3. ShortForge Cognitive Model

The project-owned fine-tuned LLM is the ShortForge Cognitive Model and is the primary deep-cognition substrate of SCL.

Responsibilities:

- state reconstruction and record interpretation
- worker instruction and replanning
- deep decisions and diagnosis
- template design
- research interpretation
- failure analysis
- process improvement proposals
- cross-layer cognitive synthesis

It must not become a monolithic agent for every deterministic or narrow decision.

## 4. Two-speed cognition

SCL has two complementary model tiers:

- Fast Decision Core — narrow, high-frequency, typed decisions.
- ShortForge Cognitive Model — deeper reasoning, diagnosis, planning, synthesis, and novel work.

The Fast Decision Core should pursue JEV/Laya-like useful properties:

- typed choice / score / yes-no decisions
- highly efficient narrow inference
- multiple decisions from one compact state representation
- calibrated uncertainty
- local deployment
- warm inference
- batching

This is a design direction, not a claim that ShortForge currently implements Jev or Laya.

## 5. Decision cascade

Every cognitive request should take the cheapest safe path:

Tier 0 — deterministic rules, cache, exact lookup
↓
Tier 1 — Fast Decision Core
↓
Tier 2 — ShortForge Cognitive Model
↓
Tier 3 — Overseer and/or approved heavyweight model for exceptional or high-authority cases

Examples:

- capability authorization → deterministic lookup
- choose among eligible workers → Fast Decision Core
- unfamiliar rendering failure → ShortForge Cognitive Model
- architecture change → deep cognition + Overseer review

## 6. Decision packs

The Fast Decision Core should support a decision pack: one compact state representation, one inference, multiple typed decisions.

Typical outputs:

- worker_choice
- engine_choice
- template_choice
- provider_choice
- priority_score
- risk_score
- quality_score
- needs_research
- needs_escalation
- retry / repair family

The objective is to replace many sequential narrow model calls with one shared decision pass where the questions are compatible.

## 7. CognitiveContext compiler

SCL must not send the entire FactoryState into every model call.

Introduce a Context Compiler that produces the smallest sufficient state:

- objective
- relevant state slice
- evidence references
- candidate actions
- constraints
- expected output schema
- verification contract

The compiler should be deterministic where practical, versioned, traceable, and testable.

## 8. Worker cognition contract

Workers operate through a typed cognitive contract rather than vague instructions.

Minimum conceptual fields:

- workerId
- floorId
- specialization
- objective
- inputs
- constraints
- allowedCapabilities
- toolBudget
- successCriteria
- verificationCriteria
- escalationPolicy
- memoryRefs

Worker execution remains capability-fenced, observable, checkpointable, replaceable, and subordinate to system authority.

## 9. Fast Decision Core runtime

The Fast Decision Core should run as a persistent warm service:

- tokenizer resident
- model weights resident
- CUDA / ONNX / TensorRT runtime initialized where used
- memory pools initialized
- compiled graphs ready
- decision queues ready

Cold-start model loading must not be part of the normal hot path.

## 10. Caching

Cache cognition when a result is reusable and still valid.

Conceptual cache key:

DecisionCacheKey =
SHA256(
  relevant_state
  + decision_schema
  + model_version
  + policy_version
)

Invalidation must be explicit.

No cached decision may cross a safety, policy, lease, or fencing boundary incorrectly.

## 11. Dynamic batching

Fast decision requests should enter a short-lived cognitive queue and be dynamically batched when compatible.

Compatibility should consider:

- model version
- decision schema
- input shape / length bucket
- priority
- capability family

Interactive requests should use a very small batch delay or bypass batching when required. Background work may use larger batch windows.

## 12. Runtime acceleration

Benchmark the Fast Decision Core across:

PyTorch eager
→ torch.compile
→ ONNX Runtime
→ TensorRT

Precision candidates:

- FP16
- BF16
- INT8
- other lower-precision paths only after validation

Every candidate must be evaluated for accuracy, calibration, latency, throughput, and memory.

## 13. Performance philosophy

The central question is:

> What is the smallest amount of cognition required to safely advance the state machine?

ShortForge should become faster by reducing the frequency and scope of expensive reasoning, not merely by making one large model faster.

Devourer should actively search for:

- model decisions that can become deterministic rules
- repeated reasoning that can be distilled into the Fast Decision Core
- sequential independent decisions that can become one decision pack
- recurring expensive failures that can become cheap preflight validators

## 14. Pipeline concurrency

The existing F03 || F04 topology remains locked.

Additional concurrency should be introduced where dependencies allow:

- F00: parallel source discovery, extraction, deduplication, provenance, scoring
- F01: parallel audience, strategy, engine capability, and template analysis
- F05: incremental compilation of verified assets
- F06: predictive compute prewarming / reservation
- F07: early static checks, incremental media checks, final verification

Parallelism must never bypass verification, capability boundaries, or deterministic dependency constraints.

## 15. Early verification

QA is also a performance mechanism.

Preferred sequence:

cheap preflight
↓
generation
↓
cheap media checks
↓
timeline
↓
render
↓
final F07 verification

Spend small amounts of compute early to avoid expensive downstream rework.

## 16. Predictive prewarming

When schedule and workload forecasts make requirements predictable, prewarm:

- cognition workers
- render workers
- models
- tokenizers
- containers
- common assets
- fonts and effects
- content engines
- provider connections

Preferred hot path:

job arrives
↓
claim warm capacity
↓
execute

## 17. Incremental artifacts and rendering

TimelineIR and CAS should support incremental compilation and smallest-change regeneration.

Rules:

- verified scenes may be prepared early
- unchanged artifacts remain reusable
- changed scenes invalidate only their dependency subtree
- ReMaker repairs the smallest valid artifact set
- unchanged content should not be rebuilt unnecessarily

## 18. Delivery parallelism

After final verification, independent delivery operations should run concurrently where safe.

Verified artifact
├──→ Cloudinary
└──→ Google Drive

Neither secondary delivery should unnecessarily serialize the core production path.

## 19. Target performance envelope

These are engineering targets, not implementation claims:

- deterministic path: target sub-millisecond where practical
- Fast Decision Core: target roughly 5–30 ms warm, hardware-dependent
- common deep cognition: sub-second to low-seconds depending on task depth
- asynchronous worker dispatch
- F03/F04 parallel
- warm render workers where practical
- F07 preflight before expensive rendering
- delivery asynchronous after verified artifact

Targets must be benchmarked on actual deployment hardware before becoming SLOs.

## 20. Research and external intelligence

External systems such as AgentReach are sensor and research inputs, not automatic truth.

Flow:

AgentReach / external research
↓
Evidence
↓
Research IR
↓
SCL interpretation
↓
Decision / knowledge / proposal
↓
Validation
↓
Architecture promotion

External findings must not silently override executable implementation, tests, canonical contracts, or authoritative OKF rules.

## 21. Devourer

Devourer is the controlled ShortForge self-improvement program.

Lifecycle:

Discover
↓
Understand
↓
Compare with current architecture
↓
Find useful pattern
↓
Prototype
↓
Benchmark
↓
Train candidate
↓
Evaluate
↓
Canary
↓
Promote / Reject

Devourer may discover, experiment, train, test, compare, and recommend.

Devourer must not silently rewrite production weights, contracts, safety policies, authority, or architecture.

Promotion requires explicit gates as applicable:

- schema / contract validation
- provenance and factuality checks
- regression evaluation
- decision-quality evaluation
- latency / resource evaluation
- security evaluation
- held-out testing
- canary validation
- rollback readiness

The Ascalon real-WorldState and verified-trajectory rule remains in force.

## 22. Cross-layer operating loop

All factory layers converge on:

Observe
↓
Decide
↓
Execute
↓
Verify
↓
Record
↓
Learn

Learning must be evidence-backed and must not weaken the authority hierarchy.

## 23. Decision status taxonomy

Future architecture ideas must be classified as exactly one:

1. already exists
2. extends existing rule
3. contradicts existing rule
4. new capability
5. experiment only

A contradiction must not be silently reclassified as an extension.

## 24. Filing and implementation discipline

Before changing this record or adding related architecture documents, inspect:

- .okf/index.md
- .okf/architecture.md
- .okf/principles.md
- .okf/terminology.md
- .okf/hierarchy/
- .okf/intelligence/
- .okf/memory/
- .okf/research/
- .okf/cognitive/

Then inspect the relevant executable implementation and tests.

Source-of-truth precedence remains:

1. executable implementation
2. canonical ontologies / contracts
3. automated tests
4. provider registries / runtime configuration
5. inline architecture comments
6. authoritative .okf documentation
7. historical audits
8. external reference patterns
9. architectural inference

A locked decision is a design commitment, not proof of implementation.

## 25. Reusable decision-filing prompt

Use this prompt whenever a new architecture decision needs to be evaluated and filed:

> **ShortForge OKF Decision Filing Prompt**
>
> Inspect the current .okf index, architecture, principles, terminology, hierarchy, intelligence, memory, research, and cognitive sections before proposing anything. Then inspect the relevant executable implementation, contracts, and tests.
>
> Classify the proposal as exactly one of: already exists, extends existing rule, contradicts existing rule, new capability, or experiment only.
>
> Compare it against the canonical authority hierarchy. Preserve Overseer sovereignty, Guardian safety authority, monotonic fencing, evidence-grounded verification, bounded repair, least-privilege capabilities, provider neutrality, and deterministic replayability.
>
> If the idea is useful, record the smallest precise decision in .okf/decisions.md. Do not convert hypotheses, benchmarks, targets, external-reference patterns, or unimplemented designs into implementation facts.
>
> For implementation-affecting decisions, record:
> 1. decision
> 2. rationale
> 3. affected components
> 4. contract / schema impact
> 5. implementation status
> 6. validation required
> 7. rollback / rejection condition
>
> If the proposal contradicts a locked decision, do not silently overwrite it. Record the contradiction and require explicit architecture review before promotion.


## 26. Mandatory full-.okf decision gate

All future non-trivial architecture decisions must begin with a complete end-to-end review of the current .okf tree.

The decision protocol is canonical in .okf/decision-protocol.md.

The review must extract existing canonical rules, current implementation vs target design, known contradictions, security and authority boundaries, relevant memory and research constraints, applicable repo mappings, production-helper evidence, and current tests / executable implementation.

No new idea may be filed as an architectural decision without this review.

## 27. Engineering stack decision

ShortForge media-engineering decisions must first compare against TimelineIR, Remotion, AgentTube-derived scene lifecycle mechanisms, RenderFabric, and FFmpeg.

Remotion is the selected primary programmatic composition foundation, subject to license verification.

AgentTube is the selected clean-room engineering pattern source for scene manifests, durable checkpoints, audio-first timing, local-first execution, and selective scene repair.

These decisions extend existing TimelineIR, CAS, bounded-repair, and RenderFabric architecture rather than replacing it.

## 28. Production-helper routine

production-helper is a routine engineering validation station. Security-sensitive, rendering-sensitive, distributed-worker, callback, quota, or production-authority changes must consult its evidence and run the relevant available checks.

Helper output is evidence, not architectural authority.


## 26. Mandatory .okf Decision Sweep

This is now a locked process rule for all future ShortForge decisions.

Before deciding, changing, or promoting architecture, workers, permissions, models, rendering, workflows, provider integrations, or Devourer behavior, analyse the entire current `.okf` tree end to end. Extract existing rules, current implementation facts, target states, contradictions, relevant repository mappings, audit evidence, and production-helper evidence before proposing a new change.

The mandatory protocol is defined in `.okf/decision-protocol.md`.

## 27. Core Engineering Stack Locked

The current media engineering direction is:

`.TimelineIR → Remotion → Render Compiler → RenderFabric → F06 Worker → F07` with FFmpeg retained as the deterministic physical renderer/fallback.

AgentTube is the selected scene-lifecycle pattern source for durable scene manifests, checkpoints, audio-first timing, content-addressed reuse, and selective scene repair.

## 28. Worker Permissions Locked

All workers operate under `.okf/security/worker-permissions.md`. No worker receives ambient authority. Capability, scope, policy, lease, fencing, and verification requirements remain explicit.

## 29. Production Helper Routine Locked

`production-helper/` is a routine validation station. Relevant evidence must be consulted and the applicable checks run for security, worker permission, rendering, callback, provider, quota, architecture, and release changes.

## 30. Devourer Governance Locked

The root Devourer charter is `.okf/devourer.md`. Devourer may research, prototype, train candidates, benchmark, evaluate, and canary; it may not silently promote production weights, permissions, contracts, security policy, or architecture.

## 31. MCP integration boundary

Classification: new capability, extending existing provider/adapter boundaries.

ShortForge may expose bounded external systems through Model Context Protocol (MCP), but MCP is an integration surface and must not become a second authority plane.

Locked rules:
- GitHub remains the engineering/development MCP integration already available.
- Google Drive MCP is a repository-owned bounded operator/developer integration.
- Production Drive delivery remains through the existing GoogleDriveStorageProvider and DriveDeliveryAdapter.
- MCP output is evidence/input, not architecture authority.
- MCP tools do not mint capabilities, extend leases, revoke fencing, certify F07, or mint ReleaseAuthorization.
- Generic MCP access is not part of the default F00-F07 worker capability matrix.
- New MCP capabilities must be explicitly named, scoped, tested, and filed.

## 32. Google Drive MCP boundary

Classification: new capability.

Repository path: tools/mcp/google-drive/.

Initial tool surface:
- drive_health
- drive_list
- drive_search
- drive_get_metadata
- drive_create_folder
- drive_upload
- drive_download
- drive_export

Locked security posture:
- read-only Drive scope by default
- write operations require explicit readwrite scope
- local upload paths are allowlisted
- download paths are containment-checked
- configured Drive root is enforced for file/folder access
- no delete/trash operation
- no ACL/public-sharing mutation
- no release/publishing authority

Implementation status is SCAFFOLDED / NOT YET RUNTIME-VERIFIED until dependency installation, typecheck, MCP handshake, authenticated Drive health, and representative read/write tests pass.

## 33. MCP essential-set rule

The default ShortForge MCP set is intentionally small:

1. GitHub — engineering and repository operations.
2. Google Drive — bounded artifact/document storage and exchange.
3. Browser/DevTools — research/diagnostics when needed.

A database, object-storage, chat, social publishing, or generic filesystem MCP is not automatically required. Add one only when an actual workflow gap remains after checking existing provider adapters and internal subsystems.

## 34. MCP validation gate

Before promoting an MCP integration:
- complete the current .okf sweep
- inspect the relevant implementation and tests
- define the capability boundary
- run production-helper checks where applicable
- verify authentication and least privilege
- verify failure/timeout behavior
- verify filesystem/network containment
- verify idempotency for side effects
- verify that production authority remains in canonical internal components
## 31. Forger engineering workforce

**Classification:** extends existing rule.

ShortForge establishes a development-time engineering workforce named **Forgers**.

Forgers are specialized developer roles that consume the existing ".okf/research/repo-mappings/" corpus, production-helper evidence, and gstack engineering workflows.

The Forger Assembly is not a new production hierarchy. It is subordinate to engineering direction and repository governance.

Locked requirements:
- every Forger task begins with the complete current .okf sweep
- role specialization is preferred over one generic coding agent
- Forger output is evidence + branch/PR work, not production authority
- specialist security/evaluation lanes cannot self-authorize promotion
- external repositories remain pattern sources, not authority
- production-helper remains the evidence station for applicable changes
- F07, Guardian, AgentRuntime, leases/fencing, CAS, and ReleaseAuthorization remain authoritative boundaries

## 32. Forger security stack

**Classification:** extends existing rule.

Forge Sentinel uses:
- Semgrep as the existing static security worker
- Strix as the existing conditional dynamic security worker
- ZAP as the governed DAST / web-API security lane
- gstack CSO methodology as an engineering security workflow reference

ZAP is not yet represented as an existing production-helper execution asset. Until a real helper integration and evidence run exist, its status remains "ADOPTION CANDIDATE / UNPROVEN" rather than implemented.

Active security scanning is deny-by-default outside explicitly authorized test/staging targets.

## 33. Gstack engineering workflow mapping

**Classification:** new capability / pattern assimilation.

Gstack is adopted as an external engineering-workflow reference for specialized planning, review, QA, security, benchmarking, debugging, DevEx, shipping, and retrospectives.

ShortForge maps those methods into Forgers rather than creating a second authority hierarchy.

No gstack-derived workflow may bypass the mandatory .okf decision protocol or executable source-of-truth hierarchy.

## 34. Repository mapping priority update

Relevant existing mappings should be treated as a reusable engineering stack before new tools are introduced:

ECC -> engineering discipline
Chrome DevTools MCP -> browser evidence
AgentEvals + OpenAI Evals -> deterministic agent evaluation
OpenHands Benchmarks -> long-horizon mission evaluation
Archify + Temporal -> typed IR, receipts, bounded repair, replayability
Remotion + AgentTube -> media engineering
MarkItDown -> document normalization
Diagram Design -> investigation visualization
Zstandard -> deferred history/telemetry compression
Gstack -> specialist engineering workflow
ZAP -> DAST security candidate


## Decision: EngineManifest → ConfigurationSchema → ProductionSpec

### Status

**LOCKED ARCHITECTURAL DIRECTION / IMPLEMENTED TRANSITION**

### Decision

ShortForge separates Content Engine identity from runtime mission configuration.

```text
Content Engine
  ↓
Engine Manifest
  ↓
Configuration Schema
  ↓
Creator Intent
  ↓
ProductionSpec Compiler
  ↓
Immutable ProductionSpec
  ↓
FactoryOS Mission / Floor Projections
```

### Rationale

The dashboard previously mixed content choices, media choices, routing overrides, delivery targets, and lifecycle preferences in one hardcoded form. This refactor makes the Content Engine the authority over its configurable surface while keeping system-level routing, worker capability, governance, and F07 verification outside creator control.

### Consequences

- New engines can declare their own configuration without requiring hardcoded dashboard fields.
- Server-side validation is deterministic and aligned with the engine schema.
- Jobs carry a reproducible configuration snapshot and hash.
- F00 research requirements can be declared by the engine instead of being invented by a generic search layer.
- Legacy fields remain accepted during migration.
- Engines without declarations temporarily receive compatibility schemas.

### Non-goals

This decision does not change the canonical eight-floor topology, sovereign authority hierarchy, worker permissions, or F07 release gate.
## 35. F06 Render Fabric consolidation

**Classification:** extends existing rule.

**Decision:** Floor 06 has one authoritative rendering entry point at `apps/web/factoryos/core/fabric/RenderFabric.ts`. Physical provider execution is routed through the singleton `ComputeGateway` and its `ComputeRouter`; compiler selection remains inside RenderFabric, while worker lifecycle/state contracts remain under `core/fabric/*`.

**Compatibility:** The duplicate `core/rendering/RenderFabric.ts` implementation has been removed. There is no second RenderFabric implementation.

**Invariant:** A render provider cannot be treated as successfully completed when it returns `COMPLETED` without at least one physical artifact receipt. The ComputeRouter treats that condition as a failed execution eligible for bounded failover.

**Provider boundary:** Azure VM rendering is retired. F06 provider routing is owned by ComputeRouter and qualified provider adapters; AMD remains the next physical provider integration.

**Validation required:** Typecheck, canonical RenderFabric tests, Render Fabric distributed tests, and the AMD distributed golden-mission proof.

## Decision — F01 v2 Strategy Architecture

Date: 2026-09-25
Status: PROPOSED ON feat/floor01-strategy-v2; merge requires fresh CI/evidence.

Decision:
- Canonical F01 implementation is services/pipeline/floor01_strategy.
- Canonical floor identity is floor01_strategy.
- F01 consumes a typed ResearchContext derived from the verified F00 ResearchPassport.
- F01 generates bounded StrategyCandidates and uses deterministic QualityDimensions evaluation.
- Only the compiled Floor01HandoffPayload is authoritative downstream.
- Overseer delegates F01 execution through Floor01RuntimeAdapter and must not synthesize a second strategy implementation.
- LLM adapters may emit MODEL_INFERENCE only after real model execution; otherwise provenance is FALLBACK.
- Missing/weak research is DEGRADED in compatibility execution and rejected in strict execution.
- F01 v2 preserves Guardian, Slayer, Healer, F07, lease/fencing, capability, and .okf authority boundaries.

Evidence:
- .okf/audits/floor01-v2-improvement.md
- docs/research/floor01-v2-architecture-candidates.md
- services/pipeline/floor01_strategy/tests/test_v2_architecture.py

External references:
- Temporal: https://docs.temporal.io/
- LLMCompiler: https://arxiv.org/abs/2312.04511
- CRAG: https://arxiv.org/abs/2401.15884
- STORM: https://arxiv.org/abs/2402.14207
- GraphRAG: https://arxiv.org/abs/2404.16130
- DSPy: https://github.com/stanfordnlp/dspy
- GEPA: https://arxiv.org/abs/2507.19457

Conflict/limitation:
- Semantic embedding novelty, shared strategic graph memory, bounded DELIBERATE/DEEP search, and centralized report persistence remain future work.

## 35. Team Engineering Workforce and Change Gate

**Classification:** extends existing rule.

The previously established Forger Assembly and Security Stack are consolidated operationally under the top-level `Team/` directory.

Locked workflow:

.okf full sweep
↓
TeamChangeIR
↓
Forger Assembly
↓
Security Stack
↓
implementation + tests + evidence
↓
Team Change Report
↓
authorized disposition

Every non-trivial change must pass this sequence.

A contradiction against an absolute .okf rule is a first-class conflict. It must be preserved in the Team report, and the Forgers must propose a bounded resolution. The proposal does not itself amend .okf.

## 36. Team reports preserve conflicts

**Classification:** new capability.

The machine-readable Team Change Report requires:
- complete .okf sweep status
- source references
- change classification
- Forger participation
- security status
- all detected conflicts
- proposed resolution
- accepted resolution when authorized
- final disposition

Resolved conflicts remain in the report as historical evidence.

## 37. Team IR and JSON boundary

**Classification:** new capability.

TeamChangeIR is the semantic representation.

JSON is its transport/persistence/CI encoding.

Markdown is its human report projection.

No choice is made between IR and JSON because they operate at different layers:

- IR defines the meaning and typed contract.
- JSON carries that contract between processes and stores reproducible evidence.
- Model prompts receive compact projections compiled from the IR.
- Human reviewers receive Markdown.

The Context Compiler may omit irrelevant data from a model projection, but it may not omit the fact that a complete .okf sweep occurred.
