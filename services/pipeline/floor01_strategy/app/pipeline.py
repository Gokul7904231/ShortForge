"""Floor 01 v2 workflow.

The workflow deliberately separates orchestration from strategy authority:
F00 evidence -> topic gate -> parallel research/strategy preparation ->
candidate generation -> deterministic evaluation -> content/curriculum ->
typed handoff.

The Overseer owns lifecycle. This module owns the F01 strategy artifact.
"""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import structlog

from floor01_strategy.app.core.config import get_settings
from floor01_strategy.app.core.exceptions import (
    DuplicateTopicError,
    Floor01ValidationError,
    LowConfidenceError,
    StrategyPipelineError,
)
from floor01_strategy.app.core.research_gate import ResearchEvidenceGate
from floor01_strategy.app.core.request_fingerprint import fingerprint_floor01_input
from floor01_strategy.app.domain.handoff import (
    ExecutionMode,
    ExecutionModeDetails,
    Floor01HandoffPayload,
    Floor01Input,
    FloorExecutionReport,
    HandoffStatus,
    StrategyDecisionRecord,
    UniquenessVerdict,
    WorkerExecutionSummary,
)
from floor01_strategy.app.infrastructure.llm_provider import LLMStrategyAdapter
from floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
from floor01_strategy.app.intelligence.strategy_candidates import (
    StrategyCandidateEngine,
    StrategyCandidateEvaluator,
)
from floor01_strategy.app.logical_workers.content_planner import ContentPlannerWorker
from floor01_strategy.app.logical_workers.curriculum_mapper import CurriculumMapperWorker
from floor01_strategy.app.logical_workers.strategy_planner import StrategyPlannerWorker
from floor01_strategy.app.logical_workers.topic_intelligence import TopicIntelligenceWorker

logger = structlog.get_logger(__name__)


class Floor01Pipeline:
    """Canonical F01 workflow implementation."""

    def __init__(
        self,
        memory_store: Optional[StrategyMemoryStore] = None,
        llm_adapter: Optional[LLMStrategyAdapter] = None,
    ) -> None:
        self.memory_store = memory_store or StrategyMemoryStore()
        self.llm_adapter = llm_adapter or LLMStrategyAdapter()
        self.topic_worker = TopicIntelligenceWorker(memory_store=self.memory_store)
        self.strategy_worker = StrategyPlannerWorker()
        self.candidate_engine = StrategyCandidateEngine(self.strategy_worker)
        self.candidate_evaluator = StrategyCandidateEvaluator()
        self.content_worker = ContentPlannerWorker()
        self.curriculum_worker = CurriculumMapperWorker()
        self.research_gate = ResearchEvidenceGate()

    def execute_with_report(
        self, inp: Floor01Input, strict_rejection: bool = False
    ) -> Tuple[Floor01HandoffPayload, FloorExecutionReport]:
        start_time = time.time()
        started_at = datetime.now(timezone.utc).isoformat()
        settings = get_settings()
        input_fingerprint = fingerprint_floor01_input(inp)

        cached_payload_data = self.memory_store.get_idempotent_payload(inp.request_id)
        if cached_payload_data:
            cached_floor_id = cached_payload_data.get("floor_id")
            cached_version = cached_payload_data.get("floor_version")
            if cached_floor_id == settings.floor_id and cached_version == settings.floor_version:
                cached_fingerprint = cached_payload_data.get("input_fingerprint")
                if not cached_fingerprint:
                    raise Floor01ValidationError(
                        f"Idempotency record for request_id '{inp.request_id}' lacks a request fingerprint; use a new request_id."
                    )
                if cached_fingerprint != input_fingerprint:
                    raise Floor01ValidationError(
                        f"Idempotency conflict: request_id '{inp.request_id}' was previously processed for different request parameters."
                    )
                payload = Floor01HandoffPayload.model_validate(cached_payload_data)
                report = FloorExecutionReport(
                    request_id=inp.request_id,
                    plan_id=payload.plan_id,
                    floor_id=settings.floor_id,
                    floor_version=settings.floor_version,
                    started_at=started_at,
                    duration_ms=round((time.time() - start_time) * 1000, 2),
                    execution_mode=ExecutionModeDetails(
                        global_mode=payload.execution_mode,
                        worker_modes={"cached": payload.execution_mode},
                        configured_provider=self.llm_adapter.provider_name,
                        configured_model=self.llm_adapter.model_name,
                        executed=self.llm_adapter.enabled,
                        executed_model=self.llm_adapter.model_name if self.llm_adapter.enabled else None,
                    ),
                    status=payload.handoff_status,
                    input_summary=inp.model_dump(),
                    decision_quality_score=payload.decision_quality_score,
                    handoff_reference={"plan_id": payload.plan_id, "cached": True},
                )
                return payload, report

            logger.info(
                "ignoring_stale_f01_cached_payload",
                request_id=inp.request_id,
                cached_floor_id=cached_floor_id,
                cached_version=cached_version,
                expected_floor_id=settings.floor_id,
                expected_version=settings.floor_version,
            )

        worker_summaries: List[WorkerExecutionSummary] = []
        warnings: List[str] = []
        errors: List[str] = []

        try:
            # 1. Topic intelligence is the first deterministic gate.
            t0 = time.time()
            topic_res = self.topic_worker.run(inp)
            worker_summaries.append(
                WorkerExecutionSummary(
                    worker_name="TopicIntelligenceWorker",
                    execution_mode=ExecutionMode.DETERMINISTIC,
                    duration_ms=round((time.time() - t0) * 1000, 2),
                    confidence_score=topic_res.provenance[0].confidence_score if topic_res.provenance else 0.8,
                    evidence_count=len(topic_res.provenance),
                )
            )

            if strict_rejection and topic_res.uniqueness_verdict == UniquenessVerdict.DUPLICATE_IN_MEMORY:
                raise DuplicateTopicError(
                    topic=inp.topic_query,
                    matched_topic=topic_res.selected_topic,
                    similarity_score=topic_res.similarity_risk_score,
                )

            # 2. F00 evidence sufficiency is explicit and fail-closed only in strict mode.
            research_gate = self.research_gate.evaluate(inp, strict=strict_rejection)
            warnings.extend(research_gate.warnings)
            if research_gate.blockers and strict_rejection:
                raise LowConfidenceError(research_gate.score, settings.min_confidence_threshold)

            llm_future = None
            curriculum_future = None
            with ThreadPoolExecutor(max_workers=2) as executor:
                if self.llm_adapter.enabled:
                    evidence_summary = (
                        "; ".join(inp.research_context.key_findings[:4])
                        if inp.research_context
                        else None
                    )
                    llm_future = executor.submit(
                        self.llm_adapter.generate_strategy_insight,
                        topic_res.selected_topic,
                        topic_res.category,
                        inp.target_audience,
                        inp.platform,
                        evidence_summary,
                    )
                curriculum_future = executor.submit(
                    self.curriculum_worker.run,
                    inp,
                    topic_res,
                )

                if llm_future:
                    llm_insight, llm_prov = llm_future.result()
                else:
                    llm_insight, llm_prov = None, None
                curriculum_res = curriculum_future.result()

            if llm_prov:
                topic_res.provenance.append(llm_prov)

            # 3. Candidate generation and deterministic evaluation.
            candidates = self.candidate_engine.generate(
                inp,
                topic_res,
                llm_insight if self.llm_adapter.enabled else None,
            )
            evaluations = [
                self.candidate_evaluator.evaluate(
                    inp,
                    topic_res,
                    curriculum_res,
                    candidate,
                    research_gate,
                )
                for candidate in candidates
            ]

            selected_candidate, evaluation, decision_record = self.candidate_evaluator.select(
                candidates,
                evaluations,
                settings.default_complexity_mode,
            )
            worker_summaries.append(
                WorkerExecutionSummary(
                    worker_name="StrategyCandidateEngine",
                    execution_mode=(
                        ExecutionMode.HYBRID
                        if any(candidate.model_generated for candidate in candidates)
                        else ExecutionMode.DETERMINISTIC
                    ),
                    duration_ms=0.0,
                    confidence_score=evaluation.overall_score,
                    evidence_count=sum(
                        len(item.evaluator_provenance) for item in evaluations
                    ),
                )
            )

            if strict_rejection and not evaluation.accepted:
                raise LowConfidenceError(
                    evaluation.overall_score,
                    settings.min_confidence_threshold,
                )

            # 4. Content planning runs after the strategy is selected.
            t0 = time.time()
            content_res = self.content_worker.run(
                inp, topic_res, selected_candidate.strategy
            )
            worker_summaries.extend(
                [
                    WorkerExecutionSummary(
                        worker_name="CurriculumMapperWorker",
                        execution_mode=ExecutionMode.DETERMINISTIC,
                        duration_ms=0.0,
                        confidence_score=(
                            curriculum_res.provenance[0].confidence_score
                            if curriculum_res.provenance
                            else 0.8
                        ),
                        evidence_count=len(curriculum_res.provenance),
                    ),
                    WorkerExecutionSummary(
                        worker_name="ContentPlannerWorker",
                        execution_mode=ExecutionMode.DETERMINISTIC,
                        duration_ms=round((time.time() - t0) * 1000, 2),
                        confidence_score=(
                            content_res.provenance[0].confidence_score
                            if content_res.provenance
                            else 0.8
                        ),
                        evidence_count=len(content_res.provenance),
                    ),
                ]
            )

            quality_score = evaluation.overall_score

            duplicate = topic_res.uniqueness_verdict == UniquenessVerdict.DUPLICATE_IN_MEMORY
            if duplicate:
                status = HandoffStatus.REJECTED
                warnings.append(
                    f"Topic rejected as duplicate of memory (similarity={topic_res.similarity_risk_score:.2f})."
                )
            elif not evaluation.accepted or not research_gate.passed:
                status = HandoffStatus.DEGRADED
                warnings.extend(evaluation.warnings)
            else:
                status = HandoffStatus.VALIDATED

            if status == HandoffStatus.REJECTED:
                if strict_rejection:
                    raise DuplicateTopicError(
                        topic=inp.topic_query,
                        matched_topic=topic_res.selected_topic,
                        similarity_score=topic_res.similarity_risk_score,
                    )

            payload = Floor01HandoffPayload(
                request_id=inp.request_id,
                input_fingerprint=input_fingerprint,
                floor_id=settings.floor_id,
                floor_version=settings.floor_version,
                execution_mode=(
                    ExecutionMode.HYBRID
                    if selected_candidate.model_generated
                    else ExecutionMode.DETERMINISTIC_FALLBACK
                ),
                research_context=inp.research_context,
                topic=topic_res,
                strategy=selected_candidate.strategy,
                content_plan=content_res,
                curriculum=curriculum_res,
                selected_candidate_id=selected_candidate.candidate_id,
                evaluation=evaluation,
                decision_record=decision_record,
                strategic_memory_refs=[inp.research_context.passport_id] if inp.research_context else [],
                decision_quality_score=quality_score,
                handoff_status=status,
            )

            if status != HandoffStatus.REJECTED:
                persisted_payload = self.memory_store.add_record(
                    topic=inp.topic_query,
                    plan_id=payload.plan_id,
                    request_id=inp.request_id,
                    payload=payload.model_dump(),
                    metadata={
                        "request_id": inp.request_id,
                        "category": topic_res.category,
                        "candidate_id": selected_candidate.candidate_id,
                        "decision_quality_score": quality_score,
                        "research_passport_id": (
                            inp.research_context.passport_id
                            if inp.research_context
                            else None
                        ),
                    },
                )
                if persisted_payload:
                    payload = Floor01HandoffPayload.model_validate(persisted_payload)
                    replay_duration_ms = round((time.time() - start_time) * 1000, 2)
                    replay_report = FloorExecutionReport(
                        request_id=inp.request_id,
                        plan_id=payload.plan_id,
                        floor_id=settings.floor_id,
                        floor_version=settings.floor_version,
                        started_at=started_at,
                        duration_ms=replay_duration_ms,
                        execution_mode=ExecutionModeDetails(
                            global_mode=payload.execution_mode,
                            worker_modes={"idempotent_replay": payload.execution_mode},
                            configured_provider=self.llm_adapter.provider_name,
                            configured_model=self.llm_adapter.model_name,
                            executed=False,
                        ),
                        status=payload.handoff_status,
                        input_summary=inp.model_dump(),
                        worker_results=[
                            WorkerExecutionSummary(
                                worker_name="IdempotencyReplay",
                                execution_mode=ExecutionMode.DETERMINISTIC,
                                duration_ms=replay_duration_ms,
                                confidence_score=payload.decision_quality_score,
                                evidence_count=len(payload.strategic_memory_refs),
                                status="REPLAYED",
                            )
                        ],
                        decisions=[
                            {"plan_id": payload.plan_id, "replayed": True},
                            {"input_fingerprint": payload.input_fingerprint},
                        ],
                        decision_quality_score=payload.decision_quality_score,
                        component_gates={"idempotency_gate": True},
                        warnings=["Concurrent idempotent replay returned the existing canonical plan."],
                        handoff_reference={"plan_id": payload.plan_id, "cached": True},
                    )
                    return payload, replay_report

            total_duration_ms = round((time.time() - start_time) * 1000, 2)
            all_provenance = (
                topic_res.provenance
                + [research_gate.provenance]
                + [p for e in evaluations for p in e.evaluator_provenance]
                + content_res.provenance
                + curriculum_res.provenance
            )

            decisions = [
                {"topic": topic_res.selected_topic, "category": topic_res.category},
                {
                    "selected_candidate_id": selected_candidate.candidate_id,
                    "angle": selected_candidate.strategy.content_angle,
                    "duration": selected_candidate.strategy.target_duration_seconds,
                },
                {"outline": content_res.structural_outline},
                {"bloom_level": curriculum_res.bloom_taxonomy_level.value},
                {"concept_dependencies": curriculum_res.concept_dependencies},
                {"quality_dimensions": evaluation.dimensions.model_dump()},
            ]

            report = FloorExecutionReport(
                request_id=inp.request_id,
                plan_id=payload.plan_id,
                floor_id=settings.floor_id,
                floor_version=settings.floor_version,
                started_at=started_at,
                duration_ms=total_duration_ms,
                execution_mode=ExecutionModeDetails(
                    global_mode=payload.execution_mode,
                    worker_modes={
                        "topic": ExecutionMode.DETERMINISTIC,
                        "research_gate": ExecutionMode.DETERMINISTIC,
                        "strategy_candidates": (
                            ExecutionMode.HYBRID
                            if selected_candidate.model_generated
                            else ExecutionMode.DETERMINISTIC
                        ),
                        "curriculum": ExecutionMode.DETERMINISTIC,
                        "content": ExecutionMode.DETERMINISTIC,
                    },
                    configured_provider=self.llm_adapter.provider_name,
                    configured_model=self.llm_adapter.model_name,
                    executed=self.llm_adapter.enabled,
                    executed_model=self.llm_adapter.model_name if self.llm_adapter.enabled else None,
                ),
                status=status,
                input_summary={
                    "topic_query": inp.topic_query,
                    "platform": inp.platform,
                    "target_audience": inp.target_audience,
                    "format": inp.content_format,
                    "research_passport_id": (
                        inp.research_context.passport_id
                        if inp.research_context
                        else None
                    ),
                },
                worker_results=worker_summaries,
                decisions=decisions,
                decision_quality_score=quality_score,
                component_gates={
                    "topic_uniqueness_gate": not duplicate,
                    "research_evidence_gate": research_gate.passed,
                    "candidate_evaluation_gate": evaluation.accepted,
                    "constraint_gate": not bool(evaluation.blockers),
                },
                provenance_audit=all_provenance,
                warnings=warnings,
                errors=errors,
                handoff_reference={
                    "plan_id": payload.plan_id,
                    "status": status.value,
                    "candidate_id": selected_candidate.candidate_id,
                },
            )

            self._persist_report_artifact(report)
            logger.info(
                "floor01_pipeline_completed",
                status=status.value,
                plan_id=payload.plan_id,
                candidate_id=selected_candidate.candidate_id,
            )
            return payload, report

        except (Floor01ValidationError, DuplicateTopicError, LowConfidenceError):
            raise
        except Exception as exc:
            logger.error("floor01_pipeline_failed", error=str(exc))
            raise StrategyPipelineError(
                f"Floor 01 pipeline failed for topic '{inp.topic_query}'",
                detail=str(exc),
            ) from exc

    def execute(
        self,
        inp: Floor01Input,
        strict_rejection: bool = False,
    ) -> Floor01HandoffPayload:
        payload, _ = self.execute_with_report(inp, strict_rejection=strict_rejection)
        return payload

    def _persist_report_artifact(self, report: FloorExecutionReport) -> None:
        try:
            reports_dir = Path("used_artifact/reports")
            reports_dir.mkdir(parents=True, exist_ok=True)
            report_file = reports_dir / f"floor01_execution_{report.execution_id}.json"
            report_file.write_text(
                json.dumps(report.model_dump(), indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.warning(
                "failed_to_persist_execution_report_artifact",
                error=str(exc),
            )
