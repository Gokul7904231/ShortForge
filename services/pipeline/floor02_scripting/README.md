# Floor 02 — Cognitive Scripting & Structure

**Canonical ID:** `floor02_scripting`  
**Runtime version:** `2.0.0`  
**Category:** `CREATIVE`  
**Required agent type:** `FLOOR_SCRIPTING`  
**Runtime:** `services/pipeline/floor02_scripting/main.py`

## Production status

**F02 v2 production implementation is complete and blocking-tested.**

The runtime is a **Narrative Compiler**, not a free-running text generator:

```
F01 Strategy
    ↓
Validated upstream context
    ↓
Hierarchical candidate generation
    ↓
Causal / viewer state construction
    ↓
Parallel critics
    ↓
Bounded revision
    ↓
Deterministic compilation
    ↓
Canonical ScriptIR
    ↓
F03 Visual Asset Realization
    └──────────────→ F04 Media / Voice Synthesis
```

Model output is always a candidate. The deterministic compiler, typed schemas and hard quality gates create the authoritative handoff.

## What F02 owns

F02 converts the trusted F01 strategy into a production-ready narrative representation containing:

- hook / retain / payoff structure
- narration and on-screen text
- scene-by-scene narrative intent
- causal events and dependencies
- viewer information state
- pacing and duration
- evidence lineage
- visual intent for F03
- voice intent for F04
- semantic scene regeneration
- ScriptIR versioning
- execution and provenance reports

F02 **does not generate the final image, audio file or rendered video**.

## Canonical architecture

### 1. Input gateway

Production execution requires a validated `Floor01HandoffPayload`.

Topic-only execution is available only when `strict_upstream=false` for tests/simulation.

### 2. Narrative planning

The `NarrativeCompiler` converts F01 strategy into bounded candidates.

Production candidates can come from a real provider through `LLMNarrativeAdapter`.

The adapter supports Gemini and OpenAI-compatible endpoints and never labels deterministic templates as model inference.

### 3. Narrative state

F02 tracks:

- viewer known facts
- current question
- expectation
- emotional state
- unresolved promises
- character/world/timeline state

### 4. Causal event graph

Every scene can reference causal events.

Events contain:

- causes
- effects
- actor
- state before
- state after
- evidence lineage

This makes regeneration impact-aware instead of purely textual.

### 5. Candidate generation

Up to `FLOOR02_MAX_CANDIDATES` candidates are produced.

The default implementation supports three deterministic strategy variants for simulation:

- curiosity reveal
- misconception break
- example first

Production mode requires a real model provider when `FLOOR02_REQUIRE_REAL_MODEL=true`.

### 6. Parallel critics

The critics run concurrently:

| Critic | Responsibility |
|---|---|
| F02-C01 Evidence | upstream evidence lineage |
| F02-C02 Narrative | beat/scene coherence |
| F02-C03 Hook | curiosity/open-loop signal |
| F02-C04 Continuity | scene/event dependency graph |
| F02-C05 Pacing | duration and word-count contract |
| F02-C06 Feasibility | visual + voice intent completeness |

Critics are read-only. They return typed findings and scores.

### 7. Bounded revision

A failed candidate can be repaired for at most `FLOOR02_MAX_REVISIONS` iterations.

There are no unbounded reflection loops.

### 8. Deterministic compilation

Only an accepted candidate produces authoritative `ScriptIR`.

Hard gates include:

- evidence lineage
- narrative structure
- hook constraints
- continuity
- pacing
- downstream visual/voice feasibility

### 9. Pacing

The production contract is normalized to:

**130–160 spoken words per 60 seconds**

and is scaled to the requested duration.

### 10. Semantic regeneration

`POST /v1/script/regenerate-scene` changes one scene, preserves the script identity, increments scene/script versions, reconstructs the narrative graph, and runs the entire quality gate suite again.

A legacy payload without `script_ir` is rejected rather than silently regenerated.

## Canonical ScriptIR

`ScriptIR.schema_version = "2.0"`

It contains:

- identity
- strategy objective
- audience / platform / tone
- claims + evidence references
- beats
- causal events
- narrative state
- typed scenes
- retention metadata
- multidimensional quality report
- provenance references

Each scene includes:

- stable `scene_id`
- `scene_version`
- `beat_id`
- `scene_goal`
- narration
- on-screen text
- visual intent
- voice intent
- dependencies
- causal event IDs
- evidence references
- viewer state before/after

## F03 / F04 handoff

F02 produces explicit typed successor references:

```
F02
 ├── floor03_asset_realization
 │     receives ScriptIR + scene/visual intent
 │
 └── floor04_media_synthesis
       receives ScriptIR + narration/voice intent
```

F02 decides **what the scene communicates**.

F03 decides **how visual assets are realized**.

F04 decides **how the voice/audio is synthesized**.

## Security boundary

Production endpoints require:

- `X-API-Key`
- constant-time API-key comparison
- request-body size bound
- response-size bound
- thread-safe token bucket rate limiting
- input sanitization
- model-output sanitization
- strict Pydantic contracts
- zero model tools
- no arbitrary browser/provider capability
- fail-closed production model policy

Input sanitization is explicitly defense-in-depth; it is not treated as a complete prompt-injection solution.

## Persistence

The memory layer provides:

- atomic file replacement
- process locking
- request-level fingerprints
- duplicate convergence
- conflict rejection
- corruption backup/recovery
- bounded retention
- durable execution reports

Production persistence failures are not converted into successful results.

## Public API

```
GET  /health
POST /v1/script/plan
POST /v1/script/execution-report
POST /v1/script/regenerate-scene
```

Production `/plan` and `/execution-report` require a validated F01 handoff.

## Quality / verification suite

The F02 suite covers:

- F01 ingestion
- ScriptIR compilation
- causal graph integrity
- viewer state
- evidence lineage
- pacing
- bounded candidates
- semantic regeneration
- idempotency conflicts
- corruption recovery
- multiprocess persistence
- API authentication
- request-size boundaries
- rate limiting
- output sanitization
- canonical successor handoffs

A dedicated blocking GitHub Actions workflow is provided at:

```
.github/workflows/floor02.yml
```

It runs:

```
python -m compileall -q services/pipeline/floor02_scripting
python -m pytest services/pipeline/floor02_scripting/tests/ -q
```

## Ascalon boundary

Ascalon can improve:

- narrative planning
- candidate diversity
- critique reasoning
- revision reasoning
- retention reasoning
- semantic regeneration
- offline optimization

Ascalon does **not** own:

- floor authority
- permissions
- authentication
- topology
- handoff validity
- persistence authority
- downstream asset/audio ownership

The production authority chain remains:

```
Overseer
   ↓
F02 runtime
   ↓
Deterministic compiler / contracts
   ↓
F03 + F04
```

## Training rule

Ascalon training trajectories should be collected as:

```
F01 strategy
  ↓
candidate plans
  ↓
critic reports
  ↓
bounded revisions
  ↓
final ScriptIR
  ↓
F03/F04 acceptance
  ↓
downstream outcome
```

Do not train against the legacy `apps/web/agents/script-agent.ts` as an equally authoritative F02 runtime. It remains a compatibility/reference source until fully retired.

