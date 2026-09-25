"""Unit tests for single-scene regeneration and content equivalence invariants."""

import pytest

from floors.floor02_scripting.app.domain.handoff import Floor02Input
from floors.floor02_scripting.app.logical_workers.scene_regenerator import SceneRegeneratorWorker
from floors.floor02_scripting.app.pipeline import Floor02Pipeline


def test_single_scene_regeneration_invariants():
    """Verify targeted single-scene regeneration preserves exact byte/semantic equivalence of unaffected scenes."""
    pipeline = Floor02Pipeline()
    inp = Floor02Input(topic_query="Python Decorators", request_id="req-regen-invariants-1", strict_upstream=False)
    initial_payload = pipeline.execute(inp, strict_rejection=False)

    assert len(initial_payload.scenes) >= 3
    assert initial_payload.script_version == 1

    scene_a_initial = initial_payload.scenes[0].model_dump()
    scene_b_initial = initial_payload.scenes[1].model_dump()
    scene_c_initial = initial_payload.scenes[2].model_dump()

    worker = SceneRegeneratorWorker()
    updated_payload = worker.execute(
        current_payload=initial_payload,
        target_scene_id=scene_b_initial["scene_id"],
        regeneration_instruction="Tighten core explanation",
    )

    # Script version incremented; Script ID preserved
    assert updated_payload.script_version == 2
    assert updated_payload.script_id == initial_payload.script_id

    # Scene A (unaffected): Byte & semantic equivalence preserved
    scene_a_updated = updated_payload.scenes[0].model_dump()
    assert scene_a_updated == scene_a_initial

    # Scene B (target): Scene version incremented, narration text updated
    scene_b_updated = updated_payload.scenes[1].model_dump()
    assert scene_b_updated["scene_id"] == scene_b_initial["scene_id"]
    assert scene_b_updated["scene_version"] == scene_b_initial["scene_version"] + 1
    assert "Tighten core explanation" in scene_b_updated["narration_text"]

    # Scene C (unaffected): Byte & semantic equivalence preserved
    scene_c_updated = updated_payload.scenes[2].model_dump()
    assert scene_c_updated == scene_c_initial


def test_scene_regeneration_invalid_scene_id_rejection():
    pipeline = Floor02Pipeline()
    inp = Floor02Input(topic_query="Python Generators", request_id="req-regen-invalid-1", strict_upstream=False)
    initial_payload = pipeline.execute(inp)

    worker = SceneRegeneratorWorker()
    with pytest.raises(ValueError) as exc_info:
        worker.execute(
            current_payload=initial_payload,
            target_scene_id="non-existent-scene-id-999",
            regeneration_instruction="Should fail",
        )

    assert "not found" in str(exc_info.value)
