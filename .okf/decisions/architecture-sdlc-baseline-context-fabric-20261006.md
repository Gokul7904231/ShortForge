# Decision: Architecture / SDLC Baseline + Authority Registry + Context Fabric

**Date:** 2026-10-06  
**Status:** LOCKED BASELINE

## Decision

ShortForge will converge fragmented architectural ownership before adding CLM model training.

The canonical authority map is machine-readable at .okf/architecture/authority-registry.json.

The canonical active working-context boundary is ContextFabric. Existing context systems remain internal implementations or adapters until migration evidence permits retirement.

## Canonical authority map

- .okf -> governance truth
- FloorRegistry -> production topology
- MongoDB -> distributed operational truth
- Memory Fabric -> learned cognitive memory
- RLM ContextIndexer/PersistentContextStore -> externalized context substrate
- ContextFabric -> active working context
- ContentAddressedStore -> artifact identity
- F07 / VerificationReceipt -> physical verification truth
- AER -> epistemic advisory state
- JEV / Decision Engine -> typed decisions
- Ascalon -> bounded deep reasoning
- Guardian + workers -> execution authority
- Treasury -> economic admission
- Obsidian -> human knowledge projection
- Firestore -> user-facing projection/compatibility

## Non-decisions

This decision does not:
- train or promote a CLM model;
- add a database engine;
- make Obsidian operational authority;
- make AER/Ascalon execution authority;
- make ContextFabric a security or economic authority.

## Compatibility strategy

Legacy paths are not deleted in place. They are first classified as CANONICAL, ADAPTER, PROJECTION, or DEPRECATED, then migrated under test and evidence.

## Exit criteria

This baseline is considered implemented when:
1. the authority registry validates in CI;
2. ContextFabric contracts and facade test cleanly;
3. ContextFabric does not directly import Guardian, Treasury, F07 verification, or CAS authority code;
4. existing context components remain usable through explicit composition;
5. no new database is introduced for working context.

## Next wave

Persist versioned context workspace/edit ledgers in Mongo, then migrate direct ContextOS consumers. Only after those gates should CLM shadow inference begin.
