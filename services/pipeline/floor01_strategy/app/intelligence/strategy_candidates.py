"""Bounded strategy candidate generation and deterministic evaluation."""

from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

from floors.floor01_strategy.app.core.config import get_settings
from floors.floor01_strategy.app.core.research_gate import ResearchGateResult
from floors.floor01_strategy.app.domain.handoff import (
    CandidateStatus,
    EvidenceType,
    ExecutionMode,
    Floor01Input,
    ProvenanceEntry,
    QualityDimensions,
    StrategyCandidate,
    StrategyDecisionRecord,
    StrategyEvaluation,
    TopicIntelligenceResult,
)
from floors.floor01_strategy.app.logical_workers.strategy_planner import StrategyPlannerWorker


class StrategyCandidateEngine:
    def __init__(self, strategy_worker: StrategyPlannerWorker | None = None) -> None:
        self.strategy_worker = strategy_worker or StrategyPlannerWorker()

    def generate(
        self,
        inp: Floor01Input,
        topic: TopicIntelligenceResult,
        llm_insight: Dict | None = None,
    ) -> List[StrategyCandidate]:
        settings = get_settings()
        base = self.strategy_worker.run(
            inp, topic, execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK
        )
        base = base.model_copy(update={
            "rationale": "Deterministic platform/category policy candidate.",
            "evidence_refs": [p.evidence_id for p in topic.provenance],
        })

        candidates = [
            StrategyCandidate(
                strategy=base,
                rationale=base.rationale,
                evidence_refs=base.evidence_refs,
            )
        ]

        if inp.research_context and inp.research_context.recommended_hook:
            evidence_strategy = base.model_copy(update={
                "content_angle": "evidence_led_hook",
                "rationale": "Uses the upstream F00 recommended hook while preserving platform constraints.",
                "evidence_refs": [*base.evidence_refs, inp.research_context.passport_id],
            })
            candidates.append(
                StrategyCandidate(
                    strategy=evidence_strategy,
                    rationale=evidence_strategy.rationale,
                    evidence_refs=evidence_strategy.evidence_refs,
                )
            )

        if llm_insight:
            recommended_angle = str(llm_insight.get("recommended_angle", "")).strip()
            if recommended_angle:
                model_strategy = base.model_copy(update={
                    "content_angle": recommended_angle[:120],
                    "execution_mode": ExecutionMode.HYBRID,
                    "rationale": str(
                        llm_insight.get(
                            "strategic_reasoning",
                            "Provider-generated strategic candidate.",
                        )
                    ),
                })
                candidates.append(
                    StrategyCandidate(
                        strategy=model_strategy,
                        rationale=model_strategy.rationale,
                        evidence_refs=model_strategy.evidence_refs,
                        model_generated=True,
                    )
                )

        unique: Dict[Tuple[str, int, str], StrategyCandidate] = {}
        for candidate in candidates:
            key = (
                candidate.strategy.content_angle,
                candidate.strategy.target_duration_seconds,
                candidate.strategy.tone,
            )
            unique.setdefault(key, candidate)

        return list(unique.values())[: settings.max_strategy_candidates]


class StrategyCandidateEvaluator:
    """Deterministic evaluator. It scores; it does not create evidence."""

    def evaluate(
        self,
        inp: Floor01Input,
        topic: TopicIntelligenceResult,
        curriculum_result,
        candidate: StrategyCandidate,
        research_gate: ResearchGateResult,
    ) -> StrategyEvaluation:
        settings = get_settings()
        strategy = candidate.strategy
        blockers: List[str] = []
        warnings: List[str] = []

        target = strategy.target_duration_seconds
        min_duration = settings.min_duration_seconds
        max_duration = settings.max_duration_seconds
        platform_max = int(
            strategy.platform_spec.get("max_duration_seconds", max_duration)
        )

        constraint_ok = min_duration <= target <= max_duration
        platform_ok = target <= platform_max if platform_max else True

        if not constraint_ok:
            blockers.append("Duration violates Floor 01 duration bounds.")
        if not platform_ok:
            blockers.append("Duration exceeds the declared platform maximum.")
        if topic.uniqueness_verdict.value == "DUPLICATE_IN_MEMORY":
            blockers.append("Topic is already present in strategy memory.")
        blockers.extend(research_gate.blockers)

        evidence_adequacy = research_gate.score if inp.research_context else 0.35
        novelty = max(0.0, 1.0 - topic.similarity_risk_score)
        audience_fit = 0.90 if inp.target_audience != "general_learners" else 0.78
        platform_fit = 1.0 if platform_ok else 0.35
        curriculum_coherence = (
            0.92 if getattr(curriculum_result, "concept_dependencies", None) else 0.55
        )
        downstream_feasibility = (
            0.95
            if strategy.platform_spec and target >= min_duration
            else 0.45
        )
        constraint_compliance = 1.0 if constraint_ok and platform_ok else 0.30

        dimensions = QualityDimensions(
            evidence_adequacy=evidence_adequacy,
            novelty=novelty,
            audience_fit=audience_fit,
            platform_fit=platform_fit,
            curriculum_coherence=curriculum_coherence,
            downstream_feasibility=downstream_feasibility,
            constraint_compliance=constraint_compliance,
        )
        accepted = not blockers and dimensions.overall >= settings.min_confidence_threshold

        if candidate.model_generated and research_gate.score < 0.55:
            warnings.append(
                "Model candidate retained only as a bounded candidate; upstream evidence remains weak."
            )

        provenance = ProvenanceEntry(
            evidence_type=EvidenceType.EVALUATOR,
            source_type="strategy_candidate_evaluator",
            source_identifier="floor01_v2",
            method="deterministic_multi_dimension_scoring",
            confidence_score=dimensions.overall,
            summary=f"Candidate {candidate.candidate_id} score={dimensions.overall:.4f}, accepted={accepted}.",
            raw_data=dimensions.model_dump(),
        )
        return StrategyEvaluation(
            candidate_id=candidate.candidate_id,
            dimensions=dimensions,
            overall_score=dimensions.overall,
            accepted=accepted,
            blockers=blockers,
            warnings=warnings,
            evaluator_provenance=[provenance],
        )

    def select(
        self,
        candidates: Sequence[StrategyCandidate],
        evaluations: Sequence[StrategyEvaluation],
        complexity_mode: str,
    ) -> Tuple[StrategyCandidate, StrategyEvaluation, StrategyDecisionRecord]:
        pool = [
            (candidate, evaluation)
            for candidate, evaluation in zip(candidates, evaluations)
            if evaluation.accepted
        ]
        if not pool:
            pool = list(zip(candidates, evaluations))
        if not pool:
            raise ValueError("No Floor 01 strategy candidates were generated.")

        selected, evaluation = max(
            pool,
            key=lambda pair: (pair[1].overall_score, pair[0].candidate_id),
        )
        selected = selected.model_copy(update={"status": CandidateStatus.SELECTED})

        record = StrategyDecisionRecord(
            selected_candidate_id=selected.candidate_id,
            candidate_ids_considered=[candidate.candidate_id for candidate in candidates],
            selection_basis="highest deterministic multi-dimension evaluation",
            evaluation_score=evaluation.overall_score,
            complexity_mode=complexity_mode,
            bounded_deliberation_used=False,
        )
        return selected, evaluation, record
