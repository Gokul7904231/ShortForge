# Feature Specification: Release Captain SDLC & Production Readiness Gate

**Feature Branch**: `feat/release-sdlc-spec-kit-20261029`  
**Created**: 2026-10-29  
**Status**: Draft / Under Review  
**Role**: Agent 1 (Release Captain, Spec Kit & SDLC)  

---

## 1. Executive Summary

This specification establishes the authoritative SDLC governance, acceptance matrix, and multi-agent coordination protocol for ShortForge production readiness. It formalizes Spec Kit integration, enforces Anti-Slop (during mode), evaluates PR #253, and defines the strict physical rendering acceptance gate required before recommending merge to `main`.

---

## 2. User Scenarios & Testing *(Prioritized)*

### User Story 1 (Priority: P1) — Operational Telemetry & Readiness Truth
- **As a**: DevOps / Site Reliability Engineer and Release Captain
- **I want**: The Render keepalive probe to inspect application JSON payload (`success == true` and `status == "healthy"`) rather than treating any HTTP 200 response as healthy.
- **So that**: A degraded service (e.g. missing Google Drive key path or YouTube refresh token) is immediately surfaced as degraded/offline, and production containers run on the declared Node 22 engine.
- **Acceptance Criteria**:
  - `render-keepalive.yml` fails with an explicit error identifying degraded dependencies when status is not `healthy`.
  - `apps/web/Dockerfile` uses `node:22-alpine` across `deps`, `builder`, and `runner` stages matching `package.json` engines (`>=22`).
  - No synthetic success or false HTTP 200 health claims are tolerated.

### User Story 2 (Priority: P1) — Controlled Physical Render Acceptance
- **As a**: System Architect and Release Gate
- **I want**: Every render claim to be backed by physical evidence (MP4 file, cryptographic SHA-256 digest, ffprobe video/audio stream verification, CAS storage, and F07 compliance check).
- **So that**: PRs are never accepted based on unit tests or typechecks alone when physical pipeline execution fails.
- **Acceptance Criteria**:
  - Lightning physical render proof in PR #253 failed with exit code 1 (`Authentication failed: Please run lightning login`) and generated 0 proof artifacts.
  - The Release Captain records this failure honestly: PR #253 does **not** constitute production render acceptance.
  - Merge disposition remains `BLOCKED` until a controlled real-render execution generates a verified physical MP4 and passes F07.

### User Story 3 (Priority: P2) — Three-Agent Worktree Isolation
- **As a**: Multi-Agent Development Workforce (Agent 1, Agent 2, Agent 3)
- **I want**: Dedicated worktrees and non-overlapping branch boundaries.
- **So that**: Agent 1 (Release Captain) owns SDLC, Spec Kit, and Team reports; Agent 2 owns worker and pipeline code; Agent 3 owns UI components without merge collisions or uncoordinated edits.
- **Acceptance Criteria**:
  - Agent 1 operates in a dedicated worktree (`ShortForge-agent1-sdlc`) on `feat/release-sdlc-spec-kit-20261029`.
  - Zero modifications by Agent 1 to Agent 2 worker code (`services/rendering-engine/**`) or Agent 3 UI code (`apps/web/components/**`, `apps/web/app/(os)/**`).
  - Integration order is defined and tracked via a task ledger.

### User Story 4 (Priority: P2) — Team Change Report & Automated Gate Validation
- **As a**: Release Captain
- **I want**: A validated machine-readable change report at `Team/reports/pr-253.json` evaluated against `Team/scripts/validate-team-report.mjs`.
- **So that**: CI gates and human reviewers can deterministically inspect change classification, .okf sweep status, security posture, conflict records, and disposition.
- **Acceptance Criteria**:
  - `node Team/scripts/validate-team-report.mjs Team/reports/pr-253.json` exits with code 0 (`TEAM_CHANGE_GATE: VALID`).
  - Disposition is truthfully set to `BLOCKED`.
  - Blocked reasons cite missing physical render proof, missing owner credentials, and required staging verification.

---

## 3. Requirements & Constraints

### 3.1 Functional Requirements
- **FR-01**: Spec Kit must be initialized using existing-project adoption docs without wiping existing repo state.
- **FR-02**: Spec Kit skills and integrations must be operational for all three agents (`agy`, `claude`, `codex`).
- **FR-03**: Anti-Slop core must be loaded with mode `during` (session override + `%APPDATA%\antislop\settings.json`).
- **FR-04**: The project Constitution (`.specify/memory/constitution.md`) must additively embed `.okf` foundational principles (`Claim <= Evidence`, `Decoupled Hierarchy`, `Error Honesty`, `Bounded Repair`).
- **FR-05**: The acceptance matrix must explicitly declare stop conditions, verification evidence, and rollback targets.

### 3.2 Non-Functional Requirements & Security
- **NFR-01**: Never expose, commit, or print credentials or secrets (Lightning API keys, GitHub tokens, Render URLs, internal keys).
- **NFR-02**: All git operations must be scoped to dedicated feature branches. Direct pushes to `main` are strictly prohibited.
- **NFR-03**: Security scanners (Semgrep, Strix, ZAP) and physical proofs must never convert `UNPROVEN` or `BLOCKED` into `PASS`.

---

## 4. Acceptance Matrix & Gate Conditions

| Surface | Check / Target | Current Evidence | Gate Status |
| :--- | :--- | :--- | :--- |
| **Spec Kit** | `specify check` & integrations | `agy`, `claude`, `codex` installed; `.specify/` intact | **PASS** |
| **Anti-Slop** | v3.2.20 loaded; mode `during` | `during (session override & global preference)` | **PASS** |
| **Constitution** | `.specify/memory/constitution.md` | Ratified additively with `.okf` principles | **PASS** |
| **Node Runtime** | `apps/web/Dockerfile` Node 22 | Aligned across all 3 stages in PR #253 | **PASS (Static)** |
| **Health Probe** | `render-keepalive.yml` JSON validation | PR #253 enforces `status == "healthy"` | **PASS (Static)** |
| **Live Render SHA**| Render deployed SHA & readiness | Commit `cf4cc2c9`, HTTP 200, status `degraded` | **DEGRADED / BLOCKED** |
| **Physical Proof** | Lightning MP4 → CAS → F07 | Run 40824025739 failed (exit code 1, auth error) | **FAIL / BLOCKED** |
| **Team Report** | `Team/reports/pr-253.json` | Validated with `validate-team-report.mjs` | **VALID (BLOCKED)** |
| **Merge Gate** | Authorize PR #253 merge to main | Blocked pending controlled real render & secrets | **BLOCKED** |

---

## 5. Stop Conditions & Rollback Recommendation

1. **Stop Conditions**:
   - Do NOT merge PR #253 to `main` until a physical MP4 render is generated and verified with ffprobe and F07.
   - Do NOT mark `Team/reports/pr-253.json` as `PASS` while Lightning physical proof fails or while live service readiness reports degraded dependencies.
   - Halt integration if any agent violates worktree boundaries or pushes directly to `main`.

2. **Rollback Recommendation**:
   - If PR #253 or any subsequent PR causes build failures or regression in Render:
     - Roll back Render service to `cf4cc2c9eae81e4e835a1c6ee8d7bc579868a6af` (last verified baseline).
     - Keepalive probe will remain at last known working revision.
     - Isolate worker fixes in Agent 2 branch; do not contaminate main.
