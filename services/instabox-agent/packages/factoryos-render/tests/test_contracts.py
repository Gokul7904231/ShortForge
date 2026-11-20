import unittest
from factoryos_render.contracts.render_intent import RenderIntent, SceneIntent, ShotIntent
from factoryos_render.contracts.receipt import RenderReceipt, RenderValidationResult

class TestContracts(unittest.TestCase):
    def test_render_intent_deserialization(self):
        data = {
            "project_id": "test_p1",
            "title": "Test Title",
            "output_path": "out.mp4",
            "output": {"width": 1080, "height": 1920, "fps": 30},
            "scenes": [
                {
                    "scene_id": "s1",
                    "template_id": "facts.rapid-facts.v1",
                    "narration_text": "Sample text",
                    "duration_seconds": 3.0,
                    "shots": [{"id": "sh1", "recipe_id": "KINETIC_HOOK", "start_seconds": 0.0, "duration_seconds": 3.0}]
                }
            ]
        }
        intent = RenderIntent.from_dict(data)
        self.assertEqual(intent.project_id, "test_p1")
        self.assertEqual(intent.output.width, 1080)
        self.assertEqual(intent.output.height, 1920)
        self.assertEqual(len(intent.scenes), 1)
        self.assertEqual(intent.scenes[0].scene_id, "s1")
        self.assertEqual(intent.scenes[0].shots[0].recipe_id, "KINETIC_HOOK")

    def test_render_receipt_serialization(self):
        val = RenderValidationResult(
            is_valid=True,
            file_exists=True,
            file_size_bytes=50000,
            duration_seconds=5.0,
            width=1080,
            height=1920,
            has_video_stream=True,
            has_audio_stream=True,
            codec="h264"
        )
        receipt = RenderReceipt(
            run_id="run_123",
            renderer_version="0.1.0",
            intent_hash="abc",
            composition_hash="def",
            output_path="/path/out.mp4",
            output_sha256="123456",
            width=1080,
            height=1920,
            fps=30,
            duration_seconds=5.0,
            total_frames=150,
            render_time_ms=1200,
            render_mode="LOCAL_NATIVE",
            ffmpeg_version="8.1",
            validation=val
        )
        d = receipt.to_dict()
        self.assertEqual(d["run_id"], "run_123")
        self.assertEqual(d["validation"]["is_valid"], True)

if __name__ == "__main__":
    unittest.main()
