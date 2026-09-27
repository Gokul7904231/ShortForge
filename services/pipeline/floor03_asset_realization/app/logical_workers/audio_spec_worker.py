"""Audio Spec Worker for Floor 03.

Generates structured AudioAssetRequirement specifications for voiceover narration.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

import structlog

from floors.floor02_scripting.app.domain.script_models import SceneSpecification
from floors.floor03_asset_realization.app.core.security import sanitize_input_text
from floors.floor03_asset_realization.app.domain.asset_models import AssetRole, AssetType, AudioAssetRequirement
from floors.floor03_asset_realization.app.domain.handoff import EvidenceType, ExecutionMode, ProvenanceEntry

logger = structlog.get_logger(__name__)


class AudioSpecWorker:
    """Logical worker responsible for planning audio asset specifications."""

    def execute(
        self,
        scenes: List[SceneSpecification],
        voice_id: Optional[str] = None,
        speech_rate: float = 2.5,
    ) -> Tuple[List[AudioAssetRequirement], ExecutionMode, List[ProvenanceEntry]]:
        logger.info("audio_spec_worker_started", scene_count=len(scenes), voice_id=voice_id)

        audio_reqs: List[AudioAssetRequirement] = []
        provenance: List[ProvenanceEntry] = []

        for sc in scenes:
            sanitized_narration = sanitize_input_text(sc.narration_text or "")
            dur = sc.estimated_speech_duration_seconds or round(sc.word_count / speech_rate, 1)

            a_req = AudioAssetRequirement(
                asset_version=1,
                asset_type=AssetType.AUDIO,
                asset_role=AssetRole.VOICEOVER_AUDIO,
                scene_id=sc.scene_id,
                scene_version=sc.scene_version,
                sequence_index=sc.sequence_index,
                voice_id=voice_id,
                narration_text=sanitized_narration,
                caption_text=sanitize_input_text(sc.on_screen_text or "") or None,
                speech_rate=speech_rate,
                estimated_speech_duration_seconds=dur,
            )
            audio_reqs.append(a_req)

            provenance.append(
                ProvenanceEntry(
                    evidence_type=EvidenceType.UPSTREAM_HANDOFF,
                    source_type="floor02_dialogue_scriptwriter",
                    source_identifier=sc.scene_id,
                    method="generate_audio_asset_requirement",
                    summary=f"Generated audio asset specification for scene {sc.scene_id} ({sc.word_count} words, {dur}s).",
                    raw_data={
                        "scene_id": sc.scene_id,
                        "word_count": sc.word_count,
                        "speech_duration": dur,
                        "caption_text_present": bool(sc.on_screen_text and sc.on_screen_text.strip()),
                    },
                )
            )

        logger.info("audio_spec_worker_completed", total_audio_reqs=len(audio_reqs))
        return audio_reqs, ExecutionMode.DETERMINISTIC, provenance
