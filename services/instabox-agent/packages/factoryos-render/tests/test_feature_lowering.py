import unittest

from PIL import Image, ImageChops

from factoryos_render.engine.feature_lowering import (
    apply_effects,
    apply_masks,
    apply_transform,
    create_background,
    evaluate_keyframes,
    transition_mix,
)


class TestFeatureLowering(unittest.TestCase):
    def setUp(self):
        self.base = Image.new("RGBA", (120, 160), (180, 80, 40, 255))

    def test_keyframes_are_deterministic_and_bezier_supported(self):
        frames = [
            {"timeSeconds": 0.0, "value": 0.0, "interpolation": "BEZIER",
             "outHandle": {"x": 0.25, "y": 0.0}},
            {"timeSeconds": 1.0, "value": 100.0,
             "inHandle": {"x": 0.75, "y": 1.0}},
        ]
        first = evaluate_keyframes(frames, 0.5, 0.0)
        second = evaluate_keyframes(frames, 0.5, 0.0)
        self.assertEqual(first, second)
        self.assertGreater(first, 0.0)
        self.assertLess(first, 100.0)

    def test_effects_change_pixels(self):
        effected = apply_effects(
            self.base,
            [{"kind": "GRAYSCALE", "params": {"amount": 1.0}, "enabled": True}],
            0.0,
        )
        self.assertNotEqual(effected.tobytes(), self.base.tobytes())

    def test_masks_change_alpha_geometry(self):
        masked = apply_masks(
            self.base,
            [{
                "kind": "ELLIPSE",
                "x": 10,
                "y": 10,
                "width": 40,
                "height": 60,
                "rotationDeg": 0,
                "feather": 0,
            }],
            0.0,
        )
        self.assertLess(masked.getchannel("A").getbbox()[2], self.base.width)

    def test_transform_changes_pixels(self):
        transformed = apply_transform(
            self.base,
            {"scaleX": 0.5, "scaleY": 0.5, "x": 20, "y": -10, "opacity": 0.8},
            [],
            0.0,
        )
        self.assertNotEqual(transformed.tobytes(), self.base.tobytes())

    def test_background_variants_are_physical_images(self):
        solid = create_background(120, 160, {"kind": "SOLID", "value": "#112233"})
        gradient = create_background(
            120,
            160,
            {"kind": "GRADIENT", "value": {"start": "#000000", "end": "#ffffff"}},
        )
        self.assertEqual(solid.size, (120, 160))
        self.assertEqual(gradient.size, (120, 160))
        self.assertNotEqual(solid.tobytes(), gradient.tobytes())

    def test_unsupported_features_fail_closed(self):
        with self.assertRaises(ValueError):
            apply_effects(self.base, [{"kind": "UNKNOWN", "params": {}}], 0.0)
        with self.assertRaises(ValueError):
            apply_masks(self.base, [{"kind": "UNKNOWN"}], 0.0)
        with self.assertRaises(ValueError):
            transition_mix(self.base, self.base, "UNKNOWN", 0.5)

    def test_transition_blends_distinct_frames(self):
        outgoing = Image.new("RGBA", (120, 160), (255, 0, 0, 255))
        incoming = Image.new("RGBA", (120, 160), (0, 0, 255, 255))
        mixed = transition_mix(outgoing, incoming, "FADE", 0.5)
        self.assertNotEqual(mixed.tobytes(), outgoing.tobytes())
        self.assertNotEqual(mixed.tobytes(), incoming.tobytes())
        self.assertIn(mixed.getpixel((10, 10)), [(127, 0, 127, 255), (128, 0, 128, 255)])

    def test_canva_design_pack_compositing(self):
        from factoryos_render.backends.image import NativeFrameCompositor
        compositor = NativeFrameCompositor(1080, 1920)
        scene_props = {
            "template_id": "quiz.universal.cinematic.v2",
            "design_pack": "quiz.universal.cinematic.v1"
        }
        shot_props = {
            "question": "What is the deepest trench on Earth?",
            "options": ["Mariana Trench", "Tonga Trench", "Puerto Rico Trench", "Java Trench"],
            "categoryBadge": "GEOGRAPHY",
            "design_pack": "quiz.universal.cinematic.v1"
        }
        # 1. QUESTION_CARD
        frame_q = compositor.render_frame(scene_props, "QUESTION_CARD", shot_props, 0.5)
        self.assertEqual(frame_q.size, (1080, 1920))
        self.assertEqual(frame_q.mode, "RGBA")

        # 2. COUNTDOWN with animated progress bar
        countdown_props = {**shot_props, "seconds": 5}
        frame_cd = compositor.render_frame(scene_props, "COUNTDOWN", countdown_props, 0.6)
        self.assertEqual(frame_cd.size, (1080, 1920))
        self.assertEqual(frame_cd.mode, "RGBA")

        # 3. ANSWER_REVEAL with emerald punch
        reveal_props = {**shot_props, "answerIndex": 0, "correctOption": "Mariana Trench", "explanation": "It reaches 11,034 meters deep."}
        frame_ar = compositor.render_frame(scene_props, "ANSWER_REVEAL", reveal_props, 0.8)
        self.assertEqual(frame_ar.size, (1080, 1920))
        self.assertEqual(frame_ar.mode, "RGBA")

        # 4. OUTRO_CTA with Canva outro card
        outro_props = {"cta": "Can you score 6/6?", "subtitle": "Follow for more science shorts"}
        frame_outro = compositor.render_frame(scene_props, "OUTRO_CTA", outro_props, 0.5)
        self.assertEqual(frame_outro.size, (1080, 1920))
        self.assertEqual(frame_outro.mode, "RGBA")

        # 5. Fallback behavior when design pack is unconfigured
        scene_fallback = {"template_id": "quiz.universal.glass.v1"}
        shot_fallback = {"question": "Fallback question", "options": ["A", "B", "C", "D"]}
        frame_fallback = compositor.render_frame(scene_fallback, "QUESTION_CARD", shot_fallback, 0.5)
        self.assertEqual(frame_fallback.size, (1080, 1920))
        self.assertEqual(frame_fallback.mode, "RGBA")


if __name__ == "__main__":
    unittest.main()

