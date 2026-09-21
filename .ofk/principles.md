# FactoryOS Operational Principles & System Invariants

> **Status**: AUTHORITATIVE SPECIFICATION  
> **Applicability**: Kernel, Swarms, Floor Guardians, API Endpoints  

---

## 1. Absolute Single Authority Invariant

1. **One Authoritative Control Plane**:
   All video generation and state mutations MUST be routed through `AutonomousFactoryController` and `OverseerControlPlane`. Direct out-of-band FFmpeg execution or headless bypassing of the Mission DAG is forbidden in production.
2. **Authority Isolation**:
   When `EXECUTION_AUTHORITY="factoryos"` is configured, legacy direct HTTP dispatchers yield entirely to the FactoryOS Task DAG.

---

## 2. Fail-Closed Security Perimeter

1. **Zero Mock Ingress in Production**:
   - `mock_session_cookie_*` and `simulated_admin_token` authentication bypasses are physically disabled when `NODE_ENV === "production"`.
   - Hardcoded developer or bypass emails (e.g. `gokul@gmail.com`) are stripped from production auth guards.
2. **Cryptographic Execution Tokens**:
   - All render jobs generate a 256-bit cryptographically secure execution token (`crypto.randomBytes(32).toString("hex")`).
   - Callbacks to `/api/rendering/callback` are verified using constant-time timing-safe buffer comparisons (`crypto.timingSafeEqual`).
   - Replay attacks or forged tokens result in immediate HTTP 401 rejection and security event emission.
3. **Lease Failure Reversal**:
   - If an unrecoverable rendering or API failure occurs, reserved user quotas MUST be released immediately via `releaseGenerationSlot(userId, userRole, jobId)` before returning error responses.

---

## 3. Autonomous Resilience & Self-Healing

1. **Single Factory-Wide Investigator (`Slayer`)**:
   - Only ONE factory-level Slayer engine investigates system anomalies, quality degradations, and execution stalls.
   - Slayers open structured forensic Cases (`CaseManager`) containing root-cause diagnoses, metrics snapshots, and triage priorities.
2. **Single Factory-Wide Remediator (`Healer`)**:
   - When a Slayer identifies an anomalous or crashed worker/lease, the Healer applies deterministic remediation: resetting leases, rotating workers, or re-initializing state pools.
3. **Deterministic Reconstruction (`ReMaker`)**:
   - If a rendered artifact fails Floor 07 verification (corrupt container, audio sync drift, aspect ratio defect), the ReMaker reconstructs the asset from its original timeline recipe without restarting the entire upstream generation DAG.
4. **Idempotent Lease Management**:
   - All background tasks acquire bounded leases (`LeaseManager`). Expired or abandoned leases are reclaimed automatically during the Watchdog recovery sweep without double-execution.
