# ShortForge — Intelligent Visual Director & Component Library Baseline (Track A)

**Document Reference:** `docs/research/short-maker-intelligence-baseline.md`  
**Execution Date:** 2026-11-04 (Updated with PR #257 & Renderer Contradiction Audit)  
**Author:** Agent 1 (Antigravity / Release Captain & SDLC Lead)  
**Governing Directive:** `docs/release/agent-packets/agent-1-instruction.md` (Iteration 2 — Component Library + Intelligent Visual Director)  
**Coordination Branch:** `docs/three-agent-production-speedrun-20261029`  
**Integrity Mode:** Clean-Room Governed (Strict Verification, Zero Unproven Claims, Native-Renderer Locked)  

---

## 1. Executive Summary & Architectural Contradiction Notice

This baseline establishes the authoritative technical state of ShortForge for Iteration 2: **Component Library + Intelligent Visual Director**.

### CRITICAL GOVERNANCE ALERT: Renderer Architecture Contradiction
- **Status:** `CONTRADICTS LOCKED RULE`
- **Conflicting Rule References:**
  - `.okf/engineering-stack.md` (lines 48–52): *"Programmatic video composition: Remotion (primary), FFmpeg (deterministic fallback / muxing)"*
  - `.okf/decisions.md` (decision 526): *"Remotion is the selected primary programmatic composition foundation, subject to license verification."*
  - `.okf/index.md` & `.okf/research/external-repository-mappings.md`: Establishes Remotion as canonical composition architecture.
- **Iteration 2 Proposed Change:**
  - Prohibits Remotion production dependency and Remotion runtime packages.
  - Elevates the native Python Pillow/FFmpeg renderer (`image.py` + `ffmpeg.py`) to exclusive production authority.
- **Architecture Alternatives for Owner Decision:**
  1. **Alternative A (Formal .okf Law Amendment):** Adopt formal decision `DEC-20261104-NATIVE-RENDERER-AUTHORITY`, permanently superseding Remotion in production due to commercial licensing constraints and heavy Node.js rendering overhead, locking `factoryos-render` as canonical.
  2. **Alternative B (Dual-Track / Reference Boundary):** Retain Remotion in `.okf` solely as an external design reference / prototyping sandbox (`REFERENCE_ONLY`), while establishing `image.py` as the sole qualified production compiler for Shorts.
  3. **Alternative C (Revert to Remotion):** Revert native renderer mandates and implement Remotion production composition (violates Iteration 2 requirements).
- **Enforcement:** Agent 1 **will not** modify shared composition pipeline files (`TemplateProductionPipeline.ts`, `LocalRenderAdapter.ts`, `image.py`) until the owner formally decides between Alternative A and B.

---

## 2. Git & Worktree Topology

### 2.1 Agent 1 Implementation Worktree State
- **Worktree Path:** `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-agent1-sdlc`
- **Active Branch:** `feat/release-sdlc-spec-kit-20261029` (PR #255 baseline)
- **Base Ref:** `main` (`cf4cc2c9eae81e4e835a1c6ee8d7bc579868a6af`)
- **Current Head SHA:** `d027733598b1320c9bae8265b91831a6be828d64`
- **Local Working Tree Status (`git status --short`):**
  ```text
  ?? assets/
  ?? docs/research/short-maker-intelligence-baseline.md
  ```
  *(Track A baseline and Track B reference lock are created locally and untracked; zero modifications staged or committed to PR #255).*

### 2.2 Active Worktree Fleet
Verification of `git worktree list` confirms 12 active worktrees across the environment:

| Worktree Path | Branch / Ref | Assigned Agent / Role |
| :--- | :--- | :--- |
| `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-agent1-sdlc` | `feat/release-sdlc-spec-kit-20261029` | **Agent 1** (SDLC & Visual Director) |
| `C:/Users/ASUS/AppData/Local/Temp/opencode/agent3-coord` | `docs/three-agent-production-speedrun-20261029` | **Multi-Agent Coordination** (Shared 6-file packet exchange) |
| `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-agent2-distributed-render` | `agent2/distributed-render-20261029` | **Agent 2** (Distributed render, Kaggle, F06) |
| `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-verification-fabric` | `feat/production-acceptance-verification-fabric-20261031` | **PR #257 Source Worktree** (Wave 7 Acceptance) |
| `C:/Users/ASUS/OneDrive/Desktop/123/aishorts` | `maintenance/repository-hygiene-20261102` | **Primary Workspace** (Quiz V2 cinematic & Canva OAuth hybrid) |
| `C:/Users/ASUS/OneDrive/Desktop/123/pr242-qualify` | `feat/shortforge-editor-20261012` | Historical PR #242 qualification |
| `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-production-acceptance` | `feat/non-lightning-production-acceptance-20261030` | Non-Lightning production acceptance smoke suite |
| `C:/Users/ASUS/OneDrive/Desktop/123/ShortForge-quality-remediation` | `fix/creator-output-quality-wave7-1-20261031` | Quality remediation wave 7.1 |

---

## 3. Comprehensive File-Ownership & Multi-Agent Conflict Matrix

Inspected all active GitHub pull requests and agent branches, specifically auditing PR #257:

### 3.1 PR #257 Forensic Inspection
- **PR Ref:** `origin/pr/257` (fetched from `refs/pull/257/head`)
- **Branch:** `feat/production-acceptance-verification-fabric-20261031`
- **Head Commit:** `2d453fe2b82059505d2995c529db1039603fc383`
- **Commit Title:** `feature: complete end-to-end 60s and 180s production acceptance and forensic audit (wave 7)`
- **Key Overlapping Files Modified in PR #257:**
  - `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`
  - `apps/web/factoryos/core/voice/VoiceFabric.ts`
  - `apps/web/factoryos/core/render/LocalRenderAdapter.ts`
  - `apps/web/factoryos/core/contracts/DurationContract.ts`
  - `apps/web/factoryos/core/verification/VerificationEngine.ts`
  - `packages/factoryos-render/src/factoryos_render/backends/ffmpeg.py`
  - `apps/web/factoryos/tests/audio-timing-regression.test.ts`
  - `apps/web/factoryos/tests/duration-contract.test.ts`
  - `apps/web/factoryos/tests/verification-fabric.test.ts`

### 3.2 Multi-Agent Conflict & Boundary Matrix

| PR / Agent | Branch | Active File Boundaries | Conflict Status with Agent 1 Iteration 2 |
| :--- | :--- | :--- | :---: |
| **PR #253** | `fix/production-readiness-smoke-gates-20261029` | `engine-adapter.ts`, CI smoke gate workflows | **ZERO CONFLICT** |
| **PR #254** | `docs/three-agent-production-speedrun-20261029` | `docs/release/agent-packets/*` (coordination only) | **GOVERNED** (Agent 1 writes only to `agent-1-response.md`) |
| **PR #255** | `feat/release-sdlc-spec-kit-20261029` | `specs/001-release-readiness-gate/*`, `Team/reports/pr-255.json` | **STRICT BOUNDARY** (SDLC PR only; no Iteration 2 code) |
| **PR #256** | `feat/product-acceptance-20261029` | `JobStatusProjection.ts`, `durable-delivery.ts`, `api/library/*`, UI | **ZERO CONFLICT** |
| **PR #257** | `feat/production-acceptance-verification-fabric-20261031` | `TemplateProductionPipeline.ts`, `VoiceFabric.ts`, `LocalRenderAdapter.ts`, `DurationContract.ts`, `VerificationEngine.ts`, `ffmpeg.py` | **CRITICAL INTEGRATION OVERLAP** (Agent 1 prohibited from editing these 8 shared files) |
| **Agent 2** | `agent2/distributed-render-20261029` | `RenderFabric.ts`, `KaggleNotebookAdapter.ts`, `Floor03RuntimeAdapter.ts` | **ZERO CONFLICT** |
| **Agent 1 Iteration 2 (Proposed)** | Proposed: `feat/visual-director-iteration2` | `docs/research/*`, `docs/architecture/*`, `assets/component-sources/*`, `apps/web/factoryos/core/visual-director/*` | **ISOLATED NEW SUBSYSTEM** |

**Enforced Protocol:** PR #255 remains strictly scoped to Spec Kit release governance. A dedicated feature branch (`feat/visual-director-iteration2`) will be created for Iteration 2 once owner approval is granted. Zero changes will be pushed to PR #255 or the 8 shared integration files.

---

## 4. Comprehensive Asset-Tracking Policy & `.gitignore` Audit

Automated testing of `.gitignore` was executed across all media, vector, and manifest file types using `git check-ignore -v`:

| Path Probed | Ignore Status | Matching `.gitignore` Rule | Implication for Component Assets |
| :--- | :---: | :--- | :--- |
| `assets/test.svg` | **NOT IGNORED** | None | SVG icons (Lucide) are fully trackable in Git. |
| `assets/test.json` | **NOT IGNORED** | None | Component manifests and metadata are trackable. |
| `assets/test.png` | **IGNORED** | `.gitignore:76:*.png` | Raster previews **cannot** be tracked without un-ignore rules. |
| `assets/test.jpg` | **IGNORED** | `.gitignore:75:*.jpg` | Raster images **cannot** be tracked in Git. |
| `assets/test.mp4` | **IGNORED** | `.gitignore:73:*.mp4` | Media renders **cannot** be tracked in Git (belongs in CAS/B2). |
| `assets/component-previews/test.png` | **IGNORED** | `.gitignore:76:*.png` | Component preview PNGs require explicit un-ignore or CAS storage. |
| `assets/component-sources/SOURCES.lock.json` | **NOT IGNORED** | None | Source locks are tracked in Git. |

### Asset Architecture Strategy:
- **Git-Tracked Artifacts:** Manifests (`manifest.json`), source locks (`SOURCES.lock.json`), SVG vector icons, typed schemas, and TypeScript component classes.
- **CAS / B2 Stored Artifacts:** Rendered video clips (`*.mp4`), raster textures (`*.png`, `*.jpg`), and audio segments (`*.mp3`), referenced by SHA-256 content hashes.

---

## 5. Track B: Clean-Room Reference Source Licensing Audit

Three external reference repositories were acquired under `assets/component-sources/`. Licenses and use boundaries were audited:

### 5.1 RenderComp (`RenderComp/free-remotion-templates`)
- **Pinned Commit:** `f648980e528defb7594e24c6447055f0540f340b`
- **License:** MIT (`LICENSE` SHA-256: `5087261ea0f98e6bc9dbd768fab7e3422de493d901b8a614de6f31f8afcf43db`)
- **Critical License Boundary:** While RenderComp's repository is MIT-licensed, its templates import and require `@remotion/core`. Remotion AG enforces separate licensing terms for commercial use. 
- **ShortForge Enforcement:** RenderComp code is treated strictly as **`REFERENCE_ONLY`** for layout mathematics and motion curves. **Zero Remotion runtime code, imports, or packages will be introduced into ShortForge.**

### 5.2 dotLottie Web (`LottieFiles/dotlottie-web`)
- **Pinned Commit:** `2f3693a1d5b9d6936027bc892fa4f9d1cd16d2bb`
- **License:** MIT (`LICENSE` SHA-256: `779cec663b3c6590082566f2a000170d7a4d1a4bfc6f954e61efa4adddc652a8`)
- **Critical License Boundary:** The player runtime and tooling are MIT-licensed. However, community animations hosted on LottieFiles carry independent third-party licenses. A player license does not grant rights to community animations.
- **ShortForge Enforcement:** Treated as **`SCHEMA_AND_TOOLING_REFERENCE`**. Bulk scraping of the LottieFiles marketplace is prohibited. Any future animation admitted into the registry must carry independent provenance and commercial licensing clearance.

### 5.3 Lucide Icons (`lucide-icons/lucide`)
- **Pinned Commit:** `1980e3d59b0fa1a2aeb566d5902b25ee98204001`
- **License:** ISC (`LICENSE` SHA-256: `6fc5b7332939dd5c61af3a5f97450f7bc05d4a396dd0bc21ac341716b3b05096`)
- **ShortForge Enforcement:** **`ASSET_LIBRARY_QUALIFIED`**. SVG icon definitions may be compiled into vector badges and native drawing overlays, retaining the ISC attribution notice.

---

## 6. Safe Implementation Boundaries & Next Steps

Until the `.okf` renderer decision and PR #257 integration base are resolved, Agent 1 will strictly operate within the following bounded scope:
1. **Research Deliverable:** Author `docs/research/short-maker-intelligence-research.md` (WeVisCut, VideoDirectorGPT, VBench, multimodal ranking algorithms).
2. **Architecture Spec:** Author `docs/architecture/short-maker-visual-director.md` (Formalizing the 5-stage director pipeline).
3. **Standalone Contracts:** Implement isolated TypeScript interfaces in `apps/web/factoryos/core/visual-director/` (`VisualBrief.ts`, `Storybeat.ts`, `ComponentSelection.ts`, `MediaCandidate.ts`, `VisualJudgeResult.ts`).
4. **Component Registry Schemas:** Author JSON schemas and initial qualified component manifests under `assets/component-manifests/`.
5. **No Modifications to Shared Pipeline:** Zero changes to `TemplateProductionPipeline.ts`, `VoiceFabric.ts`, `LocalRenderAdapter.ts`, `RenderFabric.ts`, `VerificationEngine.ts`, or `image.py`.
