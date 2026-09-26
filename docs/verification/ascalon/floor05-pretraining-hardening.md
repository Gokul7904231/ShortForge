# Floor 05 Pre-Training Hardening — 2026-09-27

## Admission objective

Prepare Floor 05 so Ascalon can learn the composition decision loop without being taught that an LLM is an execution authority.

## Canonical loop

`F03 AssetPlanIR + F04 verified media -> TimelineBrain proposal -> Guardian authorization -> composition/render worker -> physical + semantic verification -> committed F05 handoff -> F06`

## Training boundaries

### Ascalon may learn
- temporal ordering and duration reconciliation;
- frame-grid alignment;
- transition constraints;
- subtitle/narration timing intent;
- dependency-aware repair scope;
- deterministic replay and identity hashing;
- rejection explanations derived from explicit validation evidence.

### Ascalon must not learn
- self-authorization;
- inventing substitute assets;
- changing F03 plan fingerprints;
- bypassing F04 physical source verification;
- treating quality scores as authority;
- treating synthetic placeholder files as real rendered media.

## Evidence requirements

A training example should contain:
- source plan fingerprint;
- source media identity;
- proposed timeline;
- Guardian decision/result;
- worker action;
- physical validation evidence;
- semantic validation evidence;
- handoff fingerprint;
- final state.

## Promotion rule

Training data is admissible only when the underlying runtime contract and tests pass. The training ontology is a projection of executable capability boundaries, not the source of runtime authority.


## Wave 2 training admission — 2026-09-27

The F05 Brain now emits a typed `TimelineProposalIR` inside the Guardian proposal parameters.

The training target may learn:

- scene ordering from the canonical F03 plan;
- explicit transition intent rather than renderer-invented defaults;
- target frame durations;
- hard constraints and optimization objectives;
- deterministic proposal fingerprinting;
- explanations that distinguish proposal evidence from authorization.

The training target must still fail closed when:

- the AssetPlanIR fingerprint is absent;
- F03/F04 lineage does not match;
- an unsupported transition intent is supplied;
- a committed artifact loses its SHA-256/byte-length identity;
- decoder smoke validation fails;
- the Brain proposal attempts to authorize itself.

### Evaluation rule

Model quality is evaluated separately from release authority. Agentic post-production benchmark patterns may inform datasets and rubrics, but the production gates remain programmatic validators plus Guardian/F07 authority.


## Wave 2 completion checklist

- [x] F03 transition intent preserved.
- [x] F05 CUT/CROSSFADE semantics deterministic.
- [x] Reference renderer supports zero-duration CUT joins.
- [x] FFmpeg decoder smoke gate added after ffprobe.
- [x] Registry reuse re-checks SHA-256 and byte length.
- [x] Crash recovery does not commit header-only or unproven artifacts.
- [x] TimelineProposalIR is typed and proposal-only.
- [x] Ascalon ontology and worker permissions document the boundary.
- [x] Canonical production-critical CI admission passed on this branch; informational Web Regression remains non-blocking.
