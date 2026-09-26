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


## F03 AssetPlanIR research upgrade — 2026-09-25

**Classification:** new capability

**Decision:** Extend Floor 03's existing deterministic asset-specification boundary with a typed, provider-neutral `AssetPlanIR`. Keep the production topology unchanged: `F02 -> (F03 || F04) -> F05`.

**Why:** The current F03 contract was sufficient for simple prompt specifications but did not express shot/camera constraints, safe text regions, scene dependency edges, or surgical-repair impact metadata as a first-class specification. A typed IR makes those semantics explicit without granting F03 physical-generation or orchestration authority.

**External evidence considered:**
- OpenSpec: specifications and their dependency relationships should be explicit, machine-checkable artifacts.
- Paperclip: control-plane and execution-plane responsibilities should remain separated.
- Hindsight + AI Agent Book: persistent memory should be useful context/evidence, not authority or indiscriminate history.
- StarNet: capabilities and handoffs should be explicit and scoped.
- OpenBao: secrets, leases, and revocation belong at a dedicated identity/secret boundary, not inside a media-planning floor.
- quiche: semantic application state should remain separate from transport mechanics.
- NVIDIA Model Optimizer: inference optimization belongs in the cognition/model-serving layer and must be benchmarked, not baked into F03 semantics.
- ORCA was reviewed as a possible media-generation reference but no non-conflicting capability was promoted from the available evidence.

**Affected components:**
- `services/pipeline/floor03_asset_realization/app/domain/asset_plan_ir.py`
- `services/pipeline/floor03_asset_realization/app/domain/asset_models.py`
- `services/pipeline/floor03_asset_realization/app/domain/handoff.py`
- `services/pipeline/floor03_asset_realization/app/logical_workers/image_prompt_worker.py`
- `services/pipeline/floor03_asset_realization/app/pipeline.py`
- `services/pipeline/floor03_asset_realization/app/core/identity.py`
- `services/pipeline/floor03_asset_realization/app/core/config.py`
- Floor 03 Guardian identity handling
- Ascalon floor/agent ontology
- canonical floor testing contract

**Contract impact:** The initial AssetPlanIR promotion established Floor 03 as `floor03_asset_realization`, version `2.0.0`; the second-wave hardening advanced the branch contract to `2.1.0`; Wave 3 research additions now advance the current branch contract to `2.2.0`. The handoff may contain a typed `asset_plan_ir`. Visual requirements may carry a typed scene-level `scene_plan`. Regeneration creates a new asset identity and increments the local asset-plan version without rewriting the authoritative Floor 02 ScriptIR version.

**Authority impact:** none. Overseer, Guardian, AgentRuntime, leases/fencing, TimelineIR, RenderFabric, and F07 remain authoritative at their existing layers. F03 cannot generate physical media, mint capabilities, or become a second orchestration plane.

**Implementation status:** implemented on research branch; merge is gated on fresh CI and contract regression validation.

**Validation required:** full F03 tests, Guardian tests, TypeScript contract tests, JSON ontology validation, and repository CI. Any failure or contract incompatibility rejects the promotion.

**Rollback:** revert the branch changes as a unit and restore the prior F03 contract/ontology generation. No production authority or external secrets are modified by this decision.


## F03 AssetPlanIR second-wave research expansion — 2026-09-25

**Classification:** new capability

**Decision:** Extend the Floor 03 planning contract with the smallest non-conflicting set of patterns discovered through a broader repository and research sweep. The canonical topology remains F02 -> (F03 || F04) -> F05.

### Promoted capabilities

- AssetPlanIR schema 1.1.0 now contains typed continuity modes, reference bindings, generation input modes, normalized safe text regions, motion beats, subject constraints, start/end state hints, evidence and causal lineage, dependency edges, semantic fingerprints, and bounded repair scope.
- F03 validates the scene dependency DAG before compilation: duplicate scene IDs/sequence indexes, missing dependencies, forward dependencies, self-dependencies, and cycles are rejected.
- impact_radius now means transitive downstream dependents, enabling repair planning rather than merely repeating prerequisites.
- Surgical scene regeneration preserves dependency edges and remaps dependency asset IDs to the regenerated asset identity.
- Guardian evidence hashing now fingerprints the complete validated Floor 03 input instead of only request/script identity fields.
- The semantic AssetPlanIR fingerprint excludes runtime plan identity and therefore supports replay/cache evidence across distinct request IDs for equivalent plan semantics.

### Research corpus considered

In addition to the original Paperclip, Hindsight, StarNet, NVIDIA Model Optimizer, OpenBao, ORCA, quiche, OpenSpec, and AI Agent Book set, the sweep included StoryForgeAI, VideoClaw, NolanX, Seedance 2.0, script-to-shootable-storyboard, xyz-video-skill, Pydantic AI, CharacterConsistency, PopcornReady, ShotDirector, MultiShotMaster, VstoryGen, and Code2Video.

The detailed clean-room mappings are stored under .okf/research/repo-mappings/.

### Authority and scope invariants

- F03 remains specification/planning only.
- F03 does not select providers or store provider credentials.
- F03 does not generate or verify physical media.
- F03 does not replace TimelineIR, RenderFabric, Guardian, Healer, Slayer, AgentRuntime, or F07.
- External repositories are evidence only and cannot override executable source, canonical contracts, tests, or locked .okf rules.
- F03/F04 parallelism is unchanged.

### Validation gate

Fresh F03 Python tests, Guardian tests, TypeScript contract checks, ontology validation, and repository CI remain required before PR promotion. Research quality does not substitute for executable validation.

### Rollback

Revert the second-wave F03 changes as one logical unit. No external provider credentials, production authority, or physical media execution path is modified by this decision.

## F03 AssetPlanIR research upgrade — Wave 3 — 2026-09-25

**Classification:** extends existing rule + new capability

**Decision:** Extend the provider-neutral Floor 03 planning contract with cinematic coverage roles, dependency-boundary last-frame references, richer camera metadata, lighting intent and temporal-plan validation. Preserve the canonical `F02 -> (F03 || F04) -> F05` topology and all authority boundaries.

**External evidence considered:** ComfyUI, ViMax, Hugging Face Diffusers, Open-Sora, ai-video-studio, ai-video-production-editor, Vidia Open Studio, shotlist-forge, script-to-shootable-storyboard, ai-film-director and StoryMind, plus screened reference implementations documented in `.okf/research/repo-mappings/f03-screened-wave3.md`.

**Contract impact:** Floor 03 advances to 2.2.0; AssetPlanIR schema advances to 1.2.0. Added coverage role, camera height/lens/body, lighting, source reference lineage and dependency last-frame binding semantics. Motion beats must remain within source scene duration.

**Authority impact:** none. F03 remains planning/specification only. TimelineIR remains downstream semantic composition truth, RenderFabric owns rendering execution, Guardian/Slayer/Healer retain their control roles, and F07 remains physical verification authority.

**Implementation status:** implemented on `feat/f03-research-upgrade`; fresh CI and repository-level regression validation remain required before merge.

**Validation required:** F03 worker tests, handoff tests, scene-regeneration tests, Guardian tests, ontology JSON validation, TypeScript floor-contract validation and repository CI.

**Rollback:** revert the wave-3 implementation/doc changes together. No provider credentials or physical-generation authority is introduced.

## F03 validation finding — 2026-09-25

A repository CI run exposed a pre-existing compatibility/import-path gap in the historical `floors.*` namespace: the canonical root compatibility namespace did not yet expose Floor 03, and the Floor 03 production-gate path filter did not include root `floors/**` changes.

Resolution on the research branch:
- added `floors/floor03_asset_realization/__init__.py` as the canonical compatibility bridge;
- removed the unused nested bridge under `services/pipeline/floors/`;
- added `floors/**` to the Floor 02 + Floor 03 production-gate trigger paths;
- kept canonical implementation under `services/pipeline/floor03_asset_realization`.

Fresh CI is required after this correction. The failed run is recorded as validation evidence, not as a production success claim.


## Validation infrastructure correction — 2026-09-25

The F03 production-gate run exposed a repository-root compatibility bridge defect in `floors/floor01_strategy/__init__.py`: the bridge pointed at the packaging root `services/pipeline/floor01_strategy` instead of the installable `services/pipeline/floor01_strategy/floor01_strategy` package. That prevented F02 and F03 imports from resolving.

Resolution:
- corrected the root Floor 01 compatibility path;
- kept the F03 root compatibility bridge at `floors/floor03_asset_realization`;
- retained `floors/**` in the Floor 02 + Floor 03 workflow trigger paths;
- no canonical floor implementation was duplicated or moved.

This is validation infrastructure, not a change to F01/F02 authority or semantics.


## F03 test-boundary hardening — 2026-09-25

The F03 suite was correctly found to be coupled to F02's live pipeline quality policy through the shared `build_mock_floor02_payload()` helper. In the production gate, F02 rejected the synthetic fixture because its evidence lineage did not satisfy F02-C01, causing the F03 suite to fail before exercising F03 behavior.

Resolution:
- the F03 test fixture now constructs a validated `Floor02HandoffPayload` directly;
- the fixture carries explicit platform provenance, scene evidence references, character metadata, dependency edges, and continuity/reference intent;
- no F02 model credentials, revision loop, or quality-score behavior is required for F03 unit/API tests;
- F02's own production quality gates remain unchanged and continue to run in their dedicated suite.

This restores test ownership boundaries: F03 tests the F02→F03 contract, while F02 tests its own generation/quality policy.


## F03 idempotency and semantic fingerprint hardening — 2026-09-25

A production-gate run exposed two final test-level contract gaps:

1. Request-id idempotency did not distinguish the same request ID carrying a different Floor 03 input because the memory key was request ID only.
2. AssetPlanIR fingerprints included generated runtime asset identities, so equivalent semantic plans produced different fingerprints across independent executions.

Resolution:
- Floor 03 now computes a full validated-input SHA-256 fingerprint and persists it with every new idempotency record.
- A stored fingerprint mismatch for the same request ID is rejected as an idempotency conflict.
- AssetPlanIR semantic fingerprints exclude runtime-only plan/asset/reference/evidence identifiers while retaining semantic scene, camera, continuity, dependency, timing and constraint content.
- Legacy records without stored fingerprints remain readable for backward compatibility; all new writes are fingerprinted.

This strengthens replay safety without moving orchestration or provider authority into F03.


## F03 Research Wave 4 — 2026-09-25

**Classification:** extends existing rule + new capability

**Decision:** Strengthen Floor 03's provider-neutral planning boundary with explicit node identity, semantic fingerprints, upstream lineage, and typed continuity/reference strategy. Preserve the canonical topology F02 -> (F03 || F04) -> F05.

**Research expansion beyond the previous corpus:**
- OpenLineage/OpenLineage — first-class lineage entities/facets and source-version provenance.
- iterative/dvc — dependency-aware reproducibility and stable stage identity.
- dagster-io/dagster — explicit blocking asset checks and inspectable metadata.
- invoke-ai/InvokeAI — saved workflow/specification separated from executable graph submission.
- divolleggett/character-consistency-skill — reference-first storyboard validation and reuse.
- taylorzhou16/video-gen-en — layered storyboard/shot/motion specification and parameter consistency.
- NVIDIA-NeMo/Guardrails — explicit validation-rail boundaries.

**Implementation decisions:**
1. AssetPlanNode carries the planned asset_id and semantic node_fingerprint.
2. AssetPlanIR carries source_fingerprint and a typed PlanLineage envelope.
3. Plan fingerprints normalize runtime UUIDs and plan revision counters.
4. ContinuityPlan explicitly records reference strategy: none, reference_first, last_frame_chain, or hybrid.
5. AssetPlanIR validation rejects broken dependency/reference bindings, invalid impact-radius references, inconsistent repair scope, and missing frame-input modes.
6. Surgical regeneration rejects blank instructions and remaps downstream asset/reference identities without mutating the authoritative F02 ScriptIR.

**Authority invariant:** F03 remains specification/planning only. It does not generate physical media, select provider credentials, enqueue provider graphs, replace Guardian, replace TimelineIR, or replace F07.

**Validation required:** F03 Python tests, Guardian tests, TypeScript floor contract tests, ontology JSON validation, and fresh repository CI.

**Rollback:** revert the Wave 4 changes as a unit and restore Floor 03 2.2.0 / AssetPlanIR 1.2.0.



## F03 current contract generation — 2026-09-25

The branch has since advanced through additional hardening to:
- Floor 03 contract: `2.3.0`
- AssetPlanIR schema: `1.3.0`

Current contract additions include:
- self-contained node asset identity and node fingerprinting;
- explicit `sourceFingerprint` and `PlanLineage` from the trusted Floor 02 handoff;
- semantic plan fingerprints that preserve meaningful upstream lineage while ignoring runtime-only asset/node IDs;
- dependency/reference integrity checks aligned with node asset identity.

Validation evidence:
- The latest F03 gate now reaches the full test suite and reports **33 passed, 1 failed**.
- The remaining failure was an exact error-message contract mismatch in the idempotency conflict test; the implementation already rejected the conflict correctly.
- The branch has been updated to emit the expected `Idempotency conflict: fingerprint mismatch ...` wording.
- F02 production tests passed in the same run; Team Change Gate also passed.

This section records the current state before the next fresh CI run. No production-green or merge claim is made until that run completes.


## Guardian import-boundary correction — 2026-09-25

The F03 Guardian gate exposed a repository-layout compatibility gap: Guardian source imports use the canonical Python namespace `factoryos.guardian.*`, while the implementation is physically stored under `services/pipeline/guardian`.

Resolution:
- added the root `factoryos/guardian` compatibility bridge to the canonical Guardian package;
- added `factoryos/__init__.py` as the Python namespace root;
- added `factoryos/**` to the Floor 02 + Floor 03 production-gate trigger paths.

No Guardian implementation was duplicated or moved. The bridge only exposes the existing package through its canonical import namespace.


## F03 Guardian gate ownership correction — 2026-09-25

The F03 Guardian production-gate job was executing both the F03 Guardian contract suite and an unrelated Floor 02 recovery scenario suite. The latter failed because its F01/F02 fixture lacked the evidence/provenance required by the independent F02 quality gate, even though the F03 Guardian contract tests were the relevant verification target.

Resolution:
- the F03 Guardian job now runs only `tests/guardian/test_guardian_floor03.py`;
- Floor 02 Guardian scenario coverage remains a separate responsibility and is not used as a proxy for F03 Guardian correctness;
- the root `factoryos.guardian` compatibility bridge remains required for the scoped F03 Guardian tests.

This is a gate-ownership correction, not a relaxation of F03 safety requirements.


## F03 Validation Gate Hardening — 2026-09-25

**Classification:** extends existing rule

Fresh runner evidence hardened the F03 validation boundary:

1. The F03 Guardian job was executing a cross-floor Guardian scenario suite that depended on Floor 02 model credentials and F02 provenance-quality policy. The F03 gate is now scoped to the dedicated Floor 03 Guardian contract test.
2. The Guardian runner required the repository-root FactoryOS compatibility namespace before the other Python roots. The F03 workflow now places the repository root first in PYTHONPATH.

This keeps F03 validation deterministic and owned by the F03 contract while leaving cross-floor scenario coverage to the broader CI layer.

Latest targeted validation:
- Floor 02 + Floor 03 Production Gates: passed.
- F03 Asset Planning v2: passed.
- F03 Guardian contract: passed.
- Team Change Gate: passed.

Full repository CI remains a separate gate.


## F03 Research Wave 5 — 2026-09-26

**Classification:** extends existing rule + new capability

**Decision:** Further harden the Floor 03 planning artifact using broader media-interoperability, graph-execution, conditioning, lineage and reproducibility research. Preserve F03 as a declarative specification boundary and preserve the canonical topology F02 -> (F03 || F04) -> F05.

### New research corpus

The wave includes additional GitHub repositories beyond the original nine and earlier F03 waves:
- OpenAssetIO/OpenAssetIO and OpenAssetIO/OpenAssetIO-MediaCreation
- AcademySoftwareFoundation/OpenTimelineIO
- Comfy-Org/ComfyUI
- huggingface/diffusers
- OpenLineage/OpenLineage
- dagster-io/dagster
- HVision-NKU/StoryDiffusion
- instantX-research/InstantID
- ali-vilab/VideoComposer
- Lightricks/LTX-Video and Lightricks/LTX-2
- contentauth/c2pa-rs
- Vchitect/VBench
- iterative/dvc
- invoke-ai/InvokeAI
- additional storyboard/cinematic/continuity mappings recorded under .okf/research/repo-mappings/

### Promoted implementation

1. AssetPlanIR schema advances to 1.4.0.
2. ReferenceBinding can carry opaque entity_ref, version_selector and traits, separating logical identity from storage/provider resolution.
3. VisualPromptPlan carries typed ConditioningSpec entries with conditioning type, strength and bounded temporal application.
4. AssetPlanIR validates that every conditioning is backed by an explicit visual reference.
5. AssetDependency carries an optional dependency_node_fingerprint so semantic cache lineage follows upstream node changes.
6. Dependency validation now checks ordering and validates the recorded upstream node fingerprint.
7. Regeneration remaps dependency asset identity and dependency-node fingerprints in sequence order, allowing exact downstream cache invalidation without rebuilding unrelated branches.
8. Scene planning now emits logical identity metadata for character, style and continuity references.

### Boundary decisions

- OpenAssetIO informs reference identity only; F03 does not resolve storage paths.
- OpenTimelineIO informs logical-vs-available media separation; F03 does not own media relinking.
- ComfyUI/DVC/Dagster inform graph/cache semantics; F03 does not become a workflow executor.
- Diffusers/InstantID/VideoComposer/LTX inform typed conditioning; F03 does not select or execute a model/provider.
- OpenLineage/C2PA inform provenance boundaries; F03 does not sign or release artifacts.
- VBench informs downstream evaluation; F03 does not self-certify quality.

### Authority invariant

Overseer remains sovereign. Guardian remains capability/safety authority. F03 remains planning/specification only. TimelineIR remains downstream semantic composition truth. RenderFabric remains physical execution orchestration. F07 remains physical verification authority.

### Validation required

Fresh F03 Python tests, Guardian tests, ontology JSON validation, TypeScript contract checks, and repository CI are required after this wave. No merge or production-green claim is made from earlier CI runs.


## F03 post-merge canonicalization — 2026-09-26

**Decision:** Canonicalize production Floor 03 execution through `Floor03RuntimeAdapter -> services/pipeline/floor03_asset_realization` and remove the duplicate TemplateProductionPipeline asset-planning path from the Overseer production executor. Test-only simulations may remain outside production, but no production fallback may bypass the canonical F03 service.

**F03→F05 contract:** Floor 05 now accepts an explicit typed `floor03_payload` alongside the independent `floor04_payload`. The F04 envelope remains a physical-media source, not the authority for F03 semantics. F05 rejects lineage mismatches before composition.

**Evidence truth:** F03 reports measured runtime execution of the planning service, never physical media success. Physical artifact truth remains downstream of F05/F06.

**Persistence:** The F03 Python JSON store is local idempotency/cache state only. The canonical Overseer handoff is persisted to the distributed FactoryOS control-plane store with immutable request identity and conflict detection.

**CI:** A dedicated post-merge F03 workflow now validates the merged main branch. Repository-wide TypeScript errors discovered on the prior main run are corrected in the same hardening branch and must pass before promotion.

**Ascalon readiness:** Do not promote the updated F03 ontology as runtime truth until the canonical runtime adapter, explicit F03→F05 join, distributed handoff persistence, scoped post-merge gate, and repository-wide typecheck all pass on main.


## F03 post-merge admission — 2026-09-26

**Final evidence:** main `e341b6f9e8d2a090812b038dbc7cde90d0b83e2a`, Floor 03 Post-Merge Verification run `36219440438`.

**Result:** PASS for the F03 canonical planning/runtime contract. The dedicated post-merge gate passed the F03 suite (37), Guardian contract (1), F03/F04/F05 typed seam (2), and Ascalon ontology JSON validation. The repository TypeScript post-merge gate also passed.

**Training admission:** F03 is admitted for Ascalon training-data preparation subject to the standing Ascalon principles: deterministic replayability, claim-evidence integrity, secret isolation, and separation of simulation from production authority. This admission does not grant F03 physical-media or release authority.

**Informational note:** the Web Regression Suite is maintained as an informational CI lane and is not used as a substitute for the canonical F03 admission gate.


## F03 final evidence refresh — 2026-09-26

Latest verified `main` is `0fa169cae74c9b77def147df55dc4572b91769d2`. Post-merge verification run `36219665043` passed the canonical F03 gate and the repository TypeScript typecheck. Repository CI run `36219665012` also passed. PR #21 corrected verifier-only environment defects discovered on the first merged-main attempt; no production F03 authority boundary was changed by that follow-up.


## Obsidian Memory Fabric — 2026-09-26

**Classification:** extends existing rule + new capability

**Decision:** Promote the existing Obsidian-compatible knowledge/ vault into the documented ShortForge Memory Fabric. Obsidian is the human/agent knowledge IDE and cognitive memory projection layer. It does not become a runtime authority, production state database, Guardian replacement, or Ascalon authority.

**Implementation:**
1. Add a typed Obsidian memory schema with explicit epistemic, verification, lifecycle, provenance and training-eligibility fields.
2. Add Bases dashboards for active decisions, verified evidence, research, conflicts, training eligibility and architecture memory.
3. Add a Canvas architecture map for the memory lifecycle.
4. Add core-compatible templates for claims, decisions, research, evidence, incidents and experiments.
5. Add official Web Clipper templates for generic sources, GitHub, and research/papers.
6. Add repository-side vault linting, catalog generation and bounded memory projection under tools/obsidian/.
7. Keep raw sources immutable and require evidence-backed promotion into durable verified knowledge.
8. Preserve the existing MemoryWriter / KnowledgeOS promotion boundary; Obsidian does not bypass it.
9. Document Obsidian CLI, Headless Sync, Git, optional community plugins and Publish as controlled integration surfaces.

**Authority invariant:** .okf remains governance truth; canonical contracts/runtime/CI remain executable and measured truth; Obsidian remains derived knowledge; Ascalon consumes bounded projections and cannot amend authority.

**Security invariant:** secrets, credentials and private customer data never enter durable memory. Community plugins require audit before enablement. Headless automation runs only on controlled hosts. Public Publish is opt-in for curated content only.

**Research basis:** current Obsidian supports core plugins including Bases, Canvas, Graph, Properties, Templates and Sync; official Web Clipper supports templates and Interpreter; Obsidian CLI supports scripted vault operations; Obsidian Headless supports agent/CI synchronization. These surfaces are used without making the desktop app a production dependency.

**Rollback:** remove the Obsidian integration files and this decision entry. Existing knowledge/ and runtime memory systems remain valid.


## Live Obsidian Memory Fabric Runtime Integration — 2026-09-26

**Classification:** extends existing rule + new capability

**Decision:** Connect the existing FactoryOS runtime event boundary and MongoDB operational state to the Obsidian-compatible knowledge vault through a dedicated MemoryFabricBridge.

**Authority invariants:**
- MongoDB operational collections remain runtime state.
- DurableEventBus remains runtime event transport.
- memory_fabric_events and memory_fabric_offsets are ingestion/checkpoint state only.
- knowledge/ remains derived cognitive memory.
- MemoryWriter remains the durable promotion gate.
- .okf remains governance authority.
- Ascalon receives bounded verified projections and cannot alter runtime state.

**Integration behavior:**
1. Ingest runtime events immediately through the existing DurableEventBus.
2. Consume MongoDB insert/update/replace changes with a resumable change stream when supported.
3. Run bounded periodic MongoDB reconciliation as a correctness backstop.
4. Sanitize credentials and sensitive fields before persistence to the vault.
5. Materialize raw observations with source hashes and temporal metadata.
6. Compile high-signal runtime records into explicit candidate memories.
7. Promote only explicitly verified candidates; unresolved or disputed memories remain out of active projection.
8. Automatically supersede older active memories when the same verified conflict group is promoted.
9. Generate a bounded Ascalon memory projection containing only verified active memories explicitly marked training_eligible.
10. Expose bounded agent read/write access through IntelligenceGateway and the MemoryFabricProjectionService.

**Operational configuration:** MEMORY_FABRIC_ENABLED, MEMORY_FABRIC_VAULT_PATH, MEMORY_FABRIC_RECONCILIATION_MS.

**Rollback:** disable MEMORY_FABRIC_ENABLED. Remove the bridge and ledger integration without changing runtime authority or the existing KnowledgeOS/MemoryWriter boundary.

**Validation:** integration tests, vault lint, generated catalog validation, and strict FactoryOS TypeScript validation are required before merge.

## ShortForge Knowledge Graph View — 2026-09-26

**Classification:** new capability

**Decision:** Add a dedicated Obsidian custom view named **ShortForge Knowledge Graph** for visual relation navigation over the existing `knowledge/` vault.

**Behavior contract:**
- force-directed graph motion;
- node drag;
- background pan;
- cursor-centered zoom;
- hover/select relation isolation;
- semantic relation labels;
- Display controls: arrows, text fade threshold, node size, link thickness, animation;
- Forces controls: center, repel, link force and link distance;
- relation filtering and search;
- direct navigation from graph node to underlying knowledge note.

**Data contract:** normal Obsidian wikilinks become `links_to`; explicit `sf_relations`, `evidence_refs`, and supersession metadata are interpreted as semantic relations. The graph is read-only.

**Authority invariant:** the graph cannot mutate `.okf`, MongoDB, MemoryWriter, runtime state, Guardian state or Ascalon authority.

**Validation:** `node --check` and repository graph-asset validation run in the Obsidian memory CI lane.


## AMD distributed render qualification — 2026-09-26

**Classification:** evidence-backed implementation state

**Decision:** Treat the AMD persistent worker integration as physically proven for distributed rendering, but do not classify the current MI300X worker as hardware-video-encoding-qualified.

Measured worker evidence:
- AMD Instinct MI300X VF detected.
- ROCm 10.0.0 reported.
- `/ready` and `/health` returned HTTP 200.
- Authenticated capability discovery succeeded.
- Direct `h264_vaapi` proof failed because the installed VAAPI driver exposed H.264 as `VAEntrypointVLD` only.
- Production worker render succeeded with `libx264`.
- Result: 1080x1920, 30fps, 2.0s H.264 MP4, 52,675 bytes.
- Worker and downloaded SHA-256 matched:
  `f58c6531af68dda10e4e27721b80ceb3c36fd471d0b14e532ae7c9955930c1b8`.

Architecture implication:
- AMD worker presence and AMD hardware-video encoding are separate capabilities.
- The Render Fabric capability contract now records the configured video encoder and whether it is hardware-video-encode qualified.
- Router/provider logic must not infer hardware media encoding merely from `gpuCount > 0`.

Admission status:
- Physical AMD worker render: VERIFIED.
- Artifact digest integrity across worker -> download: VERIFIED.
- Canonical F06 control-plane -> AMD -> CAS -> F07 live admission: PENDING fresh live-run evidence.
- Hardware H.264 encode on this guest stack: NOT QUALIFIED.


## Floor 04 physical-truth hardening — 2026-09-26

**Classification:** extends existing rule + new capability

**Decision:** Strengthen Floor 04 as the canonical physical media execution boundary without changing the F02 → (F03 || F04) topology.

### Locked invariants

- F03 remains provider-neutral specification/planning.
- F04 may choose among explicitly allowlisted providers only after Guardian authorization.
- Physical artifact bytes and decoder metadata outrank provider-declared metadata.
- Every F04 physical asset must be linked to the exact F03 AssetPlanIR semantic fingerprint.
- Deterministic fallback artifacts must be truthful: they are valid fallback media, not claimed real TTS/image models or licensed stock assets.
- Registry writes must be atomic and asset identity cannot silently map to a different checksum.
- Crash reconciliation quarantines ambiguous/corrupt evidence; it must not erase forensic evidence.
- F05 receives only a validated F04 handoff and must confirm exact F03 plan lineage.
- C2PA provenance signing remains a downstream/F07 capability.
- VBench-style quality evaluation informs downstream quality verification and does not grant F04 release authority.

### Research basis

OpenAssetIO, LTX-2, HunyuanVideo-1.5, Wan2.2, VBench-2.0, C2PA 2.4, and existing ShortForge image/audio provider abstractions were screened. They were adopted only where they fit existing authority and provider-neutrality rules. No external source overrides executable contracts, Guardian policy, tests, or .okf.

### Promotion gate

The branch must pass:
- Floor 04 unit + API + security tests
- Floor 05 handoff/contract tests
- Floor 03 contract tests
- Guardian tests
- full repository CI
- security/evaluation lanes where applicable

No “production-ready” status is inferred from architectural completion alone.
