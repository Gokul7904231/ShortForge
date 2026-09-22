# FACTUAL_CURRENT_ARCHITECTURE.md
**Current Architectural State & Forensic Component Classification**
**Date**: September 21, 2026
**Commit Target**: `chore/rename-shortforge`
**Invariant**: `CLAIM <= EVIDENCE`

---

## 1. Executive Summary & Verification Tiers
This document establishes the verified baseline of all components in ShortForge / FactoryOS related to Floor 07 (F07), verification, policy intelligence, content originality, publishing, media rendering, and Overseer control plane prior to the vNext hardening.

Classification Tiers:
- `IMPLEMENTED`: Source code exists and compiles.
- `UNIT-VERIFIED`: Automated unit test passes in isolation.
- `INTEGRATION-VERIFIED`: Automated cross-module integration test passes.
- `E2E-VERIFIED`: Automated end-to-end mission lifecycle passes.
- `REAL-SMOKE-VERIFIED`: Real local process, FFmpeg, disk I/O, or worker execution confirmed.
- `PRODUCTION-VERIFIED`: Real deployed third-party production interaction verified with immutable evidence.
- `SIMULATED`: Contains stubs, synthetic responses, or fake success mocks.
- `LEGACY`: Deprecated code path preserved for backwards compatibility.
- `DEAD-CODE`: Unreferenced code path.
- `UNKNOWN`: Unverified or uninstrumented state.

---

## 2. Component Inventory & Classification

| Component | Path | Current Classification | Forensic Observation |
| :--- | :--- | :--- | :--- |
| **F07ReleaseGuardian** | `apps/web/factoryos/core/verification/youtube/F07ReleaseGuardian.ts` | `UNIT-VERIFIED` | Disconnected from `OverseerControlPlane.ts` and `PublisherQueue`. Used only in unit tests. Contains empty-hash fallback `e3b0c44...`. |
| **VerificationEngine** | `apps/web/factoryos/core/verification/VerificationEngine.ts` | `REAL-SMOKE-VERIFIED` | Real FFprobe and FFmpeg decode smoke testing. `auditMediaArtifact()` enforces 11 physical checks. |
| **ContentAddressedStore (CAS)** | `apps/web/factoryos/core/compute/cas/ContentAddressedStore.ts` | `REAL-SMOKE-VERIFIED` | Real SHA-256 computation, sharded disk storage (`data/cas_storage`), atomic file operations, tamper detection. |
| **YouTubePolicyStore** | `apps/web/factoryos/core/verification/youtube/policy/YouTubePolicyStore.ts` | `UNIT-VERIFIED` | Manages rules and snapshots. Contains `getRule` fallback fabrication which violates fail-closed invariant. |
| **PolicySourceRegistry** | `apps/web/factoryos/core/verification/youtube/policy/PolicySourceRegistry.ts` | `IMPLEMENTED` | Indexes 12 official Google/YouTube documentation sources, but hashes are URL-string hashes rather than fetched document bytes. |
| **PolicySourceFetcher** | *Missing* | *To be built* | Required for HTTPS fetch, allowlisting, content hashing, and fail-closed freshness checking. |
| **VerificationReceipt** | `apps/web/factoryos/core/verification/youtube/VerificationReceipt.ts` | `UNIT-VERIFIED` | Produces `receiptSignatureSha256` which is only a SHA-256 digest, not an unforgeable Ed25519 digital signature. |
| **G12_ShortsEligibilityGate** | `apps/web/factoryos/core/verification/youtube/gates/G12_G14_Gates.ts` | `UNIT-VERIFIED` | Erroneously treats Content ID claims post-2026-09-24 as hard `BLOCKED` instead of `REVENUE_IMPACT` (playable). |
| **G01_ChannelReadinessGate** | `apps/web/factoryos/core/verification/youtube/gates/G00_G02_Gates.ts` | `UNIT-VERIFIED` | Trusts supplied `yppStatus` string instead of calculating thresholds against YPP policy data (1000 subs / 4000 hrs / 10M shorts) and 2027 shift. |
| **G14_EvidenceReconciliationGate** | `apps/web/factoryos/core/verification/youtube/gates/G12_G14_Gates.ts` | `UNIT-VERIFIED` | Only checks `evidence.length > 0` on string arrays, rather than validating typed, cryptographic `EvidenceRef` items. |
| **ChannelCreativeHistory** | `apps/web/factoryos/core/verification/youtube/creative/ChannelCreativeHistory.ts` | `UNIT-VERIFIED` | In-memory only; lacks durability, persistence, and coverage tracking (`FULL` vs `SHORTFORGE_ONLY`). |
| **VariationPlanner** | `apps/web/factoryos/core/verification/youtube/creative/VariationPlanner.ts` | `UNIT-VERIFIED` | Generates script hash from length (`hash_${id}_${len}`); falls back to `candidates[0]` instead of `NO_VALID_VARIATION`. |
| **RemediationCase / Tracker** | `apps/web/factoryos/core/verification/youtube/remediation/` | `UNIT-VERIFIED` | Uses `Math.random()` and `Date.now()` for revision IDs; tracks stages instead of granular artifact lineage DAG. |
| **PublicationAuthorizationService** | *Missing* | *To be built* | Mandatory release choke point currently absent. |
| **PublisherQueue** | `apps/web/publishing/publisher-queue.ts` | `SIMULATED` / `LEGACY` | Directly executes `provider.publish(payload)` without verifying an F07 release authorization or immutable CAS artifact. Subscribes to `storage.upload.completed` and enqueues without gating. |
| **Immediate Publish Route** | `apps/web/app/api/publish/queue/route.ts` | `LEGACY` (Bypass) | Lines 67-84 allow `immediate: true` to bypass the queue and publish directly without verification or authorization. |
| **YouTubePublishingProvider** | `apps/web/publishing/providers/youtube.ts` | `SIMULATED` | When credentials are missing, returns `success: true` with a fake stub ID. Hardcodes `selfDeclaredMadeForKids: false`. Ignores synthetic media flags. |
| **Execution Authority Route** | `apps/web/app/api/generate-video/route.ts` | `LEGACY` (Bypass) | If `EXECUTION_AUTHORITY !== "factoryos"`, falls back to legacy FastAPI Azure worker without FactoryOS or F07 oversight. |
| **OverseerControlPlane** | `apps/web/factoryos/core/overseer/OverseerControlPlane.ts` | `REAL-SMOKE-VERIFIED` | Runs Floors 01-06, renders real MP4, and marks video `status: "completed"` without invoking Floor 07. |

---

## 3. Publication Side Effect Paths Traced

### Path A: Direct Storage Upload Event (Bypass)
1. `StorageQueue` completes upload.
2. Emits `storage.upload.completed` on `EventBus`.
3. `PublisherQueue` line 160 receives event and automatically enqueues publish job.
4. `PublisherQueue.processJob` calls `PublishingRegistry.getProvider(platform).publish(payload)`.
5. **Finding**: ZERO verification of F07 release authorization or receipt.

### Path B: Immediate Publish API Endpoint (Bypass)
1. Client POSTs to `/api/publish/queue` with `immediate: true`.
2. Route maps through `PublishingRegistry.getProvider(platform).publish(payload)`.
3. **Finding**: Bypasses queue and F07 authorization entirely.

### Path C: Standard Publisher Queue Enqueue (Bypass)
1. Client POSTs to `/api/publish/queue` with `jobId`, `platforms`, `videoUrl`.
2. Enqueued directly into SQLite / memory queue.
3. Worker ticks and calls `provider.publish(payload)`.
4. **Finding**: No check of artifact hash matching disk or receipt existence.

### Path D: Simulated YouTube Provider (False Success)
1. `YouTubePublishingProvider.publish()` checks credentials.
2. If credentials missing:
   ```ts
   return {
     platform: "youtube",
     success: true,
     postId: `yt_stub_${Date.now()}`,
     postUrl: `https://youtube.com/watch?v=stub_${payload.jobId}`,
     publishedAt: new Date().toISOString()
   };
   ```
3. **Finding**: Violates `CLAIM <= EVIDENCE`. Falsely reports successful publication when no video was uploaded.

---

## 4. Completion Declaration Paths Traced

### Path 1: OverseerControlPlane Floor 06
- `OverseerControlPlane.ts` lines 1225-1240: Sets manifest `status: "completed"`, `videoUrl: /api/media/video/${jobId}`, `artifactSha256: artifact.sha256`.
- **Finding**: F07 is omitted from mission completion DoD.

### Path 2: Storage Queue Completion
- `apps/web/storage/upload-queue.ts` lines 440-465: Uploads to Drive/Cloudinary, updates Firestore `status: "completed"`.

### Path 3: Legacy API Worker Callback
- Legacy routes update Firestore document directly on HTTP callback.

---

## 5. Architectural Gap Summary
1. **No Release Choke Point**: No centralized capability authority sits between artifact generation and external publishing.
2. **Receipt Forgery Risk**: Receipts lack cryptographic digital signatures (Ed25519) and can be synthesized without authority.
3. **TOCTOU Risk**: File paths on disk are mutable; publisher uploads from path rather than streaming directly from immutable CAS.
4. **Policy-as-Data Fallback Hazard**: Missing policy rules generate ad-hoc fallback rules rather than failing closed.
5. **False YouTube Success**: Provider fabricates successful upload when credentials are unconfigured.
6. **Decoupled Evaluator**: G00-G14 gates evaluate in memory but their findings do not govern the actual release gatekeeper in production.
