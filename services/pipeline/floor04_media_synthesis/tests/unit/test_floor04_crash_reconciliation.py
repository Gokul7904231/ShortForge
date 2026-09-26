"""Unit tests for CrashReconciliationEngine (process restart recovery & crash mechanics)."""

from pathlib import Path
import pytest

from floors.floor04_media_synthesis.app.services.reconciliation import CrashReconciliationEngine
from floors.floor04_media_synthesis.tests.media_fixtures import write_png


def test_reconciliation_commits_valid_files(tmp_path):
    storage_root = tmp_path / "media_storage"
    storage_root.mkdir()

    valid_file = storage_root / "committed_tx01.png"
    write_png(valid_file)

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    engine.record_transaction("tx-01", "EXECUTING", {"files": [str(valid_file)]})

    summary = engine.reconcile_on_restart()
    assert "tx-01" in summary["COMMITTED"]
    assert valid_file.exists()


def test_reconciliation_rolls_back_corrupted_files(tmp_path):
    storage_root = tmp_path / "media_storage"
    storage_root.mkdir()

    corrupt_file = storage_root / "committed_tx02.png"
    corrupt_file.write_bytes(b"CORRUPTED_BYTES_WITHOUT_MAGIC")

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    engine.record_transaction("tx-02", "EXECUTING", {"files": [str(corrupt_file)]})

    summary = engine.reconcile_on_restart()
    assert "tx-02" in summary["ROLLED_BACK"]
    assert not corrupt_file.exists()
    assert (storage_root / "orphaned" / "tx-02").exists()


def test_reconciliation_cleans_orphaned_staging_files(tmp_path):
    storage_root = tmp_path / "media_storage"
    storage_root.mkdir()

    orphan = storage_root / "staging_orphan_123.tmp"
    orphan.write_bytes(b"orphan data")

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    summary = engine.reconcile_on_restart()

    assert not orphan.exists()
    assert (storage_root / "orphaned" / "unindexed").exists()


def test_reconciliation_idempotency(tmp_path):
    storage_root = tmp_path / "media_storage"
    storage_root.mkdir()

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    summary1 = engine.reconcile_on_restart()
    summary2 = engine.reconcile_on_restart()

    assert summary1 == summary2
