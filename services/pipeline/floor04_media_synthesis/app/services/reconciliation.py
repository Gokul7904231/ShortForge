"""Crash Reconciliation Engine for Floor 04 Media Synthesis."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

import structlog

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor04_media_synthesis.app.services.validator import PhysicalMediaValidator

logger = structlog.get_logger(__name__)


class CrashReconciliationEngine:
    """Recover transactions without silently deleting ambiguous evidence."""

    def __init__(self, storage_root: str, journal_path: Optional[str] = None):
        self.storage_root = Path(storage_root).resolve()
        self.journal_path = (
            Path(journal_path).resolve()
            if journal_path
            else self.storage_root / "transaction_journal.json"
        )
        self.orphan_root = self.storage_root / "orphaned"
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self.orphan_root.mkdir(parents=True, exist_ok=True)

    def record_transaction(self, transaction_id: str, state: str, details: Dict) -> None:
        journal = self._load_journal()
        journal[transaction_id] = {
            "state": state,
            "details": details,
        }
        self._atomic_write(journal)

    def add_transaction_file(self, transaction_id: str, file_path: str) -> None:
        journal = self._load_journal()
        record = journal.setdefault(
            transaction_id,
            {"state": "EXECUTING", "details": {"files": []}},
        )
        details = record.setdefault("details", {})
        files = details.setdefault("files", [])
        if file_path not in files:
            files.append(file_path)
        self._atomic_write(journal)

    def _load_journal(self) -> Dict[str, Dict]:
        if not self.journal_path.exists():
            return {}
        try:
            return json.loads(self.journal_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("transaction_journal_load_failed", error=str(exc))
            return {}

    def _atomic_write(self, journal: Dict[str, Dict]) -> None:
        fd, tmp = tempfile.mkstemp(
            prefix=self.journal_path.name + ".",
            suffix=".tmp",
            dir=str(self.journal_path.parent),
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(journal, handle, indent=2, sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, self.journal_path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def _quarantine(self, file_path: str, transaction_id: str) -> str:
        source = Path(file_path)
        if not source.exists():
            return ""

        target_dir = self.orphan_root / transaction_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name
        counter = 1
        while target.exists():
            target = target_dir / f"{counter}_{source.name}"
            counter += 1

        shutil.move(str(source), str(target))
        return str(target)

    def reconcile_on_restart(self) -> Dict[str, List[str]]:
        journal = self._load_journal()
        reconciled = {"COMMITTED": [], "ROLLED_BACK": [], "ORPHANED": []}

        for tx_id, record in list(journal.items()):
            state = record.get("state")
            if state in ("COMMITTED", "ROLLED_BACK", "ORPHANED"):
                continue

            logger.warning(
                "crash_reconciliation_triggered",
                transaction_id=tx_id,
                state=state,
            )

            file_paths = record.get("details", {}).get("files", [])
            valid_count = 0
            corrupt_paths: List[str] = []

            for fp in file_paths:
                p = Path(fp)
                if not p.exists():
                    corrupt_paths.append(fp)
                    continue
                try:
                    if p.suffix.lower() == ".png":
                        PhysicalMediaValidator.validate_image_asset(
                            str(p), 1080, 1920, str(self.storage_root)
                        )
                    elif p.suffix.lower() in {".wav", ".mp3"}:
                        PhysicalMediaValidator.validate_audio_asset(
                            str(p), 0.1, str(self.storage_root)
                        )
                    else:
                        raise GuardianValidationError(
                            f"Unsupported staging media type: {p.suffix}"
                        )
                    valid_count += 1
                except GuardianValidationError:
                    corrupt_paths.append(fp)

            if file_paths and valid_count == len(file_paths):
                record["state"] = "COMMITTED"
                reconciled["COMMITTED"].append(tx_id)
                continue

            moved = []
            for fp in corrupt_paths:
                quarantine_path = self._quarantine(fp, tx_id)
                if quarantine_path:
                    moved.append(quarantine_path)

            if valid_count > 0:
                # Mixed valid/corrupt/missing state is genuinely ambiguous.
                record["state"] = "ORPHANED"
                record.setdefault("details", {})["quarantined_files"] = moved
                reconciled["ORPHANED"].append(tx_id)
            else:
                # Nothing valid survived. The production transaction can be
                # deterministically rolled back, while corrupt evidence stays
                # quarantined for forensic inspection.
                record["state"] = "ROLLED_BACK"
                record.setdefault("details", {})["quarantined_files"] = moved
                reconciled["ROLLED_BACK"].append(tx_id)

        # Never silently delete unknown staging artifacts. Quarantine them for
        # forensic inspection instead.
        for orphan in self.storage_root.glob("**/staging_*"):
            if orphan.is_file() and self.orphan_root not in orphan.parents:
                self._quarantine(str(orphan), "unindexed")

        self._atomic_write(journal)
        logger.info("reconciliation_complete", reconciled=reconciled)
        return reconciled
