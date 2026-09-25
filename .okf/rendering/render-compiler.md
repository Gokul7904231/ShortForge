# Rendering: Render Compilers & Codec Target Translation

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/timeline/TimelineIR.ts` & `apps/web/lib/rendering/`

---

## 1. Architectural Philosophy: The Render Compiler Pipeline

The bridge between high-level editorial composition and physical media encoding is the **Render Compiler**.

Rather than authoring raw FFmpeg shell scripts or hardcoding React Remotion components directly in agent prompts, FactoryOS compiles the engine-neutral `TimelineIR` into target-specific render bundles:
1. **Remotion Bundle Compiler**: Translates `TimelineIR` tracks into typed React props for Remotion compositions, generating dynamic component trees with CSS-in-JS styling, keyframe spring animations, and WebGL shader transitions.
2. **FFmpeg Filtergraph Compiler**: Translates `TimelineIR` into complex headless FFmpeg filtergraphs (`[0:v][1:v]overlay=...;[a0][a1]amix=...`), enabling low-latency CLI rendering on headless Linux containers without requiring a Chromium headless browser.
3. **Deterministic Seed Compilation**: Incorporates random seeds and asset digests to guarantee bit-for-bit reproducible encoding runs.

```
┌────────────────────────────────────────────────────────┐
│                      TimelineIR                        │
│      (Canvas: 1080x1920, Multi-Track Video & Audio)    │
└───────────────────────────┬────────────────────────────┘
                            │ Compiles
                            ▼
┌────────────────────────────────────────────────────────┐
│                     Render Compiler                    │
├───────────────────────────┬────────────────────────────┤
│  Target A: Remotion React │  Target B: Native FFmpeg   │
│  - React Component Tree   │  - Filtergraph Strings     │
│  - CSS Transition Styles  │  - Complex Audio Mixing    │
│  - Chromium Bundle Assets │  - Hardware NVENC Flags    │
└───────────────────────────┴────────────────────────────┘
                            │ Dispatches to
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Target GPU Worker                    │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Compilation Targets** | Remotion composition compiler and basic FFmpeg filtergraph builder | High-performance C++ MLT / GStreamer pipeline generator |
| **Animation Engine** | Remotion spring physics and CSS keyframes | GPU-native GLSL fragment shader graph compilation |
| **Reproducibility** | Deterministic frame extraction with fixed seed parameters | Fully hermetic containerized render sandbox with fixed system clock |

---

## 3. Compiler Invariants

- **Canvas Integrity**: The compiler must strictly enforce vertical $1080 \times 1920$ resolution output with 9:16 aspect ratio.
- **Audio Clamping**: Audio volumes across tracks are automatically normalized to target -14 LUFS to prevent clipping or distortion.
- **Time Quantization**: Clip boundaries are quantized to exact frame intervals (1/30s at 30fps) to eliminate fractional frame audio drift.


## 4. Selected engineering stack

The primary programmatic composition target is Remotion.

Compiler boundary: TimelineIR -> Remotion composition -> RenderFabric -> F07.

AgentTube-derived lifecycle mechanisms provide durable scene manifests, checkpoints, audio-first timing, scene-level repair, and CAS reuse.

FFmpeg remains the deterministic physical fallback.

No renderer may bypass TimelineIR semantics, capability authorization, or F07 verification.
