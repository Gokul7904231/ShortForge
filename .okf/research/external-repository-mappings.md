# Research: External Repository Clean-Room Assimilations & Architectural Mappings

> **Status**: OPERATIONAL / CANONICAL  
> **Governance Standard**: Clean-Room Pattern Extraction (Zero direct code, test, or text copying)

---

## 1. Architectural Philosophy: Clean-Room Pattern Assimilation

To elevate ShortForge / FactoryOS into an industrial-grade autonomous video production system, five specialized reference architectures were analyzed through strict clean-room governance.

No code, prompt templates, test cases, or vendor-specific artifacts were copied from these repositories. Instead, high-level architectural patterns, distributed systems invariants, and domain-specific state machines were distilled and re-implemented natively using the FactoryOS authoritative type system:

1. **`video-use`**: Composition abstractions, multi-track edit decision lists, and canvas layout validation.
2. **`WeKnora`**: Domain-isolated enterprise knowledge stores, typed memory boundaries, and verification gates.
3. **`Octop`**: Agent execution harness, lifecycle state machines, workspace sandboxing, and resumable session checkpoints.
4. **`orca`**: Distributed compute fabric, worker leases, fencing tokens, and content-addressed callbacks.
5. **`VoiceStudio`**: Capability-driven voice routing, audio synthesis pipelines, and syllable-level speech synchronization.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        External Reference Repositories                 │
│       [video-use]      [WeKnora]     [Octop]     [orca]   [VoiceStudio]│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Clean-Room Architectural Analysis
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     FactoryOS Clean-Room Assimilations                 │
│  ├── video-use   ──► apps/web/factoryos/core/timeline/TimelineIR.ts    │
│  ├── WeKnora     ──► apps/web/factoryos/core/knowledge/KnowledgeOS.ts │
│  ├── Octop       ──► apps/web/factoryos/core/agent/AgentRuntime.ts     │
│  ├── orca        ──► apps/web/factoryos/core/rendering/ComputeFabric   │
│  └── VoiceStudio ──► apps/web/factoryos/core/voice/VoiceRouter         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. In-Depth Clean-Room Repository Mappings

### 1. `video-use` $\longrightarrow$ Timeline Composition & Staging (`TimelineIR.ts`)
- **Reference Insight**: Video composition should not be tightly coupled to a single rendering engine (e.g. Remotion or FFmpeg). Declarative multi-track representations separate spatial and temporal layout from physical rasterization.
- **FactoryOS Implementation**:
  - Implemented `TimelineIR` as an engine-neutral Edit Decision List in `apps/web/factoryos/core/timeline/TimelineIR.ts`.
  - Canonical canvas constraint enforcement ($1080 \times 1920$ vertical short-form format at 30fps).
  - Strongly typed track definitions (`VIDEO`, `AUDIO_VOICE`, `AUDIO_MUSIC`, `CAPTIONS`, `OVERLAY`) preventing track collision.
  - Floor 05 acts as the composition compiler emitting `TimelineIR`, consumed by Floor 06 render workers.

### 2. `WeKnora` $\longrightarrow$ Domain-Isolated KnowledgeOS (`KnowledgeOS.ts`)
- **Reference Insight**: Flat memory models suffer from semantic bleeding, where speculative brainstorming contaminates factual truth. Knowledge must be partitioned into typed, isolated domains governed by promotion barriers.
- **FactoryOS Implementation**:
  - Implemented 6 orthogonal knowledge domains in `apps/web/factoryos/core/knowledge/KnowledgeOSContracts.ts`: `SOURCE`, `CLAIM`, `EVIDENCE`, `TOPIC`, `CHANNEL`, and `PERFORMANCE`.
  - Enforced the **Promotion Gate Invariant**: items ingested from external scraping or LLM brainstorming remain `verified: false` until an authoritative verification receipt is attached.
  - Floor 02 Scripting queries only verified claims, ensuring 100% factual grounding for documentary shorts.

### 3. `Octop` $\longrightarrow$ AgentRuntime & Session Lifecycle (`AgentRuntime.ts`)
- **Reference Insight**: Sovereign control planes (Overseer) must be decoupled from agent execution runtimes. Agents require lifecycle state machines, workspace isolation, resource budgets, and resumable checkpoints.
- **FactoryOS Implementation**:
  - Implemented `AgentRuntime` in `apps/web/factoryos/core/agent/AgentRuntime.ts`.
  - Lifecycle states (`INITIALIZING`, `ACTIVE`, `WAITING_FOR_TOOL`, `PAUSED`, `COMPLETED`, `TERMINATED`).
  - Strict capability gating (`grantedCapabilities`) checked prior to any skill invocation.
  - Structured checkpoints (`AgentCheckpoint`) with artifact hashes, enabling instant point-in-time resumption upon crash recovery.
  - Overseer remains the supreme orchestrator; AgentRuntime serves as the execution harness for floor specialists.

### 4. `orca` $\longrightarrow$ Distributed Compute Fabric (`ComputeFabricContracts.ts`)
- **Reference Insight**: Distributed rendering requires strict distributed systems guarantees: worker lease heartbeats, fencing tokens to prevent zombie split-brain writes, and content-addressed callbacks.
- **FactoryOS Implementation**:
  - Implemented provider-neutral compute fabric contracts with monotonically increasing fencing tokens.
  - Workers acquire temporary leases; expired leases automatically release jobs back to the scheduler queue.
  - Callbacks from render workers require cryptographic HMAC signatures and SHA-256 binary digests matching the compiled `TimelineIR` specification.
  - Decoupled from proprietary cloud vendors (Azure/AWS), enabling local GPU clusters, cloud containers, or serverless workers.

### 5. `VoiceStudio` $\longrightarrow$ Voice Routing & Speech Engine (`VoiceRouter.ts`)
- **Reference Insight**: High-retention short-form video demands emotional pacing, dynamic voice selection, and word/syllable-level audio alignment for rhythmic captions.
- **FactoryOS Implementation**:
  - Implemented multi-provider voice routing across ElevenLabs, OpenAI Audio, and local TTS engines.
  - Extracted syllable and phoneme timing arrays during Floor 04 Media Synthesis.
  - Synchronized speech audio durations with Floor 05 Timeline clip boundaries to eliminate audio-visual jitter.

---

## 3. CURRENT vs TARGET Assimilation Status

| Assimilated Subsystem | CURRENT FactoryOS Implementation | TARGET Enterprise Implementation |
|:----------------------|:--------------------------------|:---------------------------------|
| **TimelineIR (`video-use`)** | Fully typed EDL schema with vertical $1080 \times 1920$ validation | Real-time WebGL in-browser timeline scrub preview with keyframe editing |
| **KnowledgeOS (`WeKnora`)** | Domain-isolated typed stores with promotion gate | Vector-indexed multi-domain graph store with automated citation triangulation |
| **AgentRuntime (`Octop`)** | In-process execution harness with budget & capability gates | Distributed sandboxed WebAssembly / microVM worker execution |
| **Compute Fabric (`orca`)** | Lease & fencing token contracts with CAS callbacks | Self-healing Kubernetes / Nomad GPU worker autoscaler with spot-instance preemption |
| **Voice Engine (`VoiceStudio`)**| Dynamic provider routing with syllable timestamp extraction | Neural voice cloning with real-time emotion and pacing modulation |


## 4. Remotion → Programmatic Composition Stack

Status: SELECTED ENGINEERING STACK

Assimilate explicit composition contracts, frame-clock animation, Sequence-based timeline composition, React / Canvas / WebGL rendering paths, dynamic metadata, and programmatic rendering.

ShortForge mapping: TimelineIR -> RemotionCompiler -> RenderFabric -> F07

Do not let Remotion replace TimelineIR as semantic truth.

## 5. AgentTube → Scene Lifecycle and Surgical Repair

Status: CLEAN-ROOM ENGINEERING PATTERN

Assimilate durable scene manifests, persistent checkpoints, audio-first timing, scene-level selective regeneration, content-addressed caching, local-first rendering, and fail-closed narration / evidence state.

ShortForge mapping: SceneManifest + TimelineIR + CAS + ReMaker + F07

No upstream code, prompts, tests, or proprietary assets are copied.

## 6. Stack governance

The current engineering stack is canonically documented in .okf/engineering-stack.md.

Future rendering research must compare candidates against Remotion plus AgentTube-derived lifecycle patterns before introducing a parallel architecture.


## 7. Selected Core Engineering Stack

The external repository mapping system now gives elevated engineering priority to:

### remotion-dev/remotion

Primary reference for programmatic composition, frame-addressed timing, React composition structures, Canvas/WebGL effects, and renderer/compiler integration.

### darkzOGx/youtube-automation-agent (AgentTube)

Primary pattern source for durable scene manifests, checkpoint/resume, audio-first timing, content-addressed reuse, and bounded scene-level repair.

These are clean-room pattern integrations. They do not replace ShortForge's canonical authority, `TimelineIR`, capability security, RenderFabric, or F07 verification.

## 8. Engineering-stack priority

Two repository mappings now form the selected media engineering baseline:

1. remotion-dev/remotion — primary programmatic composition engine.
2. darkzOGx/youtube-automation-agent (AgentTube) — selected scene-lifecycle / repair pattern source.

They are complementary, not competing:
- Remotion answers how rich programmatic compositions are executed.
- AgentTube-derived patterns answer how scene state, checkpoints, timing evidence, and selective repair are managed.
- TimelineIR remains semantic truth.
- RenderFabric remains execution orchestration.
- F07 remains verification authority.

## 9. Mapping-first decision rule

Before introducing a new media-engineering mechanism, review all relevant existing mappings. A new mechanism must be classified as:
- already exists
- extends existing rule
- contradicts existing rule
- new capability
- experiment only

Where an existing mapping already solves the problem, prefer assimilation over another parallel architecture.


## 10. Gstack -> Forger Engineering Workforce

Status: SELECTED ENGINEERING WORKFORCE PATTERN

Gstack is mapped into the Forger Assembly rather than imported as a second runtime authority. Its specialist workflow structure informs planning, review, QA, security, benchmarking, debugging, DevEx, shipping, and retrospective roles.

ShortForge mapping:
- planning / architecture -> Forge Architect
- implementation review -> Forge Builder
- browser QA -> Forge Browser
- security -> Forge Sentinel
- benchmark / eval -> Forge Evaluator and Performance
- investigation -> Forge Reliability
- design / diagrams -> Forge Visualization
- ship / canary -> Forge Release

No gstack prompt, hook, browser assumption, or authority model is copied into FactoryOS.

## 11. OWASP ZAP -> DAST Security Lane

Status: ISOLATED SECURITY PROVIDER / ADOPTION CANDIDATE

ZAP is mapped to Forge Sentinel and the production-helper security routine for authorized web/API dynamic testing.

ShortForge uses ZAP as a complementary evidence source:
- Semgrep = static source-pattern evidence
- Strix = runtime adversarial evidence
- ZAP = web/API protocol and DAST evidence

ZAP active scans require explicit target authorization. Scanner output never replaces FactoryOS capability, evidence, or release gates.

## 12. Engineering-workforce mapping rule

Relevant repo mappings are now consumed through the Forger specialist that owns the concern. Where an existing mapping already provides a solution, Forgers should assimilate it rather than introduce a parallel subsystem.


## Floor 03 second-wave corpus

The generic mapping-first rule now applies to a broader F03 research corpus. Dedicated records live under `.okf/research/repo-mappings/`.

For F03, the current corpus covers:
- storyboard/creative planning: StoryForgeAI, VideoClaw, NolanX
- sequence/continuity: Seedance 2.0, xyz-video-skill, CharacterConsistency, PopcornReady
- typed artifacts/validation: script-to-shootable-storyboard, Pydantic AI
- directorial multi-shot research: ShotDirector, MultiShotMaster
- multimodal visual storytelling: VstoryGen
- planning/critic separation: Code2Video

Selection rule:
1. extract a high-level pattern;
2. compare against executable ShortForge contracts and .okf authority;
3. implement only the smallest non-conflicting capability;
4. record non-adoptions explicitly;
5. benchmark or test before promotion.

F03-specific promotion from this corpus is limited to:
- typed shot/camera/continuity/reference planning;
- graph-aware dependency validation;
- transitive regeneration impact;
- localized dependency remapping;
- semantic plan fingerprinting;
- richer provenance/reference metadata.

Provider selection, media generation, credentials, physical verification, and sovereign orchestration remain outside F03.

## F03 Research Wave 3 — 2026-09-25

The F03 research set now extends beyond the original clean-room corpus to a broader video-planning cohort: ComfyUI, ViMax, Diffusers, Open-Sora, ai-video-studio, ai-video-production-editor, Vidia Open Studio, shotlist-forge, script-to-shootable-storyboard, ai-film-director and StoryMind. Their mappings are maintained individually under .okf/research/repo-mappings/.

Adoption remains bounded:
- declarative workflow structure informs AssetPlanIR but executable graphs remain downstream;
- first/last-frame continuity informs typed dependency reference bindings;
- temporal and camera metadata are explicit semantic fields;
- shot coverage, evidence lineage and repair scope are typed;
- TimelineIR, RenderFabric, Guardian and F07 retain their authority;
- restrictive-license sources remain reference-only and are not embedded.