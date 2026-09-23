# Hierarchy: The ReMaker Engine (`ReMakerEngine.ts`)

> **Tier**: Surgical Asset Reconstruction & Media Repair (Level 1)  
> **Instance Count**: Exactly ONE Factory-Wide ReMaker Engine  
> **Source Location**: `apps/web/factoryos/core/remaker/` & `apps/web/factoryos/core/timeline/TimelineIR.ts`

---

## 1. Architectural Philosophy: Surgical Compositional Repair

When a defect is detected in a rendered short-form video (such as a 100ms audio desync, a misspelled word in a caption track, or an unappealing image in Scene 3), re-running the entire 8-floor production pipeline from scratch is catastrophically wasteful: it consumes duplicate LLM tokens, re-runs TTS synthesis, risks generating a completely different script, and introduces new unpredictable defects.

The **ReMaker** specializes in surgical, deterministic reconstruction. By leveraging the engine-neutral `TimelineIR` blueprint produced during Floor 05, the ReMaker isolates the defective track or clip and triggers targeted re-execution:
1. **Recipe Preservation**: Preserves the exact compositional blueprint (timeline JSON, audio waveforms, subtitle offsets, scene durations).
2. **Surgical Sub-Task Execution**: Re-renders only the corrupted segment (e.g. regenerating misaligned subtitles or re-synthesizing a single speech line) without mutating unchanged tracks.
3. **Container Normalization**: Transcodes and normalizes pixel formats (YUV420p), audio sample rates (44.1kHz / 48kHz stereo), and vertical dimensions ($1080 \times 1920$).

```
┌────────────────────────────────────────────────────────┐
│                   Floor 07 Verification Defect         │
│          (e.g., Finding: Caption Misspelling on Track 3)│
└───────────────────────────┬────────────────────────────┘
                            │ Dispatches to ReMaker
                            ▼
┌────────────────────────────────────────────────────────┐
│                     ReMaker Engine                     │
│  ├── Load Canonical TimelineIR Blueprint               │
│  ├── Isolate Defective Track: CAPTIONS Clip #3         │
│  ├── Patch Text / Subtitle Timestamps                  │
│  └── Re-Compile Filtergraph / Remotion AST             │
└───────────────────────────┬────────────────────────────┘
                            │ Surgical Partial Render
                            ▼
┌────────────────────────────────────────────────────────┐
│                Re-Rendered Video Artifact              │
│       (Unchanged Video + Unchanged Audio + Fixed Text) │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Repair Granularity** | Track-level and segment-level re-rendering via `TimelineIR` | Frame-level differential re-encoding with motion vector reuse |
| **Blueprint Tracking** | Serialized `TimelineIR` JSON stored in mission artifact manifest | Versioned Git-like timeline commit tree with automated branching & merging |
| **Codec Normalization** | FFmpeg wrapper enforcing H.264 / AAC / YUV420p profiles | Hardware-accelerated NVENC / VideoToolbox batch normalizer |

---

## 3. ReMaker Invariants

- **Idempotent Patching**: ReMaker operations must preserve non-defective clip timestamps and asset hashes.
- **Trace Context Continuity**: Patched artifacts inherit the parent `traceId` and record a patch increment in their lineage manifest.
- **Verification Loop**: Any artifact patched by ReMaker must be re-evaluated by Floor 07 before publication.
