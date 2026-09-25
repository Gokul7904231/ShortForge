# Floor 01 — Strategy & Intelligence

**Canonical floor ID**: `floor01_strategy`
**Guardian execution alias**: `floor01` (compatibility namespace)
**Floor Version**: `2.0.0`
**Location**: `services/pipeline/floor01_strategy/`
**Status**: **v2 implementation on `feat/floor01-strategy-v2`; merge gated on fresh test/CI verification**
**Overseer Integration**: canonical Python runtime adapter implemented; endpoint runtime verification pending

**Report Persistence Classification**: `LOCAL_DEVELOPMENT_ARTIFACT_PERSISTENCE = IMPLEMENTED` | `CENTRALIZED_OVERSEER_PERSISTENCE = INTEGRATION_PENDING`  

---

## 1. Overview & Architectural Scope

Floor 01 is the strategy and intelligence engine of FactoryOS. It is responsible for:
1. **Topic Intelligence**: Topic normalization, keyword extraction, category classification, and memory similarity lookup (`MEMORY_UNSEEN`, `SIMILAR_TO_MEMORY`, `DUPLICATE_IN_MEMORY`).
2. **Channel Strategy**: Multi-platform rules for `youtube_shorts`, `tiktok`, `instagram_reels`, `linkedin_video`, `twitter_video` with aspect ratios, hook windows, CTA policies, and metadata versioning.
3. **Content Planning**: Objective formulation, structural outlines, key takeaways, hook direction, scene pacing guidance (seconds per section), and downstream Floor 02 hints.
4. **Curriculum Intelligence**: Bloom's Taxonomy classification (`EDUCATIONAL_FRAMEWORK`), dynamic concept dependency trees (`DETERMINISTIC_RULE`), hypothesized learner knowledge gaps (`knowledge_gap_hypothesis`), and assessment opportunities.

---

## 2. Core Contracts Architecture

Floor 01 defines two separate, non-interchangeable contract structures:

### A. Downstream Handoff Contract (`Floor01HandoffPayload`)
Handed off downstream to Floor 02 (Scriptwriting). Contains machine-readable strategy decisions, structural outlines, scene pacing guidance, concept dependencies, platform specs, and defined weighted heuristic decision quality score.

### B. Overseer Execution Report Contract (`FloorExecutionReport`)
Generated for Overseer control plane consumption. Contains execution metrics (ID, duration in ms, timestamp), global/worker execution modes, worker execution summaries, component quality gates, input summary, decision trace, complete provenance audit, warnings, and errors.

```
                  OVERSEER
                     ▲
                     │
          FloorExecutionReport
                     │ (Generated for Overseer consumption)
                     │
              ┌──────┴──────┐
              │   FLOOR 01  │
              └──────┬──────┘
                     │
          Floor01HandoffPayload
                     │ (Handed off downstream)
                     ▼
                 FLOOR 02
```

---

## 3. Heuristic Decision Quality Score Semantics

- **Terminology**: `decision_quality_score` (defined weighted heuristic score; **not** a calibrated statistical probability).
- **Formula**:
  $$\text{Score} = 0.30 \cdot c_{\text{topic}} + 0.25 \cdot c_{\text{strategy}} + 0.25 \cdot c_{\text{content}} + 0.20 \cdot c_{\text{curriculum}}$$
- **Component Quality Gates**:
  - `topic_uniqueness_gate`: Rejects topic if verdict is `DUPLICATE_IN_MEMORY`.
  - `confidence_score_gate`: Marks status `DEGRADED` if `decision_quality_score < 0.70`.

---

## 4. Provenance & Evidence Classification Rules

- **Bloom Classification**: `evidence_type = EvidenceType.EDUCATIONAL_FRAMEWORK`, `source_identifier = "blooms_revised_taxonomy_v2"`, `method = "classify_learning_level"`.
- **Concept Dependency Graph**: `evidence_type = EvidenceType.DETERMINISTIC_RULE`, `source_identifier = "curriculum_dependency_rules"`, `method = "derive_concept_dependency_tree"`.
- **Memory Similarity Lookup**: `evidence_type = EvidenceType.MEMORY_LOOKUP`, `source_identifier = "strategy_memory_store"`, `method = "calculate_jaccard_similarity"`.
- **LLM Model Inference**: `evidence_type = EvidenceType.MODEL_INFERENCE`, `source_identifier = "llm_adapter_model"`, `method = "generate_strategy_insight"`.

---

## 5. Security & Persistence Classification Boundaries

- **Granular Security Classifications**:
  - `INPUT_SANITIZATION = IMPLEMENTED` (strips HTML script tags, control characters, and direct injection phrases)
  - `API_KEY_AUTH = IMPLEMENTED` (`X-API-Key` header verification)
  - `RATE_LIMITING = IMPLEMENTED` (single-node in-process token bucket rate limiter)
  - `FULL_PROMPT_INJECTION_RESILIENCE = NOT_IMPLEMENTED / REQUIRES_DEFENSE_IN_DEPTH`
- **Persistence Boundary**: Single-node multi-process file memory hardened with sidecar `.lock` process locking (`msvcrt`/`fcntl`), atomic file replace (`NamedTemporaryFile` + `os.replace`), corruption auto-recovery (`.corrupted.<timestamp>`), retention bounds (`max_records=1000`), and idempotency index. Multi-node shared memory is unsupported pending shared backend infrastructure.
- **Report Persistence**: Local report artifact persistence to `used_artifact/reports/floor01_execution_<id>.json`. Centralized Overseer persistence transport marked `INTEGRATION_PENDING`.

---

## 6. Concurrent Idempotency & Persistence Semantics

- **Classification**: `CONCURRENT PERSISTENCE DEDUPLICATION`.
- When multiple OS processes submit identical `request_id` simultaneously, process-level locking guarantees that the first completed execution persists exactly one record to strategy memory. Subsequent processes detect the saved record under lock protection, skip duplicate writes (`skip_duplicate_idempotent_add_record`), and return identical cached payloads.

---

## 7. Authoritative Test Verification & Performance Breakdown

Authoritative test execution command:
`python -m pytest floors/floor01_strategy/tests/`

Authoritative test log: `used_artifact/test_runs/task-827.log`

**31 PASSING TESTS — AUTHORITATIVE TASK-827 VERIFICATION RUNTIME: 4.60s**

```
============================= 31 passed in 4.60s =============================
```

### Performance Analysis:
- Process locking and multi-worker execution are fully process-safe and optimized.
- All unit, contract, API, multiprocess locking, concurrent persistence deduplication, security sanitization, and failure recovery tests execute in **4.60 seconds** total.


# Floor 01 v2 Architecture Addendum

Canonical floor ID: floor01_strategy
Version: 2.0.0

F01 v2 workflow:
F00 ResearchPassport -> ResearchContext -> Topic Intelligence -> Evidence Gate -> bounded Strategy Candidates -> deterministic Evaluation -> Content/Curriculum -> Floor01HandoffPayload -> F02.

Key rules:
- F00 owns external research and passport integrity.
- F01 consumes a typed evidence projection.
- Model output is a candidate, not an authority.
- The deterministic evaluator compiles the authoritative handoff.
- Missing evidence can be DEGRADED in compatibility mode and rejected in strict mode.
- Overseer remains orchestration authority and delegates strategy to the canonical Python runtime.
- F01 identity is floor01_strategy.
- MODEL_INFERENCE provenance is emitted only after a real provider request succeeds.

New contracts:
- ResearchContext
- ResearchEvidenceRef
- StrategyCandidate
- StrategyEvaluation
- QualityDimensions
- StrategyDecisionRecord

Reliability/performance changes:
- Hybrid novelty scoring replaces token-only Jaccard as the primary duplicate signal.
- Independent model/curriculum preparation overlaps.
- Existing idempotency persistence is retained.
- Guardian input hashes use SHA-256.
- Service authentication is separate from model credentials.
- CORS is explicitly bounded.

Canonical Overseer transport:
apps/web/factoryos/core/bridge/Floor01RuntimeAdapter.ts

Required runtime configuration:
- FLOOR01_SERVICE_URL
- FLOOR01_SERVICE_API_KEY

Authoritative design records:
- .okf/audits/floor01-v2-improvement.md
- docs/research/floor01-v2-architecture-candidates.md

Verification note:
The old 31-test claim in this README is historical task-827 evidence. v2 requires fresh branch CI verification.
New regression coverage is at services/pipeline/floor01_strategy/tests/test_v2_architecture.py.
