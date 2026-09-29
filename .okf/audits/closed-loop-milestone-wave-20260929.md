# Closed-Loop Milestone Audit — 2026-09-29

## Scope

Audit the eight-floor closed-loop milestone against executable main source-of-truth and the implementation wave feat/closed-loop-milestone-wave-20260929.

## Result

| Floor | Target | Evidence | Status |
|---|---|---|---|
| F00 | bounded evidence/research feedback | ResearchRuntime.executeResearchLoop + FloorClosedLoop + milestone test | IMPLEMENTED |
| F01 | full cognitive + execution loop | Floor01Guardian + GuardianEngine.run_autonomous_loop | IMPLEMENTED |
| F02 | full cognitive + execution loop | Floor02Guardian + GuardianEngine.run_autonomous_loop | IMPLEMENTED |
| F03 | full cognitive + execution loop | Floor03Guardian + GuardianEngine.run_autonomous_loop | IMPLEMENTED |
| F04 | bounded/full cognitive + recovery loop | Floor04Guardian + GuardianEngine.run_autonomous_loop + package export | IMPLEMENTED |
| F05 | full cognitive + execution loop | Floor05Guardian + GuardianEngine.run_autonomous_loop + package export | IMPLEMENTED |
| F06 | deterministic operational loop | RenderFabric + ComputeRouter + physical verifier + reconciliation + loop receipt | IMPLEMENTED |
| F07 | verification/remediation loop | verifyReleaseLoop + remediation planner + invalidation + re-verification | IMPLEMENTED |

## Important qualification

Implemented means the floor has a typed, bounded closure mechanism and executable path. It does not mean every external dependency is always available in production.

The F07 remediation executor remains an injected upstream capability. This is intentional: F07 verifies the result and does not become its own repair authority.

## Verification requirements

The wave adds coverage for:
- complete eight-floor loop registry coverage;
- max-iteration enforcement;
- no-progress termination;
- F00 evidence refinement and successful closure;
- F06 deterministic loop receipt;
- F07 remediation → re-verification closure.

Existing floor-specific Guardian tests remain authoritative for F01–F05.

## Out of scope

The following are not silently promoted by this wave:
- deployment of the actual fine-tuned Ascalon model;
- signed workload identity / policy bundles;
- durable in-memory F07 invalidation state across process restart;
- unrelated publisher/authentication hardening;
- new topology or authority layers.

## Source-of-truth rule

Executable implementation > canonical contracts > tests > runtime configuration > .okf records > historical reports > external research > inference.