# Floor 01 — Strategy & Intelligence

**Canonical floor ID**: `floor01_strategy`
**Guardian execution alias**: `floor01` (compatibility namespace)
**Floor Version**: `2.0.0`
**Location**: `services/pipeline/floor01_strategy/`
**Status**: **Production-gate GREEN on head `52842ccd57e4b6104edef6168956636ea6e5fc4e`**
**Overseer Integration**: canonical Python runtime adapter plus validated-only handoff boundary implemented; PR #16 remains draft/unmerged

**Report Persistence Classification**: `LOCAL_EXECUTION_AUDIT_ARTIFACT = IMPLEMENTED` | `OVERSEER_LIFECYCLE_PERSISTENCE = EXISTING_EVENT_PATH`  

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

- **Terminology**: `decision_quality_score` is a weighted heuristic quality signal, not a calibrated probability.
- **Formula**:
  $$\text{Score} = 0.22e + 0.16n + 0.14a + 0.14p + 0.10c + 0.12d + 0.12k$$
  where \(e\)=evidence adequacy, \(n\)=novelty, \(a\)=audience fit, \(p\)=platform fit, \(c\)=curriculum coherence, \(d\)=downstream feasibility, and \(k\)=constraint compliance.
- **Acceptance gate**:
  A candidate is accepted only when there are no deterministic blockers and the score is at least the configured `min_confidence_threshold` (default 0.70).
- **Handoff gate**:
  Canonical production API execution runs in strict mode. Missing/insufficient F00 evidence or an unaccepted strategy is not promoted as a validated handoff.
- **Topic uniqueness**:
  `DUPLICATE_IN_MEMORY` is a deterministic blocker and strict execution rejects the request.

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
  - `INPUT_BOUNDARY_DEFENSE_IN_DEPTH = IMPLEMENTED` (bounded field/constraint sanitization, model-bound input sanitization, and request-size limits)
  - `FULL_PROMPT_INJECTION_RESILIENCE = NOT_GUARANTEED` (sanitization is defense-in-depth, not proof of arbitrary provider safety)
- **Persistence Boundary**: Single-node multi-process file memory hardened with sidecar `.lock` process locking (`msvcrt`/`fcntl`), atomic file replace (`NamedTemporaryFile` + `os.replace`), corruption auto-recovery (`.corrupted.<timestamp>`), retention bounds (`max_records=1000`), full-request SHA-256 idempotency fingerprints, concurrent replay convergence, and fail-hard persistence errors. Multi-node shared memory remains intentionally unsupported until a shared backend is introduced.
- **Report Persistence**: F01 persists its local execution artifact; Overseer also receives the canonical execution result through the existing control-plane event path. A separate shared report database is intentionally not introduced because Overseer remains the lifecycle authority and F01 memory is single-instance.

---

## 6. Concurrent Idempotency & Persistence Semantics

- **Classification**: `CONCURRENT PERSISTENCE DEDUPLICATION`.
- When multiple OS processes submit identical `request_id` simultaneously, process-level locking guarantees that the first completed execution persists exactly one record to strategy memory. Subsequent processes detect the saved record under lock protection, skip duplicate writes (`skip_duplicate_idempotent_add_record`), and return identical cached payloads.

---

## 7. Authoritative Test Verification & Performance Breakdown

Authoritative test execution command:
`python -m pytest floor01_strategy/tests/ -q`

Authoritative test log: `used_artifact/test_runs/task-827.log`

**Historical task-827 result only. Not current v2 proof.**

Current verification is owned by branch CI:
```
python -m pytest floor01_strategy/tests/ -q
```
and the production-container smoke job in `.github/workflows/ci.yml`.

### Performance Design:
- Blocking strategy work is executed by FastAPI sync route handlers, keeping the event loop free.
- Independent model/curriculum preparation remains overlapped inside F01.
- Candidate tie-breaking is content-deterministic rather than UUID-deterministic.
- File persistence is lock-protected and atomic.


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
The old 31-test claim in this README is historical task-827 evidence. Current v2 verification is green in CI run #427 (`36144286795`) on code head `52842ccd57e4b6104edef6168956636ea6e5fc4e`.
New regression coverage is at services/pipeline/floor01_strategy/tests/test_v2_architecture.py.


## Production Runbook

Required production configuration:
- `FLOOR01_ENVIRONMENT=production`
- `FLOOR01_SERVICE_API_KEY` (required; production startup fails without it)
- `FLOOR01_MEMORY_FILE_PATH` (recommended on persistent storage)
- `FLOOR01_CORS_ORIGINS` only when browser-origin access is explicitly required
- Optional `FLOOR01_LLM_API_KEY`, `FLOOR01_LLM_BASE_URL`, and `FLOOR01_LLM_MODEL`

Canonical production path:
`F00 ResearchPassport -> Floor01RuntimeAdapter -> /v1/plan -> validated Floor01HandoffPayload -> F02`

The authenticated `/v1/plan` and `/v1/plan/execution-report` endpoints are strict and fail closed when upstream evidence is missing or the strategy is not validated. The Overseer adapter independently rejects any non-`VALIDATED` handoff.

The service image runs as a non-root user, exposes only the required API port, disables interactive OpenAPI documentation in production, applies request-size and response-security controls, persists the canonical execution audit report beside the configured strategy-memory file, and exposes an unauthenticated lightweight `/health` probe for orchestration.

Horizontal scaling is not enabled by the file memory implementation. Production deployment should keep F01 single-replica until a shared strategy-memory backend is promoted and tested. The report artifact path is derived from the configured strategy-memory path, so the strategy memory and audit artifacts share one durable writable boundary.
