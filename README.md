# ShortForge

> Autonomous, truth-verified AI video production factory with deterministic control planes and heterogeneous distributed rendering.

<p align="center">
  <a href="https://github.com/Gokul7904231/ShortForge/actions/workflows/ci.yml"><img src="https://github.com/Gokul7904231/ShortForge/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/TypeScript-Strict_FactoryOS-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeCheck" />
  <img src="https://img.shields.io/badge/Vitest-Passing_100%25-brightgreen?style=flat-square&logo=vitest" alt="Tests" />
  <img src="https://img.shields.io/badge/Architecture-FactoryOS_v2-indigo?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/Verification-CLAIM_%3C%3D_EVIDENCE-orange?style=flat-square" alt="Standard" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License" /></a>
</p>

---

## What It Is

**ShortForge** is an open-source, industrial-grade video generation factory designed to reliably synthesize 9:16 vertical video content (YouTube Shorts, TikTok, Reels) through an autonomous, policy-guarded assembly line.

Unlike script-to-video wrappers, ShortForge couples a Next.js 16 supervisory kernel (**FactoryOS**) with a **Heterogeneous Distributed Compute Fabric** (Kaggle T4, RunPod RTX 4090, Vast.ai RTX 3090, and Local FFmpeg) and a cryptographic release boundary (**F07 YouTube Monetization Guardian**).

---

## Why It Exists

1. **Eradication of Synthetic Success**: Most automated generative media pipelines hallucinate completions or return mock receipts when external services fail. ShortForge enforces `CLAIM <= EVIDENCE` across all operations.
2. **Deterministic Governance**: Video rendering, asset licensing, audio normalization, and YouTube community policy checks must be cryptographic invariants, not probabilistic hopes.
3. **Engineering Economy**: Video synthesis is expensive. ShortForge implements a Ponytail Token Economy (`CallGate`, `RetryClassifier`) and a bounded Context Compiler to minimize token and compute overhead.

---

## Architecture

ShortForge enforces a strict structural invariant: **There is exactly one authoritative production execution graph per job.**

```text
                                  USER / API REQUEST
                                          │
                                          ▼
                                AUTH & RBAC BOUNDARY
                          (Better-Auth Session & Quota Gate)
                                          │
                                          ▼
                             FACTORYOS CONTROL PLANE
                     (Mission Decomposition, Decision Fabric)
                                          │
                                          ▼
                    6-FLOOR PRODUCTION DAG (F01 ➔ F06)
          ┌────────────────────────────────────────────────────────┐
          │ F01: Research & Trend Ingestion                        │
          │ F02: Script & Narrative Synthesis                      │
          │ F03: Audio & Voice Fabric (TTS, Audio Normalization)   │
          │ F04: Visual Realization (Flux, B-Roll, Scene Blueprints)│
          │ F05: Timeline Synthesis (Scene Graph, Subtitle Layers) │
          │ F06: Distributed Render Fabric (Worker Dispatch)       │
          └────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                         CONTENT-ADDRESSED STORAGE (CAS)
                   (Two-Level Prefix Sharded SHA-256 Storage)
                                          │
                                          ▼
                        F07 RELEASE INTEGRITY GUARDIAN
              ┌──────────────────────────────────────────────────┐
              │ • 15 Verification Gates (G00–G14)                 │
              │ • Physical FFprobe Media Analysis & Audio Sync    │
              │ • Ed25519 Cryptographic Signatures               │
              │ • Quarantine of Simulated Publishing Providers   │
              └──────────────────────────────────────────────────┘
                                          │
                                          ▼
                            YOUTUBE PUBLISHING & DELIVERY
```

Full architectural specifications:

- [Current Factual Architecture](docs/architecture/current.md)
- [System Overview & Topology](docs/architecture/system-overview.md)

---

## System Components

| Component | Directory | Responsibility |
| :--- | :--- | :--- |
| **Control Plane** | [`apps/web/factoryos`](apps/web/factoryos/) | Sovereign kernel, mission planning, event bus, and policy gates |
| **Render Fabric** | [`apps/web/factoryos/core/fabric`](apps/web/factoryos/core/fabric/) | Heterogeneous worker protocol, qualification runner, and CAS |
| **Compute Adapters** | [`apps/web/factoryos/core/compute`](apps/web/factoryos/core/compute/) | Cloud orchestration for Kaggle, RunPod, and Vast.ai |
| **Intelligence** | [`apps/web/factoryos/core/intelligence`](apps/web/factoryos/core/intelligence/) | Typed Decision Fabric (`Noul`/`Choice`), Context Economy v2, Jev Shadow |
| **Token Economy** | [`apps/web/ai/economy`](apps/web/ai/economy/) | `CallGate`, 10-type `RetryClassifier`, and budget tracking |
| **Verification Gate** | [`apps/web/factoryos/core/verification`](apps/web/factoryos/core/verification/) | F07 YouTube Monetization Guardian and physical media prober |
| **Execution Engine** | [`services/rendering-engine`](services/rendering-engine/) | FastAPI rendering daemon, Python worker bootstrap, FFmpeg muxer |
| **Testing Harness** | [`testing/`](testing/) | Canonical SituationGraph, EvidenceGraph, and visual diff judge |

---

## FactoryOS

FactoryOS is the supervisory operating system running inside the Next.js runtime. It transforms human or scheduled intent into structured missions, monitors execution health, and guarantees state-machine atomicity:

- **Sovereign Agent Hierarchy**: Overseer, Slayer, Healer, and Worker models.
- **Deterministic Event Bus**: Resilient event distribution ensuring audit observability.
- **Content-Addressed Storage**: Artifacts are addressed strictly by physical byte SHA-256 digests (`data/cas_storage/{ab}/{hash}.ext`).

See [FactoryOS Documentation](docs/factoryos/agent-contracts.md) for contracts and schemas.

---

## Distributed Compute

ShortForge routes rendering workloads across diverse hardware providers:

1. **Kaggle GPU Worker**: Automated NVIDIA T4 rendering daemon via [`kaggle_worker_bootstrap.py`](services/rendering-engine/kaggle_worker_bootstrap.py).
2. **RunPod Compute**: Serverless and on-demand RTX 4090 worker instances.
3. **Vast.ai Compute**: Cost-optimized RTX 3090 GPU execution instances.
4. **Local Engine**: Fallback local FFmpeg/Pillow worker for development.
5. **Provider Qualification Matrix**: 8-level programmatic qualification gate (`ProviderQualificationMatrix.ts`) validating handshake, transport, rendering, and CAS integrity.

---

## Intelligence Layer

- **Typed Decision Fabric**: Introduces `Noul`, `Choice`, and `Score` primitives with distinct separation between epistemic confidence ($[0, 1]$ certainty) and outcome probability distribution.
- **Shadow-Mode Jev Intelligence**: Real-time evaluation of LLM decision proposals with shadow agreement logging before production intervention.
- **Context Economy v2**: Deterministic key sorting, state fingerprints, contextual SHA-256 caching, and 11-class credential redaction.

---

## Rendering Pipeline

```text
Topic / Intent
    ➔ Script Synthesis (Word Count & Rhythm Clamped)
    ➔ Voice Generation (edge-tts / Coqui / ElevenLabs with Audio Normalization)
    ➔ Subtitle Alignment (Word-Level Timing via Whisper)
    ➔ Visual Assembly (Dynamic Canvas, 9:16 Crop, 30/60fps Keyframes)
    ➔ FFmpeg Mux & Encode (H.264 / AAC Baseline, 1080×1920)
    ➔ CAS Ingestion & Checkpoint Validation
```

---

## Verification / F07

The **F07 YouTube Monetization & Content Integrity Guardian** serves as the authoritative release boundary:

- **Eradicated Synthetic Fallbacks**: Missing physical artifact hashes immediately trigger `physicalIntegrityFailure` without synthetic SHA generation.
- **Simulated Publisher Isolation**: `dryrun-youtube.ts` is explicitly quarantined and throws fatal exceptions in production environments without explicit bypass flags.
- **15 Concrete Gates (G00–G14)**: Verification of community guidelines, advertiser suitability, copyright compliance, audio loudness, and visual pacing.

---

## Repository Structure

```text
ShortForge/
├── .github/                 # Workflows (CI, worker keepalive), issue & PR templates
├── apps/
│   └── web/                 # Next.js 16 Control Plane, FactoryOS Kernel, Publishing
├── docs/                    # Canonical documentation authority (architecture, security, etc.)
│   ├── architecture/        # Factual current architecture and system topology
│   ├── factoryos/           # Agent models, event contracts, and floor definitions
│   ├── compute/             # Distributed rendering specifications
│   ├── intelligence/        # Decision intelligence and model routing
│   ├── security/            # STRIDE threat model and security workflows
│   ├── deployment/          # Multi-cloud deployment and authentication guides
│   ├── verification/        # Traceability matrices and F07 proof reports
│   └── archive/             # Historical milestone audits and superseded drafts
├── packages/
│   └── factoryos-render/    # Python rendering package and contracts
├── scripts/                 # Maintenance, migration, and verification automation
│   ├── maintenance/         # Repository health check scripts
│   └── verification/        # verify-repository.js hygiene gate
├── services/
│   ├── pipeline/            # Python floor compliance pipelines and guardians
│   └── rendering-engine/    # FastAPI render worker and Kaggle bootstrap daemon
└── testing/                 # FactoryOS canonical test framework and evidence graphs
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.x
- Python >= 3.10
- FFmpeg & FFprobe installed and available on `PATH`

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Gokul7904231/ShortForge.git
cd ShortForge

# 2. Install control plane dependencies
cd apps/web
npm install

# 3. Start local development server
npm run dev
```

The web dashboard is accessible at `http://localhost:3000`.

---

## Testing & Quality Gates

```bash
# Control plane TypeScript typecheck (strict)
npm run factoryos:typecheck

# FactoryOS core test suites
npm run factoryos:test

# Provider qualification and economy verification
npx vitest run factoryos/tests/provider-qualification-v2.test.ts
npx vitest run factoryos/tests/token-economy.test.ts
npx vitest run factoryos/tests/decision-fabric.test.ts

# Repository hygiene check
node scripts/verification/verify-repository.js
```

---

## Documentation

Full architectural specifications, threat models, and verification matrices are maintained under [`docs/`](docs/README.md).

- [Documentation Index](docs/README.md)
- [Current Factual Architecture](docs/architecture/current.md)
- [System Overview](docs/architecture/system-overview.md)
- [Security Threat Model](docs/security/threat-model.md)
- [Requirement Traceability Matrix](docs/verification/requirements/traceability-matrix.md)

---

## Security

Please report security issues responsibly. Refer to the [Security Threat Model](docs/security/threat-model.md) for details on trust boundaries, capability enforcement, and vulnerability reporting.

---

## Project Status

| Area | Status | Evidence |
| :--- | :--- | :--- |
| **Authentication & RBAC** | `INTEGRATION-VERIFIED` | Better-Auth session verification; server-side 401/403 gates |
| **Physical Media Probe** | `INTEGRATION-VERIFIED` | FFprobe metadata and decode smoke verification |
| **Content-Addressed Storage** | `INTEGRATION-VERIFIED` | Atomic write, SHA-256 physical byte digest verification |
| **F07 Release Guardian** | `INTEGRATION-VERIFIED` | 58/58 F07 tests passing; zero synthetic fallback SHA |
| **Heterogeneous Compute Adapters** | `UNIT-VERIFIED` | 6/6 qualification tests passing for Kaggle, RunPod, Vast |
| **Token & Context Economy** | `UNIT-VERIFIED` | 13/13 token economy tests passing; ContextCompiler v2 green |
| **Decision Intelligence Fabric** | `SHADOW-MODE` | TypeSafeJevAdapter operational in shadow evaluation mode |
| **Live Cloud Rendering** | `REQUIRES-CREDENTIALS` | Adapters functional; requires live API keys for L6–L8 cloud testing |

---

## License

MIT — see [LICENSE](LICENSE).