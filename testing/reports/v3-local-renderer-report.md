# FactoryOS V3 — Master Product & Local Render Engine Report
**Autonomous Video Production Factory: Template, Creative Systems & Local Render Architecture**

---

## 1. Executive Summary & North Star

FactoryOS V3 establishes the unified video production engine:
```text
FACTORYOS V3

ONE VIDEO PRODUCTION FACTORY
        +
MANY CONTENT ENGINES (11 Engines)
        +
MANY VERSIONED TEMPLATES (12 Canonical Definitions)
        +
REUSABLE SHOT RECIPES (24 Visual Primitives)
        +
FREE / OPEN PROVIDERS (Wikimedia, FlagCDN, SimpleIcons, Code, Charts)
        +
ONE LOCAL RENDER ENGINE (factoryos-render v0.1.0)
        +
REAL VERIFIED OUTPUT (Physical MP4s + F7 Hard Gates)
```

The core local rendering foundation is now fully operational as an installable Python package (`factoryos-render`), callable via a stable CLI, integrated into Node/TypeScript via `LocalRenderAdapter.ts`, equipped with a deterministic frame clock ($t = \text{frame} / \text{fps}$), audio-first physical timeline synchronization, durable stage checkpoints, and atomic output verification.

---

## 2. Research Assimilation & Provenance

### 2.1 AgentTube (`darkzOGx/youtube-automation-agent`)
- **Assimilated Capabilities**:
  - Local-first rendering as the zero-cost default path.
  - Per-segment narration timing (physical audio duration dictates visual timeline).
  - Persistent stage checkpoints with resumption from the first incomplete stage.
  - Durable scene manifests and scene-level repair (`render_scene(scene_id)` without re-rendering unchanged scenes).
  - Content-addressed artifact caching and capability awareness.
- **Implementation Location**: `packages/factoryos-render/src/factoryos_render/engine/`, `persistence/checkpoint_store.py`, `timing/audio_sync.py`.
- **Clean-Room Verification**: Zero source code copied; reimplemented natively in FactoryOS execution architecture.

### 2.2 HyperFrames (`heygen-com/hyperframes`)
- **Assimilated Capabilities**:
  - Deterministic frame seeking with canonical frame clock:
    $$t = \frac{\text{frame}}{\text{fps}}$$
  - Elimination of all wall-clock dependencies (`Date.now()`, `sleep()`, `performance.now()`) during frame composition.
  - FrameAdapter runtime abstraction answering: *"What should frame N look like?"*
- **Implementation Location**: `packages/factoryos-render/src/factoryos_render/timing/frame_clock.py`, `engine/frame_engine.py`.

---

## 3. Package Architecture: `factoryos-render` (v0.1.0)

Installed cleanly into Python 3.13 environment:
```bash
pip install -e packages/factoryos-render
```

### 3.1 Package Layout
```text
packages/factoryos-render/
├── pyproject.toml
├── README.md
├── src/factoryos_render/
│   ├── __init__.py
│   ├── api.py                      # High-level Python API (render, doctor)
│   ├── cli.py                      # CLI entrypoint
│   ├── version.py                  # v0.1.0
│   ├── contracts/
│   │   ├── render_intent.py        # RenderIntent, SceneIntent, ShotIntent
│   │   ├── composition.py          # CompositionIR, CompositionScene, CompositionShot
│   │   ├── receipt.py              # RenderReceipt, RenderValidationResult
│   │   └── checkpoint.py           # CheckpointState
│   ├── engine/
│   │   ├── frame_engine.py         # Deterministic frame evaluation at frame N
│   │   ├── scene_engine.py         # Isolated scene rendering & fast-path loop
│   │   └── renderer.py             # Main pipeline & atomic output commit
│   ├── backends/
│   │   ├── ffmpeg.py               # Discovery, raw pipe encoder, static loop, validator
│   │   └── image.py                # Pillow 9:16 vertical raster compositor
│   ├── timing/
│   │   ├── frame_clock.py          # Canonical clock t = frame/fps
│   │   └── audio_sync.py           # Physical audio duration extraction (ffprobe/wave)
│   ├── persistence/
│   │   └── checkpoint_store.py     # Checkpoint saving and resumption
│   ├── assets/
│   │   └── cache.py                # Content-addressed cache by input hash
│   ├── security/
│   │   └── paths.py                # Path sandboxing and path traversal rejection
│   ├── diagnostics/
│   │   └── doctor.py               # System health checks (Python, FFmpeg, codecs, disk)
│   └── adapters/
│       └── json_stdin.py           # Machine-readable JSON protocol for Node integration
└── tests/
    ├── test_contracts.py
    ├── test_frame_clock.py
    ├── test_checkpoint.py
    ├── test_cache.py
    └── test_security.py
```

---

## 4. Node / TypeScript Integration: `LocalRenderAdapter.ts`

Location: `apps/web/factoryos/core/render/LocalRenderAdapter.ts`

- **Protocol**: Direct JSON over `stdin` and `stdout` with zero shell interpolation.
- **Diagnostic Isolation**: Human-readable progress tags (`[RENDER_PROGRESS]`) stream to `stderr`.
- **Search Order**: `FACTORYOS_RENDER_BIN` $\to$ `FACTORYOS_RENDER_PYTHON` $\to$ system `factoryos-render` $\to$ `python -m factoryos_render.cli`.
- **Typed Receipt**: Returns full TypeScript `RenderReceipt` containing SHA-256, duration, dimensions, codecs, and physical validation results.

---

## 5. Canonical Template & Shot Recipe Foundation

### 5.1 Canonical Shot Recipe Library (24 Visual Primitives)
All recipes conform to strict 9:16 vertical safe areas (Top: 160px, Bottom: 320px, Left: 60px, Right: 120px) and typed semantic fallbacks:
1. `KINETIC_HOOK` (Explosive typography, subtle zoom, high energy)
2. `BIG_NUMBER` (Massive numerical metric with count-up animation)
3. `IMAGE_WITH_CAPTION` (Framed visual element with lower-third caption card)
4. `FULL_BLEED_IMAGE` (Edge-to-edge imagery with Ken Burns motion)
5. `FULL_BLEED_BROLL` (Dynamic looping ambient background video)
6. `QUOTE_CARD` (Inspirational / historical quotation with author attribution)
7. `STAT` (Comparative percentage or metric card)
8. `CODE_REVEAL` (Syntax highlighted code block with line focus)
9. `TERMINAL_SCREEN` (Dark terminal with command line output)
10. `MAP_ZOOM` (Geographic map with pin reveal)
11. `TIMELINE_BUILD` (Sequential milestone timeline node)
12. `HEADLINE_CARD` (Breaking news banner with publisher logo)
13. `SOURCE_CARD` (Research evidence and citation card)
14. `REDDIT_POST` (Pixel-accurate Reddit post card)
15. `REDDIT_COMMENT` (Threaded Reddit comment reaction)
16. `QUESTION_CARD` (Multiple choice trivia question card)
17. `ANSWER_REVEAL` (Celebration particle reveal card)
18. `COUNTDOWN` (Visual 3... 2... 1... circular countdown timer)
19. `FLAG_REVEAL` (National flag with country reveal)
20. `LOGO_REVEAL` (Brand logo resolution from blur/silhouette)
21. `PROGRESSIVE_CLUE` (Sequentially revealed clue list)
22. `CHART` (Deterministic animated bar / pie chart)
23. `AUDIO_WAVEFORM` (Reactive audio visualizer bars)
24. `OUTRO_CTA` (Closing call to action card)

### 5.2 Canonical Template Batch (12 Templates across all Content Engines)
1. `facts.rapid-facts.v1` (`FACTS` — Rapid Fire Facts, `READY`)
2. `history.timeline.v1` (`HISTORY` — Historical Timeline Documentary, `READY`)
3. `motivation.story-to-lesson.v1` (`MOTIVATION` — Story to Hard Lesson, `READY`)
4. `reddit.story.v1` (`REDDIT` — Native Reddit Viral Story, `READY`)
5. `news.why-it-matters.v1` (`NEWS` — Why It Matters Evidence Explainer, `READY`)
6. `coding.code-explainer.v1` (`CODING` — Syntax Highlighted Code Tutorial, `READY`)
7. `guess-flag.progressive-reveal.v1` (`GUESS_FLAG` — Guess the Flag Challenge, `READY`)
8. `guess-logo.blur-reveal.v1` (`GUESS_LOGO` — Guess the Brand Logo, `READY`)
9. `psychology.why-you-do-this.v1` (`PSYCHOLOGY` — Why You Do This Behavioral Insight, `READY`)
10. `quiz.trivia-challenge.v1` (`QUIZ` — 3-Question Rapid Trivia, `READY`)
11. `story.micro-horror.v1` (`STORY` — Micro Horror Twist, `READY`)
12. `quantum-trivia.science-mindbender.v1` (`QUANTUM_TRIVIA` — Quantum Paradox Mind-Bender, `READY`)

---

## 6. Verification & Test Evidence

### 6.1 Automated Test Suites Executed

| Test Suite | File | Tests Run | Result | Key Guarantees Verified |
| :--- | :--- | :--- | :--- | :--- |
| **Template Library Suite** | `testing/tests/template-library.test.ts` | 6/6 | **PASS** | 24 recipes validated, 12 templates conform to schema, 9:16 safe areas, legacy migration |
| **Provider Router Suite** | `testing/tests/template-provider.test.ts` | 5/5 | **PASS** | FlagCDN, SimpleIcons, Code, Chart, and Fallback adapters resolve with SHA-256 provenance |
| **Python Unit Tests** | `packages/factoryos-render/tests/` | 10/10 | **PASS** | Contracts, deterministic frame clock, checkpoint save/load, content cache, path sandboxing |
| **Node Adapter Suite** | `testing/tests/local-render-adapter.test.ts` | 3/3 | **PASS** | Node $\leftrightarrow$ Python health check, full 3-scene 9:16 render to physical MP4, error propagation |

### 6.2 Physical MP4 Artifacts Produced & Verified

1. **Artifact 1: `testing/artifacts/output_01_text.mp4`**
   - **Render Time (Cold)**: 3,256 ms (3.2 seconds)
   - **Render Time (Cached)**: 235 ms (3 cache hits)
   - **Resolution**: $1080 \times 1920$ (9:16 vertical)
   - **FPS**: 30
   - **Duration**: 6.52 seconds
   - **File Size**: 156,740 bytes
   - **Video Codec**: `h264 (High) (avc1)`
   - **Audio Stream**: AAC Stereo 192kbps
   - **SHA-256**: `b7eeb35453d10e32ad50ee07cee8d915836d0e11b9a0a4fce85b9d6a5d0f83f0`
   - **Validation Status**: `Valid: True`

2. **Artifact 2: `testing/artifacts/node_adapter_test_output.mp4`**
   - **Generated Via**: TypeScript `LocalRenderAdapter.getInstance().render()`
   - **Resolution**: $1080 \times 1920$
   - **FPS**: 30
   - **Duration**: 5.50 seconds
   - **File Size**: 136,888 bytes
   - **Video Codec**: `h264 (High)`
   - **Audio Stream**: AAC Stereo
   - **Validation Status**: `Valid: True`

### 6.3 System Health Diagnostics (`factoryos-render doctor`)
```text
=== FactoryOS Render Engine Diagnostics (v0.1.0) ===
OS: Windows (AMD64)
Python: 3.13.3 (C:\Users\ASUS\AppData\Local\Programs\Python\Python313\python.exe)
FFmpeg: ffmpeg version 8.1.2-full_build-www.gyan.dev
Pillow: 11.3.0
Disk: 31.64 GB available in current workspace

Checks:
  [PASS] python: Python >= 3.10 required
  [PASS] ffmpeg: System or bundled FFmpeg binary
  [PASS] pillow: Pillow 2D raster engine
  [PASS] videoCodec: H.264 video codec support
  [PASS] audioCodec: AAC audio codec support
  [PASS] diskSpace: 31.64 GB available in current workspace

Overall Health: OPERATIONAL
```

---

## 7. Next Steps & Production Pipeline Integration

1. Connect `LocalRenderAdapter.ts` directly into the F6 task step inside `apps/web/factoryos/core/rendering/` so production video generation jobs seamlessly route to `factoryos-render`.
2. Connect TTS voice synthesis outputs from F4 as input audio tracks into `SceneIntent.audio_track` for physical per-scene audio timing.
3. Feed physical MP4 receipts into the existing authoritative F7 Verification Judge (`verificationJudge.ts`) to maintain 100% compliance with FactoryOS truth gates.
