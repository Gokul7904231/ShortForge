# Floor 03 — Asset Specification & Realization Planning

**Canonical Floor ID**: `floor03_asset_realization`  
**Floor Version**: `2.3.0`  
**Status**: **DETERMINISTIC PLANNING CORE + TYPED ASSET PLAN IR**  
**Overseer Integration**: **CANONICAL** — Overseer uses the signed/internal Python runtime adapter and persists the validated handoff in the distributed control-plane store.

## Purpose

Floor 03 is the **visual asset planning/specification floor**. It transforms the trusted Floor 02 handoff into provider-neutral, versioned visual asset requirements and a typed `AssetPlanIR` (schema `1.4.0`). It does **not** generate physical images/video and it does **not** select provider credentials.

The canonical production topology remains:

`F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07`

F03 therefore cannot become a dependency of F04.

## Inputs

- `Floor03Input.floor02_payload`: authoritative Floor 02 handoff.
- Optional authorized platform override.
- Optional aspect ratio/resolution/style/voice constraints.
- Production constraints supplied by the upstream mission.

## Core actions

1. Validate and ingest the F02 handoff without mutating upstream ScriptIR.
2. Resolve platform using executable precedence:
   `authorized caller override → upstream strategy platform → configured fallback`.
3. Compile every scene into a visual requirement.
4. Add typed shot/camera/safe-text-region information through `AssetPlanIR`.
5. Preserve F02 scene dependencies as asset-plan dependency edges.
6. Attach character continuity descriptors.
7. Assemble an asset manifest.
8. Emit provenance and execution-mode metadata.
9. Persist idempotent plan state.
10. Support surgical scene-plan regeneration with a new asset identity.

## Permissions and boundaries

F03 may:
- read the validated F02 handoff;
- create/modify F03-local asset plans;
- read character metadata supplied by F02;
- write F03-local plan state and evidence;
- request downstream execution through the canonical Overseer/runtime boundary.

F03 may not:
- mutate F01/F02 source state;
- mint production capabilities;
- select or disclose provider secrets;
- generate/verify physical media;
- approve release;
- bypass Guardian/Slayer/AgentRuntime/F07;
- become an orchestration authority.

## Current deterministic truth

The current visual adapter is deterministic. The repository must not label this as real model execution until a production model/provider adapter is actually wired.

## Versioning rule

Scene identity and asset identity remain separate. Regenerating one visual asset:
- increments the asset version;
- increments the F03 asset-plan version;
- creates a new asset ID;
- preserves unaffected scene specifications;
- does not rewrite the authoritative F02 ScriptIR version.

## Research-derived design rules

- **OpenSpec**: the typed AssetPlanIR is treated as a first-class specification artifact with explicit dependencies.
- **Paperclip**: execution/control-plane separation is preserved; F03 plans work but does not own agent runtime execution.
- **Hindsight / AI Agent Book**: memory is evidence/context, not authority; future learning should retain useful scene/continuity facts instead of replaying arbitrary raw history.
- **StarNet**: capability and handoff boundaries are explicit rather than ambient.
- **OpenBao**: provider credentials and leases stay outside F03; future provider adapters should use explicit identity/lease boundaries.
- **quiche**: semantic F03 state is separated from transport mechanics.
- **NVIDIA Model Optimizer**: model optimization belongs to the Fast Decision Core / Ascalon training system, not to F03's semantic contract.

## Runtime persistence boundary

The local JSON memory store is an idempotency/cache mechanism only. Canonical Overseer execution persists the validated F03 handoff and execution report in the FactoryOS distributed control-plane store keyed by the mission/task request identity. Duplicate requests with the same canonical request identity must resolve to the same immutable handoff.

The Python service does not own orchestration, provider credentials, render capabilities, physical media, or release authority.

## Not implemented by this floor

- physical image/video generation;
- production LLM execution;
- generative character consistency;
- output security scanning of provider-generated media;
- centralized Overseer report persistence;
- provider credential management.

## Validation status

The historical repository evidence recorded 25 F03 tests and a 79-test combined floor run. The new v2 contract changes require fresh CI validation before merge.

## Research Wave 4 additions

- Every AssetPlanIR node carries the planned asset identity plus a semantic node fingerprint.
- The plan carries an explicit Floor 02 lineage envelope and semantic source fingerprint.
- Semantic plan fingerprints ignore runtime UUIDs and revision counters, while preserving source/compiler lineage needed for reproducible cache invalidation.
- Continuity planning explicitly distinguishes independent, reference-first, last-frame-chain, and hybrid reference strategies.
- Typed validation rejects duplicate nodes, broken dependency/reference asset bindings, invalid impact-radius references, inconsistent repair scopes, and missing first/last-frame input modes.
- Surgical regeneration remaps downstream asset/reference bindings and recomputes only the semantic identities affected by the change.

## Research Wave 3 additions

- Cinematic coverage is explicit through `CoverageRole`.
- Chain-dependent scenes can express provider-neutral previous-scene `LAST_FRAME` reference bindings.
- Camera planning may include camera height, lens profile, and camera body.
- Lighting is explicit semantic intent.
- Motion beats are validated against the source scene's target duration.
- Existing dependency DAG validation, transitive repair impact, semantic plan fingerprinting, and surgical asset identity renewal remain intact.

Research mappings for these decisions are maintained under `.okf/research/repo-mappings/`.

## Research Wave 5 additions — 2026-09-26

Broader GitHub research now informs the planning contract without importing any external runtime.

- OpenAssetIO-inspired logical reference identity is represented through opaque entity references, optional version selectors and traits.
- Diffusers / InstantID / VideoComposer / LTX research is represented through provider-neutral typed conditioning with strength and bounded temporal application.
- ComfyUI / DVC / Dagster research is represented through explicit dependency-node fingerprints so surgical regeneration invalidates the affected downstream subgraph without forcing unrelated nodes to rebuild.
- OpenLineage research is reflected in typed plan lineage and semantic fingerprints.
- OpenTimelineIO research reinforces that F03 owns logical asset intent while resolved physical media remains a downstream concern.
- C2PA and VBench remain downstream provenance/verification and quality-evaluation references.

The canonical AssetPlanIR validator now checks dependency order, dependency identity, recorded upstream node fingerprints, and conditioning-to-reference bindings.

Fresh CI is still required for promotion of this research wave.
