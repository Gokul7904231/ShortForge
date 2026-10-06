# Context Fabric Architecture

**Status:** ACTIVE BASELINE  
**Effective:** 2026-10-06  
**Authority:** Context Fabric owns only the active working-context boundary.

## Purpose

ShortForge already contains multiple context capabilities: ActiveContextManager, ContextCompiler, ContextOS, RLM indexing/externalization, Memory Fabric recall, and cognitive orchestration. This wave does not delete them and does not create another context database.

It creates one logical boundary:

sources -> retrieval -> ContextCompiler -> ContextFabric -> bounded cognition -> typed decision

## Ownership boundary

Context Fabric owns:
- the active working set for the current mission/task;
- deterministic retain/reorder/optimize operations over that working set;
- working-context version/hash metadata;
- bounded context compilation through the existing ContextCompiler;
- provenance references needed to rehydrate the working set.

Context Fabric does not own:
- .okf policy;
- mission/job identity;
- worker capability grants;
- leases/fencing;
- Treasury admission or settlement;
- CAS artifact identity;
- F07 verification;
- Memory Fabric promotion;
- AER epistemic authority;
- JEV decision authority;
- Ascalon model promotion.

## Convergence map

| Existing component | Role after convergence |
| --- | --- |
| ContextIndexer + PersistentContextStore | external-context substrate; large/raw evidence remains dereferenceable |
| ContextCompiler | seed-context compiler; provenance-aware evidence packing |
| ActiveContextManager | active working-set implementation |
| ContextOS | legacy packaging adapter; migration target is ContextFabric |
| CognitivePlaneEngine | orchestration wiring owner; binds the RLM substrate behind ContextFabric and retains only compatibility access |
| Memory Fabric | learned-memory retrieval/projection source |
| AER | epistemic interpretation of bounded context/evidence |
| CLM | future context policy/model that proposes edits through ContextFabric |

## Persistence boundary

MongoDB is the durable operational persistence layer for Context Fabric workspaces.

- context_workspaces stores the current durable workspace head.
- context_edit_ledger stores immutable edit audit entries keyed by editId.
- Workspace updates use optimistic version compare-and-swap.
- Stale writers fail closed with a typed concurrency error.
- The repository is persistence infrastructure, not a second context authority.

Large raw context remains externalized through RLM/PersistentContextStore instead of being copied into Mongo workspace documents.

## Commit and recovery boundary

Wave C adds a guarded atomic commit and recovery path.

- ContextFabric.commitEdits is the durable mutation path.
- MongoContextFabricRepository uses Mongo transactions when a transaction-capable MongoClient is supplied.
- Missing transaction capability fails closed; there is no silent save-then-append downgrade.
- Recovery verifies the deterministic workspace hash before restoring the active context.
- Failed durable commits restore the prior in-memory active set and workspace version.
- Stale durable writers are rejected before their proposed version can become durable.

## Wave D boundary

Wave D makes the single-facade invariant machine-checkable.

- `CognitivePlaneEngine.activeContextManager` is retained only as a deprecated compatibility alias typed through `ContextFabric`; the cognitive plane does not import or construct the legacy manager.
- `ContextOS` currently has no production runtime consumer in the FactoryOS core search surface and remains a legacy/reference primitive.
- `factoryos:verify:context-fabric-boundary` fails on direct production references to `ActiveContextManager` or `ContextOS` outside their canonical primitive files.
- Tests may exercise legacy primitives directly while compatibility coverage remains required.

## Wave E cognitive orchestration boundary

Wave E routes production cognitive context operations through ContextFabric.

- CognitiveRuntime must use ContextFabric for runtime context indexing and recursive investigation.
- ContextOrchestrator remains the RLM implementation substrate and is wired into ContextFabric by CognitivePlaneEngine.
- The production boundary verifier rejects direct `contextOrchestrator.*` use outside the canonical wiring/substrate files.
- No new authority is introduced; ContextFabric still owns only active working-context semantics.

## Invariants

1. There is exactly one active working-context facade: ContextFabric.
2. RLM may externalize and retrieve raw context but may not become working-context authority.
3. Memory Fabric may supply recalled knowledge but may not silently mutate the active context.
4. Context edits are typed and bounded.
5. Context state is never an authority shortcut.
6. Any later durable context store must remain subordinate to the operational/authority registry.
7. A model may propose ContextEdit; deterministic validation and ContextFabric own the mutation.
8. No CLM training or production model promotion is part of this baseline.

## Versioned migration

Wave A (this PR): facade + contracts + registry + tests.

Wave B: persist context workspace/version/edit ledger in Mongo; large payloads remain in the external context store/CAS as appropriate.

Wave C: guarded durable commit/recovery + rollback + integrity verification.

Wave D: enforce the production boundary, migrate any direct consumers, and retire duplicate active-context ownership.

Wave E: migrate cognitive orchestration and worker cognition behind ContextFabric.

Wave F: introduce CLM shadow proposals.

Wave G: evaluate CLM with ContextBench before any production promotion.

## SDLC gate for this boundary

Every future Context Fabric change must complete:

REQUEST -> INSPECT -> MAP -> PLAN -> IMPLEMENT -> UNIT/CONTRACT -> INTEGRATION -> LIVE/PHYSICAL PROOF (when applicable) -> SECURITY -> PERFORMANCE/ECONOMICS -> REVIEW -> VERIFY -> .OKF RECORD

Definition of Ready:
- authority domain identified;
- source-of-truth decision documented;
- contract and non-goals explicit;
- security/data impacts identified;
- migration and rollback described;
- acceptance tests named.

Definition of Done:
- implementation merged with tests;
- negative/abuse paths covered;
- observability/provenance present;
- runtime proof captured where the change touches production behavior;
- .okf and derived knowledge reconciled;
- obsolete path explicitly marked or retired.

## Context budget baseline

The facade may accept caller-specific policy, but a future centralized ContextBudgetPolicy must govern:
- max input tokens;
- max working tokens;
- max output tokens;
- max context growth;
- max edit count/churn;
- max latency;
- max cost.

This baseline deliberately leaves numeric policy in existing compiler budgets until the budget-convergence wave.
