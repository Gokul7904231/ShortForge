
# Repository Mapping: darkzOGx/youtube-automation-agent (AgentTube)

> Status: SELECTED ENGINEERING PATTERN SOURCE
> Adoption Mode: CLEAN-ROOM PATTERN ASSIMILATION
> License recorded by the ShortForge research ledger: MIT
> Primary Mapping: scene lifecycle, checkpoints, audio timing, selective repair

## 1. Core useful mechanisms

The repository's documented AgentTube architecture provides useful patterns around:

- durable scene manifests
- scene-level repair
- persistent checkpoints
- local-first rendering
- audio-first timing
- content-addressed caching
- capability-aware scene production
- explicit narration provider / task evidence
- fail-closed narration state

## 2. ShortForge mapping

~~~
AgentTube pattern
      |
      +-- Scene Manifest ------> scene lineage / provenance
      +-- Checkpoints ---------> AgentRuntime / checkpoint layer
      +-- Selective Repair ----> ReMaker + TimelineIR dependency repair
      +-- Audio-first timing --> F04 + TimelineIR
      +-- Local-first render ---> local render worker path
      +-- CAS ------------------> artifact CAS
~~~

## 3. Existing ShortForge alignment

The existing packages/factoryos-render package already records analogous mechanisms:

- deterministic frame clock
- audio-first timing
- durable checkpoints
- scene-level repair
- content-addressed caching
- atomic output commits

This means the AgentTube assimilation is an extension of an existing pattern, not a new architecture node.

## 4. What ShortForge must preserve

Scene repair must be:

- bounded
- dependency-aware
- provenance-preserving
- idempotent
- re-verified by F07

Unchanged scenes should remain reusable from CAS.

## 5. What ShortForge must not copy blindly

Do not import:

- third-party orchestration authority
- external permissions
- provider credentials
- application policy
- assumptions about ShortForge's floor hierarchy

AgentTube patterns are subordinate to FactoryOS authority and contracts.

## 6. Validation

The AgentTube-derived render lifecycle is considered valid only when:

- scene state is traceable
- checkpoints are resumable
- unchanged scenes are preserved
- repair scope is bounded
- physical artifact evidence is collected
- F07 re-verification passes

## 7. Canonical source

Repository:
https://github.com/darkzOGx/youtube-automation-agent
