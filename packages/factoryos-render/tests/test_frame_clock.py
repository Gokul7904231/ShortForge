import unittest
from factoryos_render.timing.frame_clock import FrameClock

class TestFrameClock(unittest.TestCase):
    def test_canonical_clock(self):
        clock = FrameClock(fps=30)
        self.assertEqual(clock.frame_to_time(0), 0.0)
        self.assertEqual(clock.frame_to_time(30), 1.0)
        self.assertEqual(clock.frame_to_time(15), 0.5)

        self.assertEqual(clock.time_to_frame(1.0), 30)
        self.assertEqual(clock.time_to_frame(2.5), 75)

        self.assertEqual(clock.duration_to_frames(3.0), 90)

    def test_progress_calculation(self):
        clock = FrameClock(fps=30)
        # At start
        self.assertEqual(clock.calculate_progress(0, 0, 100), 0.0)
        # At end
        self.assertEqual(clock.calculate_progress(100, 0, 100), 1.0)
        # In middle
        self.assertEqual(clock.calculate_progress(50, 0, 100), 0.5)
        # Clamped out of bounds
        self.assertEqual(clock.calculate_progress(-5, 0, 100), 0.0)
        self.assertEqual(clock.calculate_progress(120, 0, 100), 1.0)

if __name__ == "__main__":
    unittest.main()
