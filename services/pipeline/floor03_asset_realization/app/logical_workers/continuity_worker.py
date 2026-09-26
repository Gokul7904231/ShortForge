"""Floor 03 continuity worker."""

from __future__ import annotations

from typing import List, Tuple

import structlog

from floors.floor02_scripting.app.domain.script_models import CharacterProfile
from floors.floor03_asset_realization.app.domain.asset_models import VisualAssetRequirement
from floors.floor03_asset_realization.app.domain.handoff import EvidenceType, ExecutionMode, ProvenanceEntry

logger = structlog.get_logger(__name__)


class ContinuityWorker:
    """Attach immutable-ish continuity descriptors while preserving scene-local data."""

    def execute(
        self,
        visual_reqs: List[VisualAssetRequirement],
        character_profiles: List[CharacterProfile],
    ) -> Tuple[List[VisualAssetRequirement], ExecutionMode, List[ProvenanceEntry]]:
        char_map = {c.character_id: c for c in character_profiles}
        provenance: List[ProvenanceEntry] = []

        for req in visual_reqs:
            matched_chars = [char_map[cid] for cid in req.character_references if cid in char_map]
            constraints = dict(req.continuity_constraints)
            if matched_chars:
                constraints["character_descriptors"] = [f"{c.name} ({c.role})" for c in matched_chars]
                constraints["continuity_keys"] = list(req.character_references)
            req.continuity_constraints = constraints

            provenance.append(
                ProvenanceEntry(
                    evidence_type=EvidenceType.DETERMINISTIC_RULE,
                    source_type="continuity_worker",
                    source_identifier=req.scene_id,
                    method="attach_character_continuity_constraints",
                    summary=f"Attached {len(matched_chars)} character profiles to scene {req.scene_id}.",
                    raw_data={"scene_id": req.scene_id, "character_count": len(matched_chars)},
                )
            )

        return visual_reqs, ExecutionMode.DETERMINISTIC, provenance
