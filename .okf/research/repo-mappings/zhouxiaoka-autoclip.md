# Repository Mapping: zhouxiaoka/autoclip

Status: FUTURE BUILD REFERENCE
Adoption: RESEARCH_ONLY + PATTERN_EXTRACTION
Primary domain: source-video highlight extraction, clip generation, publish/export automation
Current runtime adoption: NONE

Source:
- Repository: https://github.com/zhouxiaoka/autoclip
- Current inspected main release: v1.3.5 (2026-09-25)
- License: MIT
- Maintainer: zhouxiaoka
- Primary stack: Python + FastAPI + React/TypeScript + FFmpeg
- Interfaces: Desktop, Docker/Web, CLI, MCP

## 1. Why ShortForge is mapping AutoClip

ShortForge plans a future movie-shorts production capability in addition to its current AI-generated/orchestrated content factory.

AutoClip is a useful external reference because it already operationalizes:

- transcript-driven highlight discovery;
- duration-aware clip selection;
- subtitle/timeline boundary correction;
- deterministic overlap handling and fallback selection;
- title generation and thematic grouping;
- FFmpeg-based export;
- Shorts-oriented export;
- CLI and MCP access;
- publication workflow integration.

AutoClip is not treated as a replacement for ShortForge floors, RenderFabric, CAS, or F07.

## 2. Observed AutoClip pipeline

The inspected implementation is broadly:

Video / link / local media
→ subtitles / Whisper
→ Step 1 outline extraction
→ Step 2 timeline / highlight candidates
→ Step 3 LLM scoring + deterministic fallback
→ Step 4 title generation
→ Step 5 topic clustering / collections
→ Step 6 video cutting
→ publishing export
→ optional platform publishing.

The important engineering characteristic is that the project increasingly moves deterministic responsibilities out of the LLM.

## 3. High-value patterns for ShortForge

### 3.1 DurationProfile

AutoClip introduced a duration-aware profile instead of applying fixed podcast-style timing rules to every source.

The profile carries:
- source-duration tier;
- minimum clip duration;
- target duration range;
- maximum duration;
- topic-count hints;
- minimum retained clips;
- maximum retained clips;
- subtitle snapping window;
- merge gap;
- overlap merge threshold.

Future ShortForge use:
- feed source-duration constraints into Movie Intelligence;
- produce explicit candidate-duration intent before F05/F06;
- preserve deterministic duration policy outside the model.

### 3.2 Deterministic timeline refinement

AutoClip's quality layer performs procedural correction after LLM timeline generation:
- snap start/end to subtitle cue boundaries;
- extend clips to minimum duration;
- trim to maximum duration;
- detect and merge excessive overlap;
- shift smaller overlaps;
- merge or drop clips that remain too short;
- emit a quality report.

Future ShortForge use:
- treat model-produced candidate windows as proposals;
- validate and normalize candidate intervals deterministically;
- preserve original proposal plus refinement evidence.

This pattern is compatible with the .okf rule:
LLM proposes; typed deterministic contracts validate.

### 3.3 Score fallback instead of zero-result collapse

AutoClip does not simply discard a whole block when LLM score cardinality is wrong.

It attempts matching by outline/title and assigns an explicit fallback score/source when a result is missing.

Future ShortForge use:
- preserve partial candidate sets;
- mark missing evaluation explicitly;
- prevent opaque "success with zero artifacts";
- keep evaluation provenance visible.

### 3.4 Local-first processing

AutoClip keeps video cutting local while allowing remote or local LLM selection.

Future ShortForge use:
- keep source media processing near the execution worker;
- treat remote inference as a bounded provider;
- avoid sending source media to an LLM merely to perform transcript reasoning.

### 3.5 MCP as a bounded orchestration interface

AutoClip exposes processing through MCP operations such as:
- clip_video
- start_clip_job
- get_job_status
- get_project
- list_projects
- list_providers
- check_environment
- export_clip
- publish_clip
- get_publish_status
- list_publish_profiles

Future ShortForge use:
- study the command surface as a possible external provider/worker contract;
- expose only the capabilities required by a bounded movie-clip worker;
- do not grant AutoClip control over the mission DAG, leases, F07, CAS, or sovereign decisions.

## 4. Important limitations for movie shorts

AutoClip is primarily transcript-centric and its documented target use is interviews, podcasts, courses, and livestream recordings.

The inspected repository does not provide a complete movie-understanding stack for:
- shot detection as a first-class semantic artifact;
- scene graph construction;
- character identity tracking across shots;
- cinematic composition analysis;
- visual event understanding;
- narrative event graphs;
- synchronized dialogue + shot + character + visual-event reasoning;
- rights/provenance authorization as a production gate.

Its vertical export also relies on deterministic FFmpeg layout policies such as crop/blur/fit rather than a movie-specific active-subject reframing system.

Therefore AutoClip alone must not be promoted into the canonical Movie Shorts architecture.

## 5. Future ShortForge build derived from this mapping

The future build should combine AutoClip's transcript/highlight engineering with a Movie Intelligence layer.

Target future architecture:

Movie Source
→ Rights / source authorization record
→ Media + audio analysis
→ ASR / dialogue timeline
→ Shot detection
→ Scene segmentation
→ Character / identity references
→ Visual event extraction
→ Music / silence / intensity features
→ Movie Event Graph
→ Highlight Candidate IR
→ narrative / dramatic / comedic scoring
→ bounded candidate refinement
→ F01/F02 planning
→ F03/F04
→ F05
→ F06
→ F07.

A future candidate artifact should evolve beyond a simple timestamp pair and carry typed evidence such as:
- scene_id;
- source range;
- dialogue evidence;
- character references;
- shot boundaries;
- visual events;
- narrative role;
- intensity signals;
- continuity relationships;
- source lineage;
- rights/provenance references.

This is a future design direction, not current production behavior.

## 6. Boundary with current ShortForge floors

AutoClip must not become a hidden parallel floor.

Current canonical DAG remains:

F00
→ F01
→ F02
→ (F03 || F04)
→ F05
→ F06
→ F07.

Future AutoClip-derived movie intelligence may feed:
- F00/F01 with source evidence and highlight candidates;
- F02 with validated narrative candidates;
- downstream planning only through existing typed contracts.

It must not:
- own mission authority;
- bypass Overseer;
- bypass Worker capabilities;
- select or secretly route compute;
- own secrets;
- certify physical media;
- write directly to F07 release authority;
- replace CAS or artifact lineage;
- create a second RenderFabric.

## 7. Relationship to existing media references

AutoClip complements, rather than supersedes, existing ShortForge media references.

Current canonical composition/rendering references remain:
- Remotion for programmatic composition;
- AgentTube patterns for scene manifests, checkpoints, audio-first timing and selective repair;
- RenderFabric + ComputeRouter for execution;
- F07 for independent verification.

AutoClip contributes primarily on the source-video/highlight-extraction side.

## 8. Future-build work packages

### MB-01 — Movie Source Analyzer
Build an isolated source-analysis service that produces typed media facts without choosing final clips.

### MB-02 — Movie Event Graph
Fuse transcript, shot, scene, character, visual-event and audio-intensity evidence into a queryable graph.

### MB-03 — Highlight Candidate IR
Define a provider-neutral candidate artifact with source range, evidence, narrative role, scoring features, confidence and lineage.

### MB-04 — Deterministic Candidate Refinement
Port the useful AutoClip pattern:
cue/shot boundary snapping, minimum/maximum duration, overlap resolution, merge policy, and quality reports.

### MB-05 — Cinematic Vertical Reframing
Go beyond center crop/blur:
subject detection, active-speaker/character focus, shot-aware crop, safe zones and continuity-aware reframing.

### MB-06 — Rights & Provenance Gate
Require explicit source authorization metadata before movie-source processing/publishing can reach F07.

### MB-07 — AutoClip Adapter
Only after MB-01..06 have typed contracts:
- isolate AutoClip behind an adapter;
- consume only bounded capabilities;
- keep its filesystem/database/publisher out of ShortForge source of truth.

### MB-08 — Evaluation Corpus
Create movie-short evaluation cases covering:
- dialogue-only scenes;
- action scenes;
- silent reveals;
- multi-character dialogue;
- rapid cuts;
- music-driven moments;
- visual comedy;
- continuity-sensitive sequences.

## 9. Promotion rule

AutoClip remains RESEARCH_ONLY until all of the following exist:
1. typed ShortForge contracts;
2. bounded adapter or clean-room implementation;
3. deterministic tests;
4. provenance and rights checks;
5. measurable movie-short evaluation results;
6. compatibility with Overseer/worker capability boundaries;
7. F07 evidence demonstrating no release-authority bypass.

No AutoClip capability is production-routable merely because the upstream repository works.

## 10. Licensing and provenance

The upstream repository is MIT-licensed. This mapping does not authorize copying upstream code, prompts, tests, assets, or implementation details into ShortForge.

Any future implementation must follow the .okf clean-room assimilation rules and record the exact adopted mechanism and implementation provenance.

## 11. Decision

AutoClip is accepted into the ShortForge research corpus as a:

**FUTURE MOVIE-SHORTS BUILD REFERENCE**

Its highest-value contribution is the engineering discipline around:
- transcript-to-highlight extraction;
- duration-aware selection;
- deterministic timeline refinement;
- fallback scoring;
- local media execution;
- MCP-bounded automation.

Its main limitation is that it does not by itself provide the visual/movie intelligence required for cinematic movie-short extraction.

The future ShortForge build should therefore be:

**AutoClip-derived highlight intelligence + Movie Vision/Event Graph + typed Highlight Candidate IR + rights/provenance gate + existing ShortForge planning/render/verification fabric.**

Current production architecture is unchanged.
