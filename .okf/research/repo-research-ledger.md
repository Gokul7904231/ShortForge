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
| **Research Passport** | Cryptographic claim & metadata tamper detection | **ACTIVE & VERIFIED** | RFC-8785 JCS-v1 canonical serialization; SHA-256 claim hashing; HMAC-SHA256 signature; rejects altered claims and altered metadata. |
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
