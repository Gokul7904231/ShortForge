# FactoryOS Frontier v3 — Final Cross-Subsystem Bypass Analysis

**Governance Standard**: ZERO FALSE GREENS | EVIDENCE BEFORE CLAIM | NO SYNTHETIC SUCCESS | FAIL CLOSED

---

## 1. Executive Summary & Forensic Boundary Invariants

The objective of this analysis is to audit every code path leading into terminal positive states (`COMPLETED`, `VERIFIED`, `PUBLISHED`, `PRIMARY`, and `SUCCESS`) across all FactoryOS subsystems to prove that no execution path can bypass the canonical physical evidence and security gates.

---

## 2. Reverse Call Graph & Terminal State Audit

### State 1: `COMPLETED` (Job / Mission Lifecycle)

```
Terminal State: COMPLETED
  ▲
  ├── Entry Point A: POST /api/rendering/callback (route.ts)
  │     ├── [GATE 1] Authentication: Constant-time comparison of `executionToken` vs stored manifest or `RENDER_WORKER_SECRET`
  │     ├── [GATE 2] RemoteRenderStateMachine: Attempt monotonicity check (`incomingAttemptId >= currentAttempt`)
  │     ├── [GATE 3] Idempotency: If already `COMPLETED`, returns cached 200 without re-finalizing quota
  │     ├── [GATE 4] Physical Presence: `candidateUrl` resolved via `ArtifactResolver.resolve()`
  │     │     ├── SSRF validation against private/restricted IPs (127.0.0.1, 10.0.0.0/8, 169.254.169.254, etc.)
  │     │     ├── Path traversal validation (no `..` escapes outside approved roots)
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
  └── Bypasses Tested:
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
  │     └── Requires physical file decode, probe measurements, and zero ffprobe errors.
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

## 3. Adversarial Bypass Verification Summary

Every candidate bypass path identified during the audit has been systematically falsified and closed:

1. **Synthetic Callback Bypass**: Prevented by `VerificationEngine.auditMediaArtifact()` and `ArtifactResolver.resolve()`.
2. **Fallback Masquerade as Primary**: Blocked by `assertPrimaryAudioArtifact()` discriminated contract.
3. **Optimistic HTTP 200 Interpretation**: Dismantled; Azure VM dispatch returns `remoteState: DISPATCHED`, not `COMPLETED`.
4. **Stale Callback Race / Overwrite**: Mitigated by `RemoteRenderStateMachine` monotonic attempt IDs.
5. **SSRF & Symlink Escape**: Prevented by `ArtifactResolver` IP validation and `fs.realpathSync()` root boundaries.
6. **Unregistered Healer Recovery**: Blocked by `sm.getJob(jobId)` existence enforcement in `healer-render-recovery`.
