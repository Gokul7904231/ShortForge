
# ShortForge / FactoryOS — Canonical Engineering Stack

> Document Class: Engineering Stack Decision
> Status: LOCKED DIRECTION / PRIMARY ENGINEERING BASELINE
> Primary Domain: Programmatic video composition, scene lifecycle, deterministic rendering, and bounded repair
> Decision Basis: Complete .okf review + current rendering architecture + existing AgentTube assimilation + current Remotion documentation

## 1. Stack decision

ShortForge adopts the following media engineering stack:

~~~
                    TimelineIR
                       |
                       v
              Remotion Composition Layer
                /              \
           React / DOM       Canvas / WebGL / media
                \              /
                       |
                       v
               Render Compiler
                       |
             +---------+---------+
             |                   |
             v                   v
        Remotion render      FFmpeg / other
             |                   |
             +---------+---------+
                       |
                       v
                RenderFabric
                       |
                       v
                 F06 worker
                       |
                       v
             physical artifact
                       |
                       v
                  F07 proof
~~~

Alongside the rendering stack:

~~~
Scene Manifest
   +
Durable Checkpoints
   +
Audio-first timing
   +
Selective scene repair
   +
CAS
~~~

The scene lifecycle principles are taken from the existing AgentTube assimilation and reimplemented as native ShortForge contracts.

## 2. Remotion role

Remotion is the selected primary programmatic video composition foundation for rich deterministic compositions.

Relevant capabilities include:

- React-based compositions
- explicit fps / width / height / duration
- frame-based timing through useCurrentFrame()
- Sequence-based timeline composition
- HTML / Canvas rendering
- WebGL effects / rendering paths
- render APIs and CLI
- dynamic composition metadata
- programmatic batch rendering

ShortForge already exposes a compiler-neutral TimelineIR so that Remotion is a target engine, not the canonical semantic model.

## 3. Remotion frame-clock assimilation

ShortForge must preserve deterministic frame semantics:

~~~
time = frame / fps
~~~

Animation logic must derive from the canonical frame position, not wall-clock time.

The TimelineIR compiler is responsible for mapping:

- scene start
- source trim
- playback rate
- duration
- keyframes
- caption timing
- audio timing

into frame-based execution.

## 4. Remotion WebGL / composition boundary

When a composition needs GPU-backed browser effects:

- WebGL must be explicitly configured and validated.
- render environment compatibility must be tested.
- output must remain deterministic for the same inputs.
- GPU-specific behavior must never be treated as a verification bypass.

WebGL is an execution mechanism.

TimelineIR remains authoritative.

F07 remains authoritative for physical artifact verification.

## 5. AgentTube role

AgentTube is the selected scene-lifecycle engineering pattern source.

ShortForge assimilates these mechanisms:

- local-first rendering
- durable per-stage checkpoints
- durable scene manifests
- scene-level repair
- audio-first timing
- content-addressed caching
- capability-aware generation boundaries
- explicit narration evidence / failure state

The current ShortForge package factoryos-render already implements the corresponding clean-room concepts:

- deterministic frame clock
- audio-first timing
- durable checkpoints
- scene-level repair
- content-addressed caching
- atomic commits

## 6. Scene Manifest

Every renderable scene should have a durable manifest containing, as applicable:

- scene ID
- mission ID
- parent artifact
- visual asset IDs
- visual asset hashes
- narration state
- narration provider
- narration model
- task IDs
- generation timestamps
- duration evidence
- timing source
- rights / provenance references
- verification state
- revision history
- dependency references
- repair history

A scene manifest is a control / provenance record, not a replacement for TimelineIR.

## 7. Audio-first timing

Physical narration duration is authoritative for scene timing when narration is present.

Do not infer physical audio duration from:

- script character count
- expected words-per-minute
- nominal provider timing
- HTTP success
- file extension

Physical media inspection remains the evidence source.

## 8. Selective repair

When one scene is invalid:

~~~
bad scene
  |
scene manifest
  |
dependency analysis
  |
repair only affected scene
  |
reuse unchanged scenes from CAS
  |
rebuild affected dependency subtree
  |
F07 re-verification
~~~

Full-pipeline restart is the fallback, not the default.

## 9. Checkpoint architecture

Each expensive stage should checkpoint enough state to resume without repeating verified work.

At minimum:

- stage ID
- mission / run ID
- input digest
- output digest
- model / provider identity
- task status
- timestamp
- verification state

A checkpoint cannot mark success without evidence.

## 10. TimelineIR remains canonical

External engines do not own the ShortForge semantic composition graph.

The canonical chain is:

~~~
F03 + F04
   |
TimelineIR
   |
engine-specific compiler
   |
Remotion / FFmpeg / future renderer
~~~

This preserves provider / engine neutrality.

## 11. AgentTube and Remotion are complementary

They solve different layers:

| Layer | Primary technology |
|---|---|
| Semantic composition | TimelineIR |
| Rich programmatic composition | Remotion |
| Scene lifecycle / repair | AgentTube-derived patterns |
| Physical fallback | FFmpeg |
| Distributed orchestration | RenderFabric |
| Verification | F07 / Auditor |
| Artifact identity | CAS |
| Repair coordination | Healer / ReMaker |

## 12. Why this stack was chosen

The current .okf already established:

- engine-neutral TimelineIR
- deterministic rendering
- content-addressed artifacts
- bounded repair
- Last-Known-Good
- physical verification
- provider-neutral RenderFabric

Remotion extends the composition expressiveness without replacing these boundaries.

AgentTube reinforces scene-level lifecycle discipline without becoming a second orchestration plane.

## 13. Licensing / governance

Remotion is source-available software governed by the Remotion License, not an OSI-approved open-source license.

Before production automation use, ShortForge must verify the applicable Remotion license terms for the actual deployment organization, automation model, team size, and render usage.

No architecture document may assume unlimited commercial use without license verification.

AgentTube is recorded in the existing repo research ledger as MIT and is used as a clean-room pattern source.

No third-party source code, prompts, tests, or proprietary assets are to be copied into ShortForge without explicit governance review.

## 14. Stack extension rule

A new rendering technology may be added only if it provides a documented advantage in at least one of:

- fidelity
- determinism
- latency
- throughput
- cost
- hardware utilization
- repair locality
- developer productivity
- capability coverage

The proposal must compare it with:

- TimelineIR
- Remotion
- AgentTube-derived lifecycle mechanisms
- FFmpeg
- current RenderFabric

## 15. Stack anti-patterns

Do not:

- let a worker author arbitrary render code without a contract
- let an engine define semantic truth
- use wall-clock timing where frame timing is required
- re-render unchanged scenes unnecessarily
- accept successful HTTP dispatch as physical completion
- trust metadata instead of physical media evidence
- bypass F07 because the renderer reported success
- import external architecture as authority without .okf review

## 16. Engineering stack priority rule

For media-generation architecture, the default comparison baseline is:

1. TimelineIR — semantic source of truth
2. Remotion — primary programmatic composition engine
3. AgentTube-derived scene lifecycle — manifest/checkpoint/repair discipline
4. RenderFabric — distributed provider-neutral execution
5. FFmpeg — deterministic physical rendering / normalization fallback
6. F07 / Auditor — physical proof

A new engine may complement this stack, but must not silently replace any canonical boundary.

## 17. Remotion is a selected foundation, not semantic authority

ShortForge adopts Remotion for rich programmatic compositions where its React/frame-clock composition model is advantageous.

Required boundary:

~~~
TimelineIR
   |
RemotionCompiler
   |
Remotion Composition
   |
RenderFabric
   |
physical artifact
   |
F07
~~~

Remotion completion is never itself verification.

## 18. AgentTube is the selected scene-lifecycle pattern source

ShortForge adopts the clean-room engineering patterns demonstrated by AgentTube for:
- durable scene manifests
- scene-level repair
- persistent checkpoints
- audio-first timing
- local-first rendering where appropriate
- content-addressed reuse
- explicit narration evidence and fail-closed narration state

These patterns are reimplemented as native ShortForge contracts under Overseer, SCL, AgentRuntime, Healer/ReMaker, CAS, and F07 boundaries.

## 19. Current external evidence

The current public AgentTube repository documents approval-first publishing, durable scene manifests, Scene Repair Studio, fail-closed narration, and persistent production state. These observations are current external evidence and remain subject to clean-room assimilation and ShortForge verification.

The current Remotion documentation confirms frame-addressed timing through useCurrentFrame and frame-based sequencing/timing APIs. These are the basis for our frame-clock assimilation.

## 20. Licensing gate

Remotion is source-available software under its own proprietary Remotion License rather than an OSI-approved open-source license. The current official FAQ states that individuals and organizations/teams up to three people can use the Free License under the published terms; larger organizations may require a Company License, and automation products can fall under the Automators licensing model when the Company License applies.

ShortForge must verify the actual organizational and automation licensing situation before production rollout. License status is a release gate, not an implementation detail.

## 21. Stack change gate

Before adopting another composition or scene lifecycle system, the proposal must compare against:
- TimelineIR
- Remotion
- AgentTube-derived lifecycle patterns
- RenderFabric
- FFmpeg
- F07 verification

The comparison must state exactly what is better, what remains unchanged, and what boundary is added or removed.
