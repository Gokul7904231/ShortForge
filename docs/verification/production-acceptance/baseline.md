# ShortForge Production Acceptance Baseline Report (Wave 0)

**Date:** 31 October 2026  
**Authority:** Principal Software Architect, Release Lead, QA Architect  
**Repository:** [ShortForge (Gokul7904231/ShortForge)](https://github.com/Gokul7904231/ShortForge)  
**Base Commit (main):** `cf4cc2c9eae81e4e835a1c6ee8d7bc579868a6af`  
**Integration Baseline Head:** `3330ecbd6f4a21c564c08f1a6316ab72991b757a` (from PR #257)  
**Dedicated Branch:** [`feat/production-acceptance-verification-fabric-20261031`](https://github.com/Gokul7904231/ShortForge/tree/feat/production-acceptance-verification-fabric-20261031)  
**Dedicated Worktree:** `C:\Users\ASUS\OneDrive\Desktop\123\ShortForge-verification-fabric`  
**Status:** **WAVE 0 BASELINE ESTABLISHED & FROZEN**

---

## 1. Repository & Worktree Topology

### Isolation & Governance
- Primary repository worktree `C:\Users\ASUS\OneDrive\Desktop\123\aishorts` remains on `feat/product-acceptance-20261029` with uncommitted changes preserved and completely untouched.
- Previous acceptance worktree `C:\Users\ASUS\OneDrive\Desktop\123\ShortForge-production-acceptance` remains on `feat/non-lightning-production-acceptance-20261030` at `3330ecbd`.
- New isolated worktree created at `C:\Users\ASUS\OneDrive\Desktop\123\ShortForge-verification-fabric` on dedicated branch `feat/production-acceptance-verification-fabric-20261031`.
- Clean junction for `apps/web/node_modules` established; both `npm run factoryos:typecheck` and `npm run typecheck` pass with 0 errors.

### Remote & Pull Request Topology
```text
origin/main (cf4cc2c9)
  │
  ├── PR #256 (285e8b43) feat/product-acceptance-20261029 [Creator journey truth & delivery]
  │     └── [Merged into acceptance branch via 5cfef1b3]
  │
  ├── PR #257 (3330ecbd) feat/non-lightning-production-acceptance-20261030 [Local NVENC renders]
  │     └── BASELINE FOR THIS MISSION (feat/production-acceptance-verification-fabric-20261031)
  │
  ├── PR #258 (f19de6cb) feat/ascalon-dataset-admission-20261031 [Ascalon dataset admission]
  └── PR #259 (b4c256f7) feat/aer-shadow-evidence-20261031 [AER shadow evidence verifier]
```

---

## 2. Existing Capabilities

1. **Floor 06 Local RenderFabric:** Canonical local rendering via `packages/factoryos-render` using FFmpeg 8.1.2 + Pillow + NVIDIA GeForce RTX 3050 NVENC (`h264_nvenc`).
2. **Floor 04 VoiceFabric:** Primary host/SAPI voice engine (`SystemVoiceEngine`) generating clean mono PCM/WAV speech with 0 network websocket dependencies.
3. **CAS Storage:** `ContentAddressedStore` calculating SHA-256 digests and organizing files into immutable CAS paths (`cas://<sha256>`).
4. **Google Drive & Firestore Delivery:** OAuth2 storage provider with public view/download link permissions and durable Firestore document persistence in collection `videos`.
5. **Initial F07 Media Audit:** Audio volume analysis using FFmpeg `volumedetect` for whole-stream and latter-half levels, plus initial frame sampling.

---

## 3. Forensic Gap Analysis

| Architectural Dimension | Existing State | Target Production State | Required Wave |
|---|---|---|---|
| **Duration Enforcement** | Dynamically expanded to 93.93s for a 60s request because narration text was unconstrained. | Hard `DurationContract`: strict $\pm 5\%$ tolerance window (57–63s for 60s target; 171–189s for 180s target). Narration pre-budgeted by speaking rate. | Wave 1 |
| **Voice Fail-Closed Policy** | Generic audio path without explicit quality class contract. | `VoiceArtifact` contract (`PRIMARY`, `DEGRADED`, `SILENT`). Mandatory narration strictly rejects `SILENT` or missing audio. Kokoro benchmarked. | Wave 1 |
| **Template Intelligence** | Fixed 9-scene recipe mapping for `facts.deep-explainer.v1`. | Dynamic narrative planning with variable scene counts, Zod-validated `ContentPlan`, attributable quotes only, diverse template visual lowerings. | Wave 2 |
| **Factual Provenance** | Topic fallback facts without structured source records. | Structured `ClaimLedger`: verified claim IDs, publisher, source URL, timestamp, excerpt. DeepEval evaluation adapter. | Wave 2 |
| **Canonical F00–F07 Execution** | Acceptance script invoked pipeline directly rather than canonical services. | Canonical trajectory via real application services (`ResearchRuntime`, `StrategyFloor`, `ScriptFloor`, etc.) with fail-closed credential reporting. | Wave 3 |
| **Speech Verification Fabric** | Only bulk volume dB measurement. | True VAD (Silero VAD adapter) + word-level transcription and forced alignment (WhisperX / local ASR adapter). | Wave 4 |
| **Visual Verification Fabric** | Only 3 sample frames. | PySceneDetect adapter measuring actual physical scene cuts, black frame detection, and perceptual hashing across all scenes. | Wave 4 |
| **Observability** | Internal ad-hoc logging. | OpenTelemetry W3C traceparent propagation across floors. | Wave 4 |
| **Process Restart Recovery** | In-memory cache clearing simulated restart. | Automated separate-process OS crash & resume harness, lease fencing, idempotency key reconciliation. | Wave 5 |
| **Evidence & Attestation** | Shared artifact folder overwritten on subsequent runs. | Isolated immutable run directories (`artifacts/production-acceptance/<run-id>/`), hash validation, and GitHub artifact attestations (`actions/attest`). | Wave 6 |
| **End-to-End Acceptance** | 26s/94s videos without strict duration tolerance. | Separate 60s compliant, 180s compliant, template diversity, and failure-injection missions. | Wave 7 |

---

## 4. Execution Plan by Waves

1. **Wave 1:** DurationContract, narration word budgeting, VoiceArtifact fail-closed enforcement, unit/integration tests.
2. **Wave 2:** ContentPlan, variable narrative structures, ClaimLedger with real source provenance, DeepEval adapter, template diversity tests.
3. **Wave 3:** Canonical service trajectory, credential diagnostics, persistent correlated receipts across floors.
4. **Wave 4:** Speech verification (Silero VAD + WhisperX adapters), visual verification (PySceneDetect adapter), OpenTelemetry tracing.
5. **Wave 5:** Multi-process restart recovery harness, lease fencing, idempotency verification.
6. **Wave 6:** Immutable run bundles (`artifacts/production-acceptance/<run-id>/`), SHA-256 verification, GitHub artifact attestations.
7. **Wave 7:** Final independent acceptance runs (60s Mission A, 180s Mission B, Template Diversity Mission C, Failure Injection Mission D).

---

## 5. Exit Criteria for Wave 0

- [x] Baseline commit identified: `3330ecbd6f4a21c564c08f1a6316ab72991b757a`
- [x] Feature branch created: `feat/production-acceptance-verification-fabric-20261031`
- [x] Isolated worktree operational at `C:\Users\ASUS\OneDrive\Desktop\123\ShortForge-verification-fabric`
- [x] TypeScript validation clean (`factoryos:typecheck` and `typecheck` 0 errors)
- [x] Baseline document written and committed
