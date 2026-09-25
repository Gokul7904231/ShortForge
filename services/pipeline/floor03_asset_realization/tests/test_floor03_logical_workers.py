"""Unit tests for Floor 03 logical workers."""

import pytest

from floors.floor02_scripting.app.domain.script_models import CharacterProfile, SceneSpecification
from floors.floor03_asset_realization.app.core.exceptions import Floor03ValidationError
from floors.floor03_asset_realization.app.logical_workers.audio_spec_worker import AudioSpecWorker
from floors.floor03_asset_realization.app.logical_workers.continuity_worker import ContinuityWorker
from floors.floor03_asset_realization.app.logical_workers.image_prompt_worker import ImagePromptWorker
from floors.floor03_asset_realization.app.logical_workers.manifest_worker import ManifestWorker


def build_mock_scenes():
    return [
        SceneSpecification(
            scene_id="sc-1",
            scene_version=1,
            sequence_index=1,
            section_type="Hook",
            narration_text="Did you know functions are secretly objects?",
            on_screen_text="Functions = Objects",
            visual_intent="Code editor close up with syntax highlighting",
            target_duration_seconds=10,
            word_count=7,
            estimated_speech_duration_seconds=2.8,
            character_references=["char-dev"],
            continuity_rules={"lighting": "cinematic_dark", "environment": "dev_studio"},
        ),
        SceneSpecification(
            scene_id="sc-2",
            scene_version=1,
            sequence_index=2,
            section_type="Concept Breakdown",
            narration_text="Here is how wrapper functions work in Python.",
            on_screen_text="Wrapper Functions",
            visual_intent="Diagram showing wrapper function execution flow",
            target_duration_seconds=15,
            word_count=8,
            estimated_speech_duration_seconds=3.2,
            character_references=[],
            continuity_rules={},
        ),
    ]


def test_image_prompt_worker_success():
    scenes = build_mock_scenes()
    worker = ImagePromptWorker()
    reqs, mode, provs = worker.execute(scenes, aspect_ratio="9:16", resolution="1080x1920", style_preset=None)

    assert len(reqs) == 2
    assert reqs[0].scene_id == "sc-1"
    assert reqs[0].style_preset is None
    assert "Code editor close up" in reqs[0].prompt_text
    assert len(provs) == 2


def test_image_prompt_worker_missing_visual_intent_rejection():
    """Verify rejection when upstream visual_intent is missing or whitespace only."""
    invalid_scenes = [
        SceneSpecification(
            scene_id="sc-invalid",
            scene_version=1,
            sequence_index=1,
            section_type="Hook",
            narration_text="Narration",
            on_screen_text="Text",
            visual_intent="     ",  # Whitespace-only string
            target_duration_seconds=10,
            word_count=1,
            estimated_speech_duration_seconds=0.4,
        )
    ]
    worker = ImagePromptWorker()
    with pytest.raises(Floor03ValidationError) as exc_info:
        worker.execute(invalid_scenes, aspect_ratio="9:16", resolution="1080x1920")

    assert "Missing required visual_intent" in str(exc_info.value)


def test_audio_spec_worker():
    scenes = build_mock_scenes()
    worker = AudioSpecWorker()
    reqs, mode, provs = worker.execute(scenes, voice_id="en-US-Neural", speech_rate=2.5)

    assert len(reqs) == 2
    assert reqs[0].scene_id == "sc-1"
    assert reqs[0].voice_id == "en-US-Neural"
    assert reqs[0].estimated_speech_duration_seconds == 2.8


def test_continuity_worker():
    scenes = build_mock_scenes()
    img_worker = ImagePromptWorker()
    reqs, _, _ = img_worker.execute(scenes, aspect_ratio="9:16", resolution="1080x1920")

    chars = [
        CharacterProfile(
            character_id="char-dev",
            name="Alex",
            appearance="Casual hoodie and tech gear",
            role_description="Senior Python Engineer",
        )
    ]
    worker = ContinuityWorker()
    updated_reqs, mode, provs = worker.execute(reqs, chars)

    assert "character_descriptors" in updated_reqs[0].continuity_constraints
    assert "Alex" in updated_reqs[0].continuity_constraints["character_descriptors"][0]


def test_manifest_worker():
    scenes = build_mock_scenes()
    img_worker = ImagePromptWorker()
    v_reqs, _, _ = img_worker.execute(scenes, aspect_ratio="9:16", resolution="1080x1920")

    aud_worker = AudioSpecWorker()
    a_reqs, _, _ = aud_worker.execute(scenes)

    worker = ManifestWorker()
    manifest, mode, provs = worker.execute(
        script_id="script-123",
        script_version=1,
        resolved_platform="youtube_shorts",
        resolved_aspect_ratio="9:16",
        resolved_resolution="1080x1920",
        visual_reqs=v_reqs,
        audio_reqs=a_reqs,
    )

    assert manifest.script_id == "script-123"
    assert manifest.total_visual_assets == 2
    assert manifest.total_audio_assets == 2
    assert manifest.resolved_platform == "youtube_shorts"



def test_visual_plan_binds_dependency_last_frame_and_camera_metadata():
    scenes = build_mock_scenes()
    scenes[1].depends_on_scene_ids = [scenes[0].scene_id]
    scenes[1].continuity_rules = {
        "continuity_mode": "chain_from_previous",
        "lighting": "soft rim light",
    }
    scenes[1].visual_intent_structured = {
        "camera": {
            "camera_height": "eye-level",
            "lens_profile": "standard prime",
            "camera_body": "cinematic digital body",
        },
        "coverage_role": "action",
    }
    reqs, _, _ = ImagePromptWorker().execute(
        scenes, aspect_ratio="9:16", resolution="1080x1920"
    )
    plan = reqs[1].scene_plan
    assert plan is not None
    assert plan.lighting == "soft rim light"
    assert plan.camera.camera_height == "eye-level"
    assert plan.camera.lens_profile == "standard prime"
    assert plan.camera.camera_body == "cinematic digital body"
    assert any(ref.use.value == "last_frame" and ref.source_scene_id == scenes[0].scene_id for ref in plan.references)
    assert "last_frame" in {mode.value for mode in plan.generation_inputs}


def test_motion_beats_cannot_exceed_scene_duration():
    scenes = build_mock_scenes()
    scenes[0].visual_intent_structured = {
        "time_beats": [{"start": 0, "end": 11, "instruction": "zoom in"}]
    }
    with pytest.raises(Floor03ValidationError, match="exceeds target duration"):
        ImagePromptWorker().execute(scenes, aspect_ratio="9:16", resolution="1080x1920")
