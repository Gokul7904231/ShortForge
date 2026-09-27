"""Floor 05 subtitle compiler regression."""
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload
from floors.floor05_timeline_composition.app.workers.composition_worker import TimelineCompositionWorker


def test_f05_uses_explicit_caption_intent_over_narration(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    f04.floor03_payload.audio_asset_requirements[0].caption_text = "ON SCREEN FACT"
    timeline = TimelineCompositionWorker.assemble_timeline(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        target_fps=30,
    )
    assert timeline.subtitles[0].text == "ON SCREEN FACT"
