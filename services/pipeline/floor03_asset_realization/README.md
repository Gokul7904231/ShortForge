# Floor 03 — Asset Specification & Realization Planning

**Canonical Floor ID**: `floor03_asset_realization`  
**Floor Version**: `2.0.0`  
**Status**: **DETERMINISTIC PLANNING CORE + TYPED ASSET PLAN IR**  
**Overseer Integration**: **PENDING** — production control-plane wiring still requires the canonical runtime adapter.

## Purpose

Floor 03 is the **visual asset planning/specification floor**. It transforms the trusted Floor 02 handoff into provider-neutral, versioned visual asset requirements and a typed `AssetPlanIR`. It does **not** generate physical images/video and it does **not** select provider credentials.

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

## Not implemented by this floor

- physical image/video generation;
- production LLM execution;
- generative character consistency;
- output security scanning of provider-generated media;
- centralized Overseer report persistence;
- provider credential management.

## Validation status

The historical repository evidence recorded 25 F03 tests and a 79-test combined floor run. The new v2 contract changes require fresh CI validation before merge.
