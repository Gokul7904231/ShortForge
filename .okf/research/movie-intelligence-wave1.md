# ShortForge Movie Intelligence Research Architecture — Wave 1

Date: 2026-09-26
Status: FUTURE BUILD / RESEARCH-ONLY
Canonical production DAG: F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07

## 1. Research conclusion

AutoClip is useful for transcript-to-highlight extraction, duration-aware selection, deterministic timeline refinement, fallback scoring, local media execution and bounded MCP automation.

It is not sufficient for movie-source shorts because a movie requires visual shot boundaries, scene/character continuity, visual event evidence, long-context memory, temporal grounding and cinematic reframing.

Wave 1 therefore defines a future Movie Intelligence boundary that produces evidence and typed candidate artifacts without becoming a hidden production floor or a second renderer.

## 2. Proposed future pipeline

Source authorization
-> Media probe + audio/video indexing
-> Shot Boundary Evidence
   - TransNetV2 candidate neural boundaries
   - PySceneDetect deterministic/heuristic boundaries
   - consensus + conflict evidence
-> Scene grouping / semantic segmentation
-> Subject + Character Track Evidence
   - Grounded SAM 2 / SAM 2 bounded worker
   - preserve frame ranges, track IDs, masks/boxes and confidence
-> Dialogue / ASR timeline
-> Audio intensity / music / silence evidence
-> Visual Event Evidence
   - temporal action/event localization candidates
-> Movie Evidence Memory
   - sparse scene summaries and temporal anchors
-> Long-context semantic analysis
   - VideoChat-Flash / VideoChat3 style evidence-aware retrieval
   - MovieChat-style sparse-memory principle
-> Highlight Candidate IR
-> Deterministic candidate refinement
-> Cinematic Reframe Plan
-> F00/F01/F02 through existing typed contracts
-> F03/F04/F05/F06/F07

## 3. Key derived artifacts

### ShotBoundaryEvidence
- source range
- detector/model identity
- detector configuration
- boundary timestamp/frame
- confidence
- consensus status
- source fingerprint

### SubjectTrackEvidence
- logical subject reference
- local track ID
- frame/time range
- bbox/mask evidence
- confidence
- model/version fingerprint
- shot association

### VisualEventEvidence
- event label or event family
- start/end range
- supporting visual anchors
- confidence
- model/version
- evaluation/threshold metadata

### MovieEvidenceMemory
- scene/shot anchor
- compact summary
- source range
- salient frames
- linked dialogue/audio/visual evidence
- retrieval key
- provenance

### HighlightCandidateIR
- source range
- candidate reason
- evidence references
- narrative role
- character set
- event set
- dialogue evidence
- intensity profile
- duration policy
- continuity constraints
- reframe intent
- rights/provenance references
- deterministic refinement record

## 4. Reframing design

Google AutoFlip provides the strongest researched pattern for future cinematic reframing:
- detect scene boundaries first;
- identify salient content;
- choose stationary, panning or tracking behavior;
- smooth the viewport trajectory;
- degrade gracefully when all required content cannot fit.

ShortForge should reproduce the design principles clean-room rather than adopt the legacy MediaPipe AutoFlip runtime. Reframing remains a declarative plan; F05/RenderFabric execute it.

## 5. Long-context design

Never feed an entire movie frame-by-frame into a single model by default.

Use hierarchical evidence density:
1. coarse shot/scene index;
2. compact scene memory;
3. candidate-window retrieval;
4. high-resolution inspection only for evidence gaps;
5. typed temporal evidence returned to the candidate compiler.

VideoChat-Flash and VideoChat3 are research references for this staged evidence-allocation pattern. MovieChat is a research reference for sparse memory over long video.

## 6. Character continuity rule

A tracker identity is evidence, not truth.

Grounded SAM 2 / SAM 2 can provide persistent local tracking, but cross-shot movie character identity must be reconciled through additional evidence. No single worker is allowed to assert a globally authoritative character identity without provenance.

## 7. Promotion boundaries

No Wave 1 capability enters the canonical runtime merely because the upstream project works.

Promotion requires:
1. provider-neutral ShortForge schema;
2. bounded worker capability;
3. deterministic replay and fingerprinting;
4. provenance for every evidence record;
5. evaluation on a movie-short corpus;
6. failure-mode tests and repair locality;
7. cost/latency measurements;
8. explicit rights/source authorization;
9. F07-compatible evidence with no release-authority bypass.

## 8. Explicit non-adoption

Do not:
- replace the canonical floor DAG;
- create a Movie Intelligence hidden floor that bypasses Overseer;
- let a video MLLM directly control RenderFabric;
- let tracking IDs become authority without verification;
- let an LLM emit unvalidated timestamp pairs as production truth;
- let legacy AutoFlip become a production dependency;
- mix third-party credentials/models into F03;
- bypass CAS, Guardian, or F07.

## 9. Relationship to current research corpus

AutoClip remains the source-video highlight/timeline reference.
Wave 1 adds the missing movie-visual intelligence references.
Existing Remotion, AgentTube, RenderFabric and F07 mappings remain authoritative for composition, execution and verification.

## 10. Ascalon training implication

Ascalon should learn the decomposition and evidence protocol, not memorize a specific third-party tool choice.

Training examples should teach:
- detect the smallest necessary evidence-producing worker;
- preserve provenance and uncertainty;
- separate proposal from deterministic validation;
- use sparse memory for long media;
- respect worker capability boundaries;
- escalate cross-shot identity conflicts instead of fabricating continuity;
- produce typed candidates that downstream floors can verify.

Current production runtime is unchanged.