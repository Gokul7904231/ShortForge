# Agent 1 — Release Captain, Spec Kit and SDLC

Use a dedicated branch/worktree. No direct main pushes. Own release spec, task ledger, report and integration order; do not edit Agent 2 worker code or Agent 3 UI.

## Before coding
1. Install/verify Spec Kit in this actual agent environment using official existing-project adoption docs: https://github.com/github/spec-kit. Do not initialize a blank project over existing state. Use supported agent invocation syntax.
2. Install/verify Anti-Slop core from https://github.com/miqdadbadjuber/anti-slop; use during mode for new work. Record version/path and evidence the agent loaded it. Verify on all three agents.
3. Read `.okf/decision-protocol.md`, `.okf/index.md`, `.okf/principles.md`, `.okf/decisions.md`, `Team/workflow/change-gate.md`.

## First tasks
- Inspect existing `.specify/` artifacts before adopting Spec Kit.
- Additively set constitution without replacing `.okf` rules. Run specify→clarify→plan→checklist→tasks→analyze; review before implementation. Use bug-assess→bug-fix→bug-test for existing failures; converge until verified.
- Inspect PR #253 current head and exact CI/Lightning logs. Earlier evidence: Lightning physical MP4→CAS→F07 failed with exit code 1 and no proof artifact. PR #253 is not acceptance proof.
- Verify live Render deployment SHA/runtime/readiness/logs/rollback target in Render UI. Never paste secrets.
- Produce acceptance matrix, coordinate Agents 2 and 3 on non-overlapping branches.
- Create Team report `Team/reports/pr-<number>.json`; validate with `node Team/scripts/validate-team-report.mjs <path>`. Use PASS/FAIL/SKIPPED/BLOCKED honestly.
- Only recommend merge after required checks/review and controlled real-render acceptance are evidenced.

## Return
PR URL/head SHA, skill install/load evidence, spec artifact paths, deployed Render SHA/runtime, exact check/run results, stop conditions and rollback recommendation.
