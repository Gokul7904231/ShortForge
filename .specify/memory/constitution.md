# ShortForge / FactoryOS Engineering Constitution

> **Status**: RATIFIED & ADDITIVE TO `.okf`  
> **Precedence**: Subordinate to Executable Code & Tests; Additive to `.okf` Governance & Principles.  
> **Role Scope**: Agent 1 (Release Captain, Spec Kit & SDLC), Agent 2 (Workers & Pipeline), Agent 3 (UI & Client).  

---

## Core Principles

### I. Claim <= Evidence (Forensic Grounding)
An autonomous agent, pipeline floor, or release gate may never assert an outcome of `SUCCESS` or `PASS` unless it is supported by concrete, independently verifiable evidence.
- Physical video artifacts must exist on storage and be verified with cryptographic SHA-256 digests and ffprobe stream inspection.
- Lightning/Compute proofs must generate real physical artifacts; exit codes, error traces, and missing files must be recorded truthfully.
- A claim without verified evidence is rejected at the validator gate.

### II. Absolute Telemetry & Error Honesty
The system strictly prohibits synthetic success, uncalibrated confidence scores, or fake 200 HTTP responses.
- If external web retrieval, voice synthesis, or rendering fails or is degraded, the subsystem returns explicit status codes and diagnostics, never synthetic mock successes.
- Health endpoints and keepalive probes must validate underlying service dependencies; degraded or unconfigured services must never be reported as healthy.

### III. Decoupled Hierarchy & Agent Boundaries
The sovereign control hierarchy (authority, supervision, lease management, circuit breaking) is strictly segregated from the physical production pipeline and client interfaces.
- Agent 1 (Release Captain & SDLC) owns the release specification, task ledger, Team Change report, and integration order. Agent 1 never edits Agent 2 worker code or Agent 3 UI code.
- Agent 2 (Worker & Pipeline) owns rendering worker logic, sandbox adapters, and pipeline execution floors.
- Agent 3 (UI & Client) owns frontend views, dashboards, and presentation components.
- Dedicated git branches/worktrees are mandatory. Direct pushes to `main` are strictly forbidden.

### IV. Single Authoritative Source of Truth
Every architectural entity possesses exactly one canonical source of truth.
- Topology, floor definitions, numbers, and categories derive solely from `apps/web/factoryos/core/hierarchy/FloorRegistry.ts`.
- Repository changes must adhere to `.okf/decision-protocol.md`, `.okf/index.md`, `.okf/principles.md`, and `.okf/decisions.md`.

### V. Deterministic Replayability & Monotonic Fencing
All state transitions, capability leases, and execution tokens are deterministic, replayable, and strictly time-bounded.
- Distributed workers execute under time-bounded leases with strictly increasing monotonic fencing tokens.
- `executionToken = crypto.randomBytes(32).hex()` is used for authorization and verified via `timingSafeEqual`.

### VI. Bounded Repair & Last-Known-Good Baseline Preservation
Automated healing and retry loops operate under finite budgets.
- Repair attempts are strictly capped (default: 2 attempts) to prevent infinite loops and runaway spend.
- The system retains the last-known-good verified baseline. If repair fails, the pipeline rolls back to the baseline rather than overwriting it with an unverified candidate.

### VII. Anti-Slop Discipline
All new work across UI, copywriting, layout, code comments, and architecture must adhere to Anti-Slop standards.
- Active mode: `during` (session override & global preference).
- Prevents generic AI artifacts, synthetic placeholders, and unverified assumptions.

---

## SDLC & Change Gate Governance

1. **Mandatory Team Change Gate**:
   - Every non-trivial change requires an authoritative report: `Team/reports/pr-<number>.json`.
   - The report must be validated with `node Team/scripts/validate-team-report.mjs <path>`.
   - Dispositions must be used honestly: `PASS`, `BLOCKED`, `REJECTED`, or `ESCALATED`.
   - `PASS` is strictly prohibited if any security scanner or physical verification is `FAIL`, `UNPROVEN`, or `BLOCKED`.

2. **Controlled Staging Render Acceptance**:
   - PR merge recommendations are blocked until controlled real-render acceptance (physical MP4 → CAS → F07 verification) is proven.
   - PR #253 does not constitute production render acceptance while real physical render proofs fail or remain unproven.

3. **Production Deployment Truth**:
   - Live Render deployment status must reflect true dependency readiness (e.g. Google Drive, YouTube credentials, worker availability).
   - Rollback target must be documented and maintained at all times.

---

**Version**: 1.0.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-29
