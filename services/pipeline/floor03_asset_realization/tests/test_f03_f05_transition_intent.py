"""Regression: F03 preserves explicit editorial transition intent for F05 consumption."""
from floors.floor02_scripting.app.domain.script_models import SceneSpecification
from floors.floor03_asset_realization.app.logical_workers.image_prompt_worker import ImagePromptWorker
from factoryos.guardian.contracts.guardian_state import ExecutionMode


class FakeAssetLLM:
    def enhance_visual_prompt(self, **kwargs):
        return {
            "mode": ExecutionMode.DETERMINISTIC,
            "prompt_text": kwargs["visual_intent"],
        }


def test_f03_preserves_transition_intent_from_f02():
    scene = SceneSpecification(
        scene_id="scene-1",
        sequence_index=1,
        narration_text="A concise narration.",
        visual_intent="A clean establishing shot.",
        target_duration_seconds=4,
        word_count=3,
        estimated_speech_duration_seconds=1.2,
        continuity_rules={},
        visual_intent_structured={"transition_intent": "crossfade"},
    )

    visual_reqs, _, _ = ImagePromptWorker(
        llm_adapter=FakeAssetLLM()
    ).execute(
        scenes=[scene],
        aspect_ratio="9:16",
        resolution="1080x1920",
    )

    assert visual_reqs[0].continuity_constraints["transition_intent"] == "crossfade"
