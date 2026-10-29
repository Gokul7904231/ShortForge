# Implementation Plan: Release Captain SDLC & Production Readiness Gate

**Branch**: `feat/release-sdlc-spec-kit-20261029`  
**Feature**: `specs/001-release-readiness-gate`  
**Status**: In Progress  
**Lead**: Agent 1 (Release Captain & SDLC)  

---

## 1. Technical Architecture & Constraints

- **Architecture Precedence**: Executable code and tests outrank documentation; `.okf` decision protocol is the root architectural reasoning authority.
- **Agent Scopes**:
  - **Agent 1 (Release Captain)**: Spec Kit, SDLC, task ledger, Team Change reports, acceptance matrix. Strictly non-overlapping with worker and UI code.
  - **Agent 2 (Worker)**: Execution plane, FastAPI render worker, compute sandboxes.
  - **Agent 3 (UI)**: Next.js control plane interface, OS shell, user controls.
- **Anti-Slop Integration**:
  - Version: 3.2.20. Mode: `during` (session override + `%APPDATA%\antislop\settings.json`).
- **Telemetry & Health Gate**:
  - Live health validation rejects HTTP 200 responses with degraded/offline status.

---

## 2. Implementation Phases

### Phase 1: Environment & Tooling Verification
- [x] Create dedicated worktree `ShortForge-agent1-sdlc` on branch `feat/release-sdlc-spec-kit-20261029` from `origin/main` (`cf4cc2c9`).
- [x] Install Spec Kit via `specify init --here --force --non-interactive --integration claude`.
- [x] Add multi-agent integrations for `codex` and `agy` via `specify integration install`.
- [x] Verify Spec Kit integrations: `agy`, `claude`, `codex` all installed.
- [x] Verify Anti-Slop core v3.2.20 in mode `during`.

### Phase 2: Governance & Constitution Ratification
- [x] Review `.okf/decision-protocol.md`, `.okf/index.md`, `.okf/principles.md`, `.okf/decisions.md`, and `Team/workflow/change-gate.md`.
- [x] Ratify `.specify/memory/constitution.md` additively embedding `.okf` foundational laws (`Claim <= Evidence`, `Decoupled Hierarchy`, `Error Honesty`, `Bounded Repair`).

### Phase 3: Forensic Inspection of PR #253 & Lightning CI
- [x] Inspect PR #253 head commit `0e733960dc034a4b07c2e94c6c0a1f08bd2ded67`.
- [x] Analyze GitHub Actions run `40824025739` on `Lightning Physical MP4 Render Proof`.
- [x] Confirm exit code 1 failure: `Authentication failed: Please run lightning login`.
- [x] Record that PR #253 did not generate physical proof artifacts and cannot serve as production render acceptance.

### Phase 4: Live Render Deployment Inspection
- [x] Inspect Render keepalive run `40804889047`.
- [x] Identify degraded dependencies: `google-drive` (key path missing), `youtube-publisher` (refresh token missing).
- [x] Record deployed container commit `cf4cc2c9` running Node 20 runtime.
- [x] Establish rollback baseline at `cf4cc2c9eae81e4e835a1c6ee8d7bc579868a6af`.

### Phase 5: Multi-Agent Acceptance Matrix & Task Ledger
- [x] Produce comprehensive acceptance matrix with explicit stop conditions.
- [x] Define non-overlapping worktree/branch boundaries for Agent 2 and Agent 3.

### Phase 6: Team Change Report & Validation
- [x] Generate / verify `Team/reports/pr-253.json`.
- [x] Validate using `node Team/scripts/validate-team-report.mjs Team/reports/pr-253.json`.
- [x] Confirm report passes schema and logic validation with honest `BLOCKED` disposition.
