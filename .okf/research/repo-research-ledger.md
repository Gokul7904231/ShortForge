# Open-Source Repository Research & Provenance Ledger
**ShortForge / FactoryOS Frontier v3 Second-Wave Assimilation**

## Governance Invariant
> **Strict Clean-Room Assimilation Rule**:
> No third-party repository code, test suites, prompts, or proprietary assets were copied into the ShortForge codebase.
> All assimilated capabilities were independently reimplemented from first principles using clean-room interfaces, strongly typed contracts, and architectural reference isolation.
> AGPL / restrictive licensed repositories are isolated behind network boundary adapters or reference patterns only.

---

## Assimilated Repositories Matrix

| Repository | Upstream Ref / Version | Upstream License | Capability Provided | Adoption Mode | Implementation Location | Provenance Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Lightpanda** (`lightpanda-io/browser`) | `v0.2.x` / Commit `c8d19a2` | AGPL-3.0 | Machine Browser for AI agents; low-memory execution | **Clean-Room Adapter Pattern** (Network API Boundary; zero AGPL code embedded) | `apps/web/factoryos/core/research/LightpandaBrowserAdapter.ts` | **ISOLATED_ADAPTER** |
| **Academic Research Skills** (`academic-research-skills`) | `v1.1.0` / Commit `e74f1b0` | MIT | Deep fact verification, citation chaining, claim classification | **Clean-Room TypeScript Implementation** | `apps/web/factoryos/core/research/ResearchRuntime.ts`, `apps/web/factoryos/core/contracts/ResearchPassportContracts.ts` | **INDEPENDENT_REIMPLEMENTATION** |
| **Voice Studio** (`voice-studio-ref`) | `v2.0` / Commit `4a9b31d` | MIT | Multi-engine voice fallback, preflight benchmarking, audio normalization | **Clean-Room TypeScript Implementation** | `apps/web/factoryos/core/voice/VoiceFabric.ts` | **INDEPENDENT_REIMPLEMENTATION** |
| **HyperFrames** (`hyperframes-canvas`) | `v0.9.4` / Commit `b512df8` | MIT | HTML/CSS/SVG kinetic canvas rendering, word-level subtitle keyframes | **Clean-Room Compiler Interface** | `apps/web/factoryos/core/rendering/RenderFabric.ts`, `apps/web/factoryos/core/contracts/RenderIntentContracts.ts` | **INDEPENDENT_REIMPLEMENTATION** |
| **Camofox** (`camofox-browser`) | `v1.0.1` | Apache-2.0 | Anti-fingerprinting egress proxy configuration | **Architecture Reference Only** | `apps/web/factoryos/core/research/ReachSubsystem.ts` | **REFERENCE_ONLY** |
| **OpenMAIC** (`openmaic-orchestrator`) | `v0.3.0` | Apache-2.0 | Multi-agent interactive conversation graphs | **Architecture Reference Only** | `apps/web/factoryos/core/overseer/OverseerControlPlane.ts` | **REFERENCE_ONLY** |
| **OpenViking** (`openviking-agent`) | `v0.8.0` | MIT | Context bounding and window pruning (`RETRIEVE -> FILTER -> BOUND`) | **Clean-Room TypeScript Implementation** | `apps/web/factoryos/core/memory/ContextOS.ts` | **INDEPENDENT_REIMPLEMENTATION** |
| **Archify** (`tt-a1i/archify`) | `main` | MIT | Typed IR, evidence receipts, interaction-oriented inspection, Explain Edge | **Clean-Room Reimplementation & Pattern Extraction** | `testing/graphs/visual/` (`InteractionIR.ts`, `EdgeExplanationResolver.ts`, resolvers, receipts) | **CLEAN_ROOM_REIMPLEMENTATION** |
| **AgentEvals** (`langchain-ai/agentevals`) | `main` | MIT | Multi-mode trajectory matching (strict, unordered, graph-aware) | **Pattern Extraction** | `testing/oracles/TrajectoryOracle.ts`, `.okf/research/repo-mappings/langchain-ai-agentevals.md` | **PATTERN_EXTRACTION** |
| **OpenAI Evals** (`openai/evals`) | `main` | MIT | Repeatable datasets, deterministic graders, evaluation reports | **Pattern Extraction** | `testing/contracts/mission.contract.ts`, `testing/judges/`, `.okf/research/repo-mappings/openai-evals.md` | **PATTERN_EXTRACTION** |
| **Temporal SDK** (`temporalio/sdk-typescript`) | `v1.11.x` | MIT | Durable execution history, snapshotting, replay determinism | **Pattern Extraction** | `testing/replay/MissionHistory.ts`, `.okf/research/repo-mappings/temporalio-sdk-typescript.md` | **PATTERN_EXTRACTION** |
| **OpenHands Benchmarks** (`OpenHands/benchmarks`) | `main` | MIT | Long-horizon real-world task evaluation methodologies | **Pattern Extraction** | `testing/oracles/GoalOracle.ts`, `testing/oracles/EfficiencyOracle.ts`, `.okf/research/repo-mappings/openhands-benchmarks.md` | **PATTERN_EXTRACTION** |
| **BrowserGym** (`ServiceNow/BrowserGym`) | `v0.3.x` | Apache-2.0 | Standardized browser task environment architectures | **Architecture Reference Only** | `testing/suites/browser/`, `.okf/research/repo-mappings/servicenow-browsergym.md` | **RESEARCH_ONLY** |
| **i-have-adhd** (`ayghri/i-have-adhd`) | `main` | MIT | Action-first prompting, bounded steps, tangential suppression | **Pattern Extraction** | `.agents/rules/i-have-adhd-discipline.md`, `testing/model/SituationRecord.ts` | **PATTERN_EXTRACTION** |
| **Diagram Design** (`cathrynlavery/diagram-design`) | `main` | MIT | Progressive disclosure, semantic navigation stack, complexity budgets, accessible tokens | **Pattern Extraction** | `testing/graphs/visual/` (`GraphNavigationState.ts`, `CyclePresentationPlanner.ts`, tokens) | **PATTERN_EXTRACTION** |
| **ECC** (`affaan-m/ECC`) | `main` | MIT | Agentic engineering workflow, skills/rules/hooks separation | **Pattern Extraction** | `.agents/skills/`, `.agents/rules/`, `.agents/workflows/` | **PATTERN_EXTRACTION** |
| **MarkItDown** (`microsoft/markitdown`) | `v0.0.1a4` | MIT | Multi-format document normalization boundary | **Isolated Provider / Interface** | `apps/web/factoryos/core/research/DocumentNormalizer.ts` | **ISOLATED_PROVIDER** |
| **Chrome DevTools MCP** (`ChromeDevTools/chrome-devtools-mcp`) | `v0.1.x` | Apache-2.0 | Development & browser testing inspection via CDP | **Isolated Development Provider** | `testing/runtime/ChromeDevToolsClient.ts`, `.agents/docs/mcp-chrome-devtools.md` | **ISOLATED_PROVIDER** |
| **Zstandard** (`facebook/zstd`) | `v1.5.6` | BSD-3-Clause | Fast history & telemetry compression interface | **Architecture Reference / Interface** | `apps/web/factoryos/core/database/HistoryCompressionProvider.ts` | **REFERENCE_ONLY** |
| **Remotion** (`remotion-dev/remotion`) | main / current | Source-available / Remotion License | Programmatic React video composition, frame-based timing, Canvas/WebGL, render APIs | PRIMARY ENGINEERING STACK / LICENSE-GATED DEPENDENCY | apps/web/factoryos/core/timeline/, .okf/engineering-stack.md | STACK_SELECTED |
| **AgentTube** (`darkzOGx/youtube-automation-agent`) | `main` / 2026 | MIT | Local-first rendering, persistent checkpoints, scene manifests, scene-level repair, audio-first timing | **Clean-Room Reimplementation & Pattern Extraction** | `packages/factoryos-render/` (`FrameEngine`, `SceneEngine`, `CheckpointStore`, `AudioSync`) | **CLEAN_ROOM_REIMPLEMENTATION** |
| **HyperFrames Frame Clock** (`heygen-com/hyperframes`) | `v0.9.x` | MIT | Deterministic frame clock ($t = \text{frame}/\text{fps}$), frame adapter interface, zero wall-clock dependency | **Clean-Room Reimplementation** | `packages/factoryos-render/src/factoryos_render/timing/frame_clock.py` | **CLEAN_ROOM_REIMPLEMENTATION** |
| **Simple Icons & FlagCDN** (`simple-icons`, `flagcdn`) | `v11.x` | CC0-1.0 / Public Domain | Vector brand logos and ISO-3166 high-res national flags | **Free/Open Provider Adapters** | `testing/templates/providers/ProviderRouter.ts`, `apps/web/lib/templates/providers/` | **FREE_OPEN_ADAPTER** |

---

## Detailed Isolation Verification

### 1. Lightpanda Machine Browser (`AGPL-3.0`)
- **Risk Mitigation**: AGPL code cannot be linked or bundled into production distribution without triggering copyleft conditions.
- **Architectural Solution**: `LightpandaBrowserAdapter` treats Lightpanda as an external standalone containerized service communicating strictly via HTTP JSON-RPC over `LIGHTPANDA_ENDPOINT`.
- **Fallbacks**: If Lightpanda daemon is unreachable, the adapter transparently falls back to in-memory clean-room DOM parsing without crashing the `ReachSubsystem`.

### 2. Multi-Engine Voice Fabric
- **Upstream Pattern**: Voice Studio multi-engine fallback chains.
- **Implementation**: Built `VoiceFabric` with zero external dependencies, supporting Google Gemini TTS, ElevenLabs, Edge TTS, and an unconditional `SILENT_WAV_FALLBACK` generating valid PCM WAV headers in-memory.
- **Licensing**: 100% native ShortForge code.

### 3. HyperFrames vs FFmpeg Render Fabric
- **Upstream Pattern**: HyperFrames dynamic kinetic canvas vs FFmpeg CPU/GPU filter complex.
- **Implementation**: `RenderFabric` decodes compiler-agnostic `RenderIntent` intermediate representations. HyperFrames compiler is explicitly registered as `PROTOTYPE` with `isProductionRoutable: false` and `executionClass: "UNVERIFIED"`. Production routing is hard-blocked server-side in `CapabilityRegistry`. Real deterministic physical rendering is delegated to `FFmpegRenderCompiler` producing 1080x1920 MP4 files verified with `ffprobe` and `ffmpeg` decode smoke tests.
- **Licensing**: Fully MIT clean-room compliant.

---

## P0 Governance Hardening & Forensic Verification Records

| Component | Forensic Invariant | Implementation Status | Evidence / Verification Mode |
| :--- | :--- | :--- | :--- |
| **Floor 06 Render Fabric** | Real physical MP4 artifact generation on disk | **ACTIVE & VERIFIED** | Deterministic FFmpeg spawn creating 1080x1920 MP4; SHA-256 byte digest; temp-to-final atomic rename; ffprobe stream metadata extraction. |
| **Floor 07 Verification Engine** | Independent media probe; refuses to trust claims or URLs | **ACTIVE & VERIFIED** | Subprocess `ffprobe` format/stream probe; `ffmpeg -v error -i ... -f null -` decode smoke test; 8 hard gates (container, codecs, geometry, duration, sync, decode). |
| **Remote Azure State Machine** | HTTP 200 != COMPLETED | **ACTIVE & VERIFIED** | Dispatched async job returns `remoteState: "DISPATCHED"`; completion only acknowledged upon cryptographically verified callback with executionToken. |
| **Voice Fabric** | Physical WAV on disk with degraded fallback tracking | **ACTIVE & VERIFIED** | Real 16-bit PCM WAV generated on disk; 44-byte RIFF/fmt/data chunks verified; explicitly tagged `qualityClass: "DEGRADED_FALLBACK"`. |
| **Research Passport** | Cryptographic claim & metadata tamper detection | **ACTIVE & VERIFIED** | deterministic project JCS-v1 canonical serialization; SHA-256 claim hashing; HMAC-SHA256 signature; rejects altered claims and altered metadata. |
| **Capability Registry** | Server-side blocking of prototypes | **ACTIVE & VERIFIED** | `authorizeExecution()` rejects `render.hyperframes` before runtime access when `isProductionRoutable: false`. |
| **UI Telemetry Surfaces** | Zero synthetic optimistic numbers | **ACTIVE & VERIFIED** | Removed `|| 7`, `94.8`, `2.8x`, `|| 70%`; displays `UNKNOWN` / `UNMEASURED` when real measurements are unavailable. |



### 4. Remotion + AgentTube engineering-stack decision

Remotion is now the selected primary programmatic composition foundation for rich deterministic video composition.

AgentTube remains a clean-room pattern source for scene manifests, durable checkpoints, audio-first timing, local-first rendering, content-addressed caching, and selective scene repair.

These choices are subordinate to TimelineIR, RenderFabric, capability policy, CAS, and F07 verification.


## Selected Core Engineering Stack

The repository ledger now designates these as the current core media engineering references:

| Repository | Role | Adoption |
|---|---|---|
| `remotion-dev/remotion` | Programmatic video composition, frame-timed React composition, WebGL/Canvas composition target | PRIMARY ENGINEERING REFERENCE / LICENSE-GATED |
| `darkzOGx/youtube-automation-agent` (AgentTube) | Scene lifecycle, checkpoints, audio-first timing, scene-level repair, durable manifests | CORE ENGINEERING PATTERN / CLEAN-ROOM |

Canonical ShortForge boundaries remain `TimelineIR`, `RenderFabric`, CAS, leases/fencing, and F07 verification.

A new rendering stack must explicitly compare against these references before adoption.

## 5. Third-Wave Engineering Workforce Mappings

| Repository | Capability | Adoption Mode | ShortForge Role | Status |
|---|---|---|---|---|
| **gstack** (garrytan/gstack) | Specialist AI engineering workflow: planning, review, QA, security, benchmark, ship, DevEx, retro | Pattern extraction / optional developer toolchain | Forger Assembly | SELECTED WORKFORCE PATTERN |
| **ZAP** (zaproxy/zaproxy) | Web/API DAST, automation plans, MCP-server scanning | Isolated security provider | Forge Sentinel | ADOPTION CANDIDATE |

The Forger workforce consumes the existing repository corpus rather than flattening all mappings into one generic developer role.

## 6. Forger reuse rule

Before adding an engineering tool, identify the owning Forger lane and compare the tool against the existing mappings already assigned to that lane.

A new tool is not justified merely because it is newer. It must close a measurable gap in fidelity, correctness, security, evaluation coverage, latency, cost, developer productivity, or repair locality.

## 7. Team assimilation rule

Gstack, Semgrep, Strix, ZAP, AgentEvals, OpenAI Evals and other mapped engineering/security patterns are operationalized through the top-level `Team/` boundary.

Mappings remain research evidence. The Team consumes their adopted mechanisms only after the same .okf-first and source-of-truth rules are satisfied.


## Fourth-wave Floor 03 research mappings — 2026-09-25

| Repository | Capability observed | ShortForge treatment | Status |
|---|---|---|---|
| jamesbas/storyforgeai | World/visual bible, cinematography/directorial plan, storyboard package, variants and animatic | Typed planning boundary and intermediate-artifact separation | PATTERN_EXTRACTION |
| HITsz-TMG/VideoClaw | Visible staged creative pipeline and editable storyboard/reference stages | Inspectable F03 planning artifact | PATTERN_EXTRACTION |
| nolanx-ai/nolanx.ai | Long-runtime multimodal continuity and persistent scene/asset context | Canonical continuity vs transient execution separation | PATTERN_EXTRACTION |
| Emily2040/seedance-2.0 | Global sequence plan, local prompt compilation, re-anchors, observed-state handoff | ContinuityMode, motion beats, state hints, typed references | PATTERN_EXTRACTION |
| zyz254009-crypto/script-to-shootable-storyboard | Atomic shot schema, graph validators, provenance, safe zones, repair plans | Typed F03 shot semantics, graph validation, fingerprints, repair locality | CLEAN_ROOM_PATTERN_EXTRACTION |
| huangserva/xyz-video-skill | Purpose-driven reference protocol and explicit continuity fields | ReferenceUse, GenerationInputMode, ContinuityMode | PATTERN_EXTRACTION |
| pydantic/pydantic-ai | Typed structured output and validation/retry discipline | Pydantic-first strict AssetPlanIR and semantic validation | PATTERN_EXTRACTION |
| madebysaira/CharacterConsistency | Stable identity/style block plus per-shot action/camera delta | ContinuityPlan with invariants/allowed changes and character references | PATTERN_EXTRACTION |
| kmgrassi/PopcornReady | Character bible/reference pack/shot intent separation and surgical repair | First-class references and localized regeneration | PATTERN_EXTRACTION |
| ShotDirector research pattern (evidence via zhaoyang97/Paper-Notes-en; upstream implementation not verified in this sweep) | Cinematographic transition semantics and explicit camera control | Richer provider-neutral camera/continuity semantics | RESEARCH_PATTERN |
| KlingAIResearch/MultiShotMaster | Global persistent caption + per-shot local caption structure | Stable invariants vs local shot plan separation | RESEARCH_PATTERN |
| AI-Application-and-Integration-Lab/VstoryGen | Multi-scene visual storytelling with scene/character references | Reference-aware scene planning | RESEARCH_ONLY |
| showlab/Code2Video | Planner/Coder/Critic separation and evaluation | Preserve planner vs judge boundary in F03 | RESEARCH_ONLY |

All mappings are clean-room pattern extraction or research references. No external code, prompts, tests, weights, or provider-specific credentials were imported into F03.

## Floor 03 research wave 3 — 2026-09-25

Additional GitHub repositories were reviewed beyond both the original nine sources and the prior second-wave corpus.

### High-signal sources

| Repository | F03-relevant signal | Adoption |
|---|---|---|
| Comfy-Org/ComfyUI | Declarative reusable graphs and partial re-execution | F03 remains declarative; repair locality is represented by dependency/impact metadata, while executable graphs stay downstream |
| conexto/ViMax | Reference selection from previous timeline plus first/last-frame continuity | Automatic dependency-boundary last-frame reference bindings when chain continuity is requested |
| huggingface/diffusers | First/last-frame conditioning and explicit temporal controls | Provider-neutral generation input modes and temporal intent |
| hpcaitech/Open-Sora | Explicit aspect-ratio and frame-count generation controls | Temporal semantics remain explicit rather than hidden in prompts |
| yfge/ai-video-studio | Durable production objects with Timeline as playback SSOT | AssetPlanIR remains durable intent; TimelineIR remains downstream SSOT |
| LudwigKienle/ai-video-production-editor | Shot/camera/lens/lighting planning before filming | Camera height, lens profile, camera body and lighting fields |
| Vidia-Tools/Vidia-Open-Studio | Declarative stage manifests separated from execution | F03 does not select provider workflow or execute stages |
| thoxakihiko/shotlist-forge | Reusable shot grammar and continuity dimensions | Deterministic CoverageRole |
| zyz254009-crypto/script-to-shootable-storyboard | Atomic shot contracts, coverage, source trace and bounded repair | Coverage/evidence/repair metadata in AssetPlanIR |
| BitraAI/ai-film-director | Stage schemas, stable IDs, continuity checks, adapter execution | Stronger typed stage boundary and stable semantic artifact |
| LinHao-city/StoryMind | Camera, lighting, character anchors and cross-shot consistency | Provider-neutral camera/lighting/continuity/reference semantics |

### Additional screened references

Sainath Pattipati's video-generation pipeline, 0xadvait/ai-video-pipeline, open-video-ai/open-video, billpar/ai-cinematic-pipeline, ai-visual-director and ai-storyboard-video-starter were also screened. Their useful signals overlap the adopted patterns above; no separate runtime capability was promoted from them.

### Implementation delta

- Floor 03 contract advances to 2.2.0.
- AssetPlanIR advances to schema 1.2.0.
- CameraSpec now carries camera height, lens profile and camera body.
- VisualPromptPlan now carries lighting intent.
- ReferenceBinding can retain source scene/asset lineage.
- Chain continuity can automatically bind a dependent scene to the previous scene's last frame.
- Generation input modes now expose that last-frame requirement to downstream adapters.
- AssetPlanNode now carries deterministic cinematic CoverageRole.
- Motion beats are validated against the source scene target duration instead of creating an invalid temporal plan.
- Existing dependency graph, transitive impact radius and semantic plan fingerprinting remain intact.

### Non-conflict rule

These improvements remain specification-only. F03 does not choose a provider/model, execute generation graphs, own secrets, replace TimelineIR, or certify physical media.

## Current-generation video-model and evaluation research — 2026-09-25

| Repository | Signal | F03 treatment | Status |
|---|---|---|---|
| Wan-Video/Wan2.2 | Explicit cinematic conditioning, T2V/I2V, resolution/frame-rate and character-animation inputs | Confirms provider-neutral camera/lighting/reference/input metadata; runtime stays downstream | PATTERN_EXTRACTION |
| SkyworkAI/SkyReels-V2 | Start/end-frame control and long-video extension | Reinforces dependency-boundary frame references and continuity state | PATTERN_EXTRACTION |
| Tencent-Hunyuan/HunyuanVideo-1.5 | Explicit model/runtime conditions separated from semantic request | Keeps inference/runtime parameters outside AssetPlanIR | ARCHITECTURE_REFERENCE |
| Vchitect/VBench | Multidimensional video quality evaluation | Keeps quality scoring downstream of F03 planning | EVALUATION_PATTERN |
| Lightricks/LTX-Video | Multi-keyframe conditioning, extension and frame-level control | Reinforces temporal-reference direction while keeping provider-specific syntax out of F03 | PATTERN_EXTRACTION |

These mappings are research inputs only. No provider code, weights, workflows, or model-specific execution APIs were imported into F03.


## Floor 03 Research Wave 4 — 2026-09-25

| Repository | Capability | Adoption Mode | ShortForge Role | Status |
|---|---|---|---|---|
| OpenLineage/OpenLineage | Run/job/dataset lineage and versioned facets | Pattern Extraction | F03 PlanLineage/source fingerprint | ADOPTED |
| iterative/dvc | Dependency-aware reproducibility and stable stage identity | Pattern Extraction | F03 semantic source/node fingerprints | ADOPTED |
| dagster-io/dagster | Explicit asset checks and blocking check semantics | Pattern Extraction | F03 structural preflight validation | ADOPTED |
| invoke-ai/InvokeAI | Saved workflow distinct from executable graph | Architecture Reference | AssetPlanIR execution boundary | ADOPTED |
| divolleggett/character-consistency-skill | Reference-first storyboard and reference reuse | Pattern Extraction | F03 continuity/reference strategy | ADOPTED |
| taylorzhou16/video-gen-en | Layered storyboard and parameter consistency | Pattern Extraction | F03 typed planning discipline | ADOPTED |
| NVIDIA-NeMo/Guardrails | Independent validation rails | Architecture Reference | F03 validation-boundary discipline | ADOPTED |


## Floor 03 Research Wave 5 — 2026-09-26

| Repository | Capability observed | ShortForge treatment | Status |
|---|---|---|---|
| OpenAssetIO/OpenAssetIO | Logical asset identity, resolver boundary, typed traits | ReferenceBinding entity_ref/version/traits | ADOPTED |
| OpenAssetIO/OpenAssetIO-MediaCreation | Typed media-creation trait boundary | Reference metadata discipline | ADOPTED |
| AcademySoftwareFoundation/OpenTimelineIO | Logical source range vs available media | Preserve semantic asset intent independently of resolved media | ADOPTED |
| Comfy-Org/ComfyUI | Graph cache and partial re-execution | Dependency-node fingerprint lineage | ADOPTED |
| huggingface/diffusers | Modular conditioning | ConditioningSpec | ADOPTED |
| OpenLineage/OpenLineage | Typed lineage/facets | PlanLineage/source fingerprints | ADOPTED |
| dagster-io/dagster | Explicit asset dependencies/checks | Structural dependency validation | ADOPTED |
| HVision-NKU/StoryDiffusion | Long-range consistency | First-class continuity/reference strategy | ADOPTED |
| instantX-research/InstantID | Identity reference conditioning | Identity ConditioningSpec | ADOPTED |
| ali-vilab/VideoComposer | Spatial/temporal conditioning | Typed control and motion intent | ADOPTED |
| Lightricks/LTX-Video | Conditioning strength/start frame | Typed temporal conditioning | ADOPTED |
| Lightricks/LTX-2 | Keyframe/video/HDR conditioning | Boundary reference; provider mechanics remain downstream | REFERENCE_ONLY |
| contentauth/c2pa-rs | Manifest/ingredient/assertion provenance | Future F07 signing/verification boundary | REFERENCE_ONLY |
| Vchitect/VBench | Multidimensional video quality | Downstream evaluation | REFERENCE_ONLY |
| iterative/dvc | Dependency-aware reproducibility | Semantic source/node/plan fingerprints | ADOPTED |
| invoke-ai/InvokeAI | Saved workflow vs execution graph | Non-executable AssetPlanIR boundary | ADOPTED |
| Additional storyboard/director repositories | Shot, camera, reference and continuity patterns | Existing typed scene planning fields | PATTERN_EXTRACTION |

No third-party runtime code or model/provider dependency was added.
