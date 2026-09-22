---
name: factoryos-verify
description: Skill for running authoritative FactoryOS verification gates prior to declaring a mission or engineering task complete.
---

# FactoryOS Authoritative Verification Skill

## Rule of Verification
Never declare a task complete merely because code compiles or unit mocks returned 200 OK.
A change affecting the FactoryOS execution path must be proven via the canonical testing system.

## Verification Checklist
1. Run typecheck: `npm run typecheck`
2. Run canonical golden mission: `npx tsx testing/cli/mission.ts golden-short-001`
3. Inspect `findings` array in report: must have 0 critical and 0 error findings.
4. Verify physical files on disk in `data/renders/` and `data/outbox/`.
5. Confirm exit code is `0`.
