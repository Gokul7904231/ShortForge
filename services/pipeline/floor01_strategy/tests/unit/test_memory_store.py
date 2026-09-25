"""Unit tests for StrategyMemoryStore corruption recovery, atomic writes, and retention bounds."""

import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore


def test_memory_store_in_memory():
    store = StrategyMemoryStore()
    store.clear()
    store.add_record("Topic A", "plan-1")
    store.add_record("Topic B", "plan-2")

    topics = store.get_all_topics()
    assert len(topics) == 2
    assert "Topic A" in topics
    assert "Topic B" in topics


def test_memory_store_disk_persistence():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = str(Path(tmpdir) / "test_memory.json")
        store1 = StrategyMemoryStore(storage_path=file_path)
        store1.add_record("Persistent Topic 1", "plan-100")
        store1.add_record("Persistent Topic 2", "plan-101")

        # Load store2 from same disk file
        store2 = StrategyMemoryStore(storage_path=file_path)
        topics = store2.get_all_topics()
        assert len(topics) == 2
        assert "Persistent Topic 1" in topics
        assert "Persistent Topic 2" in topics


def test_memory_store_corruption_recovery():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = Path(tmpdir) / "corrupt_memory.json"
        # Write corrupted invalid JSON text
        file_path.write_text("{ invalid_json: corrupt }", encoding="utf-8")

        # Load memory store -> should recover smoothly and backup corrupt file
        store = StrategyMemoryStore(storage_path=str(file_path))
        assert len(store.get_all_topics()) == 0

        # Check backup file created
        corrupt_backups = list(Path(tmpdir).glob("corrupt_memory.json.corrupted.*"))
        assert len(corrupt_backups) == 1


def test_memory_store_retention_bounds():
    store = StrategyMemoryStore(max_records=5)
    store.clear()
    for i in range(10):
        store.add_record(f"Topic {i}", f"plan-{i}")

    topics = store.get_all_topics()
    assert len(topics) == 5
    assert "Topic 9" in topics
    assert "Topic 0" not in topics  # Oldest 5 evicted


def test_memory_store_thread_concurrency():
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = str(Path(tmpdir) / "concurrent_memory.json")
        store = StrategyMemoryStore(storage_path=file_path)

        def worker(idx):
            store.add_record(f"Concurrent Topic {idx}", f"plan-{idx}")

        with ThreadPoolExecutor(max_workers=5) as executor:
            list(executor.map(worker, range(20)))

        topics = store.get_all_topics()
        assert len(topics) == 20


def test_corruption_recovery_clears_stale_request_reservations(tmp_path):
    memory_path = tmp_path / "memory.json"
    store = StrategyMemoryStore(storage_path=str(memory_path))

    status, _, owner_token = store.claim_request(
        "req-corrupt-01",
        "fingerprint-corrupt-01",
        ttl_seconds=120.0,
    )
    assert status == "OWNER"
    assert owner_token
    assert store.get_request_reservation("req-corrupt-01") is not None

    memory_path.write_text("{corrupted-json", encoding="utf-8")

    recovered = StrategyMemoryStore(storage_path=str(memory_path))
    assert recovered.get_request_reservation("req-corrupt-01") is None

