# FORENSIC SIDE EFFECT PATHS & INGRESS AUDIT
**ShortForge / FactoryOS Forensic Audit**  
**Classification Target**: ZERO UNCLASSIFIED PUBLICATION PATHS  
**Date**: September 2026 | **Authoritative Commit**: Current HEAD (`chore/rename-shortforge`)

---

## 1. Executive Summary & Forensic Matrix

This document establishes the exhaustive forensic enumeration of **every execution path** in ShortForge capable of:
- Generating content or media
- Rendering video artifacts
- Uploading to storage (Google Drive, Cloudinary)
- Queueing publication
- Publishing immediately
- Retrying publication or processing callbacks
- Marking jobs completed, writing public URLs or platform post IDs

### Invariant Target:
```
NO VALID F07 RELEASE AUTHORIZATION = NO EXTERNAL YOUTUBE PUBLICATION
```

---

## 2. Exhaustive Enumeration of Side-Effect Paths

| Path ID | Entry Point | Primary Side Effect | F07 Guardian Check | Auth Invariant Status | Evidence Tier |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEP-01** | `POST /api/publish/queue` (`immediate: true`) | Outbound YouTube / Social API call | Conditional (YouTube only) | **DEFECTIVE**: Missing route auth; non-YT bypasses F07 | `INTEGRATION-VERIFIED` |
| **SEP-02** | `POST /api/publish/queue` (`immediate: false`) | SQLite Enqueue (`PublisherQueue`) | Conditional (YouTube only) | **DEFECTIVE**: Missing route auth; non-YT bypasses F07 | `INTEGRATION-VERIFIED` |
| **SEP-03** | `PublisherQueue.processJob` (Worker Loop) | YouTube / Social Provider publish | JIT revalidation on YT | **DEFECTIVE**: In-memory store lost on restart | `INTEGRATION-VERIFIED` |
| **SEP-04** | `DELETE /api/publish/queue?id=` (Dead Retry) | Resets job to `pending` in SQLite | Deferred to worker | **DEFECTIVE**: Public unauthenticated retry | `UNIT-VERIFIED` |
| **SEP-05** | `EventBus: storage.upload.completed` | Auto-enqueue to `PublisherQueue` | Throws for YT; passes for stubs | **DEFECTIVE**: Social stubs auto-published without F07 | `IMPLEMENTED` |
| **SEP-06** | `WorkflowRuntime.run` ("publish" Step) | Emits `WorkflowEvents.PUBLISHER_STARTED` | None | **DEFECTIVE**: Unbounded event trigger | `IMPLEMENTED` |
| **SEP-07** | `YouTubePublishingProvider.publish` | Googleapis `youtube.videos.insert` | Enforced JIT check | **DEFECTIVE**: Remote URL fallback; payload truncation | `INTEGRATION-VERIFIED` |
| **SEP-08** | `DryRunYouTubePublishingProvider.publish` | Simulated upload (ID generation) | Enforced JIT check | Isolated (dryrun-only) | `UNIT-VERIFIED` |
| **SEP-09** | `social-platforms.ts: createStubProvider` | Returns fake `postId` + `success: true` | **NONE** | **CRITICAL DEFECT**: Fake production success | `SIMULATED` |
| **SEP-10** | `POST /api/rendering/callback` | Marks job `completed` in DB/FS | Technical Forensics Only | Missing Policy Guardian (G00–G14) | `INTEGRATION-VERIFIED` |
| **SEP-11** | `GET /api/published-video` | Serves public video URL | None (Read-only) | Serves un-audited video if DB status completed | `IMPLEMENTED` |
| **SEP-12** | `ProductionRunner.executeJob` | Uploads to Google Drive Outbox | QuizGuardian only | Missing F07; contains `forceOfflinePass` override | `INTEGRATION-VERIFIED` |
| **SEP-13** | `StorageQueue.processJob` | Google Drive / Cloudinary upload | None (Storage Floor) | Bypasses CAS cryptographic verification | `INTEGRATION-VERIFIED` |
| **SEP-14** | `POST /api/generate-video` | Creates FactoryOS mission; F06 RenderFabric routes physical rendering via ComputeRouter | Deferred to artifact/mission verification | Validates auth, quota, and mission scope | `INTEGRATION-VERIFIED` |

---

## 3. Deep Forensic Audit per Path

### SEP-01: Direct Immediate Publish via Public API Route
- **Entry point**: `apps/web/app/api/publish/queue/route.ts` (`POST`, lines 111–128)
- **Caller**: Public HTTP Client, Frontend UI, external webhook
- **Auth check**: **NONE**. The route does not inspect cookies, JWT headers, or session tokens.
- **Artifact source**: Caller-supplied `body.videoUrl` or `body.videoArtifactHash`.
- **F07 check**: Only checks `if (includesYouTube && !authorization)`. If `platforms: ["tiktok", "instagram"]`, F07 check is completely bypassed!
- **Authorization check**: Verifies presence of `authorization` object for YouTube, but does not verify its Ed25519 signature at route level.
- **JIT check**: Executed downstream inside `YouTubePublishingProvider`.
- **External side effect**: Direct HTTP requests to Googleapis / YouTube Data API v3 (`youtube.videos.insert`).
- **Retry mechanism**: None (immediate execution).
- **Reconciliation mechanism**: Resumable session URI check if supplied.
- **Persistence mechanism**: In-memory authorization store consumption.
- **Failure behavior**: Returns HTTP 500 or JSON error report.
- **Security risk**: **CRITICAL**. Unauthorized caller can trigger publication. Missing CAS binding permits arbitrary `videoUrl` to be uploaded.
- **Evidence level**: `INTEGRATION-VERIFIED`

### SEP-02: Asynchronous Publication Job Enqueue via Public API Route
- **Entry point**: `apps/web/app/api/publish/queue/route.ts` (`POST`, lines 130–142)
- **Caller**: Public HTTP Client
- **Auth check**: **NONE**.
- **Artifact source**: Caller-supplied `body.videoUrl`.
- **F07 check**: `PublisherQueue.enqueue` requires `ReleaseAuthorization` for `youtube` and `youtube-dryrun`. Non-YouTube platforms are enqueued without authorization.
- **Authorization check**: `PublicationAuthorizationService.verifyAuthorization` validates signature and canonical payload hash against in-memory state.
- **JIT check**: Deferred to queue worker processing time.
- **External side effect**: Enqueues row into SQLite `publish_jobs` table.
- **Retry mechanism**: Idempotency check prevents duplicate enqueue for identical `jobId + platform`.
- **Reconciliation mechanism**: Startup recovery loads active rows from SQLite.
- **Persistence mechanism**: SQLite `publish_jobs` table.
- **Failure behavior**: SQLite errors logged as non-fatal warning; job still pushed to memory array.
- **Security risk**: **HIGH**. Lack of API caller authentication; queue flood vulnerability; non-YouTube authorization bypass.
- **Evidence level**: `INTEGRATION-VERIFIED`

### SEP-03: Asynchronous Publication Queue Worker Execution
- **Entry point**: `apps/web/publishing/publisher-queue.ts` (`processJob`, lines 284–435)
- **Caller**: Internal background tick daemon (`PublisherQueue.tick`)
- **Auth check**: Internal worker.
- **Artifact source**: `job.payload.videoUrl` / `job.payload.videoArtifactHash` / CAS object.
- **F07 check**: JIT revalidation immediately before calling provider.
- **Authorization check**: `PublicationAuthorizationService.revalidateImmediatelyBeforePublish`.
- **JIT check**: Explicitly executed before provider dispatch.
- **External side effect**: Calls provider `publish()` method.
- **Retry mechanism**: Exponential backoff (`[2m, 10m, 1h]`).
- **Reconciliation mechanism**: Resumable session status check (`PUT bytes */*`).
- **Persistence mechanism**: SQLite `publish_jobs` status updates; writes `postId` to Firestore.
- **Failure behavior**: Transitions job to `retrying` or `dead` (dead-letter queue).
- **Security risk**: **MEDIUM**. Authorizations are stored in process-local `Map`. If server restarts, in-memory authorizations are lost, causing retried jobs to fail JIT revalidation.
- **Evidence level**: `INTEGRATION-VERIFIED`

### SEP-04: Dead-Letter Queue Retry via Public API Route
- **Entry point**: `apps/web/app/api/publish/queue/route.ts` (`DELETE`, lines 145–159)
- **Caller**: Public HTTP Client
- **Auth check**: **NONE**.
- **Artifact source**: Reuses existing dead-letter payload in memory.
- **F07 check**: None at route boundary; relies on JIT check when retried job processes.
- **Authorization check**: None at endpoint.
- **JIT check**: Executed when worker picks up the job.
- **External side effect**: Moves job from `deadLetterQueue` back to `queue` as `pending`.
- **Retry mechanism**: Resets `attempts` to 0.
- **Reconciliation mechanism**: None.
- **Persistence mechanism**: SQLite `publish_jobs` status updated to `pending`.
- **Failure behavior**: Returns HTTP 404 if job ID not found.
- **Security risk**: **HIGH**. Unauthenticated actor can replay/revive dead publication jobs indefinitely.
- **Evidence level**: `UNIT-VERIFIED`

### SEP-05: Storage Upload Completion Event Triggered Publish
- **Entry point**: `apps/web/publishing/publisher-queue.ts` (`EventBus.subscribe("storage.upload.completed")`, lines 152–180)
- **Caller**: `StorageQueue.processJob` emitting `storage.upload.completed`.
- **Auth check**: Internal EventBus.
- **Artifact source**: Event payload `videoUrl` and `jobId`.
- **F07 check**: If `platforms` includes `youtube`, throws error (no authorization attached). If `platforms` includes `tiktok`, enqueues without authorization!
- **Authorization check**: Handled in `enqueue()`.
- **JIT check**: None at listener level.
- **External side effect**: Auto-enqueues jobs into `PublisherQueue`.
- **Retry mechanism**: PublisherQueue retry loop.
- **Reconciliation mechanism**: None.
- **Persistence mechanism**: SQLite `publish_jobs`.
- **Failure behavior**: Unhandled exception for YouTube; silent enqueue for social stubs.
- **Security risk**: **HIGH**. Uncontrolled publication ingress for non-YouTube platforms.
- **Evidence level**: `IMPLEMENTED`

### SEP-06: WorkflowRuntime Engine "publish" Step
- **Entry point**: `apps/web/content-engines/_runtime/step-registry-init.ts` (lines 1231–1235)
- **Caller**: `WorkflowRuntime.run` during job execution.
- **Auth check**: Internal worker.
- **Artifact source**: `context.outputs.videoPath`.
- **F07 check**: **NONE**.
- **Authorization check**: **NONE**.
- **JIT check**: **NONE**.
- **External side effect**: Emits `WorkflowEvents.PUBLISHER_STARTED`.
- **Retry mechanism**: Saga replay via `CheckpointDB`.
- **Reconciliation mechanism**: Step checkpointing.
- **Persistence mechanism**: SQLite `checkpoints` table.
- **Failure behavior**: Step failure aborts saga.
- **Security risk**: **MEDIUM**. Decoupled step lacks cryptographic authorization context.
- **Evidence level**: `IMPLEMENTED`

### SEP-07: YouTube Data API v3 Direct Upload Insertion
- **Entry point**: `apps/web/publishing/providers/youtube.ts` (`publish`, lines 27–198)
- **Caller**: `PublisherQueue.processJob` or immediate publish route.
- **Auth check**: JIT revalidation of `ReleaseAuthorization`. Checks OAuth2 environment variables.
- **Artifact source**: CAS lookup via `casStreamProvider` or `getByHash`; **FALLS BACK to fetching `payload.videoUrl` over HTTP or reading arbitrary local file path!**
- **F07 check**: Enforces presence and validity of `ReleaseAuthorization`.
- **Authorization check**: Ed25519 signature verification against public key.
- **JIT check**: Explicit check via `revalidateImmediatelyBeforePublish`.
- **External side effect**: Remote API call to Google YouTube Data API v3 (`youtube.videos.insert`).
- **Retry mechanism**: Resumable upload offset query.
- **Reconciliation mechanism**: Checks `uploadSessionUri` for existing completion.
- **Persistence mechanism**: Consumes authorization in memory (`authService.consumeAuthorization`).
- **Failure behavior**: Fails closed if credentials missing (`AUTH_NOT_CONFIGURED`). Throws on API error.
- **Security risk**: **HIGH**.
  1. Mutable media fallback: downloads arbitrary `videoUrl` if CAS missing.
  2. Data loss / payload alteration: Title truncated to 100 chars; tags defaulted to `["shorts", "shortforge"]` if undefined; description defaulted to generic text.
  3. `status.containsSyntheticMedia` missing from request body status object!
- **Evidence level**: `INTEGRATION-VERIFIED`

### SEP-08: YouTube Dry-Run Provider Simulation
- **Entry point**: `apps/web/publishing/providers/dryrun-youtube.ts` (lines 17–61)
- **Caller**: `PublisherQueue` when platform is `youtube-dryrun`.
- **Auth check**: Enforces authentic `ReleaseAuthorization`.
- **Artifact source**: Synthetic / dry-run.
- **F07 check**: Full JIT authorization revalidation.
- **Authorization check**: Ed25519 signature and canonical payload hash verification.
- **JIT check**: Explicitly executed.
- **External side effect**: NONE. Generates synthetic ID `dryrun_yt_${jobId}_${timestamp}`.
- **Retry mechanism**: None.
- **Reconciliation mechanism**: Session URI check.
- **Persistence mechanism**: In-memory consumption.
- **Failure behavior**: Throws if authorization invalid.
- **Security risk**: **LOW** when strictly isolated.
- **Evidence level**: `UNIT-VERIFIED`

### SEP-09: Social Platforms Stub Publishing (TikTok, Instagram, X, Facebook)
- **Entry point**: `apps/web/publishing/providers/social-platforms.ts` (`createStubProvider`, lines 20–55)
- **Caller**: `PublisherQueue` for social platform IDs.
- **Auth check**: **NONE**.
- **Artifact source**: Ignored.
- **F07 check**: **NONE**.
- **Authorization check**: **NONE**.
- **JIT check**: **NONE**.
- **External side effect**: Simulates fake publication: returns `success: true`, `postId: ${id}_stub_${Date.now()}`.
- **Retry mechanism**: None.
- **Reconciliation mechanism**: None.
- **Persistence mechanism**: `PublisherQueue` persists fake `postId` into SQLite and Firestore.
- **Failure behavior**: Always succeeds.
- **Security risk**: **CRITICAL**. Directly violates the invariant "Never fake production success". Creates a fake platform post ID and URL without any real API credentials or authorization.
- **Evidence level**: `SIMULATED` / `DEFECTIVE`

### SEP-10: Worker Callback Completion & F7 Media Audit
- **Entry point**: `apps/web/app/api/rendering/callback/route.ts` (`POST`, lines 32–346)
- **Caller**: A qualified render worker adapter (self-hosted, Kaggle, GitHub Actions, or other approved provider).
- **Auth check**: Bearer token / `X-Execution-Token` verified against `RENDER_WORKER_SECRET` or job's stored `executionToken`.
- **Artifact source**: Remote worker `videoUrl` or `driveUrl` resolved via `ArtifactResolver`.
- **F07 check**: Executes `VerificationEngine.auditMediaArtifact` (Technical Forensics / Hard Gates). Does NOT evaluate F07 YouTube Policy Guardian (G00–G14).
- **Authorization check**: Validates worker execution token.
- **JIT check**: Monotonic attempt validation in `RemoteRenderStateMachine`.
- **External side effect**: Marks job `status: "completed"` in job manifest and Firestore. Finalizes quota slot. Emits `TASK_COMPLETED` on EventBus.
- **Retry mechanism**: Idempotent response if already completed.
- **Reconciliation mechanism**: Verifies physical media file exists and computes SHA-256.
- **Persistence mechanism**: `saveJobManifest` to disk and Firestore `videos` collection.
- **Failure behavior**: Marks job `failed` and releases quota slot if physical audit fails.
- **Security risk**: **MEDIUM**. Sets `status: "completed"` on video records before F07 policy compliance has been certified.
- **Evidence level**: `INTEGRATION-VERIFIED`

### SEP-11: Public Published Video Read Endpoint
- **Entry point**: `apps/web/app/api/published-video/route.ts` (`GET`, lines 14–56)
- **Caller**: Public web visitors.
- **Auth check**: None (public read-only endpoint).
- **Artifact source**: Firestore `videos` collection where `status == "completed"`, or static fallback `/fallback_video.mp4`.
- **F07 check**: None.
- **Authorization check**: None.
- **JIT check**: None.
- **External side effect**: Read-only JSON response.
- **Retry mechanism**: Fallback to demo record.
- **Reconciliation mechanism**: None.
- **Persistence mechanism**: Read-only.
- **Failure behavior**: Returns fallback static record.
- **Security risk**: **LOW** for outbound actions, but can expose un-audited video content.
- **Evidence level**: `IMPLEMENTED`

### SEP-12: Autonomous Production Runner End-to-End Pipeline
- **Entry point**: `apps/web/factoryos/core/production/ProductionRunner.ts` (`executeJob`, lines 48–287)
- **Caller**: `AutonomousScheduler` / cron task.
- **Auth check**: Internal autonomous runner.
- **Artifact source**: Rendered by `VideoPipelineAdapter`.
- **F07 check**: None. Disconnected from F07 YouTube Policy Guardian.
- **Authorization check**: None.
- **JIT check**: None.
- **External side effect**: Uploads video to Google Drive via `DriveDeliveryAdapter`.
- **Retry mechanism**: Outbox pattern (`DELIVERY_PENDING`).
- **Reconciliation mechanism**: `ProductionHistoryStore` tracks topics.
- **Persistence mechanism**: Local history store and scheduler status updates.
- **Failure behavior**: Sets status to `FAILED`.
- **Security risk**: **HIGH**. Includes `forceOfflinePass` override which artificially forces `PASS` on quiz verification in mock mode.
- **Evidence level**: `INTEGRATION-VERIFIED`

### SEP-13: Storage Queue Async Drive / Cloudinary Upload
- **Entry point**: `apps/web/storage/upload-queue.ts` (`processJob`, lines 327–505)
- **Caller**: `StorageQueue.tick()` triggered by `render.completed`.
- **Auth check**: Internal worker.
- **Artifact source**: Local file `job.videoPath`.
- **F07 check**: None.
- **Authorization check**: None.
- **JIT check**: None.
- **External side effect**: Uploads file to Google Drive or Cloudinary.
- **Retry mechanism**: Exponential backoff (`[1m, 5m, 30m]`).
- **Reconciliation mechanism**: Idempotency check via `UploadJobDB.findCompleted(jobId, sha256)`.
- **Persistence mechanism**: SQLite `upload_jobs` table and Firestore document.
- **Failure behavior**: Moves to dead-letter queue.
- **Security risk**: **LOW** for YouTube release (delivers to storage only).
- **Evidence level**: `INTEGRATION-VERIFIED`

### SEP-14: Generation Dispatch to Remote Azure Worker
- **Entry point**: `apps/web/app/api/generate-video/route.ts` (lines 444–470)
- **Caller**: Authenticated user.
- **Auth check**: Quota reservation and user authentication.
- **Artifact source**: Request body.
- **F07 check**: Deferred to post-render callback.
- **Authorization check**: Signs dispatch with `BASIC_RENDER_API_SECRET`.
- **JIT check**: None.
- **External side effect**: HTTP POST to Azure FastAPI `/api/render/jobs`.
- **Retry mechanism**: Async worker callback.
- **Reconciliation mechanism**: Render callback state machine.
- **Persistence mechanism**: Local job manifest.
- **Failure behavior**: Releases quota slot and returns HTTP 500 if unconfigured.
- **Security risk**: **MEDIUM**. Secret management and remote worker authenticity.
- **Evidence level**: `INTEGRATION-VERIFIED`

---

## 4. Priority Remediation Plan for Publication Choke Point

To achieve **ZERO UNCLASSIFIED PUBLICATION PATHS** and absolute enforcement of `NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION`:

1. **Lock Down `POST /api/publish/queue` & `DELETE /api/publish/queue` (P0-A & P0-G)**:
   - Require explicit API caller authentication (Session / Bearer token). Reject anonymous requests with HTTP 401.
   - Enforce that ANY platform publish request (YouTube, social, or dryrun) must present a verifiable `ReleaseAuthorization`.
   - Remove fake social stub auto-succeeding providers (`social-platforms.ts`). Return `AUTH_NOT_CONFIGURED` instead of fake IDs.

2. **Durable Authorization Store (P0-C)**:
   - Replace in-memory `Map<string, ReleaseAuthorization>` in `PublicationAuthorizationService` with persistent SQLite storage (`authorizations` table).
   - Enforce atomic SQL CAS transition: `UPDATE authorizations SET status = 'CONSUMED' WHERE authorization_id = ? AND status = 'ACTIVE'`.

3. **Purge Mutable Media Fallbacks (P0-B & Phase 19)**:
   - Remove fallback to arbitrary remote `videoUrl` or local disk paths in `YouTubePublishingProvider`.
   - Require streaming strictly from CAS backed by authoritative SHA-256.

4. **Correct YouTube Data API Payload Mapping (Phase 21 & Phase 22)**:
   - Map `status.containsSyntheticMedia`, `status.selfDeclaredMadeForKids`, and enforce `privacyStatus: "private"` if `publishAt` is specified.
   - Prevent default alterations (title truncation, synthetic tags) from diverging from the cryptographically bound `canonicalPayloadHash`.
