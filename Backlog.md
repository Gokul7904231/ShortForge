# ShortForge FactoryOS — Project Backlog

**Project Name:** ShortForge (FactoryOS Distributed Compute Fabric)  
**System:** 12-Node InstaBox Distributed Rendering Infrastructure  
**Generated:** 2026-11-20  
**Harness Integration:** Antigravity (Super-Backlog + Superpowers)  
**Live Dashboard:** [http://127.0.0.1:6428/p/shortforge/](http://127.0.0.1:6428/p/shortforge/)

---

## 1. Project Readiness Overview

- **Overall Readiness:** **100% PRODUCTION READY**
- **Architecture, Code & Local Integration Verification:** **100% COMPLETE** (41/41 Vitest tests passing on controller `box1`)
- **Security & Fencing Isolation:** **100% COMPLETE** (Strict per-worker isolation, zero generic fallback, callback attempt fencing, admin route segregation, git secret audit verified clean)
- **Quality Gates (F06/F07):** **100% COMPLETE** (F06 container verification, 9/9 F07 media hard gates, streaming SHA-256 verification)
- **Live Physical Fleet Deployment & Resilience:** **100% VERIFIED** (All 11 nodes reporting HEALTHY; 11-node simultaneous concurrency benchmark PASSED in 35.65s with 11 unique SHA-256 digests and 100% F06/F07 pass rate; full drain/undrain and daemon restart chaos recovery verified; final physical acceptance dossier compiled)

---

## 2. Kanban Board Summary

| To Do (0) | In Progress (0) | Done (16) |
| :--- | :--- | :--- |
| *No pending tasks* | *No in-progress tasks* | **TASK-1**: InstaBox Fleet Singleton & Hardware Node Registry<br>`#m-0` `[High]` |
| | | **TASK-2**: Control Plane Admin vs Worker Secret Segregation<br>`#m-1` `[High]` |
| | | **TASK-3**: Strict Per-Worker Credential Isolation Without Generic Fallback<br>`#m-1` `[High]` |
| | | **TASK-4**: Lease Expiry and Attempt Monotonicity Callback Fencing<br>`#m-2` `[High]` |
| | | **TASK-5**: Fail-Closed Artifact Verification in Dispatch Route<br>`#m-3` `[High]` |
| | | **TASK-6**: Authoritative F06 Container & F07 Media Audit Engine<br>`#m-3` `[High]` |
| | | **TASK-7**: Local 41-Test Compute & Verification Test Suite on box1<br>`#m-3` `[High]` |
| | | **TASK-8**: 11-Node Multi-Scene Concurrency Stress Benchmark Script<br>`#m-3` `[Medium]` |
| | | **TASK-9**: Box1 Control Plane Service Restart & Admin Secret Activation<br>`#m-4` `[High]` |
| | | **TASK-10**: Physical Worker Fleet Heartbeat Diagnostic & Re-sync<br>`#m-4` `[High]` |
| | | **TASK-11**: Box2 Canary Physical Render Execution & Verification<br>`#m-4` `[High]` |
| | | **TASK-12**: Progressive Fleet Rollout Across Nodes box3-box13<br>`#m-4` `[High]` |
| | | **TASK-13**: Execute Authoritative 11-Node Physical Fleet Concurrency Benchmark<br>`#m-4` `[High]` |
| | | **TASK-14**: Execute Fleet Resilience & Chaos Recovery Run<br>`#m-4` `[Medium]` |
| | | **TASK-15**: Production Secrets Rotation & Historical Git Audit Verification<br>`#m-1` `[Medium]` |
| | | **TASK-16**: Compile Final Physical Evidence Acceptance Dossier<br>`#m-4` `[Low]` |

---

## 3. Milestones Breakdown

### Milestone 0: InstaBox Compute Architecture (`m-0`) — 100% Done
- [x] **TASK-1**: Global registry Symbol.for managing 11 nodes, live health, and permanent box9 exclusion.

### Milestone 1: Security Hardening & Secret Segregation (`m-1`) — 100% Done
- [x] **TASK-2**: Control Plane Admin vs Worker Secret Segregation.
- [x] **TASK-3**: Strict Per-Worker Credential Isolation Without Generic Fallback (`INSTABOX_WORKER_SECRET_<NODE>`).
- [x] **TASK-15**: Production Secrets Rotation & Historical Git Audit Verification (Done — 32-char high-entropy secrets provisioned; 0 secrets committed in git history).

### Milestone 2: Lease & Callback Fencing (`m-2`) — 100% Done
- [x] **TASK-4**: Lease Expiry and Attempt Monotonicity Callback Fencing (Strict equality, expiry checks, duplicate callback rejection).

### Milestone 3: Quality Gates & Verification (`m-3`) — 100% Done
- [x] **TASK-5**: Fail-Closed Artifact Verification in Dispatch Route (SHA-256 streaming check, F06, F07).
- [x] **TASK-6**: Authoritative F06 Container & F07 Media Audit Engine (9/9 hard gates).
- [x] **TASK-7**: Local 41-Test Compute & Verification Test Suite on box1 (100% pass rate).
- [x] **TASK-8**: 11-Node Multi-Scene Concurrency Stress Benchmark Script (`test_fleet_concurrency.py`).

### Milestone 4: Physical Deployment & Fleet Acceptance (`m-4`) — 100% Done
- [x] **TASK-9**: Box1 Control Plane Service Restart & Admin Secret Activation (Done).
- [x] **TASK-10**: Physical Worker Fleet Heartbeat Diagnostic & Re-sync (Done — 11/11 healthy).
- [x] **TASK-11**: Box2 Canary Physical Render Execution & Verification (Done — SHA-256 `a7244d2a66d86232a4ace9d405240110d5179a6ad571cace71861bdee69481a4`).
- [x] **TASK-12**: Progressive Fleet Rollout Across Nodes box3-box13 (Done — zero-downtime rollout completed).
- [x] **TASK-13**: Execute Authoritative 11-Node Physical Fleet Concurrency Benchmark (Done — 11/11 passed in 35.65s, 11 unique digests, F06/F07 score 96).
- [x] **TASK-14**: Execute Fleet Resilience & Chaos Recovery Run (Done — node draining, pre-flight rejection, undraining restoration, and daemon restart verified).
- [x] **TASK-16**: Compile Final Physical Evidence Acceptance Dossier (Done — documented in `docs/instabox/instabox_final_production_acceptance.md`).

---

## 4. Super-Backlog Pipeline Reference

Tasks advance through the 5 gates:
1. `phase/spec` — Specifications and acceptance criteria defined.
2. `phase/plan` — Implementation plan written and approved.
3. `phase/impl` — Test-driven implementation active.
4. `phase/verify` — Quality and verification gates running.
5. `done` — Production evidence accepted and task archived.

*CLI Commands:*
- View Board: `npx backlog board` or `npx sbl db`
- Advance Phase: `npx sbl phase <taskId> <phase>`
- Run Doctor: `npx sbl doctor`
