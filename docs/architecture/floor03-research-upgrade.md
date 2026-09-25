# Floor 03 Research Upgrade — Evidence & Adoption Ledger

## Status
Implementation branch: `feat/f03-research-upgrade`
Base: `main` at the current repository head before this upgrade.

This ledger records external patterns that were evaluated and the ShortForge-compatible changes selected. External repositories are pattern evidence, never authority.

## Evaluated sources

| Source | Useful pattern considered | ShortForge treatment |
|---|---|---|
| Paperclip | Control-plane vs execution-plane separation, adapter boundary, durable task state, atomic checkout/budget ideas | Adopted conceptually for F03 runtime adapter/handoff discipline; F03 does not become an execution orchestrator |
| Hindsight | Retain/recall/reflect, persistent memory, experience vs fact separation | Adopted as a future memory-quality pattern; F03 keeps deterministic provenance and does not promote memory into authority |
| StarNet | Capability-scoped rooms/lanes, explicit handoff boundaries, each run with bounded workspace/permissions | Adopted as a capability-boundary design pattern for visual planning; no new production authority |
| NVIDIA Model Optimizer | Optimize expensive model inference through quantization, distillation, pruning, speculative decoding and deployment-aware benchmarks | Adopted for Ascalon/Fast Decision Core evaluation, not for F03 semantic contracts |
| OpenBao | Identity-based authorization, leases, renewal/revocation, audit logging, encrypted durable state | Adopted as a design pattern for future provider leases/secrets; no secret-management implementation is added to F03 by this change |
| ORCA | Candidate architecture examined for media-generation workflow ideas | No architecture promotion without repository evidence sufficient to map a non-conflicting capability |
| quiche | Low-level transport boundary, application-owned I/O/event loop, explicit connection state | Adopted as a transport-design analogy: F03 contracts own semantic state; transport remains outside the floor |
| OpenSpec | Spec-as-truth, changes as explicit units, schema/artifact dependency DAGs, parallelizable artifacts | Directly adopted: provider-neutral AssetPlanIR is a typed specification artifact and downstream dependencies remain explicit |
| AI Agent Book | Persistent memory should retain useful facts rather than raw conversation; context should be compiled deliberately | Adopted for Ascalon context/memory training discipline; not used as production authority |

## Architecture non-conflict rule

The locked ShortForge rules remain:
- Overseer is the sovereign production authority.
- Workers are capability-fenced executors.
- F03 remains specification/planning, not physical media generation.
- F03 and F04 remain parallel branches in the canonical production topology.
- TimelineIR remains the downstream semantic composition authority.
- F07 remains the physical verification authority.
- External repositories can inform experiments and implementation proposals but cannot override executable source, canonical contracts, tests, or .okf.

## Selected F03 improvements

1. Canonical floor identity is `floor03_asset_realization`.
2. F03 version advances to `2.0.0` for the new contract generation.
3. A provider-neutral `AssetPlanIR` was added. It captures shot type, camera metadata, safe text region, continuity keys, scene dependencies, and impact radius without selecting a provider or writing media.
4. Visual requirements can carry the typed plan as an optional field, preserving backward-readable structure while making the richer plan available to downstream systems.
5. F03 configuration now points to the actual checked-in service storage path instead of the stale root `floors/` path.
6. The visual adapter no longer claims a simulated model execution path. Current implementation is explicitly deterministic unless a real provider adapter is later wired.
7. Stable SHA-256 request fingerprints were added for replay/caching evidence.
8. Scene regeneration is being hardened to create a new asset identity for the regenerated scene, matching the documented identity contract.
9. Per-worker execution timing is being moved toward measured timings rather than synthetic percentages.

## Explicitly not adopted

- F03 does not gain provider credentials.
- F03 does not generate physical images/video/audio.
- F03 does not become a second orchestration plane.
- F03 does not let memory or external research grant capabilities.
- F03 does not replace TimelineIR, RenderFabric, Guardian, AgentRuntime, or F07.
- No external source code is copied.

## Remaining validation gate

Before merging, the branch must pass source-level checks and repository CI that are available. Because the local environment may not have network access, GitHub Actions is the authoritative final execution environment for the branch.
