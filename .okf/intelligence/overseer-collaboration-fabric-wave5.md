# Overseer Collaboration & Work Fabric — Wave 5

**Status:** LANDED ON MAINLINE
**Product layer:** Fleet Orchestration & Mission Automation

## Purpose
Wave 5 composes Waves 1–4 into reusable operational recipes and a fleet-wide activity view.

Recipes define reusable mission intent. Launching a published recipe materializes canonical MissionTasks through MissionWorkManager. Fleet Activity is a durable projection of the existing Event Bus.

## Product model

Workspace
  → Agent Workforce
  → Mission Automation Recipes
  → Recipe Launch
  → Mission + MissionTasks
  → Agent Intercom / Work
  → FGC / AEF
  → F00 … F07
  → F07 truth

## Recipe contract
- versioned workspace-scoped recipe identity;
- DRAFT / PUBLISHED / ARCHIVED lifecycle;
- deterministic steps with explicit owner agent and capability;
- dependency edges validated for unknown references, self-dependencies, and cycles;
- bounded timeout/retry values;
- mission defaults for objective, constraints, priority, failure policy, and budget;
- optimistic concurrency on recipe updates.

## Launch contract
- explicit operator launch;
- published recipes only;
- optional launch idempotency key;
- CREATE_ONLY or START_MISSION mode;
- workforce agents must be ACTIVE;
- requested workforce capabilities must already exist on the target agent;
- materialized task IDs are deterministic from launch + step identity;
- dependency edges are translated from recipe steps to MissionTask dependencies.

START_MISSION changes canonical mission lifecycle state through MissionManager. It does not directly invoke MCP/provider/renderer tools.

## Fleet Activity
Fleet Activity is a derived, durable operational projection over the existing DurableEventBus.

Activity entries retain only bounded safe metadata such as attempt, state/status, phase, capability, DAG/recipe/launch/step identities, delivery state, and delegation identity.

Activity can be filtered by mission, agent, or topic and replayed using cursor pagination.

## Authority boundary
> Intelligence may propose. Authority may authorize. Runtime may execute. Evidence must prove.

Wave 5 cannot:
- mint agent capabilities;
- bypass FGC/Guardian;
- execute an MCP/provider directly;
- acquire worker leases directly;
- certify verification or F07;
- turn recipe launch into production truth.

Canonical execution remains:
MissionTask → Mission Work → AEF/FGC → worker/provider → F07.

## UX
The existing Overseer Dashboard remains the primary command surface.
The existing emotional/living Overseer face is untouched.
Below Mission Room and Agent Workforce, Fleet Orchestration exposes Recipes and Fleet Activity.

## Persistence
Mongo collections:
- mission_automation_recipes
- mission_automation_launches
- fleet_activity

Disk persistence uses the existing FactoryOS storage path under orchestration/. In-memory mode remains available for focused tests.

## Acceptance
- [x] Versioned automation recipes
- [x] Recipe DAG validation
- [x] Publish lifecycle
- [x] Explicit recipe launch
- [x] Launch idempotency
- [x] Canonical MissionTask materialization
- [x] Workforce agent availability/capability checks
- [x] Fleet activity durable projection
- [x] Mission/agent/topic activity filters
- [x] Cursor replay
- [x] Authenticated APIs
- [x] Overseer Dashboard surface
- [x] Focused typecheck/tests/Semgrep gate

## Deliberate non-goals
- no second task executor;
- no second broker;
- no scheduler/autonomous cron engine;
- no direct MCP/provider authority;
- no changes to FGC/AEF/F07;
- no redesign of the emotional Overseer face.