# Agent 3 — Instruction (OpenCode / ChatGPT handoff)

**Runtime:** OpenCode; activation is initiated by the owner from the Agent 3 ChatGPT conversation  
**Role:** UI/product acceptance, truthful user-facing states, accessibility and focused QA  
**Response file:** docs/release/agent-packets/agent-3-response.md  
**Coordination branch:** docs/three-agent-production-speedrun-20261029
**Required skill:** [Looping Skill](https://github.com/Gokul7904231/ShortForge/blob/docs/three-agent-production-speedrun-20261029/.agents/skills/looping-skill/SKILL.md) — read and follow it for every iteration.

## Activation and trigger

This Markdown file does not launch OpenCode or trigger a ChatGPT conversation by itself. The owner must paste the Agent 3 activation prompt into the Agent 3 conversation or run it in the OpenCode session. Start promptly after activation.

First read this instruction from the coordination branch. Immediately overwrite Agent 3's response file with status IN_PROGRESS and push that update to the coordination branch using an isolated worktree. At completion, overwrite the entire response file with the final evidence-backed report and push again. Do not append unbounded logs.

## Mission and existing work

Agent 3 owns the product-facing UI/client experience and independent acceptance QA. A previous report states that branch feat/product-acceptance-20261029 contains commit 9f64f664 and that its changes were not yet pushed or opened as a PR. Verify local Git and remote state before acting; these are reported details, not proof of current state.

1. Inspect git status, current branch, worktrees, HEAD and diff before touching anything. Preserve all valuable/uncommitted changes; do not recreate the change from a summary if the original worktree is available.
2. Read .okf/decision-protocol.md, .okf/index.md, .okf/principles.md, .okf/decisions.md and relevant Team gate/agent instructions. Verify Spec Kit and Anti-Slop actually load in the OpenCode session before further source edits; record evidence. EGM reports experimental OpenCode support in open upstream PR #165 and follow-up V2 dispatch work in PR #189; therefore do not assume the whole workflow is supported by simply adding the repository. Verify installation, commands/skills discovery, reviewer dispatch and fresh-context isolation in this actual OpenCode runtime. For substantial new UI/product design, EGM draft/review is useful only if those checks pass; otherwise record the limitation and use current governed QA. Do not fabricate Goldfish reviewer evidence.
3. Review the reported truth fixes: do not invent file sizes, FPS, resolution, progress, health, upload status, Drive delivery or success claims. LOCAL_OUTBOX is not Google Drive delivery. HTTP 200 is not application readiness.
4. Run targeted UI/product acceptance tests for the changed surfaces. Include empty/error/loading/success states, incorrect or missing artifact metadata, unavailable Drive, refresh/recovery, accessibility and mobile layouts where relevant. Record exact commands and outcomes. Separate mocked tests from true external-system verification.
5. Correct verified launch-critical UI defects only. Do not make worker, dispatch, callback, CAS, F07 policy or Agent 1 release-governance changes.
6. Verify current remote state for feat/product-acceptance-20261029. If the local work is valid, commit remaining intended changes and push that same branch—never main. Open a PR only if one does not already exist; let GitHub assign the number. Include its required Team report and test evidence. If you cannot access the local worktree or push permission, report that exact blocker; do not pretend it was pushed.
7. Do not deploy, enable production queues, trigger paid compute, publish to YouTube/social platforms, or use production user data.

## Secrets

Static UI/typecheck/unit work should not require production credentials. If a live Drive or deployment check is needed, verify the existing code's credential model and report the exact missing environment variable/permission, purpose, verified source, configuration destination and minimum scope. The owner configures it directly through the appropriate provider console or GitHub/Render secret settings. Never ask for secret values in chat; never include them in screenshots, logs or the response file. Do not invent credentials or claim a live test passed when it was skipped.

## Ownership and six-file rule

- Work only on UI/client/product acceptance surfaces and your assigned feature branch.
- Do not push directly to main, merge PRs, or edit Agent 1/Agent 2 implementation files.
- The only files permitted inside docs/release/agent-packets are the six canonical files: agent-1-instruction.md, agent-1-response.md, agent-2-instruction.md, agent-2-response.md, agent-3-instruction.md, agent-3-response.md. Do not create extra notes, logs, screenshots or status files in that directory.
- The response file is published separately from the implementation branch. Use a clean isolated worktree for docs/three-agent-production-speedrun-20261029, change only agent-3-response.md, commit/push without force-push, and verify it exists remotely. If another agent's different response file changed the branch, fetch/rebase and retry.

## Completion criteria

The final response must state the actual implementation PR/URL and head SHA, files changed, exact tests with PASS/FAIL/SKIPPED/BLOCKED results, UI acceptance findings, residual risks, any owner-only credential/permission steps, and the response commit SHA. Do not describe the product as fully accepted if physical rendering/Drive durability remains unproven.

**Activation prompt:** “ACTIVATE AGENT 3 — OpenCode via the ChatGPT handoff. Follow docs/release/agent-packets/agent-3-instruction.md from the coordination branch. Verify and finish the existing product-acceptance work, push the same implementation branch and open/update its PR if needed, then overwrite agent-3-response.md on the coordination branch and push that response update. Do not recreate inaccessible work, expose secrets, or overstate acceptance.”


## Current Iteration — Coordinator Handoff

**Iteration:** 1  
**Status:** READY FOR OWNER ACTIVATION  
**Objective:** Inspect the actual local worktree and remote state for `feat/product-acceptance-20261029`, preserve the existing commit/work, validate truth-fix UI changes and run focused tests. Push the same implementation branch and open/update its PR only after checking current PR state.  
**Deliverable:** Overwrite `agent-3-response.md` with verified local/remote branch and HEAD state, exact PR link if any, changed files, test commands/results, product-acceptance findings, blocked/skipped live checks, and owner-only credential needs. Push and verify the remote response file.  
**Acceptance:** Existing work is preserved; no unsupported file-size/FPS/resolution/health/delivery claims remain in changed UI; test results distinguish mocks from real external verification; response file is remotely updated.  
**Credential stop gate:** Do not require production credentials for static QA unless a live check genuinely needs them. If so, report exact names, purpose, official source, configuration destination, minimum scope and safe validation, without values; wait for owner/coordinator verification before proceeding.  
**Safety stop conditions:** No worker/pipeline/CAS/F07 policy edits, no main push, no merge/deployment, no production jobs, paid compute or external publication.  
**Coordinator ownership:** The coordinator will replace this section for each subsequent iteration after reviewing your response. Do not edit this instruction file.
