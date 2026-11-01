<p align="center">
  <a href="https://shortforge.gokul.software/">
    <img src="https://raw.githubusercontent.com/Gokul7904231/ShortForge/main/apps/web/public/favicon-white.png" alt="ShortForge Logo" width="96" />
  </a>
</p>
<p align="center">
  <strong>ShortForge — FactoryOS</strong><br/>
  <a href="https://shortforge.gokul.software/">Hosted Platform</a> · <a href="https://github.com/Gokul7904231/ShortForge">GitHub</a> · <a href="https://github.com/Gokul7904231/ShortForge/blob/main/LICENSE">MIT</a>
</p>

---

# ShortForge — Industrial-Grade Autonomous Video Factory

ShortForge is an enterprise-grade, autonomous short-form video generation factory. It turns a creative brief into a 9:16 vertical video (YouTube Shorts / Instagram Reels / TikTok) through a mathematically governed, seven-floor assembly line — with deterministic control planes, a multi-agent cognitive hierarchy, heterogeneous distributed GPU compute, and cryptographic release verification.

- **Status**: Production-active and improving daily. Deployed and running at [**https://shortforge.gokul.software/**](https://shortforge.gokul.software/).
- **Operating standard**: `CLAIM <= EVIDENCE` — no stage asserts success without tangible, verifiable proof.

---

## 1. Problem Statement

### 1.1 The gap ShortForge solves

Today's "script-to-video" AI tools are probabilistic wrappers: they fail silently, hallucinate asset delivery, return synthetic success receipts, and churn repetitive, copyright-gray or demonetized content. They have no audit trail, no fault isolation, and no guarantee that a delivered video is physically real — only that an API returned `200`.

That produces three concrete failures:

1. **Silent failure & synthetic success** — a generation "succeeds" in the database while the artifact never existed.
2. **No auditability** — you cannot reproduce why a video was approved, who/what authored each frame, or whether it complies with platform policy.
3. **No monetization safety** — content ships without verification against YouTube Partner Program (YPP) rules, exposing channels to strikes, shadowbans, and demonetization.

### 1.2 ShortForge's answer

ShortForge treats video production as a **manufacturing plant, not an API wrapper**:

- **Deterministic control** above generative uncertainty — LLMs propose, deterministic code enforces geometry, timing, and compliance invariants.
- **Physical verification before trust** — every artifact is FFprobe-probed, hashed into content-addressed storage, and only then considered real.
- **Cryptographic release authorization** — nothing is published without an Ed25519-signed, single-use release receipt issued only after 15 verification gates.
- **Fault isolation and bounded repair** — broken stages heal locally with bounded budgets; the last-known-good baseline is never overwritten by an unverified candidate.
- **Economic governance** — every stage is admitted against a token economy so autonomous generation cannot run away with compute spend.

ShortForge is still actively improving — every day brings new Reliable systems, gates, adapters, verified evidence and Improving along with the world.

---

## 2. How It Was Engineered

ShortForge was built as a **strictly stratified monorepo**, with an explicit separation between the *control plane* (authority, supervision, leases, circuit breaking) and the *production pipeline* (sequential media generation). Control entities — the Overseer, Guardian, Slayer, and Healer — are deliberately **never** pipeline floors, and pipeline floors never own authority. This single architectural decision prevents the system from authorizing its own work, which was the core failure mode observed in early prototypes.

### Core invariants baked into the code

- **`CLAIM <= EVIDENCE`** — no agent or floor may emit `SUCCESS` without concrete, independently verifiable evidence (SHA-256 digests over physical bytes, ffprobe-verified streams, reconciled reference counts). Synthetic hash generation is prohibited.
- **`physicalIntegrityFailure || !fileExists || byteLength <= 0` forces BLOCK** — publishing is hard-blocked if the artifact is missing, empty, or unparseable.
- **No fake success when unconfigured** — if credentials are not set, YouTube Drive publishing returns `AUTH_NOT_CONFIGURED`, never a mock URL or fake video ID.
- **No duplicate publication** — the Durable Authorization Store is a SQLite state machine (`ACTIVE → CONSUMED`) using a conditional `UPDATE … WHERE status='ACTIVE'` to defeat replay.
- **Fail-closed policy** — any F07 gate that cannot reach consensus or times out aborts publishing unconditionally.
- **Deterministic replayability** — distributed workers run under monotonic fenced leases with complete input/output digests, enabling deterministic re-simulation in sandboxes.

### Engineering process

The project maintains an executable knowledge system, `.okf/`, which any non-trivial engineering decision must pass through end-to-end: architecture and principles, absolute hierarchy, security and worker permissions, cognition, memory, rendering contracts, workflows, forensic audits, external repo mappings, production-helper evidence, then the actual implementation and tests. This discipline keeps the codebase from drifting into undocumented abstractions — the system's rule is "zero tolerance for undocumented abstractions."

Key assimilated patterns were re-implemented as native contracts rather than pasted in:
- **Remotion** as the primary programmatic video composition engine (React/Canvas/WebGL-backed), with a compiler-neutral `TimelineIR` (EDL) as the canonical semantic model so no external engine owns the composition graph.
- **AgentTube** as the scene-lifecycle pattern source — local-first rendering, durable per-stage checkpoints, durable scene manifests, audio-first timing, content-addressed caching, and selective scene repair (repair only the affected subtree, reuse unchanged scenes from CAS).

---

## 3. Complete System Hierarchy

```
LEVEL 0 — HUMAN AUTHORITY
        (policy authority, exceptional approval, manual override, emergency stop, production governance)
              |
              v
LEVEL 1 — OVERSEER: SUPREME CONTROL PLANE
        Mission intake · lifecycle · objective decomposition · DAG planning · dispatch
        · cross-floor supervision · global state monitoring · decision ledger · escalation
        |
        +-- CROSS-CUTTING REGulators (independent of the Overseer)
        |   +-- Guardian   — capability / policy authorization
        |   +-- Slayer     — lease revocation / kill enforcement
        |   +-- Healer     — bounded remediation
        |   +-- Treasurer  — economic admission, reservations, settlement, scarcity protection
        |   +-- Auditor/F07 — evidence-based verification (never an authority over execution)
        |   +-- SCL        — bounded cognition; supports the Overseer, never becomes a second Overseer
        |
        v
RUNTIME / EXECUTION BOUNDARY
        AgentRuntime · leases · checkpoints · TraceContext
        |
        v
LEVEL 2 → 7 — SPECIALIZED PRODUCTION FLOORS (F00–F07)
        ┌─────────────────────────────────────────────────────────────────┐
        │ F00 Analyst & Research Ingestion      category: RESEARCH       │
        │ F01 Strategic Direction & Research    category: PLANNING       │
        │ F02 Cognitive Scripting & Structure     category: CREATIVE     │
        │ F03 Visual Asset Realization & Blueprints  (parallel branch)   │
        │ F04 Media Synthesis & Provider Execution (parallel branch)     │
        │ F05 Timeline Composition & Motion        category: COMPOSITION │
        │ F06 Video GPU Rendering Engine           category: RENDER      │
        │ F07 QA Gate & Social Compliance          category: VERIFICATION│
        └─────────────────────────────────────────────────────────────────┘
        Note: F03/F04 run in parallel and converge into F05.
        |
        v
ARTIFACTS + TELEMETRY + FINDINGS
        Content-Addressed Storage (CAS) · Artifact Lineage · Cases
        · Verification Receipts · Structural Findings
        |
        v
MEMORY / LEARNING
        Domain-typed MemoryOS / KnowledgeOS (Source, Claim, Evidence,
        Topic, Channel Profile, Performance stores) → Ascalon training
        trajectories → Devourer-controlled improvement
```

### Sovereign agent roles

| Role | Responsibility |
| :--- | :--- |
| **Overseer** | Deconstructs creative briefs into topological mission DAGs; monitors timeouts; dynamically schedules floors; owns the decision ledger. |
| **Guardian** | Owns capability and policy authorization; gates execution on typed capability contracts. |
| **Slayer** | Identifies unrecoverable anomalies (stalled workers, deadlocks) and enforces lease revocation / clean kills. |
| **Healer** | Executes bounded recovery (regenerating failed audio frames, reprompting corrupted assets, provider fallback) with a capped budget; rolls back to last-known-good. |
| **Treasurer** | Economic admission, reservations, settlement, freeze modes, and scarcity accounting — read-only Economic Intelligence sits downstream, advisory only. |
| **F00–F07 Workers** | Execute only. Each floor owns its input → verified output boundary and emits evidence for the decision ledger. |

---

## 4. The 7-Floor Assembly Line

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                          PRODUCTION FLOWS (F00 → F07)                     │
  └──────────────────────────────────────────────────────────────────────────┘
    [F00: Analyst & Research Ingestion]
        │ • Query Reddit, YouTube trends, and web sources (Tavily / Firecrawl)
        │ • Extract viral semantic seeds and audience sentiment
        │ • Strictly report unmet capacity — never fabricate synthetic topics
        ▼
    [F01: Strategic Direction & Research]
        │ • Trend validation, audience resonance scoring, freshness windows
        ▼
    [F02: Cognitive Scripting & Structure]
        │ • ScriptAgent synthesizes beat structure (Hook / Retain / Payoff)
        │ • Output: validated JSON script manifest with word counts and scene markers
        ▼
    [F03: Visual Asset Realization & Blueprints] ──┐  (parallel branch)
    [F04: Media Synthesis & Provider Execution]   │
        │ • Visual prompt / blueprint generation, provider dispatch, asset production
        ▼
    [F05: Timeline Composition & Motion]          │  (converges F03 + F04)
        │ • TimelineIR (EDL) compilation — audio-first timing, frame-based scheduling
        │ • Caption/subtitle layer assembly, transition composition
        ▼
    [F06: Video GPU Rendering Engine]
        │ • Dispatch through ComputeRouter to a qualified provider (Local/AMD/Kaggle/
        │   Kaggle-Notebook/RunPod/Vast.ai/PersistentWorker/GitHub-Actions)
        │ • Render with Remotion composition layer → FFmpeg mux
        │ • Physical probe (ffprobe) → SHA-256 into CAS
        ▼
    [F07: QA Gate & Social Compliance]
        │ • FFprobe physical media probe (container, geometry, codecs, audio sync,
        │   decode smoke test)
        │ • G00–G14 compliance gate evaluation and policy freshness checks
        │ • Deterministic canonical serialization + Ed25519 detached receipt signature
        │   (ACTIVE → CONSUMED state machine)
        ▼
    [PUBLISHER OUTBOX] → YouTube Data API v3 / Google Drive (JIT safety boundary)
```

---

## 5. F07 Verification Gates (G00–G14)

Floor 07 is the cryptographic release authority — content cannot be dispatched externally without it.

| Gate | Invariant enforced |
| :--- | :--- |
| **G00** | Policy freshness — local policy snapshots are current; fails closed on staleness. |
| **G01–G02** | Channel readiness, YPP multi-tier check, community safety (toxicity / hate / violence). |
| **G03–G05** | Inauthentic-content similarity, transformative value (reused-content defense), commercial rights and license expiry for all assets. |
| **G06–G08** | Advertiser suitability, AI/synthetic-media disclosure mapping, anti-spam and narrative coherence. |
| **G09–G11** | Anti-fake-engagement attestation, metadata and anti-tag-stuffing integrity, made-for-kids classification. |
| **G12–G14** | Shorts geometry (1080×1920, ≤180s), creative-fatigue pacing, and final evidence reconciliation (hashes match CAS, signatures hold). |

Failing gates route through the ReMaker remediation planner and an `ArtifactLineageGraph` DAG that cascade-invalidates and selectively repairs the affected subtree.

---

## 6. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Control Plane** | Next.js 16 / React 19 / Tailwind v4 | Supervisory kernel, dashboard, 100+ route handlers |
| **Language** | TypeScript (strict) | FactoryOS kernel, state machines, contract schemas |
| **Client / Server State** | Zustand 5 · TanStack Query 5 | Mission state, query caching, SSE hydration |
| **Auth & RBAC** | Firebase Admin (`__session` HMAC) | Server-authoritative session verification and RBAC |
| **Local DB** | better-sqlite3 (WAL) | Render queue, authorization state machine, outbox, CAS metadata |
| **Doc DB** | MongoDB 7.5 | FactoryOS operational collections, mission logs |
| **NoSQL** | Firestore | User quotas, channel configs, video catalog |
| **Media CDN** | Cloudinary | Edge distribution and thumbnails |
| **Validation** | Zod | Runtime schema validation at all trust boundaries |
| **AI Router** | `IntelligentRouter` + `AIRuntime` | Multi-provider routing scored on quality / latency / cost / availability, with circuit breaking at `errorRate > 0.85` |
| **Model routing** | Gemini, Groq, OpenRouter, NVIDIA NIM, local (Ollama/vLLM), Pollinations | Capability-declared `ModelCapability` dispatch (TEXT_REASONING, STRUCTURED_JSON, AUDIO_TTS, …) |
| **Composition** | Remotion (React/Canvas/WebGL) | Programmatic composition via a compiler-neutral `TimelineIR` |
| **Media engine** | FFmpeg / FFprobe, Pillow | Encoding, audio normalization, canvas layering, physical probing |
| **Voice** | edge-tts, ElevenLabs | Neural TTS with granular prosody |
| **Alignment** | faster-whisper (CTranslate2) | Word-level forced alignment |
| **Execution Plane** | FastAPI workers (:8080 main, :8100 warm pool) | Async rendering service and persistent-worker pool |
| **Heterogeneous GPU** | Kaggle (T4), Kaggle Notebook, RunPod (4090), Vast.ai, AMD ROCm, Local, GitHub Actions, Hosted Sandboxes | ComputeRouter dispatches jobs to the most utility-optimal qualified provider |
| **Testing** | Vitest (node, scoped) | Kernel, contracts, gate, and provider-qualification suites |
| **Hygiene** | ESLint, Prettier, commitlint | Strict linting + conventional `refactor:` / `feature:` / `bug:` commits |

---

## 7. Repository Layout

```
ShortForge/
├── .okf/                          # Executable knowledge system: decisions, hierarchy,
│    ├── hierarchy-map.md          #    floors, security, rendering, workflows, audits
│    ├── principles.md             #    architectural principles (authoritative)
│    ├── decision-protocol.md      #    mandatory decision protocol
│    ├── decisions.md              #    locked ADR ledger
│    ├── production-helper.md      #    evidence station contract
│    └── research/                 #    repo mappings / assimilation record
├── apps/web/                      # CONTROL PLANE — Next.js 16 sovereign app
│   ├── ai/                        # IntelligentRouter, AIRuntime, TokenEconomy, providers
│   ├── app/                       # App Router: (os) shell, (auth), 100+ API routes
│   │   └── api/                   # /generate-video, /factory/*, /overseer/*, /rendering/*,
│   │                               #    /publish/*, /jobs/*, /drive/*, /settings/*, /admin/*
│   ├── components/                # Dashboard, factory DAG visualization, QuickGenerate wizard
│   ├── factoryos/                 # FACTORYOS SOVEREIGN KERNEL
│   │   ├── core/
│   │   │   ├── hierarchy/         # FloorRegistry (single source of floor truth)
│   │   │   ├── overseer/          # Mission lifecycle & DAG planner
│   │   │   ├── verification/      # F07 ReleaseGuardian, G00–G14 gates, crypto receipts
│   │   │   ├── compute/           # ComputeRouter + provider adapters (Kaggle, RunPod, …)
│   │   │   ├── render/            # LocalRenderAdapter, OpenCutAdapter, capability contracts
│   │   │   ├── intelligence/      # DecisionFabric, GLiDE, ContextCompiler
│   │   │   ├── governance/        # Guardian / Slayer / Healer / Treasurer
│   │   │   ├── bridge/            # Node.js ↔ Python floor bridge
│   │   │   ├── memory/            # MemoryOS / KnowledgeOS typed stores
│   │   │   └── timeline/          # TimelineIR (EDL) compiler-neutral model
│   │   ├── tests/                 # Vitest kernel suites
│   │   └── cli/                   # Project CLI (memory fabric, backfill, headless sync)
│   ├── lib/                       # Auth, quota, CAS, storage, rendering queues
│   └── content-engines/           # Declarative engines (quiz, facts, story, …)
├── services/
│   ├── rendering-engine/          # EXECUTION PLANE — FastAPI workers, create_short.py
│   │   ├── basic_render_api.py    # :8100 warm Basic pool
│   │   ├── basic_render_worker.py # Isolated rendering worker with disk validation
│   │   ├── kaggle_worker_bootstrap.py
│   │   ├── worker_daemon.py
│   │   └── scripts/create_short.py
│   └── pipeline/                  # Hexagonal Python floors F01–F06 + guardian
│       ├── floor01_strategy/
│       ├── floor02_scripting/
│       ├── floor03_asset_realization/
│       ├── floor04_media_synthesis/
│       ├── floor05_timeline_composition/
│       └── floor06_rendering/
├── docs/                          # Canonical Documentation Authority
│   ├── architecture/              # current.md · system-overview.md · authentication.md
│   ├── factoryos/                 # agent/event/floor contracts, hierarchy
│   ├── compute/                   # Heterogeneous rendering fabric specs
│   ├── security/                  # Threat models, RBAC, audit workflows
│   ├── verification/              # Traceability, F07 proof reports, audits
│   └── archive/                   # Historical, superseded
├── testing/                       # SituationGraph, EvidenceGraph, visual diffs
├── scripts/                       # Maintenance, migration, verification
├── firebase.json · vercel.json    # Hosting / deployment config
├── LICENSE                        # MIT
```

---

## 8. Getting Started

### Prerequisites

- **Node.js** `>=20.x`, **npm** `>=10.x`
- **Python** `>=3.11`, with `ffmpeg`/`ffprobe` on system `PATH`
  - Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y ffmpeg`
  - macOS: `brew install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg`

### Control Plane (apps/web/)

```bash
cd apps/web
npm install
cp .env.example .env            # fill in Cloudinary + AI provider keys
npm run dev                     # Next.js dev on http://localhost:3000 (Turbopack)
npm run build                   # 109 route production build
npm run lint
npm run factoryos:typecheck     # strict TypeScript for FactoryOS
npm run factoryos:test          # Vitest run over factoryos/tests + tests + shortforge/tests
```

### Rendering Engine (services/rendering-engine/)

```bash
cd services/rendering-engine
python -m venv venv; source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8080     # standalone worker
python -m uvicorn basic_render_api:app --reload --port 8100  # warm pool
curl http://localhost:8080/health
```

### Verification

```bash
npx vitest run factoryos/tests/token-economy.test.ts      # token & context economy
npx vitest run factoryos/tests/f07-guardian.test.ts       # 15 F07 gates
node scripts/verification/verify-repository.js            # CLAIM <= EVIDENCE hygiene
```

---

## 9. Security & Threat Model

ShortForge runs an active STRIDE threat model:

- **SSRF hardening** — media fetch URLs in the render pipeline validate against private ranges and reject cloud metadata endpoints (`169.254.169.254`).
- **Timing-safe authentication** — execution-token verification on `/api/rendering/callback` and claim paths uses `crypto.timingSafeEqual`.
- **Capability sandboxes** — agents run inside `AgentRuntime` with strictly scoped grants; a Floor-02 script agent cannot invoke rendering or publishing.
- **Fail-closed everywhere** — missing config → `AUTH_NOT_CONFIGURED`; timeout → abort; unparseable artifact → BLOCK.

To report security issues: email security@shortforge.dev or file a private advisory on GitHub.

---

## 10. License

ShortForge is MIT licensed — see [LICENSE](LICENSE).

---

<p align="center">
  <b>ShortForge</b> — engineering with Evolving future of AI.
</p>
