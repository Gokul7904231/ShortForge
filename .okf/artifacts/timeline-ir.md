# Artifacts: Timeline Intermediate Representation (TimelineIR)

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/timeline/TimelineIR.ts` & `apps/web/factoryos/core/timeline/`

---

## 1. Architectural Philosophy: The Engine-Neutral Composition Model

In automated video assembly, tying narrative composition directly to a specific rendering engine (such as Remotion React components or raw FFmpeg filtergraph command strings) creates severe architectural fragility:
1. Video rendering engines evolve rapidly and have vastly different performance profiles.
2. Direct engine coupling prevents static validation of composition errors (e.g., overlapping audio speech tracks or out-of-bounds text captions).
3. Agents cannot easily reason about complex imperative code as opposed to structured declarative schema.

FactoryOS solves this via **TimelineIR (Timeline Intermediate Representation)**—a strongly typed, engine-neutral Edit Decision List (EDL) designed specifically for vertical short-form video.

Floor 05 compiles upstream assets (Floor 03 visuals and Floor 04 speech) into a declarative `TimelineIR` document. Render compilers (Floor 06) translate this neutral IR into whatever target execution format is required (Remotion AST, FFmpeg filtergraph, or HTML5 canvas frames).

```
┌────────────────────────────────────────────────────────┐
│                   Floor 05 Composition                 │
│         (Synthesizes Multi-Track Composition)          │
└───────────────────────────┬────────────────────────────┘
                            │ Emits Canonical Schema
                            ▼
┌────────────────────────────────────────────────────────┐
│                      TimelineIR                        │
│  ├── Canvas: 1080x1920 @ 30fps, durationMs             │
│  ├── Tracks: Video, Speech Audio, Music, Captions      │
│  └── Clips: In/Out points, Transforms, Keyframes       │
└───────────────────────────┬────────────────────────────┘
                            │ Validates Schema & Layout
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Target Render Compilers              │
│  ├── Remotion React Compiler (Web / Node Render)       │
│  ├── Native FFmpeg Filtergraph Compiler (Headless GPU) │
│  └── Client-Side Preview Renderer (HTML5 Canvas)       │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Timeline Schema** | Strongly typed `TimelineIR` interface in `TimelineIR.ts` | OpenTimelineIO (OTIO) standard serialization alignment |
| **Canvas Constraints** | Strict vertical $1080 \times 1920$ resolution validation | Dynamic responsive canvas (9:16 vertical, 1:1 square, 16:9 horizontal) |
| **Track Support** | Video, Audio, Overlay, Subtitle/Caption tracks | Multi-layer 3D transform tracks with camera projection |
| **Audio-Visual Sync** | Millisecond-precision start/end bounds matching audio durations | Sub-frame sample-accurate audio phase alignment |
| **Compilation Targets** | Remotion composition compiler and deterministic mock compiler | Native C++ GPU rendering engine bypassing Node.js runtime entirely |

---

## 3. TimelineIR Schema Specification

Defined in `TimelineIR.ts`:

```typescript
export interface TimelineCanvas {
  readonly width: number;  // 1080
  readonly height: number; // 1920
  readonly fps: number;    // 30
  readonly durationMs: number;
}

export type TrackType = 'VIDEO' | 'AUDIO_VOICE' | 'AUDIO_MUSIC' | 'AUDIO_SFX' | 'CAPTIONS' | 'OVERLAY';

export interface TimelineClip {
  readonly id: string;
  readonly assetId: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly sourceInMs: number;
  readonly sourceDurationMs: number;
  readonly volume?: number;
  readonly transform?: {
    readonly scale?: number;
    readonly positionX?: number;
    readonly positionY?: number;
    readonly opacity?: number;
  };
}

export interface TimelineTrack {
  readonly id: string;
  readonly type: TrackType;
  readonly zIndex: number;
  readonly clips: readonly TimelineClip[];
}

export interface TimelineIR {
  readonly id: string;
  readonly canvas: TimelineCanvas;
  readonly tracks: readonly TimelineTrack[];
  readonly metadata: {
    readonly scriptId: string;
    readonly totalSpeechDurationMs: number;
    readonly traceContext: TraceContext;
  };
}
```

---

## 4. Canvas & Layout Invariants

Every `TimelineIR` document is validated against strict constraints before being accepted by Floor 06:
1. **Vertical Aspect Ratio**: Resolution must be exactly $1080 \times 1920$ (9:16 aspect ratio).
2. **Track Bounds Check**: No clip may start before $0\text{ms}$ or extend beyond `canvas.durationMs`.
3. **No Audio Collisions**: Clips on the `AUDIO_VOICE` track must not overlap in time (ensuring dialogue clarity).
4. **Caption Alignment**: Words on the `CAPTIONS` track must align with speech syllable timestamps from Floor 04 within a $\pm 50\text{ms}$ window.


## 5. Engineering-stack mapping

TimelineIR is the canonical semantic media graph.

Selected execution mapping:

~~~
TimelineIR
   |
Remotion compiler
   +-- React / Canvas / WebGL
   |
RenderFabric
   +-- local
   +-- remote
   +-- FFmpeg fallback
   |
physical artifact
   |
F07
~~~

AgentTube-derived scene lifecycle mechanisms complement TimelineIR through durable scene manifests, checkpoints, audio-first timing, CAS reuse, and selective repair.

The renderer never becomes the source of semantic truth.
