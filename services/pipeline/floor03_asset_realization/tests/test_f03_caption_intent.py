"""Regression: F03 preserves F02 on-screen caption intent for F05."""
from floors.floor02_scripting.app.domain.script_models import SceneSpecification
from floors.floor03_asset_realization.app.logical_workers.audio_spec_worker import AudioSpecWorker


def test_f03_preserves_explicit_caption_text():
    scene = SceneSpecification(
        scene_id="scene-caption-1",
        sequence_index=1,
        narration_text="Spoken narration.",
        on_screen_text="Key fact",
        visual_intent="A clean establishing shot.",
        target_duration_seconds=4,
        word_count=2,
        estimated_speech_duration_seconds=1.0,
    )

    audio_reqs, _, _ = AudioSpecWorker().execute([scene])
    assert audio_reqs[0].caption_text == "Key fact"
