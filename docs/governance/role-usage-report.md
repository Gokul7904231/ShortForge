# Governance Role Usage & Enforcement Report

**Authority:** `.okf/charter.md` (10 Canonical Sovereigns — zero accretion)  
**Machine Registry:** `.okf/architecture/authority-registry.json`

## 1. Ten Canonical Sovereigns — Shipping-Path Enforcement

| # | Sovereign | Scope | Shipping-Path Enforcement Point | Enforcement Test(s) | Status |
|---|---|---|---|---|---|
| 01 | `overseer` | Global command & coordination | `apps/web/factoryos/core/authority/AuthorityRegistryRuntime.ts` (`assertTreasurerCommandAuthority`) | `authority-charter-drift.test.ts`, `authority-runtime.test.ts` | ACTIVE |
| 02 | `treasurer` | Economic gate (`RESERVE`/`SETTLE`/`FREEZE`) | `AuthorityRegistryRuntime.ts` (Law L7) + `.okf/economics/treasurer-operating-contract.md` | `authority-charter-drift.test.ts`, `authority-runtime.test.ts` | ACTIVE |
| 03 | `slayer` | Investigate → classify → prove | `apps/web/factoryos/core/compute/instabox/InstaBoxFleetRegistry.ts` (lease expiry / fault classification) | `authority-charter-drift.test.ts`, `instabox-callback-fencing.test.ts` | ACTIVE |
| 04 | `healer` | Bounded recovery execution | `services/rendering-engine/core/commit.py` / `InstaBoxFleetRegistry.ts` (bounded retries/backoff) | `authority-charter-drift.test.ts`, `test_instabox_agent_backoff.py` | ACTIVE |
| 05 | `remaker` | Scoped surgical reconstruction (`CAP_REMAKER_REPAIR`) | `.okf/hierarchy/remaker.md` + `AuthorityRegistryRuntime.ts` | `authority-charter-drift.test.ts` | DORMANT (advisory/gated) |
| 06 | `comms` | Structured event bus (transports, never commands) | `.okf/hierarchy/comms.md` + `AuthorityRegistryRuntime.ts` (L9 guard) | `authority-charter-drift.test.ts` | ACTIVE |
| 07 | `guardian` | Per-floor sovereign commander (`F00`..`F07`) | `apps/web/app/api/rendering/instabox/dispatch/route.ts` + `AuthorityRegistryRuntime.ts` | `authority-charter-drift.test.ts`, `authority-runtime.test.ts` | ACTIVE |
| 08 | `auditor` | Independent examination (`≠ F07`) | `apps/web/app/api/rendering/instabox/callback/route.ts` + `RenderArtifactVerifier.ts` (G1–G12) | `authority-charter-drift.test.ts`, `p2-render-gates.test.ts` | ACTIVE |
| 09 | `advisor` | Strategy recommendations (no command, no spend) | `.okf/hierarchy/advisor.md` + `GlideWorkerSelectionAdvisor.ts` | `authority-charter-drift.test.ts` | DORMANT (advisory) |
| 10 | `instructor` | Procedural knowledge & lessons (feeds Ascalon) | `.okf/hierarchy/instructor.md` + `AuthorityRegistryRuntime.ts` | `authority-charter-drift.test.ts` | DORMANT (advisory) |

## 2. Subsystem Re-Homing (Charter §4)

- `devourer` → `instructor` + `overseer` (propose-only; promotion requires charter amendment)
- `aer` / `glide` / `scl` → `ascalon` (advisory, shadow-only)
- `fencing` / `cas` / `renderfabric` / `computerouter` → `guardian` (execution infrastructure, never sovereigns)
- `bda` / `fg-healer` → `guardian` (floor-local inspection & recovery)
- `f07` → independent release-integrity boundary (`VerificationEngine.ts`)
