# ShortForge / FactoryOS — Final Architecture Map

**Target Branch**: `chore/rename-shortforge`  
**Evaluation Standard**: CLAIM <= EVIDENCE  
**Last Updated**: 2026-09-22T12:50:00Z  

---

## 1. End-to-End System Topology

```
+-----------------------------------------------------------------------------------------+
|                                    USER INTERACTION                                     |
|  Web UI / Dashboard / API Requests (/api/factory/execute, /api/publish/queue)          |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                                   AUTH & RBAC GATEWAY                                   |
|  verifySession(req) -> Owner / Admin / Editor Authorization Boundary                    |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                                   FACTORYOS OVERSEER                                    |
|  Mission Decomposition, Thinking Controller, Context Capsules, Floor Scheduling         |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                                  PRODUCTION FLOORS F01-F06                              |
|  F01: Research & Trend Ingestion (Reddit, YouTube Trends, Web Search)                  |
|  F02: Script Generation (Topic, Persona, Hook, Duration Constraints)                   |
|  F03: Audio & Voice Fabric (TTS Synthesis, Voice Cloning, Audio Tracks)                 |
|  F04: Visual & Asset Realization (Image Gen, B-Roll, Shot Recipes, Video Clamps)       |
|  F05: Timeline Synthesis & Assembly (Scene Graph, Caption Layers, Dynamic Transitions)  |
|  F06: Distributed Render Fabric (Local FFmpeg, ROCm/AMD, Ephemeral Worker Pool)         |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                               CONTENT ADDRESSED STORAGE (CAS)                           |
|  Physical Bytes Stream -> SHA-256 Digest -> Sharded Immutable CAS (data/cas_storage/)   |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                  F07 YOUTUBE MONETIZATION & CONTENT INTEGRITY GUARDIAN                  |
|  * Physical Media Probe (Container, Stream Geometry, Codecs, Audio Sync, Decode Smoke)  |
|  * Gates G00-G14 Evaluation (Policy Freshness, Community Safety, Inauthentic Content,  |
|    Commercial Rights, Synthetic Media, Shorts 180s Boundary, Lineage Reconciliation)   |
|  * Invalidation Tracker & ReMaker Remediation Planner (if findings detected)            |
|  * Deterministic Canonical Serialization & Ed25519 Detached Receipt Signature           |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                           DURABLE RELEASE AUTHORIZATION STORE                           |
|  * SQLite `release_authorizations` (WAL Mode, Row Locking)                              |
|  * Binds: artifactSha256, targetChannelId, targetPlatform, canonicalPayloadHash         |
|  * Status: ACTIVE -> CONSUMED | INVALIDATED                                             |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                                 PUBLISHER QUEUE & OUTBOX                                |
|  * Transactional Outbox (data/queues.db) with Monotonic Priority & Retry Backoff        |
|  * Replay & Idempotency Defense (Idempotency Key & Session Tracking)                   |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                            JUST-IN-TIME (JIT) SAFETY BOUNDARY                           |
|  * Re-verifies Ed25519 signature against F07TrustedKeyStore                             |
|  * Re-verifies active status in DurableAuthorizationStore                               |
|  * Re-verifies canonicalPayloadHash == computeCanonicalPayloadHash(actualPayload)       |
|  * Atomically claims token (`UPDATE ... SET status='CONSUMED' WHERE status='ACTIVE'`)   |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                                EXTERNAL PLATFORM PROVIDERS                              |
|  * YouTube Provider (Resumable Upload, Status Reconciliation, Zero Fake Success)        |
|  * Google Drive Provider (Multipart / Direct Upload, Server Verification via files.get) |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                            EXTERNAL PLATFORM RECONCILIATION                             |
|  * HTTP 308 Session Probe (Offset Recovery & Duplicate Prevention)                       |
|  * Platform Status Verification (videos.list / files.get)                               |
|  * Durable Audit Logging & Memory Learning Loop                                         |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Directory Layout & Key Modules

* `apps/web/factoryos/core/verification/youtube/`:
  * `F07ReleaseGuardian.ts`: Main gatekeeper orchestrating F00-F14, CAS binding, and authorization issuance.
  * `VerificationReceipt.ts`: Immutable verification receipt construction and Ed25519 signing.
  * `F07TrustedKeyStore.ts`: Signer trust management and key revocation store.
  * `DurableAuthorizationStore.ts`: SQLite-backed state machine for release capabilities.
  * `gates/`: G00 through G14 gate implementations.
  * `policy/`: Date-aware policy store and AST rule evaluation.
  * `remediation/`: ReMaker remediation planner and `ArtifactLineageGraph` DAG.
* `apps/web/publishing/providers/`:
  * `youtube.ts`: Hardened YouTube Data API provider with JIT re-verification.
  * `social-platforms.ts`: Sealed publication router with no mock bypasses.
* `apps/web/storage/providers/`:
  * `google-drive.ts`: Production Google Drive integration with OAuth2 refresh tokens.
* `apps/web/factoryos/core/compute/cas/`:
  * `ContentAddressedStore.ts`: Two-level sharded CAS store with atomic file renaming.
