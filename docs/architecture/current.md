# ShortForge / FactoryOS — Factual Current Architecture

**Audit Basis**: Actual source code, real filesystem layout, and executable test suites.  
**Standard**: CLAIM <= EVIDENCE | Zero tolerance for undocumented abstractions.  
**Branch**: `chore/rename-shortforge`  
**Timestamp**: 2026-09-22T12:51:00Z  

---

## 1. Concrete System Verification Matrix

| Area | Current Implementation State | Truthful Operational Reality |
| :--- | :--- | :--- |
| **Authentication & RBAC** | `verifySession` helper checks Better-Auth session cookies & JWTs | Server-side API endpoints (`/api/publish/queue`, `/api/rendering/callback`, `/api/admin/*`) strictly reject unauthenticated requests with HTTP 401/403. |
| **Physical Media Verification** | `VerificationEngine.probeMediaFile` uses FFprobe | Reads container metadata, video stream codecs, audio streams, duration, and decode smoke. Fails closed if file is missing, empty, or unparseable. |
| **Artifact CAS Storage** | Two-level prefix sharding under `data/cas_storage/{ab}/{hash}.ext` | Writes atomically using `.tmp` files. Computes SHA-256 over physical bytes. Integrity is independently re-verified on read. |
| **F07 Gatekeeper** | 15 Sequential Gates (`G00` - `G14`) | Evaluates policy freshness, channel readiness, safety, reuse, rights, synthetic media, metadata, shorts eligibility, history repetition, and structured evidence. |
| **Cryptographic Signatures** | Detached Ed25519 signatures via Node `crypto.sign` | Signs RFC 8785 canonical JSON bytes. Verified using trusted public keys loaded from `data/keys/trusted_signers.json`. |
| **Capability Store** | SQLite database `data/authorizations.db` | Atomic state transition `ACTIVE -> CONSUMED` prevents double-publishing. Survives server reboots without loss of invalidations or consumptions. |
| **Publisher Queue** | SQLite database `data/queues.db` | Persistent transactional outbox with idempotency key deduplication and exponential backoff retry. |
| **YouTube Publishing** | YouTube Data API v3 (`videos.insert` resumable upload) | Strictly requires `AuthorizedPublicationCommand`. Checks JIT authorization, binds payload hash, verifies CAS artifact, sets `containsSyntheticMedia` and `selfDeclaredMadeForKids`. Fails closed if credentials are not configured. |
| **Google Drive Publishing** | Google Drive API v3 | Supports OAuth2 refresh tokens. Uploads video and verifies server state via `files.get`. Proven live in CI. |
| **Render Fabric** | Heterogeneous worker pool (Local, AMD, Ephemeral) | Uses leases, fencing tokens, and callback verification. Reconciles dropped callbacks via physical disk check. |
| **Artifact Lineage** | In-memory + JSON-persisted DAG | Prevents cycles with DFS ancestor traversal. Cascade-invalidates downstream child artifacts and evidence upon upstream repair. |

---

## 2. Hard Invariants Enforced in Code

1. **No Release Without Physical Verification**:
   * Code: `apps/web/factoryos/core/verification/youtube/F07ReleaseGuardian.ts`
   * Invariant: `physicalIntegrityFailure || !measurements.fileExists || measurements.byteLength <= 0` forces `publishAllowed = false` and `overallOutcome = "BLOCKED"`.

2. **No Publication Without Cryptographic Capability**:
   * Code: `apps/web/publishing/providers/youtube.ts`
   * Invariant: `if (!command.authorization) throw new Error("[YouTubeProvider] SECURITY REJECTION: Missing ReleaseAuthorization")`.

3. **No Duplicate Publication Via Replay**:
   * Code: `apps/web/factoryos/core/verification/youtube/DurableAuthorizationStore.ts`
   * Invariant: Atomic CAS statement `UPDATE release_authorizations SET status = 'CONSUMED' WHERE authorization_id = ? AND status = 'ACTIVE'`.

4. **Outbound Payload Fidelity**:
   * Code: `apps/web/factoryos/core/verification/youtube/contracts/F07ReleaseContracts.ts`
   * Invariant: `computeCanonicalPayloadHash` binds title, description, tags, privacyStatus, publishAt, containsSyntheticMedia, and selfDeclaredMadeForKids. Any divergence between approved and transmitted payload fails JIT validation.

5. **No Fake Success When Unconfigured**:
   * Code: `apps/web/publishing/providers/youtube.ts`
   * Invariant: If `!apiKey && !accessToken`, returns `{ success: false, error: "AUTH_NOT_CONFIGURED" }`. Zero synthetic URLs or mock video IDs are returned.
