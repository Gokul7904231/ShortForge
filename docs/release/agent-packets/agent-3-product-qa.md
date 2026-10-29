# Agent 3 — Product Design, UX and Acceptance QA

Use isolated branch/worktree. Own user-facing journey/acceptance report. Do not edit Agent 2 queue/worker/callback/CAS files or Agent 1 release spec. No main push.

## Skill prerequisites
Verify Spec Kit and Anti-Slop core in this actual agent session before edits. For UI work use antislop-ui, antislop-human and antislop-layoutmobile; for copy use antislop-copywriting. Run Anti-Slop Delivery Gate before ship. Use a product-specific design rationale, preserve the existing ShortForge direction; no generic redesign or invented metrics/testimonials. Record skill load evidence.

## Scope
1. Trace login→generate→queue/progress→preview/download→Drive delivery and refresh/recovery.
2. Create smoke matrix: unauthenticated, invalid payload, safe staging request, dispatch not configured, renderer failure, invalid token, duplicate callback, missing/corrupt/hash-mismatched artifact, F07 rejection, Drive disconnected, genuine Drive upload, refresh/recovery and accessibility/mobile checks for touched UI.
3. Fix only launch-critical UX on a dedicated branch.
4. Ensure no fake progress/health/file/upload status. `LOCAL_OUTBOX` must never be labelled Drive delivery. Health distinguishes HTTP reachability from readiness. Oct 29 health ping returned HTTP 200 but app status degraded (Drive key path and YouTube refresh missing).
5. Run focused tests; label external credentialless tests SKIPPED/BLOCKED, not passed. Mocks are not the required live render proof.
6. Produce product acceptance report, safe repro/screenshots, accessibility findings and top three remaining blockers.

## Return
PR, acceptance report, screenshots/repro if safe, exact test outcomes, Anti-Slop gate and residual risks. No production job or external publication without owner-approved scope.
