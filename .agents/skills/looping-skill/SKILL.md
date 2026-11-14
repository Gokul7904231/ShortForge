---
name: looping-skill
description: Use when coordinating coding agents across separate ChatGPT or IDE conversations with instruction/response files, evidence-based iterative review, human-approved credential setup, and repeatable Git handoffs.
---

# Looping Skill

## Purpose

Use this protocol when one owner coordinates coding agents that run in separate sessions. The owner activates each agent, each agent publishes its report to its assigned response file, and the owner returns to the coordinator (ChatGPT) for independent review and the next iteration's instructions.

**The core loop is: instruct → execute → overwrite response → push → coordinator verifies → coordinator updates instruction → owner reactivates.**

A Markdown file does not start an IDE, run a coding agent, watch a repository, or wake another ChatGPT conversation. The owner must manually trigger or reactivate the relevant agent and tell the coordinator when an agent says its response was uploaded.

## Canonical packet map

The directory `docs/release/agent-packets/` must contain exactly these six files—no extra reports, logs, screenshots, indexes, or temporary files:

1. `agent-1-instruction.md` — coordinator-owned instructions for Agent 1 (Antigravity / Release Captain).
2. `agent-1-response.md` — Agent 1-owned current report.
3. `agent-2-instruction.md` — coordinator-owned instructions for Agent 2 (Claude Code / distributed rendering).
4. `agent-2-response.md` — Agent 2-owned current report.
5. `agent-3-instruction.md` — coordinator-owned instructions for Agent 3 (OpenCode, activated through the owner's ChatGPT handoff).
6. `agent-3-response.md` — Agent 3-owned current report.

The skill itself lives at `.agents/skills/looping-skill/SKILL.md`, outside the six-file packet directory.

## File ownership rules

### Instruction files — coordinator-owned

- Each instruction file contains stable role boundaries and a section named **Current Iteration — Coordinator Handoff**.
- Only the coordinator/owner updates that current-iteration section after reviewing the latest response and verifying repository evidence.
- Coding agents must read their instruction file but must not edit, overwrite, or commit it. They must not invent the next iteration's task on their own.
- A new instruction must specify the iteration number, objective, permitted scope, concrete acceptance criteria, evidence to collect, stop conditions, and credential status.
- After the coordinator updates an instruction file, the owner manually reactivates the relevant agent and tells it to read the latest remote version before acting. Do not assume a separate agent chat has been triggered automatically.

### Response files — coding-agent-owned

- On activation, the agent immediately replaces its response file with a short `IN_PROGRESS` report and publishes that update.
- At task completion or a blocker, the agent replaces the **entire** response file with the final current report. Do not append indefinitely; keep the latest state and preserve links to historical commits/workflow runs where useful.
- The final report must include iteration number, timestamp, implementation branch and exact HEAD SHA, PR URL/number or explicitly state none, changed files, exact checks/commands/results, evidence links, residual blockers, credential/permission needs, recommended next decision, and the response commit SHA.
- The report must distinguish what was directly verified from what was merely reported, inferred, skipped, or blocked.
- The agent must say “response uploaded” only after its final response-file commit is pushed and the remote file is verified. A local edit or successful commit without a successful push does not count.
- A response-file commit should modify only that agent's response file. Implementation changes belong on the agent's isolated implementation branch/PR. Required Team reports belong at the repository's canonical `Team/reports/pr-<actual-number>.json` path, never inside the packet folder.

## Operating loop

### Phase A — Activate an agent

1. The owner pastes the agent's activation prompt into that agent's existing conversation.
2. The agent fetches the latest coordination branch, reads its instruction file and this skill, and inspects its own current worktree/branch before modifying anything.
3. The agent checks whether the instruction contains a current-iteration handoff. It follows that exact scope and preserves existing local work.
4. The agent publishes `IN_PROGRESS` to its own response file on the coordination branch using an isolated worktree.

### Phase B — Execute and report

1. Work only in the assigned implementation scope and feature branch. Inspect `git status`, worktrees, current HEAD, PRs and prior work first; preserve uncommitted changes.
2. Run focused tests, relevant CI and the canonical Team/OKF checks required for the change. Do not weaken gates to manufacture green results.
3. Collect reproducible evidence: exact commit SHA, commands, test totals, workflow URLs/run IDs, actual artifact measurements and failure messages.
4. If blocked, stop at the boundary. Publish `BLOCKED` with the observed error, what was verified, what was not attempted, and the exact owner action needed.
5. Replace the response file with the final report, push without force, and confirm the remote response file. Then notify the owner that the response was uploaded.

### Phase C — Owner notifies the coordinator

The owner returns to the coordinating ChatGPT conversation and identifies the agent and that its response is uploaded. They may provide the response URL, but the coordinator should retrieve the latest remote response and inspect the live GitHub PR, branch head, diff and relevant checks rather than trusting the report alone.

The coordinator must:
1. Read the latest response file and correlate its stated branch, commit and PR with live repository data.
2. Inspect changed files and current head; check whether workflow evidence belongs to that exact SHA or a previous candidate.
3. Re-run or request missing checks when evidence is stale, incomplete or ambiguous.
4. Classify each acceptance claim as **VERIFIED, REPORTED, INFERRED, UNPROVEN, SKIPPED, BLOCKED, FAIL or PASS**. A status badge, unit test, green governance workflow, HTTP 200, simulated artifact or earlier SHA is not a substitute for required live acceptance evidence.
5. Decide the next smallest safe step. Report conflicts/dependencies between agents and avoid assigning overlapping file ownership.
6. Update only the relevant agent's **Current Iteration — Coordinator Handoff** section with the next numbered iteration—or clearly mark that agent DONE/BLOCKED pending owner action. Do not put next-step instructions into the response file.
7. Give the owner a ready-to-paste reactivation prompt. The owner then manually sends it to the appropriate agent.

### Phase D — Repeat until the release gate is actually met

Repeat phases A–C as needed. Each iteration should reduce a named blocker or produce a specific piece of required evidence. Prefer the smallest bounded change that can be tested. Preserve last-known-good baselines; do not broaden scope just because another issue is visible.

Declare an implementation task complete when its agreed acceptance criteria are met. Declare production acceptance only when every required release criterion is independently verified on the exact candidate/deployed SHA. Otherwise maintain `BLOCKED` or `UNPROVEN`, and keep production dispatch disabled.

## Optional EGM integration — design quality, not a mandatory runtime dependency

EGM is the Google-authored open-source Elephant-Goldfish Model plugin at https://github.com/google/elephant-goldfish-model. It structures deep-context design/specification work and isolated fresh-context reviews. Use it selectively for changes with meaningful design choices, unclear requirements, cross-boundary architecture, or high risk. For a narrow and well-understood bug fix, do not force brainstorming/specification ceremonies.

EGM supplements rather than replaces this Looping Skill. It does not automatically publish agent response files, activate a separate chat, perform the coordinator's independent verification, satisfy required tests, or prove production acceptance. A successful Goldfish review is review evidence, not proof a feature works.

Before using EGM, each agent must verify it is installed and its relevant skills/commands load in the actual runtime. For review commands requiring fresh-context subagents, verify the host exposes a real fresh-context dispatch mechanism. Never simulate a zero-context reviewer in the parent context. Record EGM state as one of: REPOSITORY_LINK_ONLY, INSTALLED, SKILLS_DISCOVERED, WORKFLOW_SMOKE_VERIFIED, or BLOCKED, with exact evidence.

Harness-specific cautions:
- Antigravity: upstream documents `agy plugin install https://github.com/google/elephant-goldfish-model`; verify installed plugin/command discovery in a fresh session.
- Claude Code: upstream documents `claude plugin marketplace add google/elephant-goldfish-model` then `claude plugin install egm@egm`; start a fresh session and verify commands work.
- OpenCode: upstream support remains experimental in upstream PR #165, with a follow-up for OpenCode V2 subagent dispatch in PR #189. Do not assume it works because the repository URL was added. Verify plugin/skills discovery and actual `subagent` (V2) or supported `task` (V1) dispatch for that runtime, including successful persona reads and child completion. If any requirement fails, report EGM BLOCKED and proceed with the existing governed workflow for bounded tasks.
- Other ChatGPT conversations are separate sessions. An EGM plugin install or skill mention in one conversation is not evidence that it is installed in another. The owner still manually activates each chat.

For any EGM result, preserve the draft/review artifact links and the actual child-run/verification output. The coordinator independently checks those artifacts and decides whether the findings affect the next Looping Skill iteration.

## Credential and permission gate — human-in-the-loop

Credentials are an explicit pause point, not an excuse to guess.

When an agent needs access or a secret, its response may include only:
- exact environment-variable/secret/permission name (verified against the current code or workflow);
- what operation requires it and why;
- whether it is missing, rejected, expired, under-scoped or not yet checked;
- the official acquisition/documentation URL;
- where the owner should configure it (for example the repository's Actions secrets or the correct Render service's Environment settings);
- minimum required permissions/scope, based on inspected code;
- a safe validation method that never prints the value.

The response must never contain secret values, bearer tokens, cookies, private keys or copied environment-file contents. The agent must not ask the owner to paste credentials into ChatGPT or GitHub issues. It must not create/rotate/revoke credentials, change scopes, enable paid compute, dispatch production work or publish externally without explicit owner authorization.

When the owner reports a credential blocker, the coordinator verifies the requested name, need, official acquisition route and minimum scope against current repository code and authoritative provider documentation. The coordinator then updates the agent's current-iteration instruction with the verified setup checklist and waits for the owner's confirmation that configuration was completed directly in the provider's secret store. The agent may then validate presence/function by name and safe API behavior without echoing values. If credentials remain unavailable, keep the work `BLOCKED`; do not invent a workaround or claim a live pass.

## Concurrency and Git rules

- Agent implementation branches, the coordination branch, and the default branch are separate workspaces. Never switch a dirty implementation worktree to publish a response.
- Publish response updates from a clean, isolated worktree on the coordination branch. Inspect the diff; commit only that agent's response file; push without force.
- Because three agents share one coordination branch, push conflicts are expected. On rejection, fetch and rebase/merge the latest coordination branch, confirm the only intended response-file change remains, then retry. Never overwrite or delete another agent's response.
- Before opening a PR, search current branches and PRs. Never guess PR numbers or claim a local branch is on origin without verifying it.
- Never push directly to main or merge on the coordinator's behalf unless the owner explicitly asks for that action and all required gates/reviews pass.
- Follow ShortForge's `.okf`, Team Change Gate, security, Spec Kit, Anti-Slop, CAS, F07, lease/fencing and release-authority policies. This skill does not override them.

## Required response-file report shape

Every final agent report should answer: **What changed? Which exact SHA? What tests ran? What evidence proves it? What remains unproven? What needs owner action? What should the coordinator instruct next? Did the response reach the remote branch?**

The recommended next action is a recommendation for the coordinator; it is not permission for the agent to expand scope. Only the updated instruction file plus the owner's reactivation prompt authorizes the next iteration.
