# Agent 1 — Instruction (Antigravity)

**Runtime:** Antigravity  
**Role:** Release Captain, SDLC, integration order and release decision  
**Response file:** docs/release/agent-packets/agent-1-response.md  
**Coordination branch:** docs/three-agent-production-speedrun-20261029

## Activation and trigger

This Markdown file does not launch Antigravity by itself. Start this task when the owner pastes the Agent 1 activation prompt into the Antigravity conversation. Do not wait for Agents 2 or 3 before beginning the release-state inspection.

First read this file from the coordination branch. Immediately overwrite Agent 1's response file with status IN_PROGRESS and push that response-file update to the coordination branch using an isolated worktree. When your task is complete, overwrite the entire response file with the final evidence-backed report and push again. Never append an endless log.

## Mission

Act as release coordinator—not as the implementation owner for rendering or UI. Refresh the actual repository state and establish the safest next integration order across Agent 1, Agent 2 and Agent 3.

1. Read .okf/decision-protocol.md, .okf/index.md, .okf/principles.md, .okf/decisions.md, Team/workflow/change-gate.md, and the current release speedrun plan. These remain authoritative.
2. Verify the live GitHub state for PRs #253, #254 and #255; inspect each current head SHA, merged/open state, required checks and latest relevant workflow runs. Do not rely on old pasted reports or assume that a previously reported SHA remains current.
3. Inspect the existing Agent 2 branch/PR and Agent 3 branch/PR. Report exactly what exists, what has been pushed, and what remains local/unverified. Never invent a PR number.
4. Reconcile release blockers against evidence: current live readiness, physical MP4/ffprobe proof, exact SHA-256 and byte length, real CAS bytes, F07, Google Drive metadata/download identity, and retrieval after backend restart.
5. Maintain the release gate and dependency order. Do not mark production acceptance PASS while any required gate is FAIL, BLOCKED, SKIPPED or UNPROVEN. Keep scheduled production dispatch gated.
6. Verify the current Team report for each PR is correctly scoped to that PR and validate it with the repository's canonical validator where local execution is available. A green governance check is not physical production acceptance.
7. Give the owner a concise, actionable integration plan: immediate next action, required agent, evidence needed, blocker owner, and stop condition.

## Ownership and safety

- Work only on Agent 1's existing branch/worktree for Agent 1 source changes, normally feat/release-sdlc-spec-kit-20261029. Preserve local changes; inspect git status first.
- Never push directly to main, merge PRs, alter production configuration, enable scheduled dispatch, trigger paid compute, publish externally, or change credentials.
- Do not edit Agent 2 worker/pipeline implementation or Agent 3 UI implementation.
- Do not expose secret values, cookies, bearer tokens, API keys, or private environment files in terminal output, reports, or GitHub.
- If GitHub/Render/provider permissions block verification, report the exact missing permission or owner action rather than inferring status.
- Do not create files inside docs/release/agent-packets beyond the six agreed instruction/response files. Put required Team reports in their repository-prescribed Team/reports path.

## How to publish your response

The response files are shared on the coordination branch, separate from each agent's implementation branch. Use a dedicated, clean Git worktree for response publishing; do not switch branches in a dirty implementation worktree.

1. Fetch origin and inspect docs/three-agent-production-speedrun-20261029.
2. Use a separate worktree/checkout for that branch.
3. Replace the complete contents of docs/release/agent-packets/agent-1-response.md.
4. Review the diff to confirm only your response file changed.
5. Commit and push to docs/three-agent-production-speedrun-20261029. If the push is rejected because another agent updated its different response file, fetch/rebase and retry. Never force-push.
6. Verify the remote file contains your final report and record the resulting commit SHA in the response itself where practical. Do not say “uploaded” until the remote update is verified.

## Secrets and external dependencies

No new secret should be needed to perform this coordination task. If a current deployment/CI check requires owner-only credentials, report only the exact credential/variable name, why it is needed, where the owner should configure it, and the safe validation step. Never ask the owner to paste the value into ChatGPT or a response file.

## Completion criteria

The response must contain current PR/branch/head information, checks actually inspected, an honest release disposition, evidence gaps, ordered next actions, owner-only permissions/secrets if any, and the exact commit SHA that published the response. Clearly separate VERIFIED, REPORTED, BLOCKED, SKIPPED and UNPROVEN.

**Activation prompt:** “ACTIVATE AGENT 1 — Antigravity. Follow docs/release/agent-packets/agent-1-instruction.md from the coordination branch, refresh the live state, start and finish by overwriting agent-1-response.md on that branch, and push the response update. Do not merge or claim acceptance without evidence.”
