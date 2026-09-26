# Floor 05 — Timeline Composition & Motion

Status: wave-2 production hardening complete; canonical production-critical and post-merge gates PASS on main.

## Purpose

Floor 05 is the convergence boundary for the two media branches:

`F02 -> (F03 || F04) -> F05 -> F06 -> F07`

F03 supplies the canonical `AssetPlanIR` and visual/audio requirements. F04 supplies physically verified media artifacts. F05 turns those inputs into an immutable, frame-aligned `TimelineSpec`, an authorized render job identity, a physically verified reference MP4, and a provenance-bound handoff for Floor 06.

F05 is not a provider authority, GPU compute router, or release/compliance authority.

## Start condition

Floor 05 may start only when:

1. F03 handoff is `VALIDATED` and contains a semantic `AssetPlanIR.plan_fingerprint`.
2. F04 handoff is valid and links every physical asset to that exact F03 plan fingerprint.
3. F03/F04 lineage IDs and script versions match.
4. Source media bytes still match their declared SHA-256 and byte length.
5. Guardian has authorized the F05 execution capability.

## End condition

A successful F05 run ends only after:

1. exact F03/F04 asset-set convergence;
2. deterministic TimelineSpec compilation;
3. frame-grid validation using the timeline rational timebase;
4. deterministic timeline fingerprint calculation;
5. real FFmpeg render to MP4;
6. ffprobe physical verification of container, codec, dimensions, FPS, duration, and audio streams;
7. semantic validation of timing, overlap, transitions, subtitles, asset identity, and render hashes;
8. committed render-job registry state and atomic transaction evidence;
9. creation of the Floor 05 handoff for Floor 06.

Any failed gate fails closed and leaves reconciliation evidence rather than silently substituting media.

## Features

- Rational frame timebase instead of unbounded floating-point timeline semantics.
- Exact scene/asset identity on each timeline clip.
- Deterministic render-input SHA-256 and timeline fingerprints.
- Exact F03/F04 asset-set and path/version enforcement.
- Real FFmpeg reference rendering; no synthetic MP4/header stubs.
- ffprobe JSON physical validation.
- Semantic composition invariants for audio overlap, visual transitions, subtitle bounds, and artifact identity.
- Atomic local registry writes and idempotent render lookup.
- Crash journal written before rendering begins.
- Ambiguous/corrupt render evidence quarantined under `orphaned/`.
- Guardian/Brain separation: TimelineBrain proposes; Guardian authorizes; workers execute.
- F05 -> F06 contract carries timeline and render provenance.

## Actions

### Timeline Brain
Produces a candidate composition execution proposal containing request identity, target FPS, execution mode, F03 plan fingerprint, and explicit authorization/verification requirements. It cannot authorize execution.

### Composition Worker
Compiles F03/F04 into TimelineSpec without fallback asset substitution.

### Reference Renderer
Uses FFmpeg to create decoder-valid video and thumbnail evidence from exact F04 source files.

### Validators
Use source-manifest checks, ffprobe physical evidence, and semantic invariants.

### Registry
Stores canonical TimelineSpec and RenderJob records with atomic replacement and identity collision rejection.

### Reconciliation
Recovers interrupted work and quarantines ambiguous artifacts for forensic inspection.

## Permissions

| Actor | Allowed responsibility | Not allowed |
|---|---|---|
| OVERSEER | request/propose F05 execution | bypass Guardian |
| TimelineBrain / Ascalon | propose composition decisions and bounded parameters | authorize workers, alter runtime truth |
| Guardian | capability authorization and execution gate | surrender authority to Brain/LLM |
| F05 worker | compose/render/validate within granted capability | change F03 semantic plan |
| F03 | own semantic media intent | choose providers or physical files |
| F04 | own physical media synthesis | rewrite F03 plan semantics |
| F06 | consume committed F05 handoff for production compute | accept uncommitted or lineage-mismatched F05 output |
| F07 | final release/verification authority | be replaced by F05 quality checks |

## Why the boundary exists

Without a dedicated convergence floor, visual and audio outputs can be independently valid but temporally or semantically incompatible. F05 establishes one deterministic temporal truth before compute rendering, so F06 can focus on compute execution rather than deciding what the video is.

## Ascalon role

Ascalon should learn F05 as a decision-and-verification contract, not as an unrestricted execution agent.

The high-value training pattern is:

`inputs -> evidence -> timeline proposal -> Guardian decision -> execution -> measured artifact -> verification -> handoff`

Ascalon should improve:

- temporal scheduling decisions;
- scene-duration reconciliation;
- transition selection within declared policy;
- subtitle/narration alignment intent;
- repair impact analysis;
- deterministic replay reasoning;
- explanation of why an input is rejected;
- distinction between proposal, authorization, execution, and verification.

Ascalon must not learn that an LLM can invent an asset, change a plan fingerprint, or self-authorize rendering.

## F05 -> F06 handoff

The committed handoff contains:

- exact F03 payload and semantic AssetPlanIR fingerprint;
- exact F04 media envelope and provenance;
- TimelineSpec plus `timeline_fingerprint`;
- committed RenderJob identity and `render_input_hash`;
- verified MP4 path, SHA-256 and byte length;
- ffprobe summary;
- cumulative provenance hash.

F06 therefore receives an already defined composition and only needs to execute qualified rendering/compute policy against that immutable contract.

## External research disposition

### OpenTimelineIO
Used as a boundary reference for rational time, time ranges, logical media references, and interchange semantics. It is not the ShortForge runtime authority.

### Remotion
Used as a reference for programmatic, frame-driven composition and renderer architecture. It informs a future renderer adapter/preview path; it does not replace F06 or the Guardian boundary.

### FFprobe
Used as the physical evidence mechanism for the committed reference artifact.

### VBench / VBench-2.0
Used as a downstream evaluation reference for multidimensional video quality. Scores do not authorize F05 execution or release.

### C2PA
Remains a downstream provenance/signing concern rather than a F05 execution authority.

## Current non-adoption rule

No third-party provider, model, runtime, credential, storage system, or source-code implementation becomes canonical because a research source recommends it. The executable ShortForge contracts, Guardian policy, tests, CI evidence, and .okf governance remain authoritative.


## Wave 2 completion — 2026-09-27

The second hardening wave closes the remaining pre-training gaps without changing the F03/F04/F05/F06 authority topology.

### Added

- F03 preserves Floor 02's explicit `transition_intent` in its existing `continuity_constraints` handoff field.
- F05 now honors that intent: `cut` is represented as a zero-duration transition; `crossfade`/compatible dissolve intents remain bounded and frame-aligned.
- The reference renderer supports both cut joins and crossfade joins.
- F05 runs an actual FFmpeg decoder smoke test after ffprobe inspection.
- Crash reconciliation now fails closed when artifact evidence is absent, incomplete, or physically mismatched; it no longer treats a header-only file as committed evidence.
- The committed-render registry now verifies path containment, non-symlink status, byte length, and SHA-256 before reusing an artifact.
- TimelineBrain emits a typed, non-authoritative `TimelineProposalIR` containing scene order, transition intents, target frame durations, hard constraints, and training objectives.
- Added deterministic regression coverage for F03→F05 transition intent, cut semantics, registry tamper detection, reconciliation fail-closed behavior, and structured Brain proposals.

### Ascalon training consequence

The training target is now explicitly:

`F03/F04 evidence → TimelineProposalIR → Guardian authorization → deterministic composition → physical decode evidence → semantic verification → committed handoff`.

Ascalon may learn to propose and explain composition decisions, but the proposal remains non-authoritative and all physical truth remains outside the model.

### Boundary preserved

F05 still does not acquire provider credentials, distributed render dispatch authority, F07 release authority, or permission to mutate F03 semantics. The reference render remains a bounded evidence/render fixture; production distributed compute remains F06.
