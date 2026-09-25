"""F00 -> F01 evidence sufficiency gate."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from floors.floor01_strategy.app.core.config import get_settings
from floors.floor01_strategy.app.domain.handoff import EvidenceType, Floor01Input, ProvenanceEntry, ResearchContext


@dataclass(frozen=True)
class ResearchGateResult:
    score: float
    passed: bool
    blockers: List[str]
    warnings: List[str]
    provenance: ProvenanceEntry


class ResearchEvidenceGate:
    """Validate that F01 has enough upstream evidence to make a grounded plan."""

    def evaluate(self, inp: Floor01Input, strict: bool = False) -> ResearchGateResult:
        settings = get_settings()
        ctx: Optional[ResearchContext] = inp.research_context

        if ctx is None:
            blocker = "F00 ResearchContext is missing."
            return ResearchGateResult(
                score=0.0,
                passed=not strict and not settings.require_verified_research,
                blockers=[blocker],
                warnings=["Running without first-class F00 evidence; result is DEGRADED."],
                provenance=ProvenanceEntry(
                    evidence_type=EvidenceType.UPSTREAM_RESEARCH,
                    source_type="f00_evidence_gate",
                    source_identifier="missing_research_context",
                    method="presence_check",
                    confidence_score=0.0,
                    summary=blocker,
                    raw_data={"present": False},
                ),
            )

        verified_ratio = min(1.0, ctx.verified_claim_count / max(1, settings.minimum_verified_claims))
        source_ratio = min(1.0, ctx.source_count / max(1, settings.minimum_research_sources))
        integrity_score = 1.0 if ctx.integrity_verified else 0.0
        score = round(
            (0.35 * integrity_score)
            + (0.25 * source_ratio)
            + (0.25 * verified_ratio)
            + (0.15 * ctx.confidence),
            4,
        )

        blockers: List[str] = []
        warnings: List[str] = []
        if not ctx.integrity_verified:
            warnings.append("Research passport integrity was not asserted by the F00/bridge boundary.")
            if strict or settings.require_verified_research:
                blockers.append("Verified ResearchPassport integrity is required.")
        if ctx.source_count < settings.minimum_research_sources:
            blockers.append("Insufficient research source count.")
        if ctx.verified_claim_count < settings.minimum_verified_claims:
            blockers.append("Insufficient verified claim count.")

        passed = len(blockers) == 0
        provenance = ProvenanceEntry(
            evidence_type=EvidenceType.UPSTREAM_RESEARCH,
            source_type="f00_evidence_gate",
            source_identifier=ctx.passport_id,
            method="evidence_sufficiency_evaluation",
            confidence_score=score,
            summary=f"F00 evidence gate score={score:.4f}; passed={passed}.",
            raw_data={
                "integrity_verified": ctx.integrity_verified,
                "source_count": ctx.source_count,
                "verified_claim_count": ctx.verified_claim_count,
                "unresolved_issue_count": ctx.unresolved_issue_count,
            },
        )
        return ResearchGateResult(score, passed, blockers, warnings, provenance)
