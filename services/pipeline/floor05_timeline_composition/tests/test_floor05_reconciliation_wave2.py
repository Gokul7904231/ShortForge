"""Crash-recovery fail-closed regressions for Floor 05."""
import json

from floors.floor05_timeline_composition.app.services.reconciliation import CrashReconciliationEngine


def test_reconciliation_rolls_back_when_no_artifact_evidence_was_recorded(tmp_path):
    engine = CrashReconciliationEngine(storage_root=str(tmp_path))
    engine.record_transaction(
        "tx-empty",
        "RENDERING",
        {
            "request_id": "req-empty",
            "files": [],
        },
    )

    result = engine.reconcile_on_restart()

    assert "tx-empty" in result["ROLLED_BACK"]
    journal = json.loads(engine.journal_path.read_text(encoding="utf-8"))
    assert journal["tx-empty"]["state"] == "ROLLED_BACK"
