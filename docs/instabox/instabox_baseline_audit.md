# ShortForge FactoryOS — InstaBox Fleet Baseline Forensic Audit & Deployment Plan

**Date:** 2026-11-16  
**Repository:** `Gokul7904231/ShortForge`  
**Branch:** `feat/instabox-render-provider`  
**Starting Commit:** `6cc7144fd7565e15f4d1f0dd4623de4e11b78484`  
**Status:** Pre-Deployment Forensic Baseline & Backup Confirmation  

---

## 1. Fleet Inventory, Topology & Hardware Status

The InstaBox distributed rendering fleet consists of 1 controller node and 11 dedicated worker nodes. Node `box9` is permanently excluded from all routing, authentication, and registration.

| Node | Role | IP / Hostname | Hardware (Live Verified) | Storage Mount (`/data`) | Systemd Service |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **box1** | Control Plane | `instabox-box1` | 4 vCPU, 7.8 GiB RAM | 20 GB (7.5 GB used, 13 GB avail) | `shortforge-controlplane.service` |
| **box2** | Canary Worker | `instabox-box2` | 4 vCPU, 7.8 GiB RAM | 20 GB (4.3 GB used, 16 GB avail) | `instabox-worker.service` |
| **box3** | Worker | `instabox-box3` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box4** | Worker | `instabox-box4` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box5** | Worker | `instabox-box5` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box6** | Worker | `instabox-box6` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box7** | Worker | `instabox-box7` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box8** | Worker | `instabox-box8` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box9** | **EXCLUDED** | *Permanently Excluded* | N/A | N/A | Excluded from registry & routing |
| **box10** | Worker | `instabox-box10` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box11** | Worker | `instabox-box11` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box12** | Worker | `instabox-box12` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |
| **box13** | Worker | `instabox-box13` | 4 vCPU, 7.8 GiB RAM | 20 GB | `instabox-worker.service` |

---

## 2. Non-Destructive Backup Confirmation on `box1`

Before making any production updates, a non-destructive backup of the control plane state, configuration, and CAS metadata was executed on `box1`:

- **Backup Timestamp:** `20261116_110200`
- **Environment Configuration:**
  - Source: `/data/workspace/ShortForge/apps/web/.env.local`
  - Backup: `/data/backup_env_local_20261116_110200`
  - Permissions: `chmod 600` (read/write by owner only; zero secret exposure)
- **Fleet State Store:**
  - Source: `/data/workspace/ShortForge/apps/web/data/factoryos_state/`
  - Backup: `/data/workspace/ShortForge/apps/web/data/factoryos_state_backup_20261116_110200/`
  - Stored State File: `instabox_fleet_state.json` (6,738 bytes, preserving all attempt counters and node metrics)
- **Content-Addressed Storage (CAS) Index:**
  - CAS Path: `/data/workspace/ShortForge/apps/web/data/cas_storage`
  - Manifest: `/data/cas_storage_manifest_20261116_110200.txt` (15 physical `.mp4` artifacts indexed with zero modification)

---

## 3. Forensic Code Audit & Identified Production Blockers

A forensic line-by-line inspection of commit `6cc7144f` revealed the following critical items that must be resolved prior to declaring production readiness:

### A. Authentication & Worker Identity Scope (Phase 1)
1. **Ambiguous Dispatch Authentication:**
   In `apps/web/app/api/rendering/instabox/dispatch/route.ts` (lines 70-78), dispatch requests accept worker tokens for administrative dispatch and draining:
   ```typescript
   const isFleetSecretValid = registry.authenticateWorker(token);
   const isWorkerSecretValid = body.workerId
     ? registry.authenticateWorker(token, body.workerId)
     : false;
   ```
   **Remedy:** Separate admin dispatch privileges from worker execution privileges. Introduce `INSTABOX_CONTROL_PLANE_ADMIN_SECRET` and implement `registry.authenticateControlPlaneAdmin(token)`. Admin endpoints (drain, undrain, manual dispatch) must strictly require the admin secret.
2. **Missing Worker Identity Enforcement:**
   In `apps/web/factoryos/core/compute/instabox/InstaBoxFleetRegistry.ts` (lines 250-286), `authenticateWorker(token, workerId)` falls back to the shared fleet secret if per-worker secret is missing or when `workerId` is omitted.
   **Remedy:** Enforce that worker operations (`claim`, `heartbeat`, `progress`, `callback`) require a matching `workerId` and validate against the specific node secret `INSTABOX_WORKER_SECRET_<NODE>`. Missing or mismatched worker IDs must fail closed.
3. **Fleet Configuration Completeness:**
   `isCredentialConfigured()` in `InstaBoxFleetRegistry.ts` currently returns `true` if any one generic secret is present. It must verify that credentials for all 11 active worker nodes are configured.

### B. Artifact Verification Enforcement (Phase 2)
1. **Soft Verification Failures in Dispatch:**
   In `dispatch/route.ts` (lines 242-294), the endpoint calculates `sha256Match`, runs `RenderArtifactVerifier`, and runs `VerificationEngine.auditMediaArtifact`. However, it logs or attaches the result but returns `success: true` regardless of whether `sha256Match` is false, F06 fails, or F07 hard gates fail.
   **Remedy:** The dispatch endpoint must fail closed (`success: false`, HTTP 422) if:
   - Computed SHA-256 does not match `artifactRef.sha256`.
   - `verifierResult.status !== "PASS"`.
   - `!f07Audit.passed` or any of the 9 F07 hard gates fail.
2. **Dynamic Multi-Scene Verification:**
   `dispatch/route.ts` currently hardcodes `sceneCount: 1` when invoking `VerificationEngine.auditMediaArtifact`. It must dynamically inspect the validated manifest scenes array.

### C. Multi-Scene ShortForge Rendering in Benchmarks (Phase 3)
1. **Benchmark Test Workload:**
   Previous concurrency benchmarks used a single 2-second synthetic scene.
   **Remedy:** The 11-node acceptance benchmark must execute authentic multi-scene compositions (`KINETIC_HOOK`, `BIG_NUMBER`, `OUTRO_CTA`) with distinct visual backgrounds, typography, and unique audio frequencies to prove multi-shot timeline stitching and end-to-end rendering across all 11 nodes simultaneously.

### D. Durable State Persistence & Monotonic Fencing (Phase 4)
1. **Monotonic Attempt Fencing:**
   `instabox_fleet_state.json` provides atomic snapshotting via temporary file rename, but restart recovery must guarantee that in-flight leases from a dead server instance are deterministically expired and requeued, without leaking orphaned promises.

---

## 4. Controlled Deployment & Rollout Plan

To adhere to human attention economics and zero-downtime safety:

1. **Step 1: Code Hardening & Local Unit Tests**
   - Update `InstaBoxFleetRegistry.ts` (strict admin/worker auth, fleet credential verification).
   - Update `dispatch/route.ts` (hard failure on verification gates, admin auth separation).
   - Update `claim`, `heartbeat`, `progress`, `callback` route handlers for strict worker scoping.
   - Add unit test suites: `instabox-security-matrix.test.ts` and `instabox-verification-gates.test.ts`.
2. **Step 2: User Presentation & Review**
   - Present this audit report and backup confirmation to the user.
   - Await user approval before touching running services on `box1` or workers.
3. **Step 3: Controller (`box1`) Update**
   - Update `apps/web/.env.local` on `box1` with `INSTABOX_CONTROL_PLANE_ADMIN_SECRET`.
   - Pull git branch `feat/instabox-render-provider` on `box1`.
   - Restart `shortforge-controlplane.service` and verify startup logs.
4. **Step 4: Canary Node (`box2`) Pilot Deployment**
   - Update `/opt/instabox-agent/agent.py` on `box2`.
   - Restart `instabox-worker.service` on `box2`.
   - Execute single-node multi-scene test dispatch to `box2` and verify all 9 F07 hard gates pass.
5. **Step 5: Staged Fleet Rollout (`box3`–`box8`, `box10`–`box13`)**
   - For each worker node: Drain -> Update `agent.py` -> Restart service -> Verify heartbeat -> Undrain.
6. **Step 6: Live 11-Node Simultaneous Concurrency & Resilience Acceptance**
   - Execute 11-node simultaneous multi-scene concurrency benchmark.
   - Execute worker restart and drain/undrain resilience tests.
   - Collect all 11 receipts, CAS hashes, and F07 verification scores.
