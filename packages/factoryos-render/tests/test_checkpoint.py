import unittest
import os
import shutil
from factoryos_render.contracts.checkpoint import CheckpointState
from factoryos_render.persistence.checkpoint_store import CheckpointStore

class TestCheckpointStore(unittest.TestCase):
    def setUp(self):
        self.test_dir = ".test_checkpoints"
        self.store = CheckpointStore(self.test_dir)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_save_and_load_checkpoint(self):
        state = CheckpointState(
            run_id="test_run_1",
            project_id="test_proj",
            intent_hash="hash_123",
            composition_hash="comp_456",
            total_scenes=3,
            completed_scenes=["s1"],
            stage="SCENES_RENDERING"
        )
        self.store.save(state)

        loaded = self.store.load("test_run_1")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.run_id, "test_run_1")
        self.assertEqual(loaded.completed_scenes, ["s1"])
        self.assertEqual(loaded.stage, "SCENES_RENDERING")

    def test_load_nonexistent(self):
        loaded = self.store.load("ghost_run")
        self.assertIsNone(loaded)

if __name__ == "__main__":
    unittest.main()
