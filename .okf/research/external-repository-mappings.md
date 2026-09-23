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
