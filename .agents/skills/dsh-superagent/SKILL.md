---
name: dsh-superagent
description: Proactive two-layer Router/Worker superagent architecture based on DeepSeek's dsh-superagent prototype. Minimizes human attention cost while autonomously handling GitHub issues, pull requests, code tickets, and background verification.
---

# DeepSeek Superagent (dsh-superagent) in Antigravity

This skill adapts the DeepSeek **`dsh-superagent-prototype`** framework into Antigravity.

## Core Philosophy
**Take as little human attention as possible, and give as much value as possible.**
- **Act only when authorized**: Evaluates requests against explicit rules and intent before creating tickets.
- **Stay quiet while working**: Progress is tracked internally; reports to humans only when a result is ready or an unresolvable blocker requires a decision.
- **Stop by impact, not by effort**: Autonomous changes push to a reviewable PR with passing checks. Unsettled design or product decisions stop with a single clear question.

## Architecture

```
[ GitHub / Chat Triggers ]
           │
           ▼
┌────────────────────────────────────────┐
│   dsh-superagent-orchestrator (Router) │
│   - Filters requests / evaluates intent│
│   - Manages ticket scopes & policies   │
│   - Delegates to isolated Workers      │
└──────────────────┬─────────────────────┘
                   │ invokes subagent (branch/inherit)
                   ▼
┌────────────────────────────────────────┐
│   dsh-superagent-worker (Worker)       │
│   - Investigates, plans & edits code   │
│   - Runs local verification & tests    │
│   - Prepares PR & reports back         │
└────────────────────────────────────────┘
```

## How to Use

### 1. Activating the Orchestrator
To triage multiple incoming requests or run a proactive background audit:
```typescript
invoke_subagent({
  TypeName: "dsh-superagent-orchestrator",
  Role: "Superagent Router",
  Prompt: "Assess incoming tasks/issues for repository. Evaluate intent, filter noise, and dispatch worker subagents for valid tickets."
});
```

### 2. Delegating to a Worker
When a ticket is scoped and ready for implementation:
```typescript
invoke_subagent({
  TypeName: "dsh-superagent-worker",
  Role: "Superagent Worker",
  Workspace: "branch", // Isolated ticket worktree
  Prompt: "Ticket: Implement fix for issue #X. Run relevant tests, ensure zero regression, and prepare commit/PR with honest verification evidence."
});
```

## Reference Documentation
- Original prototype checkout: `tools/dsh-superagent-prototype/`
- Domain Model: `tools/dsh-superagent-prototype/docs/001-domain.md`
- Philosophy: `tools/dsh-superagent-prototype/docs/000-philosophy.md`

