# Build the ShortForge Editor

**Research snapshot:** 12 October 2026  
**Implementation branch:** feat/shortforge-editor-20261012  
**Status:** Dedicated page/source-preview scaffold is on the branch. CI and end-to-end validation are pending. Export is intentionally locked.

## Decision

Build ShortForge's native editor page; don't embed Concat or OpenCut as the product, and don't build a second timeline engine. ShortForge already has CompositionIR, DurableEditor, ShortForgeEditorStudio, EditorRuntime, RenderFabric, CAS and F07. The main missing seam is preserving the exact editable source project when generation finishes and then safely connecting that source to the editor.

A flattened MP4 is final pixels plus mixed audio. It cannot reliably reconstruct question/answer fields, scene boundaries, independent captions, narration text, or asset dependencies. The current importer labels old videos FLATTENED_MP4 and allows clip-level editing only. Genuine quiz scene editing requires a source manifest written by the F05/F06 pipeline.

Keep export disabled until the server can stage and verify source assets on the selected worker, obtain authorized Treasury context, render through F06, store the output in CAS, physically probe the media and reconcile an independent F07 receipt.

## 1. Reuse current ShortForge systems

| Component | Decision |
|---|---|
| CompositionIR | Canonical edit semantics: integer media ticks, tracks/clips, audio/captions, transforms, effects, masks, transitions |
| DurableEditor | Only edit mutation service; use expected revision, typed command IDs, undo/redo/checkpoints |
| ShortForgeEditorStudio | Extend existing editor UI rather than rebuilding it |
| EditorRuntime | Lower CompositionIR and call physical preview/render logic behind server APIs |
| RenderFabric/F06 | Only production renderer |
| ContentAddressedStore (CAS) | Immutable media identity and digest verification |
| VerificationEngine/F07 | Independent physical media and release verification |
| ReMaker v2 | Potential surgical repair planner, but its decision says production admission is pending fresh CI/evidence |
| OpenCutAdapter | Existing experimental adapter; not production eligible in inspected readiness metadata |

### Important source gap

The generated VideoJob history does not guarantee a full, immutable CompositionIR/TimelineIR and per-scene/audio/caption source manifest. Do not infer source layers from the final MP4.

Follow-up trace: F05 already writes `timeline_<timeline_id>.timelineir.json`, computes a canonical fingerprint, and returns `canonical_timeline_ir_path` plus `canonical_timeline_ir_fingerprint` from `services/pipeline/floor05_timeline_composition/app/services/pipeline.py`. The missing integration is a portable CAS-backed source package and linkage into F06/job history—not the invention of a new timeline model.

The inspected F05 bridge (`services/pipeline/floor05_timeline_composition/app/services/timeline_ir_bridge.py`) drops editor semantics: it hardcodes `compositionType=FACTS_SHORTS`, every visual `assetType=IMAGE`, omits `scene_id`, `source_asset_version`, trims and transitions, emits empty word cues and default caption styles. The handoff path/fingerprint is a service-local reference and is not bound as an editor-owned CAS package by the inspected web F06 job-manifest write.

P0 follow-up: preserve the F05 artifact/fingerprint as an immutable CAS-backed source package, fix the bridge to retain scene IDs, media kinds/versions, trims, transitions, real caption cues and content type, propagate the package ID/digest into F06/job history, and add F05→F06→Editor contract tests for portability, integrity and semantic round-trip. The editor must load this package rather than reverse engineer the flattened MP4.

### Important export gap

EditorRuntime.export() exists, but a safe production export endpoint and remote-worker source staging are not yet connected in the inspected path. A local CAS path cannot be assumed visible to distributed workers. Before export: stage inputs; verify worker-side hashes; use server-owned Treasury/F07 context; execute F06; probe the encoded MP4; write output to CAS; verify F07 receipt for that exact digest. Download becomes available only after reconciliation.

## 2. Repository and research audit

### Concat
Sources: [repository](https://github.com/jub0t/concat), [architecture](https://github.com/jub0t/Concat/blob/main/ARCHITECTURE.md), [11 October audit](https://github.com/jub0t/concat/blob/main/audit/AUDIT-2026-10-11.md). License: AGPL-3.0-or-later.

Useful patterns: Rust engine independent from UI, command-based document edits/undo, frame-plan lowering and a shared preview/export compositor. But the inspected architecture says the advertised MCP transport is absent in that tree; JSON-RPC/gRPC are the transports described as implemented. Its 11 October audit reports CI red due to a Windows test timeout. Treat it as a research/adapter candidate, not a production dependency yet. Do not copy/embed AGPL code into a hosted product until obligations and deployment model receive a deliberate review.

### OpenCut
Sources: [current rewrite](https://github.com/OpenCut-app/OpenCut), [archived classic](https://github.com/opencut-app/opencut-classic). The rewrite advertises MIT.

The README says Editor API, plugin system, shared Rust core, MCP, headless and scripting support are planned; classic is archived. Adopt separation and extension ideas, but don't rely on planned APIs as if they were stable. ShortForge already has an experimental adapter, not a production-qualified route.

### OpenTimelineIO
Sources: [repository](https://github.com/AcademySoftwareFoundation/OpenTimelineIO), [docs](https://opentimelineio.readthedocs.io/).

OTIO represents editorial tracks, clips, gaps, time ranges and media references. It is an interchange layer, not a renderer or media container. Use optional import/export with round-trip and loss reports. CompositionIR remains canonical; never silently drop quiz semantics, word cues, provenance, rights, masks or unsupported effects.

### Unified Agentic Video Editing
Paper: [arXiv:2609.12769](https://arxiv.org/abs/2609.12769), published 11 September 2026.

Adopt structured intermediate editorial intent, explicit constraints, hierarchical planning and evaluation for scene previews, summaries and more creative edits. Model output must become a typed bounded proposal, not unrestricted tool access.

### FairArena Video
Source: [repository](https://github.com/FairArena/fairarena-video), which advertises MIT.

Its README describes a React/TypeScript browser editor with WebCodecs/WebGPU, tracks, keyframes, waveform/audio effects, history/autosave, frame cache and workers. Use it as a web-editor performance reference; inspect actual code, dependencies, license notices and browser tests before any adoption. Browser codecs are an optional fast path, never the authoritative final render.

### ComfyUI
Source: [repository](https://github.com/Comfy-Org/ComfyUI).

Adopt graph-based dirty-node propagation and full-input cache identity: caption styling should not regenerate imagery or voice; narration changes may invalidate audio, word cues and downstream timing. Cache by canonical inputs and source hashes, not filename alone.

### Remotion
Sources: [repository](https://github.com/remotion-dev/remotion), [license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), [license details](https://www.remotion.pro/license).

Useful reference for frame-driven React compositions. Verify current company-size and automated-video-product terms before selecting as a dependency. Do not create a second timeline authority.

### AgenticVBench
Source: [repository](https://github.com/PhiloLabs/agentic-vbench). Its README describes 100 post-production tasks across assembly, repair, sequencing and repurpose, mixing programmatic verifiers with rubric-based judges. Adopt this evaluation split for ShortForge.

### C2PA, CapCut and Kdenlive
C2PA 2.4 (April 2026): [official specification](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html). Could add portable provenance/AI disclosure later but cannot replace CAS/F07.

Use CapCut's [keyframes](https://www.capcut.com/tools/keyframe-animation), [captions](https://www.capcut.com/tools/auto-caption-generator), [background removal](https://www.capcut.com/tools/video-background-remover), [effects](https://www.capcut.com/tools/video-effect-and-filter) and [Kdenlive docs](https://docs.kdenlive.org/en/) as feature inventories only. Do not copy proprietary assets/UI/source or transplant GPL desktop code without an explicit license review.

## 3. Feature disposition: adopt / adapt / exclude

| Feature | Decision | Rule |
|---|---|---|
| Pencil -> dedicated editor page, video/preview monitor, undo/redo/history | Adopt P0 | First creator-facing workflow |
| Open exact generated source project | Adopt P0 blocker | Requires source manifest; do not fabricate scene layers |
| Clip trim/split/move, transforms, keyframes, masks/transitions | Adopt/adapt P0/P1 | Reuse typed model; test each render-lowered operation |
| Quiz question/options/answer reveal; replace one scene visual | Adopt after source manifest | Needs semantic fields, stable IDs and dependencies |
| Caption editing and word timing | Adopt P0/P1 | Styling shouldn't rerun voice |
| Narration regeneration and music/SFX mix | Adapt P1 | Measure actual audio duration and re-align dependent captions |
| Auto captions/translation | Adapt P1 | Qualified ASR/alignment; preserve human corrections |
| Dependency-aware minimal scene rebuild | Adopt P1 | Content-addressed inputs and preservation proof |
| Natural-language agent and A/B variants | Adapt P1/P2 | Typed plan, impact/cost bounds and user approval |
| Background cutout, LUTs, grading, advanced effects | Defer P2 | Opt-in and allowlisted; assess cost/performance |
| OTIO interchange; WebCodecs/WebGPU | Adapt P2 | Loss-aware import/export; browser acceleration only |
| Arbitrary plugins/scripts/shaders | Exclude P0 | Code execution and supply-chain risk |
| Frame-level differential re-encoding | Exclude production P0/P1 | Codec/keyframe safety not qualified |
| Mutating MP4 as source of truth; auto-publish; bypass Guardian/Treasury/F07 | Exclude | Breaks editability or release authority |

License rule: reuse patterns, not whole applications. Concat is AGPL-3.0-or-later; OpenCut/FairArena advertise MIT; Remotion has specific commercial/automation terms. Review all direct/transitive licenses before shipping.

## 4. Target user flow and architecture

Route: /factory/editor?jobId=<encoded-job-id>. Add Edit Short to the generation READY panel and Edit to Media Library.

Page layout: header with source/revision/checkpoint status; center source video and physically rendered preview; simple scene cards and inspector first; advanced multi-track timeline on demand; undo/redo and revision history. A flattened import must clearly say **“Flattened source — clip-level editing only.”** Do not show fake semantic scene/question/caption layers.

Architecture:

    Generation READY / Media Library
      -> Editor Source API: auth, ownership, media probe, source digest
      -> CompositionIR + DurableEditor revision commands
      -> Edit Intent Compiler: natural language -> typed bounded proposal
      -> Dependency planner and cache invalidation
      -> ReMaker only after production admission
      -> RenderFabric/F06 with CAS inputs staged and checked on worker
      -> output CAS + physical MP4 probe/decode/sync
      -> independent F07 receipt
      -> verified download; publishing remains a separate explicit action

Authority rules: CompositionIR is semantic truth; DurableEditor owns revisions; LLM only proposes commands; Treasury owns budget admission; F06 owns physical render; F07 independently verifies the exact output digest.

### Proposed source and edit contracts

Version the future source package as shortforge.editor-source.v1. Store owner/job ID, composition CAS URI/hash, timeline fingerprint, source asset IDs/roles/scene IDs/URIs/hashes/byte lengths/MIME, rights/provenance and parent artifact IDs. F05 creates it; F06/job history reference the immutable manifest.

A conceptual edit intent identifies the exact parent composition hash and expected revision, a target scene, an operation, a preservation list, bounded attempt/time budget and whether approval is required. The current EditorCommand set does not yet include every quiz-semantic command; add question/option/answer/narration/scene-asset commands only after source persistence and dependency rules are implemented.

## 5. Security and smart rendering

1. Recheck session/write role, job owner, persisted source owner and source-manifest binding every time. Guessed IDs are not permission.
2. Browser source references must be authorized CAS URIs, not arbitrary filesystem paths or URLs. Hash the actual bytes before render lowering.
3. Every mutation uses actor, expected revision and idempotent command ID; reject stale documents.
4. Cache on canonical scene structure, hashes, timings, narration, word cues, transforms/effects and renderer version. Never use filename alone.
5. Recompute affected dependency nodes only; narration changes can affect captions and scene timing, while global style may affect all scenes.
6. Keep prior assets/renders immutable and record parent lineage.
7. Enforce Treasury, bounded retries, cancellation, lease/fencing and worker resource budgets.
8. No arbitrary browser shader/plugin/shell execution.
9. Probe/decode actual encoded media, reconcile the CAS digest and require F07 before release.
10. C2PA is an optional later provenance layer—not CAS or F07 replacement.

## 6. Acceptance tests and gates

- Both Edit entry points route to the dedicated page with correct job ID.
- Missing/failed/processing/foreign jobs fail safely without leaking another user's data.
- MP4 is real, nonempty, decodable, 1080x1920, codec/audio valid, <=180 seconds, sync drift <=1 second; oversize/bad media rejected.
- Flattened import is one clip and labelled; it never invents separate scene layers.
- Owner and CAS bytes are re-checked; tampering fails closed.
- Undo/redo/checkpoint/stale revision behaves correctly.
- Preview result is physically rendered, not a placeholder.
- Before enabling export: F05 manifest, worker asset staging, Treasury admission, F06 output CAS, physical verification and signed F07 receipt all pass.
- The actual changed-node set matches target/preserve rules. Evaluate readability, factual correctness, pacing and narration alignment separately from deterministic technical checks.

## 7. Roadmap and branch state

1. **Phase 0 — current branch:** page, READY/library Edit actions, safe flattened MP4 source import, real video/preview monitor, owner-bound CAS source restrictions and CAS tamper regression test. CI/browser validation pending.
2. **Phase 1 — P0 blocker:** F05 source manifest with exact quiz/scene/audio/caption/assets and lineage; editor opens a truly editable project.
3. **Phase 2 — P0 export:** source staging, Treasury, F06, output CAS, media probe, F07 receipt and download URL.
4. **Phase 3 — P1 editing:** semantic quiz commands, impact planning, minimal scene rerender and preservation proof.
5. **Phase 4 — P1/P2 AI capabilities:** typed natural-language plans, variants, captions/audio tools, optional OTIO/C2PA.
6. **Phase 5 — hardening:** authorization/SSRF/replay/budget/race tests, browser performance, accessibility and staged rollout.

| Deliverable | Status |
|---|---|
| Dedicated page + generation/library Edit action | Implemented on branch |
| Authenticated source import + physical checks + CAS registration | Implemented; runtime validation pending |
| Owner/source-CAS restrictions | Implemented; tests/CI pending |
| Real source video and physical preview monitor | Implemented; browser E2E pending |
| CAS digest/tamper regression test | Added; not run in this environment |
| Per-scene source manifest | Not done; P0 next milestone |
| Semantic quiz editing commands | Not done; needs source manifest |
| Secure export, worker staging, Treasury/F06/F07 integration | Not done; export locked |
| CI/production qualification | Pending; no passing test claim |

## Primary references

- ShortForge: https://github.com/Gokul7904231/ShortForge
- CompositionIR: https://github.com/Gokul7904231/ShortForge/blob/main/apps/web/factoryos/core/timeline/CompositionIR.ts
- EditorRuntime: https://github.com/Gokul7904231/ShortForge/blob/main/apps/web/factoryos/core/editor/EditorRuntime.ts
- DurableEditor: https://github.com/Gokul7904231/ShortForge/blob/main/apps/web/factoryos/core/editor/DurableEditor.ts
- RenderFabric: https://github.com/Gokul7904231/ShortForge/blob/main/apps/web/factoryos/core/fabric/RenderFabric.ts
- ReMaker v2: https://github.com/Gokul7904231/ShortForge/blob/main/.okf/decisions/remaker-v2-20261002.md
- Concat: https://github.com/jub0t/concat
- OpenCut: https://github.com/OpenCut-app/OpenCut
- OpenTimelineIO: https://github.com/AcademySoftwareFoundation/OpenTimelineIO
- FairArena Video: https://github.com/FairArena/fairarena-video
- ComfyUI: https://github.com/Comfy-Org/ComfyUI
- Remotion: https://github.com/remotion-dev/remotion
- Unified Agentic Video Editing: https://arxiv.org/abs/2609.12769
- AgenticVBench: https://github.com/PhiloLabs/agentic-vbench
- C2PA 2.4: https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html

## Final recommendation

Build ShortForge's editor around CompositionIR and DurableEditor, preserving F06/F07 as non-negotiable render and release boundaries. Learn from the external editors but do not make an unqualified dependency the semantic or release authority. This branch provides a safe page/preview scaffold for old flattened renders. The most important next milestone is F05 source-manifest persistence: that is what unlocks editing a single quiz question or scene. Keep export locked until source staging, Treasury, F06 and F07 pass end to end.
