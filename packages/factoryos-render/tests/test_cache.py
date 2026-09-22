import unittest
import os
import shutil
from factoryos_render.assets.cache import ContentAddressedCache

class TestCache(unittest.TestCase):
    def setUp(self):
        self.test_dir = ".test_cache"
        self.cache = ContentAddressedCache(self.test_dir)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_store_and_retrieve_cache(self):
        dummy_file = "dummy_scene.mp4"
        with open(dummy_file, "wb") as f:
            f.write(b"0" * 2048)

        try:
            h = "scene_hash_abc123"
            stored = self.cache.store_scene_artifact(h, dummy_file)
            self.assertTrue(os.path.exists(stored))

            retrieved = self.cache.get_scene_artifact(h)
            self.assertIsNotNone(retrieved)
            self.assertEqual(os.path.abspath(stored), os.path.abspath(retrieved))
        finally:
            if os.path.exists(dummy_file):
                os.remove(dummy_file)

    def test_clear_cache(self):
        cleared = self.cache.clear()
        self.assertEqual(cleared, 0)

if __name__ == "__main__":
    unittest.main()
