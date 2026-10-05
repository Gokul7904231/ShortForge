# OpenCut → ShortForge Composition Mapping

> Status: IMPLEMENTED AS ADAPTER / EXPERIMENTAL
> Source: OpenCut-app/OpenCut and archived opencut-classic
> ShortForge branch: feat/opencut-composition-layer-20261005

## Decision

OpenCut is an optional composition/editor substrate, never a ShortForge authority.

The canonical authority chain remains:

`F05 CompositionIR → OKF admission → F06 RenderFabric → ComputeRouter → CAS → F07`

OpenCut may consume a ShortForge CompositionIR through `OpenCutAdapter`.

## Adopted patterns

| OpenCut capability | ShortForge implementation |
| --- | --- |
| Timeline model | `CompositionIR` v2 |
| Keyframes | typed `Keyframe<T>` + `AnimationTrack` |
| Effects | typed `EffectNode` with clip/track/scene/timeline scope |
| Masks | typed `MaskNode` |
| Audio waveform | `WaveformMetadata` attached to verified audio |
| Ripple editing | pure `rippleDelete()` transform |
| Captions | word-level `CompositionWordCue` and typed styles |
| Preview/editor UX | future ShortForge Studio product surface |
| Rust compositor | optional future backend; not canonical |
| WebAssembly | optional future preview target; not canonical |
| FFmpeg | deterministic physical encoder remains behind RenderFabric |
| Desktop GPUI | explicitly not adopted |
| Editor API | tracked as OpenCut roadmap; no runtime dependency |
| Plugin architecture | represented as future adapter extension point |
| MCP | roadmap only; no authority granted |
| Headless rendering | roadmap only; RenderFabric remains authoritative |
| Scripting | roadmap only; agents use ShortForge contracts |

## Time contract

CompositionIR uses integer MediaTime at 120,000 ticks/second and rational FrameRate values. The legacy TimelineIR remains compatible and can be upgraded using `upgradeTimelineIR()`.

This prevents a second timing authority from emerging.

## Non-goals

- No OpenCut fork.
- No OpenCut-owned project database.
- No OpenCut-owned governance.
- No OpenCut-selected compute provider.
- No production eligibility from the adapter alone.
- No claim that the current OpenCut rewrite exposes a live Editor API, MCP server, or headless execution surface.

## Admission boundary

`OpenCutAdapter.admission().productionEligible === false`

Any future production promotion requires:

1. live provider/backend proof;
2. deterministic composition conformance;
3. capability verification;
4. OKF admission;
5. RenderFabric/F07 end-to-end artifact proof.

## Architectural target

```
                 ShortForge CompositionIR
                           |
                    OpenCutAdapter
                           |
              +------------+------------+
              |                         |
        Editor/Preview             Future headless
              |                         |
              +------------+------------+
                           |
                    Render Contract
                           |
                     RenderFabric
                           |
                     ComputeRouter
                           |
                         F07
```
