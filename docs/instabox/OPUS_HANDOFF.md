# ShortForge FactoryOS — InstaBox Fleet Handoff & State Protocol

**Protocol:** Ponytail + Opus 4.6 Engineering Protocol  
**Date:** 2026-11-16  
**Repository:** `Gokul7904231/ShortForge`  
**Active Branch:** `feat/instabox-render-provider`  
**Current HEAD:** `3a9ecdb1a5e0037564d60da5443ca20536750058`  
**Target Environment:** 12-node InstaBox Fleet (`box1` controller, `box2`–`box8`, `box10`–`box13` workers; `box9` excluded)  

---

## 1. Verified Backups on `box1` (Non-Destructive)

The following backups were created on `box1` prior to any code or service modifications:

* **Control Plane Environment:** `/data/backup_env_local_20261116_110200` (`chmod 600`, zero credential leakage)
* **Fleet State Store:** `/data/workspace/ShortForge/apps/web/data/factoryos_state_backup_20261116_110200/` (`instabox_fleet_state.json`)
* **CAS Storage Inventory:** `/data/cas_storage_manifest_20261116_110200.txt` (15 physical `.mp4` CAS artifacts indexed)

---

## 2. Implemented Code Changes (Landed & Pushed)

### Commits:
* `648c15f3`: `feature(compute): enforce admin secret segregation and strict verification gates`
* `3a9ecdb1`: `bug(compute): allow normalized node IDs in parseInstaBoxNodeId`

### Key Architectural & Security Fixes:
1. **Admin Secret vs. Worker Secret Segregation:**
   * Introduced `INSTABOX_CONTROL_PLANE_ADMIN_SECRET` and `registry.authenticateControlPlaneAdmin(token)`.
   * Administrative routes (`/dispatch`, `drain`, `undrain`) strictly require control plane admin credentials. Worker tokens are rejected with HTTP 401.
2. **Strict Worker Identity Enforcement:**
   * `registry.authenticateWorker(token, workerId)` strictly requires a valid `workerId`. Missing or unregistered IDs fail closed.
   * Node `box9` is permanently rejected.
   * Validates per-worker credentials (`INSTABOX_WORKER_SECRET_<NODE>`), preventing worker credential spoofing.
3. **Fail-Closed Artifact Verification in Dispatch:**
   * Enforces streaming SHA-256 digest match (returns HTTP 422 if mismatched).
   * Enforces F06 container check (`RenderArtifactVerifier`, returns HTTP 422 if `status !== "PASS"`).
   * Enforces F07 Media Audit (`VerificationEngine.auditMediaArtifact`, returns HTTP 422 if any of the 9 hard gates fail).
   * Dynamically audits scene counts based on validated composition manifests.
4. **Authentic Multi-Scene Composition in Fleet Concurrency Benchmark:**
   * Upgraded `scripts/instabox/test_fleet_concurrency.py` to dispatch authentic 3-scene compositions (`KINETIC_HOOK` + `BIG_NUMBER` + `OUTRO_CTA`) with unique audio frequencies and typography across all 11 nodes.
   * Asserts 9/9 F07 hard gates and 11 unique SHA-256 digests.

---

## 3. Test & Diagnostic Verification Breakdown

> [!IMPORTANT]
> **Production Acceptance Status:** `PRODUCTION_BLOCKED`
> **Physical Worker Acceptance Status:** `NO PHYSICAL ACCEPTANCE ACHIEVED`
> All tests below were executed as **Local Simulations** or **Local Route Integration Tests** running via Vitest directly on controller `box1`. No worker machine was dispatched via live physical SSH execution for these tests. Live physical workers currently show heartbeat timeout (`BLOCKED`).

### Diagnostic & Simulation Results (Executed on `box1`):

| Test Suite | Tests | Category | Result | Description / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `factoryos/tests/instabox-security-matrix.test.ts` | 10 | **Local Unit / Security Matrix** | **PASSED** | Strict admin/worker secret segregation, per-worker credential isolation, removal of generic fallback, `box9` permanent exclusion |
| `factoryos/tests/instabox-callback-fencing.test.ts` | 8 | **Local Route Fencing** | **PASSED** | Missing/non-integer attemptId rejected (400), lower attempt rejected (409 stale), higher attempt rejected (409), expired lease rejected (409), duplicate callback rejected (409) |
| `factoryos/tests/instabox-verification-gates.test.ts` | 3 | **Local Quality Gate** | **PASSED** | Corrupt container, missing physical artifact, SHA-256 mismatch rejection |
| `factoryos/tests/instabox-box2-pilot-acceptance.test.ts` | 1 | **Local FFmpeg Integration Simulation** | **PASSED** | Simulates Box2 lifecycle via local process FFmpeg generation and authoritative F07 audit. **NOT a physical worker test.** |
| `factoryos/tests/instabox-render-provider.test.ts` | 18 | **Local Compute Fabric Integration** | **PASSED** | Health degradation, atomic claims, timeout recovery, stale callbacks |

### Infrastructure Access Log:
* **Controller `box1` SSH Access:** Attempt 1 failed with transient host wake-up latency (`machine is waking up`). Subsequent retry succeeded with 15s connection timeout.
* **Storage Mounts:** Confirmed persistent storage at `/data` (13GB available) and CAS at `/data/workspace/ShortForge/apps/web/data/cas_storage`.
* **Worker Service State:** Worker nodes `box2`–`box13` (excl. `box9`) are running existing service processes but are currently reporting `BLOCKED` due to heartbeat timeouts ($>300$s without heartbeat). Direct execution without operator-approved service update is blocked.

---

## 4. Current State & Safety Hold Points

* **Production Acceptance State:** `PRODUCTION_BLOCKED`
* **Rationale:** While all code-level security hardening, strict per-worker credential isolation, callback fencing, and multi-scene verification gates are implemented and pass 100% of local integration tests on `box1`, live physical acceptance is held pending operator approval for service restarts, credential provisioning, and canary deployment.
* **Service Restarts:** Neither `shortforge-controlplane.service` on `box1` nor `instabox-worker.service` on worker nodes has been restarted.
* **Live Fleet State:** No live fleet credentials rotated, no CAS artifacts deleted, no active leases cleared. Live worker nodes remain in `BLOCKED` heartbeat-timeout status.

---

## 5. Next Immediate Actions (Upon Operator Approval)

1. **Step 1:** Restart `shortforge-controlplane.service` on `box1` to load hardened route handlers and `INSTABOX_CONTROL_PLANE_ADMIN_SECRET`.
2. **Step 2:** Deploy canary update to `box2`, restart worker service, and execute single-node multi-scene test render.
3. **Step 3:** Perform progressive staged rollout across remaining 10 workers (`box3`–`box8`, `box10`–`box13`) with drain $\rightarrow$ update $\rightarrow$ restart $\rightarrow$ heartbeat verification $\rightarrow$ undrain.
4. **Step 4:** Execute 11-node simultaneous concurrency benchmark (`test_fleet_concurrency.py`) and resilience benchmark (`test_fleet_resilience.py`).
5. **Step 5:** Record evidence receipts in `docs/instabox/instabox_final_production_acceptance.md`.
