# Artifacts: Timeline / Composition Intermediate Representation

> Status: OPERATIONAL / CANONICAL
> Source: `apps/web/factoryos/core/timeline/TimelineIR.ts`, `CompositionIR.ts`
> OpenCut boundary: `apps/web/factoryos/core/render/OpenCutAdapter.ts`

## 1. Authority

**CompositionIR is the renderer-neutral semantic media graph.**

The production authority remains:

`F05 CompositionIR → OKF admission → F06 RenderFabric → ComputeRouter → CAS → F07`

OpenCut is an optional editor/compositor adapter. It cannot grant production eligibility, select providers, bypass Treasury, write F07 state, or become the source of semantic truth.

## 2. CompositionIR v2

CompositionIR v2 adds:

- integer-tick `MediaTime` at 120,000 ticks/second;
- rational `FrameRate` values for exact frame relationships;
- typed clips and tracks;
- per-property keyframes with LINEAR/HOLD/BEZIER interpolation;
- scoped effects (clip/track/scene/timeline);
- reusable masks;
- transitions;
- verified audio metadata and waveform information;
- word-level caption cues;
- deterministic canonical serialization.

The legacy `TimelineIR` remains supported during migration and exposes `upgradeTimelineIR()` plus `compositionV2`.

## 3. Editing transformations

`TimelineTransforms.ts` provides pure, deterministic operations:

`splitClip()`, `trimClip()`, `moveClip()`, `rippleDelete()`, `retimeClip()`

Temporal edits move or rescale nested animation/effect/mask state with their parent clip. Retime preserves the represented source span and makes `playbackRate` explicit.

Ripple deletion requires an explicit `LOCAL_TRACK`, `LINKED_TRACKS` or `WHOLE_COMPOSITION` scope. Audio and captions are never silently shifted outside the requested synchronization boundary; unsupported crossing edits fail closed.

These transformations are intentionally independent of any renderer or UI so agents, ReMaker and future editors can operate on the same semantic object.

## 4. OpenCut mapping

The adapter maps ShortForge CompositionIR into a versioned compatibility document.

| Capability | Adapter state |
| --- | --- |
| Timeline | direct IR mapping |
| Keyframes | direct IR mapping |
| Effects | direct IR mapping |
| Masks | direct IR mapping |
| Captions | direct IR mapping |
| Audio waveform | metadata mapping |
| Ripple editing | ShortForge deterministic transform |
| Rust compositor | optional future backend |
| WebAssembly | optional future preview target |
| Editor API | roadmap only |
| Plugin runtime | roadmap only |
| MCP server | roadmap only |
| Headless OpenCut execution | roadmap only |
| Scripting surface | roadmap only |
| Desktop GPUI | not adopted |

## 5. Validation contract

Before adapter serialization:

1. schema version must be `2.0.0`;
2. MediaTime values must be non-negative integers;
3. clip/audio/caption ranges must stay within composition duration;
4. keyframes must be strictly ordered;
5. caption word cues must remain inside their parent cue;
8. voice audio must exist;
9. waveform metadata must be structurally valid.

Invalid compositions fail closed.

## 6. Renderer capability and admission

Renderer capabilities are separate from renderer authority.

`RendererCapabilityContract` describes representational capability and physically proven runtime modes independently. A runtime mode must be listed in `executionModes` only when its corresponding capability is proven; roadmap surfaces belong in `integrationTargets`.

`RendererAdmission` describes whether ShortForge may route production work to it.

The current OpenCut admission is:

```
admissionClass     = EXPERIMENTAL
productionEligible = false
authority          = SHORTFORGE_OKF
```

A future promotion requires live proof, capability verification, deterministic conformance, OKF admission and an end-to-end F06/F07 artifact proof.

## 7. Architecture

```
                    F05
                     |
              CompositionIR v2
                     |
             +-------+-------+
             |               |
       ShortForge UI    OpenCutAdapter
             |               |
             +-------+-------+
                     |
              Render Contract
                     |
               RenderFabric
                     |
               ComputeRouter
                     |
                    CAS
                     |
                    F07
```

The renderer never becomes the source of semantic truth.
