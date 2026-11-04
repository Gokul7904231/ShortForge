# ShortForge — Intelligent Visual Director & Component Registry Architecture

**Document Reference:** `docs/architecture/short-maker-visual-director.md`  
**Execution Date:** 2026-11-04  
**Author:** Agent 1 (Antigravity / Release Captain & SDLC Lead)  
**Governing Directive:** `docs/release/agent-packets/agent-1-instruction.md` (Iteration 2 — Section D)  
**Coordination Branch:** `docs/three-agent-production-speedrun-20261029`  
**Integrity Mode:** Clean-Room Architected (Deterministic Lowering, Renderer Profile Isolation)  

---

## 1. Architectural Vision & Scope

The ShortForge **Intelligent Visual Director** is the editorial and visual orchestration system that bridges high-level narrative content engines (Quiz, Facts, History) with ShortForge's physical video generation pipeline.

### Core Architecture Laws:
1. **Audio-Anchored Timeline Authority:** The visual layout is bound strictly to physical audio narration produced by `VoiceFabric.ts`. Scene duration is calculated from the frame ceiling at 30 fps; video never drifts from speech.
2. **Deterministic Native Lowering:** Visual Director plans are compiled into `TimelineIR` and lowered through `CompositionIR/F05` to `RenderFabric/F06` and the native Pillow compositor (`image.py`), muxed uniformly by `ffmpeg.py`.
3. **Renderer Profile Isolation:** External Remotion templates (such as RenderComp) remain strictly design/timing references (`REFERENCE_ONLY`). Remotion compositions for general/horizontal surfaces remain supported under `.okf` foundations via profile filtering (`remotion`), while mobile Shorts production utilizes the proposed native profile (`shorts-native`). Zero RenderComp runtime dependencies are admitted into production builds.
4. **Bounded Visual Repair:** Scene evaluation failures (e.g. text clipping, low contrast, entity mismatch) trigger targeted asset substitution or layout adjustments capped at **2 attempts**.

---

## 2. Five-Stage Visual Director Pipeline & Implementation Status

```text
[Narrative Script + Voice Audio]
                │
                ▼
┌────────────────────────────────────────────────────────┐
│ Stage 1: StorybeatParser [IMPLEMENTED - CONTRACT]      │
│ - Splits narrative into atomic semantic beats          │
│ - Extracts focal entities and factual claims           │
│ - Binds physical start/end timestamps from VoiceFabric │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ Stage 2: VisualBriefPlanner [IMPLEMENTED - CONTRACT]   │
│ - Defines shot types (establishing, medium, close-up)  │
│ - Sets camera motion (static, zoom-in, pan)            │
│ - Formulates multi-route queries and safe-area regions │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ Stage 3: MultiSignalMediaRanker [IMPLEMENTED - LOGIC]  │
│ - Queries Backblaze B2, local store, and open archives │
│ - Computes multi-signal score (semantic + entity +     │
│   resolution + license confidence)                     │
│ - Hard licensing gate rejects non-commercial assets    │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ Stage 4: ComponentRegistrySelector [IMPLEMENTED]       │
│ - Queries ComponentRegistry with renderer profiles     │
│ - Validates dimensions (1080x1920 30fps) and styling   │
│ - Manifest schema validation active [CONTRACT_TESTED]  │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ Stage 5: TimelineCompiler & VisualJudge [PLANNED - E]  │
│ - Compiles ScenePlans lowered into TimelineIR / F05    │
│ - Dispatches to RenderFabric / LocalRenderAdapter      │
│ - Evaluates contact sheets; executes bounded repair    │
│   (Gated pending owner .okf decision & PR #257 base)   │
└────────────────────────────────────────────────────────┘
```

### Subsystem Implementation & Qualification Ledger:

| Subsystem / Contract | File Reference | Status | Verification Evidence |
| :--- | :--- | :---: | :--- |
| **`Storybeat` Contract** | `apps/web/factoryos/core/visual-director/Storybeat.ts` | **IMPLEMENTED** | Frame ceiling math at 30fps, boundary zero-duration handling verified by 3 unit tests. |
| **`VisualBrief` Contract** | `apps/web/factoryos/core/visual-director/VisualBrief.ts` | **IMPLEMENTED** | 9:16 vertical safe area and multi-route search query generation verified by unit tests. |
| **`MediaCandidate` Ranker** | `apps/web/factoryos/core/visual-director/MediaCandidate.ts` | **IMPLEMENTED** | Hard commercial licensing gate and 4-signal composite ranking verified by 2 unit tests. |
| **`ComponentSelection` Contract** | `apps/web/factoryos/core/visual-director/ComponentSelection.ts` | **IMPLEMENTED** | Frame timing windows and editorial semantic justification verified by unit test. |
| **`VisualJudgeResult` Contract** | `apps/web/factoryos/core/visual-director/VisualJudgeResult.ts` | **IMPLEMENTED** | Automated contrast/clipping checks and bounded repair (max 2 attempts) verified by 2 unit tests. |
| **`ComponentRegistry` Engine** | `apps/web/factoryos/core/visual-director/ComponentRegistry.ts` | **IMPLEMENTED** | Renderer profile compatibility (`shorts-native`, `remotion`, `reference-only`), duplicate-ID detection, and invalid input validation verified by 3 unit tests. |
| **Component JSON Schema** | `assets/component-manifests/component-schema.json` | **IMPLEMENTED** | Formal Draft-07 schema covering profiles, dimensions, licensing, and inputs. |
| **Initial 4 Manifests** | `assets/component-manifests/*.json` | **CONTRACT_TESTED** | `card-glass-panel`, `badge-category-pill`, `progress-timer-bar`, `answer-emerald-punch` verified against schema. |
| **TimelineIR / F05 Lowering** | `TemplateProductionPipeline.ts` integration | **PLANNED (Track E)** | Deferred until `.okf` renderer decision is ratified and PR #257 integration base is resolved. |
| **RenderFabric / F06 Dispatch** | `LocalRenderAdapter.ts` integration | **PLANNED (Track E)** | Deferred to preserve strict boundary with PR #257. |
| **Physical Preview Rendering** | Contact sheet visual asset generation | **PLANNED (Track F)** | Deferred until Track E lowering is connected. |

---

## 3. Core Contract Specifications

The visual director contracts are established in `apps/web/factoryos/core/visual-director/`:

1. **`Storybeat.ts`**: Represents an audio-anchored semantic beat with transcript text, physical audio duration, focal entities, factual claims, and emotional tone.
2. **`VisualBrief.ts`**: Specifies shot type, camera motion, multi-route search queries, safe regions avoiding mobile Shorts UI hazards, and continuity tokens.
3. **`MediaCandidate.ts`**: Manages candidate media assets with visible multi-signal ranking (semantic match $0.35$, entity match $0.25$, resolution $0.15$, license confidence $0.25$) and fail-closed commercial rights filtering.
4. **`ComponentSelection.ts`**: Binds storybeats to qualified UI components from the registry with frame-level timing windows and editorial justification.
5. **`VisualJudgeResult.ts`**: Encapsulates automated post-render checks (text clipping, contrast ratio, visual-audio alignment, safe-area compliance) with bounded repair actions capped at 2 attempts.
6. **`ComponentRegistry.ts`**: Implements the canonical catalogue of UI components supporting explicit renderer profiles (`shorts-native`, `remotion`, `reference-only`), with strict qualification gating and FPS verification.

---

## 4. Scoped `.okf` Decision Proposal Draft

To formally resolve the architectural tension between `.okf` historical Remotion selections and the locked native-renderer mandate without altering global repository law unilaterally:

```markdown
# DEC-20261104-SHORTS-NATIVE-RENDER-ADAPTER

**Status:** PROPOSED AND UNRATIFIED (AWAITING OWNER DECISION)  
**Scope:** FactoryOS Mobile Shorts Production (9:16 portrait @ 1080x1920 30fps)  
**Governing Documents Affected:** `.okf/engineering-stack.md`, `.okf/decisions.md` (decision 526)  

## Context
ShortForge's canonical architecture previously selected Remotion as primary composition foundation and FFmpeg as physical fallback. However, mobile vertical Shorts (9:16 @ 1080x1920 30fps) operate under stringent commercial licensing constraints and container runtime overhead where native Python Pillow compositing (`image.py`) provides deterministic, local-first frame rendering with zero external licensing restrictions.

## Decision
1. Retain Remotion in `.okf` as an optional reference / prototyping sandbox (`REFERENCE_ONLY`).
2. Designate `factoryos-render` (Pillow `image.py` + FFmpeg `ffmpeg.py`) as the canonical, authoritative execution backend under `RenderFabric` for mobile Shorts production.
3. Prohibit Remotion packages from being bundled into production container images.
```

