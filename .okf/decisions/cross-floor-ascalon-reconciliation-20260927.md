# Cross-Floor Ascalon Reconciliation — 2026-09-27

**Classification:** extends existing rule + consistency repair  
**Status:** ACTIVE RECONCILIATION WAVE  
**Authority:** existing .okf law, executable runtime contracts, Guardian policy, and verified CI

## Objective

Remove semantic drift that could contaminate Ascalon training while preserving the locked production topology:

F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07

No new floor, scheduler, runtime authority, or cognitive authority is introduced.

## Conflict record

**ruleRefs**
- .okf/decisions.md — locked F03/F04 parallel topology
- .okf/hierarchy-map.md — control hierarchy separated from floor topology
- training/ascalon/ontology/floors.json — canonical training ontology
- apps/web/factoryos/core/hierarchy/FloorRegistry.ts — executable floor registry

**originalConflict**
- F04 runtime already executed visual, narration and background-audio media synthesis.
- The machine-readable Ascalon ontology and runtime registry still described F04 as voice-only.
- F07's dedicated admission workflow expected an outdated report state while the committed report used CI_ADMISSION_PASS.
- Historical readiness documents could be mistaken for current certification.

**changeClaim**
Reconcile current ontology/contracts/docs to the executable F04 media-synthesis boundary and current F07 admission evidence without changing the production topology.

**evidence**
- services/pipeline/floor04_media_synthesis/app/domain/handoff.py
- services/pipeline/floor04_media_synthesis/app/services/pipeline.py
- services/pipeline/floor04_media_synthesis/README.md
- training/ascalon/ontology/floors.json
- training/ascalon/ontology/hierarchy.json
- training/ascalon/ontology/capabilities.json
- training/ascalon/ontology/agents.json
- Team/reports/pr-38.json
- .github/workflows/floor07-pretraining-validation.yml

**proposedResolution**
1. Canonicalize F04 as Media Synthesis & Provider Execution with category MEDIA.
2. Register MEDIA_SYNTHESIZER as the F04 domain worker.
3. Bind F04 visual, voice and temporal capabilities to that worker and Guardian-gate physical execution capabilities.
4. Keep F03 as provider-neutral asset planning; F04 as physical media realization.
5. Mark old Ascalon readiness certification artifacts historical/superseded.
6. Make the F07 admission workflow validate the committed PASS state.
7. Add executable cross-floor ontology consistency tests.

**tradeOffs**
- Historical documents remain available for audit and are explicitly labeled historical rather than rewritten as if the contradiction never existed.
- F03/F04 topology remains parallel even though F04 consumes the verified F03 handoff at its runtime input boundary.
- Provider-specific model promotion remains a separate qualification process.

**requiredAuthority**
- Overseer for orchestration
- Guardian for capability authorization
- F07 for final release truth
- Human Authority for any policy/topology change

**canonicalUpdates**
- FloorRegistry.ts
- HierarchyConsistencyValidator.ts
- Ascalon floor/hierarchy/capability/agent ontologies
- Ascalon trajectory capability allowlist
- F07 admission workflow
- current training-readiness charter
- branch-hygiene record
- supporting active docs and tests

## Ascalon rule

Ascalon may learn from this reconciliation only as a verified architecture update. It must not learn that a historical contradiction is equivalent to current runtime truth.

## Training gate

No new production trajectory dataset is admitted until the reconciliation branch is merged and fresh mainline:
- ontology consistency,
- F03/F04/F05/F06/F07 validation,
- Team Change Gate,
- typecheck,
- and repository-required gates

all pass.
