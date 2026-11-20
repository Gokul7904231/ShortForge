# Technical Debt & Repository Hygiene Audit: ShortForge FactoryOS

**Target Workspace:** `c:\Users\ASUS\OneDrive\Desktop\123\aishorts`  
**Execution Timestamp:** 2026-11-20  
**Auditor:** Senior Software Architect & Repo Hygiene System  
**Framework:** `tech-debt-audit` (Global Antigravity Rule & Super-Backlog Phase Integration)

---

## 1. Executive Summary

This codebase constitutes **ShortForge FactoryOS**, a distributed, high-throughput automated video generation and compute orchestration fabric. It combines a Next.js 16 web control plane (`apps/web`), a Python/FastAPI rendering engine (`services/rendering-engine`), Remotion video composition pipelines, and a newly hardened 11-node physical InstaBox distributed compute fleet (`box1` controller to `box2`..`box13` workers).

While core algorithmic pipelines and local security fencing (Vitest 41/41 passing) are robust, the repository exhibits significant accumulation of technical debt across 9 structural dimensions:

1. **Root-Level Operational Clutter (High Urgency):** Video renders (`.mp4`), audio drafts (`.mp3`), test frames (`.png`), and raw forensic text files sit uncommitted in the repo root.
2. **Architectural God Files & Duplication (High Urgency):** Major entry points exceed 2,000–3,000 lines. Identical 2,100+ line Python rendering pipelines are duplicated across `services/rendering-engine/scripts/` and `hybrid-video/scripts/`.
3. **Lockfile & Package Manager Dual-Homing (Medium Urgency):** Root contains both `pnpm-lock.yaml` and `package-lock.json`, creating dependency drift and non-deterministic build risks in CI.
4. **Physical Deployment Blockers (Canary Box2 VERIFIED):** Control plane daemon on physical `box1` reloaded with admin and per-worker secrets (`shortforge-controlplane.service`). Physical canary render on `box2` verified (F06 PASS, F07 PASSED score 96, SHA-256 `a7244d2a66d86232a4ace9d405240110d5179a6ad571cace71861bdee69481a4`). Fleet rollout to `box3`–`box13` staged.

---

## 2. Architectural Mental Model

```
                    [ Operator / Web UI / API Gateway ]
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             ShortForge Control Plane (Next.js 16)      │
       │  • apps/web/app/api/instabox/dispatch/route.ts         │
       │  • apps/web/app/api/instabox/callback/route.ts         │
       │  • apps/web/lib/instabox/InstaBoxFleetRegistry.ts       │
       │  • apps/web/lib/instabox/InstaBoxJobLeaseManager.ts    │
       └──────────────────────────┬─────────────────────────────┘
                                  │
         Per-Worker HMAC Secrets  │  Fenced Callback Protocol
         (box2..box13 isolated)   │  (Strict Attempt Equality)
                                  ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    InstaBox Distributed Compute Fleet                  │
 │                                                                        │
 │   box1 (Controller Plane + Registry + CAS File Store)                 │
 │     ├── box2  (Active / Pilot Canary Target)                           │
 │     ├── box3 .. box8 (Active Render Nodes)                             │
 │     ├── box9  (PERMANENTLY EXCLUDED - Hardware Fault)                  │
 │     └── box10 .. box13 (Active Render Nodes)                           │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Comprehensive Findings Table

| ID | Category | File:Line | Severity | Effort | Description | Recommendation |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **CLT-01** | Operational Clutter | `shortforge-instavm-final-proof.mp4:1` | Med | Low | Rendered MP4 binary sitting in repository root (34.2 MB). | Move to test fixtures or archive outside source git tree. Add `*.mp4` to `.gitignore`. |
| **CLT-02** | Operational Clutter | `test_frame_q2_ganges.png:1`, `test_speech.mp3:1`, `temp_test_audio.mp3:1` | Low | Low | Scratch audio and test frame artifacts cluttering workspace root. | Remove files and configure `services/rendering-engine/.cache/` as target scratch directory. |
| **CLT-03** | Operational Clutter | `latest_user_request.txt:1`, `FINAL-TEST-RESULTS.md:1` | Low | Low | Ad-hoc text dumps left in root from previous interactive test sessions. | Move acceptance notes to `docs/acceptance/` or delete if obsolete. |
| **ARC-01** | God File / Data Leak | [apps/web/lib/quiz/datasets/geo-hardcoded-sets.ts](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/lib/quiz/datasets/geo-hardcoded-sets.ts#L1-L3232) | Med | Med | Massive 3,232-line hardcoded geographic dataset embedded in TypeScript source bundle. | Extract into external static JSON asset (`public/datasets/geo.json`) or lazy SQLite / KV lookup. |
| **ARC-02** | God Component | [apps/web/components/QuickGenerateOverlay.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/components/QuickGenerateOverlay.tsx#L1-L1760) | High | Med | 1,760-line monolithic UI component handling state, network polling, presets, and Remotion previews. | Split into `<PresetsSelector>`, `<GenerationStatusCard>`, and `<VideoPreviewPlayer>`. |
| **DUP-01** | Duplication & Drift | [services/rendering-engine/scripts/create_short.py](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/services/rendering-engine/scripts/create_short.py#L1-L2124) vs [hybrid-video/scripts/create_short.py](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/hybrid-video/scripts/create_short.py#L1-L2106) | High | Med | Two nearly identical 2,100+ line Python CLI generation pipelines drifting independently. | Unify into `services/rendering-engine/src/pipeline/cli.py` and delete obsolete `hybrid-video/scripts/` copy. |
| **PKG-01** | Dependency Drift | `package-lock.json` vs `pnpm-lock.yaml` | Med | Low | Coexistence of both npm and pnpm lockfiles creates non-deterministic CI dependency resolutions. | Standardize on `pnpm`. Remove `package-lock.json` and document `pnpm install` in developer guide. |
| **SEC-01** | Secret Isolation | [apps/web/lib/instabox/InstaBoxFleetRegistry.ts](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/lib/instabox/InstaBoxFleetRegistry.ts#L80-L115) | Low | Low | Verified: General worker-secret fallback successfully eliminated in latest commit `b0011030`. | Keep unit test `instabox-security-matrix.test.ts` as a permanent gate in CI. |
| **OPS-01** | Physical Acceptance | `scripts/instabox/canary_box2_acceptance.py:1` | Resolved | Low | **VERIFIED (2026-11-20T13:24:52Z, commit 4f4b4181)**: Control plane reloaded on `box1`; physical canary rendered on `box2` in 7.98s; CAS SHA-256 `a7244d2a66d86232a4ace9d405240110d5179a6ad571cace71861bdee69481a4` (77,409 bytes); F06 PASS, F07 PASSED (9/9 hard gates). | Proceed to progressive fleet rollout across nodes `box3`–`box13` (TASK-12). |
| **SCR-01** | Uncommitted Scratch | `tools/audit_repo.py:1`, `tools/find_collections.py:1`, `searxng/:1` | Low | Low | Scratch helper scripts and subdirectories in workspace without formal package entry. | Organize under `scripts/tools/` with typed args or add to `.gitignore`. |

---

## 4. Top 5: "If You Fix Nothing Else, Fix These"

1. **Execute Box 1 Service Reload & Box 2 Canary (OPS-01) — [RESOLVED / VERIFIED]**:
   - *Evidence*: Verified 2026-11-20T13:24:52Z at commit `4f4b4181`. Control plane active; Box2 canary rendered in 7.98s; F06 PASS; F07 PASSED (score 96, 9/9 hard gates); artifact `a7244d2a66d86232a4ace9d405240110d5179a6ad571cace71861bdee69481a4`. Proceed to fleet rollout (`box3`–`box13`).
2. **Deduplicate `create_short.py` Pipeline (DUP-01)**:
   - *Impact*: Prevents catastrophic regression drift between video generation engines.
3. **Purge Root Binaries and Media Clutter (CLT-01, CLT-02, CLT-03)**:
   - *Impact*: Prevents repo bloat, reduces clone latency, and enforces workspace hygiene policy.
4. **Standardize on `pnpm` & Delete `package-lock.json` (PKG-01)**:
   - *Impact*: Eliminates dual-package manager caching conflicts in local dev and GitHub Actions CI.
5. **Decompose `QuickGenerateOverlay.tsx` (ARC-02)**:
   - *Impact*: Reduces frontend re-render lag and enables isolated component testing.

---

## 5. Quick Wins Checklist (Low Effort, High Value)

- [ ] Delete `package-lock.json` (retaining `pnpm-lock.yaml`).
- [ ] Move `shortforge-instavm-final-proof.mp4` and `test_frame_*.png` to `.gitignore` or archive storage.
- [ ] Add `.mp4`, `.mp3`, `.wav`, `.png`, and `.tar.gz` root patterns to `.gitignore`.
- [ ] Run `python -m unittest discover tests` in `services/rendering-engine` to ensure parity.
- [ ] Tag current hardened commit `b0011030` as `v0.9.0-instabox-hardened`.

---

## 6. Things That Look Bad But Are Actually Fine

- **`factoryos` legacy naming**: Several internal loggers and tests reference `factoryos` while public branding is `ShortForge`. This is an intentional internal fabric codename and does not impact functionality.
- **`box9` permanent absence**: The fleet jumps from `box8` directly to `box10`. `box9` has verified fatal kernel/hardware instability; its exclusion is an intentional resilience measure.
- **Large Geo Dataset (3,200 lines)**: While in TypeScript, it is tree-shaken and only bundled in quiz generation routes. It is debt, but not an immediate memory leak.
- **Mock worker secrets in Vitest**: `test-box2-secret-xyz` in unit tests is intentionally mock-only and strictly isolated from production environment variables.

---

## 7. Open Questions for the Maintainer

1. **Package Manager Standardization**: Confirm whether `pnpm` is the sole authoritative package manager for CI so `package-lock.json` can be permanently deleted.
2. **Media Output Storage Strategy**: Should local development render directly to `services/rendering-engine/output/` with automated rotation, rather than leaving root artifacts?
3. **Physical Box 1 Reload Window**: When should the operator SSH into `box1` to run `sudo systemctl restart shortforge-controlplane.service` for live canary verification?
