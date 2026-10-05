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

    def test_transition_blends_distinct_frames(self):
        outgoing = Image.new("RGBA", (120, 160), (255, 0, 0, 255))
        incoming = Image.new("RGBA", (120, 160), (0, 0, 255, 255))
        mixed = transition_mix(outgoing, incoming, "FADE", 0.5)
        self.assertNotEqual(mixed.tobytes(), outgoing.tobytes())
        self.assertNotEqual(mixed.tobytes(), incoming.tobytes())
        self.assertEqual(mixed.getpixel((10, 10)), (128, 0, 128, 255))


if __name__ == "__main__":
    unittest.main()
