# Agent 2 — Instruction (Claude Code)

**Runtime:** Claude Code  
**Role:** Distributed rendering, worker dispatch, callback, persistence/CAS, F07 and Google Drive verification  
**Response file:** docs/release/agent-packets/agent-2-response.md  
**Coordination branch:** docs/three-agent-production-speedrun-20261029

## Activation and trigger

This Markdown file does not launch Claude Code by itself. Start this task when the owner pastes the Agent 2 activation prompt into the Claude Code conversation. Begin immediately; do not wait for Agent 1 or Agent 3.

First read this instruction file from the coordination branch. Immediately overwrite Agent 2's response file with status IN_PROGRESS and push that update to the coordination branch using a clean, isolated worktree. When implementation/verification work finishes, overwrite the entire response file with the final evidence-backed report and push again. Do not append stale logs.

## Mission

Advance the real distributed-render critical path while investigating the known Lightning physical-proof authentication failure. The most recent reviewed failure reported that Lightning authentication was rejected and no physical-proof artifact was available. Re-check current workflow logs and code before assuming the failure has the same cause.

## Required sequence

1. Inspect git status and existing worktrees before touching anything. Preserve uncommitted work. Use the existing Agent 2 branch, normally agent2/distributed-render-20261029; do not create a duplicate branch or PR without checking current remote state.
2. Read .okf/decision-protocol.md, .okf/index.md, .okf/principles.md, .okf/decisions.md and the relevant Team change-gate instructions. Verify Spec Kit and Anti-Slop actually load in this Claude Code session before source edits; record version/path/evidence, not merely installed-file presence.
3. Trace the live code path end to end: generation API → queue/dispatch manager → configured repository/workflow/ref → worker claim/lease → physical renderer → callback/authentication/idempotency → artifact resolver/CAS → physical F07 → status/durability → Google Drive delivery.
4. Re-fetch the current failed Lightning Physical MP4 Render Proof run and inspect its logs without revealing credential values. Check whether expected variables exist by name, whether the workflow maps the correct names, and whether user/teamspace/studio configuration is consistent. The old evidence mentions LIGHTNING_USER_ID, LIGHTNING_API_KEY and LIGHTNING_TEAMSPACE; inspect the actual current workflow before treating any name as mandatory. A masked variable's presence does not prove it is valid.
5. Fix verified defects in Agent 2-owned worker/pipeline code only. Do not change Agent 1's governance files or Agent 3's UI. Do not weaken proof gates, fake a callback, use mocks as physical proof, or treat exit code 0 by itself as acceptance.
6. Open or update the correct implementation PR after verifying the branch and existing PR list. Never guess the PR number. Ensure its Team report is scoped to the actual PR and passes the canonical validator where executable.
7. Run applicable CI and focused tests. Use one explicitly authorized, low-cost staging render only when target and credentials are verified. No bulk queue drain, paid GPU launch, production-user job or external publishing.
8. For a real render, collect: job ID and workflow-run link; exact renderer outcome; MP4 existence, ffprobe streams and decode result; independently measured SHA-256 and byte length; authoritative callback result; CAS reference resolving to physical bytes with matching digest/length; F07 receipt for the same digest; Drive file ID/MIME/size and downloaded-byte integrity; and successful retrieval after backend restart.
9. If a provider, credential or environment blocks execution, stop at the boundary and report the observable error, timestamp/run link, names of missing/invalid settings and the owner action needed. Never turn BLOCKED/UNPROVEN into PASS.

## Secret and credential handling

- Never print, echo, commit, paste into ChatGPT, or include secret values in logs, screenshots, PR bodies or response files.
- Inspect current workflow/code for the exact environment variable names before requesting anything. Potential names already seen in this project include GITHUB_RENDER_REPOSITORY, GITHUB_RENDER_WORKFLOW, GITHUB_RENDER_REF, GITHUB_RENDER_TOKEN, FACTORYOS_EXECUTION_SECRET, FACTORYOS_CONTROL_PLANE_URL, RENDER_WORKER_SECRET, LIGHTNING_USER_ID and LIGHTNING_API_KEY. Google Drive and persistence settings depend on the current implementation; do not invent names.
- For Lightning non-interactive CI, the official docs describe obtaining the user ID and API key under the account profile → Global settings → Keys, then configuring them as LIGHTNING_USER_ID and LIGHTNING_API_KEY in the CI secret store. Docs: https://api.lightning.ai/docs/platform/overview/getting-started/ and https://api.lightning.ai/docs/platform/developers/cli/
- For GitHub Actions, the owner can configure repository secrets at GitHub repository → Settings → Secrets and variables → Actions → New repository secret. Choose the minimum permissions and only the names the inspected workflow actually consumes.
- For Render service environment variables, the owner can use Render Dashboard → select the service → Environment. Do not put app credentials into committed .env files. Official docs: https://render.com/docs/configure-environment-variables
- For Google Drive, inspect the app's existing supported OAuth/service-account configuration first. Tell the owner the exact missing variable/file/permission and its verified source; do not assume which credential model is in use.
- If a credential needs creation, renewal, scope changes or rotation, do not perform it without owner authorization. In the response, provide a safe step-by-step setup guide, exact configuration destination, minimal permissions inferred from code, and a validation command that never prints the value. Ask the owner to configure secrets directly; never ask them to send values to you.

## Ownership and safety

- Keep worker, dispatch, callback, CAS and physical acceptance code within Agent 2 scope.
- No direct push to main, no merge, no production dispatch enablement, no production deployment, no credentials rotation, and no external publication without owner approval.
- Do not create extra files inside docs/release/agent-packets. Use Team/reports/pr-<actual-number>.json for required PR change records and other canonical repository paths for test artifacts.
- The response-file update is separate from your implementation branch. Publish it only to docs/three-agent-production-speedrun-20261029 using a clean, isolated worktree; commit only agent-2-response.md in that response commit. If another response file was pushed concurrently, fetch/rebase and retry without force-pushing.

## Completion criteria

Publish the final response with the actual branch/PR/head SHA, changed files, tests and workflow links, exact render-evidence table, observed blockers, owner-only secret/permission actions with acquisition/configuration guidance, and response commit SHA. Distinguish CODE TEST PASS from PHYSICAL ACCEPTANCE PASS.

**Activation prompt:** “ACTIVATE AGENT 2 — Claude Code. Follow docs/release/agent-packets/agent-2-instruction.md from the coordination branch. Investigate/fix the real distributed-render blocker, start and finish by overwriting agent-2-response.md on that branch, and push the response update. Never expose credential values or claim physical acceptance without physical evidence.”
