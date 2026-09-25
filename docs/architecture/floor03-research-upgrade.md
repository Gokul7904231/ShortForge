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

## Second-wave deep research — 2026-09-25

The research was intentionally expanded beyond the original nine repositories.

Additional references reviewed:
- StoryForgeAI (jamesbas/storyforgeai)
- VideoClaw (HITsz-TMG/VideoClaw)
- NolanX (nolanx-ai/nolanx.ai)
- Seedance 2.0 sequence skill (Emily2040/seedance-2.0)
- script-to-shootable-storyboard (zyz254009-crypto/script-to-shootable-storyboard)
- xyz-video-skill (huangserva/xyz-video-skill)
- Pydantic AI (pydantic/pydantic-ai)
- CharacterConsistency (madebysaira/CharacterConsistency)
- PopcornReady (kmgrassi/PopcornReady)
- ShotDirector (UknowSth/ShotDirector)
- MultiShotMaster (KlingAIResearch/MultiShotMaster)
- VstoryGen (AI-Application-and-Integration-Lab/VstoryGen)
- Code2Video (showlab/Code2Video)

### Patterns promoted into F03

1. **Plan globally, compile locally.** Seedance sequence-state patterns separate a global scene/continuity plan from the single-shot execution prompt. F03 now carries continuity mode, start/end state hints, and motion beats without owning execution.
2. **Structured reference strategy.** xyz-video-skill, PopcornReady, and the structured storyboard schemas distinguish character, composition, style, stage, first-frame, last-frame, and target-state references. F03 now emits typed provider-neutral reference bindings and input-mode requirements.
3. **Atomic shot semantics.** script-to-shootable-storyboard models a shot as a bounded, traceable unit with explicit camera, state, timing, continuity, and safety-zone fields. F03 now captures the minimum useful subset while leaving TimelineIR and execution authorities untouched.
4. **Graph-aware impact.** Scene dependencies are now validated for missing references, forward dependencies, and cycles. impact_radius is the transitive downstream dependent set, not the scene's own prerequisites.
5. **Repair locality.** A node with downstream dependents is explicitly marked as DEPENDENT_SUBGRAPH; regeneration remaps dependency asset IDs rather than dropping dependency edges.
6. **Semantic fingerprints.** Pydantic-style typed output discipline and clean-room provenance patterns informed a stable SHA-256 plan_fingerprint independent of request-specific plan IDs.
7. **Directorial structure without provider lock-in.** ShotDirector paper-level research and MultiShotMaster repository evidence show that explicit camera/shot transition semantics matter for coherent multi-shot generation. F03 records semantic camera and continuity intent only; it does not bind to Wan/Kling/Seedance/etc.
8. **Multimodal continuity context.** VstoryGen demonstrates narrative visual consistency from scene + character references. F03 now preserves character reference bindings and structured intent when F02 supplies them.
9. **Critic separation.** Code2Video's planner/critic separation reinforces that planning and evaluation should remain distinct. F03 remains a planner/specifier; visual quality judgment stays outside the new IR.

### Explicit non-adoptions

- No provider/model selection was added to F03.
- No physical image/video generation was added.
- No third-party code, prompts, or tests were copied.
- No model-specific camera or reference syntax was embedded in the canonical IR.
- Research-only repositories and non-production reference implementations remain non-authoritative.
- The F02 -> (F03 || F04) topology remains unchanged.
