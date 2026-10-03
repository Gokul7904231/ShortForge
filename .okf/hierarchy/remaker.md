# Hierarchy: The ReMaker Engine (`ReMakerEngine.ts`)

> **Tier**: Surgical Asset Reconstruction & Media Repair (Level 1)  
> **Instance Count**: Exactly ONE Factory-Wide ReMaker Engine  
> **Source Location**: `apps/web/factoryos/core/remaker/` & `apps/web/factoryos/core/timeline/TimelineIR.ts`  
> **Runtime Status (2026-10-02)**: ReMaker v2 contracts, impact planning, Guardian capability admission, lease/fencing binding, and RenderFabric integration are implemented on this branch. Fresh CI admission is still required before mainline promotion. Physical execution remains on the existing RenderFabric → Compute Fabric path.

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
| **Repair Granularity** | Scene/track/segment surgical planning + forced scene-local re-render | Frame-level differential re-encoding with codec/motion-vector reuse (experimental) |
| **Blueprint Tracking** | TimelineIR digest + immutable parent artifact + deterministic idempotency key | Versioned Git-like timeline commit tree with automated branching & merging |
| **Codec Normalization** | FFmpeg wrapper enforcing H.264 / AAC / YUV420p profiles | Hardware-accelerated NVENC / VideoToolbox batch normalizer |

---

## 3. ReMaker Invariants

- **Idempotent Patching**: ReMaker operations must preserve non-defective clip timestamps and asset hashes.
- **Trace Context Continuity**: Patched artifacts inherit the parent `traceId` and record a patch increment in their lineage manifest.
- **Verification Loop**: Any artifact patched by ReMaker must be re-evaluated by Floor 07 before publication.


## ReMaker v2 — current engineering contract

ReMaker is a surgical repair coordinator. It does not own a second renderer and it never certifies its own repair.

Activation requires:
- an F07 remediation case with an explicit concrete target;
- a CAS-bound parent artifact and matching TimelineIR digest;
- a short-lived CAP_REMAKER_REPAIR grant with fencing token;
- an allowlisted repair action and bounded repair budget.

Execution is:
F07 finding -> ReMaker impact analysis -> repair plan -> RenderFabric/Compute Fabric -> immutable candidate -> CAS/lineage receipt -> F07 re-verification.

A surgical plan must name the affected TimelineIR nodes. Unchanged nodes are preserved. The physical renderer can bypass cached artifacts only for the explicitly forced repair scenes; unrelated scenes stay cache-backed.

ReMaker stops on success, authorization expiry, fencing failure, stale/invalid parent, no progress, execution failure, or budget exhaustion.



## 4. ReMaker v2 operational admission

The executable admission chain is:

`F07 remediation case -> ReMakerHandoff -> Guardian authorizeReMakerRepair -> CapabilityRegistry/CAP_REMAKER_REPAIR -> LeaseManager fencing -> ReMakerEngine -> RenderFabric -> physical artifact -> F07 re-verification`

The Guardian grant is short-lived and lease-bound. The RenderFabric adapter requires an explicit LeaseManager; there is no implicit in-memory lease fallback for production wiring.

## 5. Ascalon training boundary

ReMaker is represented in the canonical Ascalon capability ontology and trajectory validator. Training examples are eligible only when the trajectory proves authorization, fencing, parent artifact lineage, preservation evidence, physical render evidence, and independent F07 verification. Synthetic curriculum data must remain explicitly marked simulation/synthetic.

No ReMaker training example is authoritative merely because ReMaker reported success. The F07 evidence boundary remains mandatory.

## 6. Promotion state

Current state: **IMPLEMENTED / DOCUMENTED / TRAINING-CURRICULUM READY / PENDING CURRENT CI ADMISSION**.

Mainline promotion is blocked until the dedicated ReMaker validation and required repository, governance, compute, security, F04/F05/F06/F07 gates are green.
