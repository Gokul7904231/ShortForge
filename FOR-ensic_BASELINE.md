# ShortForge / FactoryOS — Master Forensic Baseline Report
**Classification Standard**: `IMPLEMENTED` | `PARTIAL` | `MOCK` | `UNVERIFIED` | `BROKEN` | `DEPRECATED` | `TARGET` | `EXTERNAL` | `PROTOTYPE`

---

## 1. Forensic Subsystem Classification

| Subsystem / Component | Path / Reference | Classification | Evidence & Runtime State |
| :--- | :--- | :---: | :--- |
| **Floor 00: Analyst & Reach** | `apps/web/factoryos/core/research/` | `IMPLEMENTED` | Real HTTP & DOM source acquisition via Reach; claim-level evidence model with contradiction parsing; JCS-v1 HMAC-SHA256 ResearchPassport signing. |
| **Floor 01: Strategy** | `apps/web/factoryos/core/strategy/` | `IMPLEMENTED` | Pacing curves, archetype retention models, and topic angle generation. |
| **Floor 02: Scripting** | `apps/web/factoryos/core/scripting/` | `IMPLEMENTED` | Scene segmentation, spoken cadence calculation, and Instructor schema compliance. |
| **Floor 03: Visual Planning** | `apps/web/factoryos/core/visual/` | `IMPLEMENTED` | Visual plan formulation, aspect ratio enforcement (9:16), scene asset manifests. |
| **Floor 04: Voice Fabric** | `apps/web/factoryos/core/voice/VoiceFabric.ts` | `IMPLEMENTED` | Multi-engine registry (`GeminiTTSProvider`, `ElevenLabsProvider`, `EdgeTTS`). Physical audio probing (`ffprobe`), SHA-256 validation. Primary engines fail with `LIVE_PROVIDER_REQUIRED` when keys are missing. `SilentWavVoiceEngine` strictly marked `DEGRADED_FALLBACK`. |
| **Floor 05: Timeline Composition** | `apps/web/factoryos/core/timeline/` | `IMPLEMENTED` | Deterministic timeline cue construction, millisecond synchronization, and audio-video layout. |
| **Floor 06: Render Fabric (FFmpeg)** | `apps/web/factoryos/core/rendering/RenderFabric.ts` | `IMPLEMENTED` | Deterministic local MP4 rendering via native `ffmpeg` binary. Generates 1080x1920 H.264/AAC videos with atomic disk promotion. |
| **Floor 06: Render Fabric (HyperFrames)** | `apps/web/factoryos/core/rendering/RenderFabric.ts` | `PROTOTYPE` | Blocked server-side from production execution (`isProductionRoutable: false`). |
| **Floor 07: Verification & Forensic Media Probe** | `apps/web/factoryos/core/verification/VerificationEngine.ts` | `IMPLEMENTED` | 3-layer architecture: Layer 1 (Physical Forensics - 9 hard gates), Layer 2 (Content Evidence), Layer 3 (Heuristic Quality). Uses subprocess `ffprobe` and `ffmpeg` decode smoke test. Zeroes out overall scores on hard gate failure. |
| **Artifact Resolver** | `apps/web/factoryos/core/rendering/ArtifactResolver.ts` | `IMPLEMENTED` | Enforces HTTPS-only, SSRF DNS/IP inspection, 250MB streaming download limits, redirect revalidation, and approved-root containment with symlink escape defense. |
| **Remote Render State Machine** | `apps/web/factoryos/core/rendering/RemoteRenderStateMachine.ts` | `IMPLEMENTED` | 11 lifecycle states. Attempt monotonicity, lease expiration, and lost-callback physical artifact recovery using Floor 07 forensic audit before completion. |
| **Central Capability Registry** | `apps/web/factoryos/core/cognitive/CapabilityRegistry.ts` | `IMPLEMENTED` | Role and floor boundary enforcement; blocks `MOCK`, `UNVERIFIED`, `PROTOTYPE` in production; real file-system `code.graph` analyzer. |
| **Overseer Control Plane** | `apps/web/factoryos/core/overseer/OverseerControlPlane.ts` | `IMPLEMENTED` | WorldState tracking, thinking depth allocation (REFLEX/DELIBERATE/DEEP), TaskDAG execution, and decision logging. |
| **Recovery Actors (Slayer, Healer, ReMaker)** | `apps/web/factoryos/core/recovery/` | `IMPLEMENTED` | Single factory-wide Slayer investigates; Overseer commands; Healer executes remediation; ReMaker handles reconstruction. |
| **Authentication & Session Authority** | `apps/web/lib/auth.ts`, `apps/web/lib/auth-client.ts` | `IMPLEMENTED` | Better Auth is canonical user identity authority. Firebase Admin is strictly scoped to Firestore/Storage persistence. |
| **Quota & Entitlement Service** | `apps/web/lib/quota/quota-service.ts` | `IMPLEMENTED` | Compare-and-set quota reservation, bounded 15-minute TTL recovery, and idempotent slot finalization. |
| **UI Telemetry & Disclosure** | `apps/web/components/overseer/`, `apps/web/components/factoryos/` | `IMPLEMENTED` | Displays `UNKNOWN` / `UNMEASURED` when unmeasured; dynamic tab counts; no synthetic completion metrics. |

---

## 2. Specialist Audit Syntheses (Agents A through L)

### Agent A: Voice Fabric
- **Findings**: Primary engines (`GeminiVoiceEngine`, `ElevenLabsVoiceEngine`, `EdgeVoiceEngine`) now invoke live providers or fail closed with `LIVE_PROVIDER_REQUIRED`. Silent WAV engine is classified as `DEGRADED_FALLBACK` (`isFallback: true`). Latency reports `ESTIMATED` unless physically measured.
- **Defects Fixed**: Removed fabricated `req_gemini_${uuid}` provider request IDs; separated `factoryExecutionId` from `providerRequestId`.

### Agent B: Capability Registry
- **Findings**: Handlers for all production-routable capabilities are genuinely implemented. `code.graph` inspects the physical filesystem. `research.web` calculates claim-level confidence. `render.hyperframes` is blocked from production routing.

### Agent C: UI Telemetry Forensics
- **Findings**: Removed all hardcoded metric claims (`count: 2`, `isAvailable: true`, `estimatedLatencyMs: 240`). State distinguishes `CONFIGURATION DEFAULT`, `LIVE OBSERVABILITY`, `UNKNOWN`, and `ESTIMATED`.

### Agent D: Research Evidence Integrity
- **Findings**: Claims maintain source lineage with `supportingSources`, `contradictingSources`, and `contradictionDegree`. Contradictory evidence lowers confidence to ~0.35 and sets status to `CONTRADICTED`. Removed static competitor fixtures.

### Agent E: ArtifactResolver Security
- **Findings**: Rejects unencrypted `http://`. Resolves DNS and blocks localhost, `127.0.0.1`, `::1`, `0.0.0.0`, cloud metadata (`169.254.169.254`), and RFC1918 subnets. Revalidates every redirect destination against SSRF. Enforces 250MB streaming download limits. Local paths are validated for approved-root containment and symlink escapes.

### Agent F: Remote Render State Machine
- **Findings**: Enforces attempt monotonicity: callbacks with `attemptId < currentAttempt` are rejected as stale (`STALE_ATTEMPT`). Lost callbacks are recovered ONLY if a candidate artifact passes full F7 media verification and expected SHA-256 matching.

### Agent G: F7 Verification & Media Forensics
- **Findings**: 9 hard gates independently inspected via `ffprobe` and `ffmpeg` decode smoke test. Separated technical validity from creative heuristics. Failure of any hard gate strictly zeroes out `overallScore`, `qualityScore`, and `confidence`.

### Agent H: Adversarial E2E Suite
- **Findings**: Test suite in `adversarial-p0-gates.test.ts` exercises failure injection across H1 to H15. Uses genuine MP4 media artifacts generated via native `ffmpeg` compiler, not arbitrary byte buffers.

### Agent I: Authority & Identity
- **Findings**: Better Auth acts as the canonical application identity and session authority. Firebase Admin is confined to infrastructure storage.

### Agent J: Provenance & Policy
- **Findings**: Cryptographic ResearchPassport signing with JCS-v1 and HMAC-SHA256. Tamper-evident audit trail for all external research and claims.

### Agent K: Artifact Graph
- **Findings**: Strongly-typed artifact contracts from Floor 00 (`AnalystReport`, `ResearchPassport`) through Floor 07 (`VerificationReport`).

### Agent L: Full-System Integration
- **Findings**: End-to-end mission execution flows through Overseer -> TaskDAG -> Floors -> Verification -> Delivery Outbox.
