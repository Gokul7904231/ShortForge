"""Base schema definitions and helper constructors for TeacherSituationPacket."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Literal, Optional


ProvenanceTier = Literal["GOLD", "CURRICULUM_GOLD"]
Reversibility = Literal["REVERSIBLE", "COMPENSATABLE", "IRREVERSIBLE"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


@dataclass(frozen=True)
class MissionContext:
    mission_id: str
    content_engine: str
    target_resolution: str = "1080x1920"
    target_duration_sec: int = 30
    reversibility: Reversibility = "REVERSIBLE"
    risk_level: RiskLevel = "LOW"


@dataclass(frozen=True)
class VerifiedFact:
    fact: str
    evidence_type: str  # "VERIFIED_FACT" | "DETERMINISTIC_RULE"
    ref: str


@dataclass(frozen=True)
class TelemetryObservation:
    signal: str
    evidence_type: str  # "OBSERVED_MEASUREMENT" | "OBSERVED_PROVIDER"


@dataclass(frozen=True)
class EpistemicState:
    verified_facts: List[Dict[str, str]]
    telemetry_observations: List[Dict[str, str]]
    unknowns_and_contradictions: List[str]
    constraints: List[str]


@dataclass(frozen=True)
class CandidateAction:
    id: str
    label: str


@dataclass(frozen=True)
class DeterministicGroundTruth:
    winning_action_id: str
    rejected_reasons: Dict[str, str]
    provenance_tier: ProvenanceTier


@dataclass(frozen=True)
class TeacherSituationPacket:
    packet_id: str
    domain: str
    floor_id: str
    source_evidence_refs: List[str]
    mission_context: Dict[str, Any]
    epistemic_state: Dict[str, Any]
    candidate_actions: List[Dict[str, str]]
    deterministic_ground_truth: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "packet_id": self.packet_id,
            "domain": self.domain,
            "floor_id": self.floor_id,
            "source_evidence_refs": self.source_evidence_refs,
            "mission_context": self.mission_context,
            "epistemic_state": self.epistemic_state,
            "candidate_actions": self.candidate_actions,
            "deterministic_ground_truth": self.deterministic_ground_truth,
        }


def make_packet(
    packet_id: str,
    domain: str,
    floor_id: str,
    source_evidence_refs: List[str],
    mission_context: MissionContext,
    verified_facts: List[VerifiedFact],
    telemetry_observations: List[TelemetryObservation],
    unknowns_and_contradictions: List[str],
    constraints: List[str],
    candidate_actions: List[CandidateAction],
    winning_action_id: str,
    rejected_reasons: Dict[str, str],
    provenance_tier: ProvenanceTier,
) -> TeacherSituationPacket:
    # Invariant checks
    action_ids = [a.id for a in candidate_actions]
    if winning_action_id not in action_ids:
        raise ValueError(f"winning_action_id '{winning_action_id}' not found in candidate_actions: {action_ids}")

    for act_id in action_ids:
        if act_id != winning_action_id and act_id not in rejected_reasons:
            raise ValueError(f"Missing rejected_reason for non-winning candidate '{act_id}' in packet '{packet_id}'")

    return TeacherSituationPacket(
        packet_id=packet_id,
        domain=domain,
        floor_id=floor_id,
        source_evidence_refs=source_evidence_refs,
        mission_context=asdict(mission_context),
        epistemic_state={
            "verified_facts": [{"fact": f.fact, "evidence_type": f.evidence_type, "ref": f.ref} for f in verified_facts],
            "telemetry_observations": [{"signal": t.signal, "evidence_type": t.evidence_type} for t in telemetry_observations],
            "unknowns_and_contradictions": unknowns_and_contradictions,
            "constraints": constraints,
        },
        candidate_actions=[{"id": a.id, "label": a.label} for a in candidate_actions],
        deterministic_ground_truth={
            "winning_action_id": winning_action_id,
            "rejected_reasons": rejected_reasons,
            "provenance_tier": provenance_tier,
        },
    )
