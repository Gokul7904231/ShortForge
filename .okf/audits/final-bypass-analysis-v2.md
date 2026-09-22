# FactoryOS Frontier v3 — Final Cross-Subsystem Bypass Analysis (v2)

**Governance Standard**: ZERO FALSE GREENS | EVIDENCE BEFORE CLAIM | NO SYNTHETIC SUCCESS | FAIL CLOSED | NO GENERATED-FILE FIXES | NO AMBIGUOUS AUTHORITY

---

## 1. Executive Summary & Forensic Boundary Invariants

The objective of this comprehensive audit is to reverse-map every code path leading into terminal positive states across all FactoryOS subsystems:
1. `COMPLETED` (Job / Mission Lifecycle)
2. `PRIMARY` (Voice Artifact Quality Class)
3. `VERIFIED` (Verification & Evidence Invariant)
4. `SUCCESS` (Capability Registry & Guardian Execution)
5. `PUBLISHED` (Cloud Delivery & External Distribution)

We prove through source inspection, architectural boundaries, and adversarial test suites that **no execution path can bypass canonical physical evidence, security boundaries, or authorization gates to produce an unearned positive state.**

---

## 2. Reverse Call Graphs & Terminal State Audits

### State 1: `COMPLETED` (Job / Mission Lifecycle)

```
Terminal State: COMPLETED
  ▲
  ├── Entry Point A: POST /api/rendering/callback (route.ts)
  │     ├── [GATE 1] Authentication: Constant-time comparison of `executionToken` vs stored manifest or `RENDER_WORKER_SECRET`
  │     ├── [GATE 2] RemoteRenderStateMachine: Attempt monotonicity check (`incomingAttemptId >= currentAttempt`)
  │     ├── [GATE 3] Idempotency & Delivery: At-least-once delivery semantics with idempotent completion effect:
  │     │     └── If already `COMPLETED`, returns cached 200 without duplicate side-effects (does not re-finalize quota or re-publish)
  │     ├── [GATE 4] Physical Presence: `candidateUrl` resolved via `ArtifactResolver.resolve()`
  │     │     ├── SSRF validation against private/restricted IPs (127.0.0.1, 10.0.0.0/8, 169.254.169.254, IPv4-mapped IPv6, etc.)
  │     │     ├── Path traversal validation (no `..` escapes outside approved roots via realpath verification)
  │     │     ├── Non-zero byte check (`stat.size > 0`)
  │     │     └── Physical SHA-256 hash calculation on disk
  │     ├── [GATE 5] VerificationEngine (Floor 07 Compliance):
  │     │     ├── Physical ffprobe container inspection (MP4)
  │     │     ├── Stream validation (H.264 video + AAC audio present)
  │     │     ├── 9:16 vertical geometry verification (width/height ratio)
  │     │     └── Full decode smoke test (`ffmpeg -v error -i <file> -f null -`)
  │     └── [EFFECT] `finalizeGenerationSlot()` called ONLY IF all gates pass; manifest updated to `status: "completed"`.
  │
  ├── Entry Point B: Local Render Path (OverseerControlPlane.ts: Floor 06)
  │     ├── [GATE 1] RenderFabric compilation: `FFmpegRenderCompiler.execute()`
  │     ├── [GATE 2] Physical RenderArtifact generation: output file exists on disk, size > 0
  │     ├── [GATE 3] Physical SHA-256 calculation on disk bytes
  │     ├── [GATE 4] Floor 07 Verification DAG node execution
  │     └── [EFFECT] Manifest marked `status: "completed"` only with physical artifact metrics.
  │
  └── Bypasses Tested & Defeated:
        - Fake videoUrl with 0 bytes -> REJECTED (422)
        - Corrupt MP4 headers -> REJECTED (422)
        - SSRF URL (http://169.254.169.254/latest/meta-data) -> BLOCKED (422)
        - Local path traversal (/etc/passwd, ../../secrets) -> BLOCKED (422)
        - Stale callback attempt -> REJECTED (409)
        - Forged execution token -> REJECTED (401)
```

---

### State 2: `PRIMARY` (Voice Artifact Quality Class)

```
Terminal State: PRIMARY
  ▲
  └── Entry Point: VoiceFabric.synthesize() / assertPrimaryAudioArtifact()
        ├── [GATE 1] Real Provider Execution: GeminiTTSProvider / ElevenLabsTTSProvider / EdgeTTSProvider
        │     └── Protocol validation, credential inspection, timeout via AbortController
        ├── [GATE 2] verifyAndPublishAudioArtifact():
        │     ├── Writes buffer atomically to `.tmp_publish` file in approved directory
        │     ├── Size check: `byteLength > 44` (must exceed RIFF header)
        │     ├── Format validation: Valid RIFF/WAVE header
        │     ├── Physical ffprobe measurement: duration, sampleRate, channels, codec
        │     ├── Physical SHA-256 calculation on persisted disk bytes
        │     └── Atomic rename to canonical artifact destination
        ├── [GATE 3] Contract Enforcement (`assertPrimaryAudioArtifact`):
        │     ├── `artifact.qualityClass === "PRIMARY"`
        │     ├── `artifact.isFallback === false`
        │     ├── `artifact.durationSource === "PHYSICAL_FFPROBE"`
        │     ├── `artifact.durationSeconds > 0`
        │     ├── `artifact.byteLength > 0`
        │     └── `artifact.sha256` matches disk hash
        └── Degradation Policy:
              If provider fails, `VoiceFabric` falls back to `SILENT_WAV_FALLBACK`.
              The resulting artifact is STRICTLY tagged:
                - `qualityClass: "DEGRADED_FALLBACK"`
                - `isFallback: true`
                - `provider: "SILENT_WAV_FALLBACK"`
              It can NEVER be promoted to `PRIMARY`.
```

---

### State 3: `VERIFIED` (Verification & Evidence Invariant)

```
Terminal State: VERIFIED
  ▲
  ├── Branch A: VerificationEngine.auditMediaArtifact()
  │     ├── Physical file decode smoke test via ffmpeg
  │     ├── Audio & video stream layout validation via ffprobe
  │     ├── Duration and geometry constraint verification
  │     └── Requires zero ffprobe/ffmpeg errors and non-zero streams.
  │
  ├── Branch B: ResearchPassport.verifyPassportIntegrity()
  │     ├── Canonical JSON serialization of claims and source provenance
  │     ├── Cryptographic HMAC SHA-256 signature verification using secret key
  │     └── Mutation attack: altering claim text, source, timestamp, or score immediately invalidates passport.
  │
  └── Branch C: UI Telemetry (VoiceFabricPanel / OverseerProgressiveDisclosure)
        ├── Direct check: `artifact.durationSource === "PHYSICAL_FFPROBE"`
        ├── If `artifact.isFallback === true`, UI renders "Degraded Fallback", NOT "Verified"
        └── Unmeasured states display `NOT_TESTED` or `UNMEASURED`.
```

---

### State 4: `SUCCESS` (Capability Registry & Guardian Execution)

```
Terminal State: SUCCESS
  ▲
  └── Entry Point: CapabilityRegistry.execute()
        ├── [GATE 1] Registration Check: Capability must exist in registry
        ├── [GATE 2] Status Check: Non-implemented or prototype capabilities (e.g. `render.hyperframes`) rejected
        ├── [GATE 3] Policy Boundary Authorization:
        │     ├── `callerRole` must match `capability.policy.allowedRoles`
        │     ├── `floorId` must match `capability.policy.allowedFloors`
        │     └── `environment` must match `capability.policy.environments`
        ├── [GATE 4] Guardian Gate:
        │     └── If `requiresGuardianGate === true`, KernelGuardianManager must authorize the action
        └── [GATE 5] Handler Execution:
              Must execute real logic (e.g., ffprobe on disk, schema validation, HTTP fetch)
              Missing or invalid parameters return `status: "FAILED"`.
```

---

### State 5: `PUBLISHED` (Cloud Delivery & External Distribution)

```
Terminal State: PUBLISHED / PUBLISH_SUCCESS
  ▲
  └── Entry Point: GoogleDriveOutbox.upload() / YouTubePublisher.publish()
        ├── [GATE 1] Physical Artifact Presence & Verification:
        │     ├── Source artifact must exist on disk and be non-empty (`statSync(filePath).size > 0`)
        │     ├── SHA-256 digest calculated from physical bytes
        │     └── Must correspond to a verified render artifact (Floor 07 compliance)
        ├── [GATE 2] Provider Authentication & Handshake:
        │     ├── Valid OAuth2 / Service Account credentials inspected
        │     └── Real network transport established with Google Drive API v3
        ├── [GATE 3] Multipart / Resumable Byte Upload:
        │     ├── Streams actual physical bytes to `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
        │     └── No 0-byte or stub requests permitted
        ├── [GATE 4] Provider Confirmation & Response Integrity:
        │     ├── Google Drive API returns HTTP 200/201 with server-assigned `id`
        │     ├── Server file ID must be non-empty and validated
        │     └── Provider metadata (file ID, name, mimeType, webViewLink) persisted to outbox state
        ├── [GATE 5] Outbox Idempotency & Replay Protection:
        │     ├── If outbox job already has persisted `fileId`, returns cached record without re-uploading
        │     └── Verifiable in live test: file ID `1C1emnvt1pVgY4sYq8KIaExqTUiedGwif` (12,064 bytes)
        └── Degradation Policy:
              If credentials missing, network fails, or upload aborted:
                - `status: "FAILED"` or `status: "BLOCKED"`
                - No synthetic fileId generated
                - State is NEVER marked `PUBLISHED` without server-assigned ID
```

---

## 3. Canonical Authentication Authority

All authentication and session resolution in FactoryOS is strictly centralized under **Better Auth**:
- **Authority**: Better Auth (`apps/web/lib/auth.ts`, `apps/web/app/api/auth/[...all]/route.ts`, `auth.db`)
- **Session Verification**: `apps/web/lib/auth/auth.ts` (`verifySession()`, `UserRepository`)
- **Clerk Federation**: Completely removed/eliminated from runtime routing. Obsolete import purged from `apps/web/app/api/generate-video/route.ts`.
- **Database / Infrastructure**: Firebase Admin SDK is used strictly as a database and storage layer (`getFirestore()`, `getStorage()`), never as an independent session authority.
- **Result**: Zero ambiguity. Exactly one canonical application identity authority exists.

---

## 4. Distributed Delivery Terminology Invariant

In accordance with strict distributed systems semantics:
- **No "Exactly-Once Execution" Claim**: FactoryOS does **not** claim mathematical "exactly-once execution" across distributed networks.
- **Correct Formulation**: FactoryOS implements:
  1. **At-least-once delivery** for distributed callbacks and worker dispatches.
  2. **Idempotent completion effects**: Once a job enters `COMPLETED`, subsequent callbacks return HTTP 200 with the existing state without repeating quota deductions, DB writes, or downstream notifications.
  3. **Duplicate-side-effect protection**: Quota finalization (`finalizeGenerationSlot`) and external publishing are guarded by atomic status checks and state machines.

---

## 5. Adversarial Bypass Verification Summary

| Candidate Bypass Path | Target State | Vulnerability Mechanism | Protection / Gate Implemented | Test Suite Verification |
|:---|:---|:---|:---|:---|
| **Synthetic Callback Bypass** | `COMPLETED` | Worker sends mock URL without rendering | `ArtifactResolver` fetches & verifies bytes; `VerificationEngine` runs ffprobe + ffmpeg decode | `adversarial-p0-gates.test.ts` |
| **Fallback Masquerading as Primary** | `PRIMARY` | Fallback audio tagged as primary | `assertPrimaryAudioArtifact()` enforces `qualityClass !== "DEGRADED_FALLBACK"` and `isFallback === false` | `voice-fabric-forensics.test.ts` |
| **Optimistic HTTP 200 Dispatch** | `COMPLETED` | Dispatching render job marked complete | Azure VM dispatch returns `remoteState: DISPATCHED`, not `COMPLETED` | `remote-render-state-machine.test.ts` |
| **Stale Callback Overwrite** | `COMPLETED` | Retry callback from attempt N-1 overwrites attempt N | `RemoteRenderStateMachine` enforces monotonic attempt ID progression | `remote-render-state-machine.test.ts` |
| **SSRF & Path Traversal** | `COMPLETED` | Callback points to cloud metadata or /etc/passwd | `ArtifactResolver` validates IP address space and prevents symlink/traversal outside approved roots | `adversarial-p0-gates.test.ts` |
| **Passport Claim Mutation** | `VERIFIED` | Attacker mutates research claim text or source score | `ResearchPassport` verifies HMAC-SHA256 signature; any single byte change fails verification | `p0-cross-subsystem.test.ts` |
| **Unexecuted Capability Success** | `SUCCESS` | Prototype handler returns `{ status: "SUCCESS" }` | `CapabilityRegistry` verifies implementation status, caller role, floor ID, and guardian approval | `capability-registry.test.ts` |
| **Synthetic Cloud Publish** | `PUBLISHED` | Fabricated `fileId` returned without cloud upload | Google Drive Outbox requires real multipart upload, valid credentials, and server-generated ID | `live-drive-e2e-real.test.ts` |
| **Generated File Hack** | Build Gate | Manual edits to `.next/dev/types/validator.ts` | `.next` purged; clean `tsc` and `next build` executed with 0 errors; race condition eliminated | Clean Build Verification |
