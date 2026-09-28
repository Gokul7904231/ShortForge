# Floor Governance Cell Wave 1 — 2026-09-28

**Classification:** new capability  
**Status:** implemented on working branch; repository CI pending.

## Decision

Introduce a bounded-autonomy Floor Governance Cell foundation without changing the locked F00–F07 production topology.

## Existing rules extended

This work extends:

- Floor Guardian as local authority;
- Ascalon as bounded cognition;
- typed worker capabilities;
- Guardian policy;
- bounded healing;
- evidence-based verification;
- leases/fencing;
- .okf decision protocol.

It does not replace:

- Overseer authority;
- F07 release authority;
- existing floor contracts;
- RenderFabric;
- TimelineIR;
- CAS;
- provider-neutral floor semantics.

## Why

The current Guardian already owns local supervision and policy, and the healer substrate already provides deduplication, resource locking and validation. The missing architectural layer was an explicit contract between cognition, action vocabulary, authority, boundary inspection, and paired healing.

Wave 1 therefore adds the smallest reusable control-plane substrate.

## Implemented components

- `FloorGovernanceContracts.ts`
- `FloorActionGraph.ts`
- `DefaultFloorActionGraph.ts`
- `FloorActionGate.ts`
- `FloorGovernanceCell.ts`
- `FloorBlackboard.ts`
- `AscalonGuardianAdapter.ts`
- `BorderDefenseAgent.ts`
- `JointHealingSession.ts`
- `ResolutionGate.ts`
- fencing-aware `RepairLockManager`
- corresponding contracts/tests

## Security invariants

The wave rejects:

- unknown model actions;
- stale state versions;
- missing capabilities;
- missing preconditions;
- missing authority grants;
- expired grants;
- stale fencing epochs;
- cross-floor proposals;
- untrusted evidence attempting mutation.

## Healing invariants

The wave does not globally lock incidents.

It uses per-resource mutation leases with monotonic fencing epochs so that two healers can reason together but cannot concurrently mutate the same protected resource.

## Known non-goals

This wave is not a claim that the entire production floor hierarchy is now runtime-integrated.

Still pending:

- durable persistence of governance state;
- full Guardian runtime adapter wiring;
- production BDA insertion;
- Advisor runtime subsystem;
- full resolution-gate wiring;
- graph-aware healer scheduler;
- identity/provenance integrations;
- adversarial evaluation suite.

## Validation

Local repository execution was not available in the coding environment because the repository could not be cloned through the environment's network path.

Repository CI is therefore the authoritative next verification step.

