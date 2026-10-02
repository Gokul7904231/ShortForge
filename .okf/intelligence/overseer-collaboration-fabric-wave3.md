# Overseer Collaboration & Work Fabric — Wave 3

**Status:** LANDED ON MAINLINE
**Product layer:** Agent Workforce & Access Fabric

## Why Wave 3 exists

Wave 1 established the Mission Room as a shared human/agent collaboration surface.
Wave 2 made work durable with task lifecycle, dependencies, review, leases, heartbeats, retries, and reclamation.
Wave 3 removes the remaining collaboration bottleneck: an agent is now a workspace-scoped product identity that can be co-managed without turning configuration into execution authority.

The supplied collaboration research specifically demonstrates the need for multiple people to manage an agent, shared workspace agents, agent-level control, response modes, and model/integration choices. It also distinguishes personal assistants from specialized team agents.

## Agent Workforce model

Every workspace-managed agent has:
- durable identity and role;
- creator ownership plus explicit OWNER / EDITOR / USER membership;
- lifecycle state ACTIVE / PAUSED / ARCHIVED;
- capabilities and allowed tools as explicit configuration references;
- preferred model provider/model references;
- response mode JOINS_CONVERSATION or MENTION_ONLY;
- shared description and specialization;
- integration bindings that contain connection references only, never raw credentials;
- optimistic versioning for concurrent edits.

## Permission model

- Workspace OWNER/ADMIN: full fleet administration.
- Agent OWNER: full agent governance.
- Agent EDITOR: configuration and membership maintenance.
- Agent USER: may use the agent but cannot edit configuration.
- Capability/tool grants require workspace OWNER/ADMIN.
- Live integration bindings require workspace OWNER/ADMIN or the agent OWNER.
- Original creator ownership cannot be removed.
- Ownership transfer is limited to the original creator.

## Security boundary

Agent configuration never directly grants physical execution.

```
Agent Workforce
   ↓
Agent profile / capability references / model preference
   ↓
Overseer + FGC + AEF policy checks
   ↓
Scoped execution
   ↓
F00 … F07
   ↓
F07 truth
```

Raw API keys, passwords, bearer tokens, and credential-shaped integration references are rejected by the workforce store.
Member views redact agent system prompts and integration connection references.

## Persistence

Workspace agent profiles persist through:
- MongoDB `agent_workforce` collection;
- existing disk runtime under the controller storage path;
- in-memory storage for isolated test/development runs.

Mongo indexes cover `(workspaceId, agentId)` uniqueness and workspace recency.

## Product surfaces

- `/api/overseer/agents/workforce` lists visible workspace agents and exposes creation permissions.
- `/api/overseer/agents/workforce/:agentId` reads and mutates agent settings, membership, and integration references.
- Existing `/api/overseer/agents` now includes active workspace-managed agents so Mission Rooms can invite them.
- Overseer Dashboard now contains an Agent Workforce surface beneath the existing Mission Room.

The emotional Overseer face/presence remains untouched as the primary identity surface.

## Wave 3 acceptance checklist

- [x] Workspace-scoped persistent agent identity
- [x] Multiple humans can co-manage an agent
- [x] OWNER / EDITOR / USER agent-level roles
- [x] Workspace OWNER/ADMIN fleet administration
- [x] Agent ACTIVE / PAUSED / ARCHIVED lifecycle
- [x] Shared agent configuration and preferred model reference
- [x] Response-mode configuration
- [x] Explicit capability/tool references
- [x] Capability/tool escalation blocked for normal editors
- [x] Integration references without raw credentials
- [x] Secret-shaped integration references rejected
- [x] Member redaction of sensitive configuration
- [x] Optimistic concurrency version checks
- [x] Durable workforce lifecycle events
- [x] Mission Room access to active workspace agents
- [x] Dashboard Agent Workforce surface
- [x] Dedicated Wave 3 tests
## Final validation evidence

- Wave 3 focused validation run **36974638093** passed.
- npm ci passed.
- npm run typecheck passed.
- Mission collaboration, durable work, and agent workforce suites passed: **3 test files / 23 tests**.
- Focused Semgrep scan passed: **2 rules / 13 files / 0 findings**.
- Team Change Gate **36974638061** passed on the validated code head.
- Selected MCP Fabric retains a known baseline documentation-grep failure for TRANSFORM_VISUAL_ASSET; the same absence exists on main and is not introduced by Wave 3.
- Strix remains **UNPROVEN** because Docker-backed dynamic testing is unavailable.