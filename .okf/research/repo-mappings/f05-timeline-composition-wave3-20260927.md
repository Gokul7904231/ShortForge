# Floor 05 Timeline Composition — Research Wave 3
Date: 2026-09-27
Status: IMPLEMENTED ON BRANCH; PROMOTION PENDING FRESH CI

## Mission

Deepen the pre-training architecture of Floor 05 without moving authority between F03, F04, F05, F06, F07, Guardian, or the ShortForge Cognitive Layer.

Clean-room rule: no third-party source code, prompts, model weights, credentials, tests, or runtime dependencies were copied.

## Screened sources

| Source | Evidence examined | ShortForge treatment |
|---|---|---|
| AcademySoftwareFoundation/OpenTimelineIO | RationalTime, TimeRange, source/available ranges, interchange boundary | **Adopted as interoperability pattern**. F05 retains its local typed TimelineSpec and emits a deterministic TimelineIR projection; OTIO is not a runtime dependency. |
| remotion-dev/remotion / official skills | frame-driven composition, explicit fps/width/height/duration, composition metadata | **Adopted as renderer/compiler design evidence**. Frame-addressed reasoning strengthens the F05 temporal contract; Remotion remains downstream execution technology. |
| W3C WebVTT | timed text/caption interchange | **Adopted as bounded F05 evidence output**. WebVTT sidecar is generated and structurally validated; F07 remains quality authority. |
| Vchitect/VBench-2.0 | multidimensional video evaluation, intrinsic faithfulness | **Downstream-only**. Evaluation dimensions inform future F07/evaluator work; they do not authorize F05 execution or release. |
| c2pa-org/specifications | signed provenance/content credentials standard | **Downstream-only**. Signing remains outside F05 execution authority and belongs with verification/release infrastructure. |
| GStreamer | media pipeline element/seeking architecture | **Reference-only**. No second media runtime was added because F05 already has a bounded FFmpeg evidence path and F06 owns production rendering. |

## Patterns promoted

### 1. Rational temporal semantics

OpenTimelineIO explicitly distinguishes rational time/ranges and media availability from the physical file. ShortForge already has a rational F05 timebase. Wave 3 strengthens its interoperability by serializing frame-aligned boundaries into the canonical TimelineIR projection.

### 2. Semantic IR before renderer

Current Remotion guidance reinforces composition metadata such as fps, dimensions, duration, and frame-driven execution. This supports the locked rule that semantic composition must remain independent of renderer implementation.

### 3. Caption intent must remain explicit

The upstream F02 on-screen text signal is preserved in F03 as caption_text and becomes the F05 SubtitleItem text. F05 emits a WebVTT sidecar so caption intent is inspectable without claiming word-level timing that has not been measured.

### 4. Proposal and authority separation

The F05 TimelineBrain remains a proposal generator. WorkerRunner now injects Guardian authorization evidence at the execution boundary, and the F05 worker refuses execution when that evidence is absent or scoped to the wrong floor/capability.

### 5. Cache identity includes semantic projection

The canonical TimelineIR fingerprint is now a component of the F05 render-input hash. A change to canonical semantic mapping therefore invalidates a previously committed reference render instead of silently reusing it.

## Explicit non-adoptions

- No OpenTimelineIO package/runtime was added.
- No Remotion runtime replaced F05 TimelineSpec.
- No GStreamer runtime was added.
- VBench/VBench-2.0 metrics do not become F05 release gates.
- C2PA signing does not move into F05.
- F05 does not receive F06's CAP_RENDER_DISPATCH.
- Ascalon does not receive self-authorization privileges.
- F03 still does not choose providers or write physical media.

## Cross-floor effect

F03 gains one preserved semantic field: caption_text, sourced from F02 on-screen text.
F05 gains canonical TimelineIR evidence plus WebVTT evidence.
F06 receives no new authority; its input remains the committed F05 contract.
F07 gains a richer evidence package but remains the independent verification/release authority.

## Promotion rule

Classify future ideas as:
1. already exists
2. extends existing rule
3. contradicts existing rule
4. new capability
5. experiment only

Prefer extending existing contracts over creating parallel architectures.