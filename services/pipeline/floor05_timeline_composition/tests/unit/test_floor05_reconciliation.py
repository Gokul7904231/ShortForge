"""Unit tests for Floor 05 crash reconciliation and evidence quarantine."""
from floors.floor05_timeline_composition.app.services.reconciliation import CrashReconciliationEngine


def test_reconciliation_commits_valid_video_renders(tmp_path):
    storage_root = tmp_path / "renders"
    storage_root.mkdir()
    valid_mp4 = storage_root / "committed_tx01.mp4"
    valid_mp4.write_bytes(b"\x00\x00\x00\x1cftypisomValid Render Output")

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    engine.record_transaction("tx-01", "RENDERING", {"files": [str(valid_mp4)]})

    summary = engine.reconcile_on_restart()
    assert "tx-01" in summary["COMMITTED"]
    assert valid_mp4.exists()


def test_reconciliation_quarantines_corrupted_video_renders(tmp_path):
    storage_root = tmp_path / "renders"
    storage_root.mkdir()
    corrupt_mp4 = storage_root / "corrupt_tx02.mp4"
    corrupt_mp4.write_bytes(b"BAD_CORRUPT_BYTES_WITHOUT_FTYP")

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    engine.record_transaction("tx-02", "RENDERING", {"files": [str(corrupt_mp4)]})

    summary = engine.reconcile_on_restart()
    assert "tx-02" in summary["ORPHANED"]
    assert not corrupt_mp4.exists()
    assert list((storage_root / "orphaned").glob("*corrupt_tx02.mp4"))


def test_reconciliation_quarantines_unindexed_staging_renders(tmp_path):
    storage_root = tmp_path / "renders"
    storage_root.mkdir()
    orphan = storage_root / "staging_render_orphan_123.tmp"
    orphan.write_bytes(b"orphan render data")

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    summary = engine.reconcile_on_restart()

    assert not orphan.exists()
    assert len(summary["ORPHANED"]) >= 1
    assert list((storage_root / "orphaned").glob("*staging_render_orphan_123.tmp"))
