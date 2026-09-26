"""Crash reconciliation and evidence quarantine for Floor 05."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


class CrashReconciliationEngine:
    """Recover interrupted render transactions without deleting ambiguous evidence."""

    _lock = threading.RLock()

    def __init__(self, storage_root: str, journal_path: Optional[str] = None):
        self.storage_root = Path(storage_root).resolve()
        self.journal_path = (
            Path(journal_path).resolve()
            if journal_path
            else self.storage_root / "render_transaction_journal.json"
        )
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self.quarantine_root = self.storage_root / "orphaned"

    def _load_journal(self) -> Dict[str, Dict[str, Any]]:
        if not self.journal_path.exists():
            return {}
        try:
            return json.loads(self.journal_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _save_journal(self, journal: Dict[str, Dict[str, Any]]) -> None:
        tmp = self.journal_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(journal, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.journal_path)

    def record_transaction(self, transaction_id: str, state: str, details: Dict[str, Any]) -> None:
        with self._lock:
            journal = self._load_journal()
            existing = journal.get(transaction_id, {})
            files = details.get("files", existing.get("details", {}).get("files", []))
            journal[transaction_id] = {
                "state": state,
                "details": {**existing.get("details", {}), **details, "files": files},
            }
            self._save_journal(journal)

    @staticmethod
    def _normalise_file_entry(entry: Any) -> tuple[str, str]:
        if isinstance(entry, str):
            kind = "thumbnail" if entry.lower().endswith(".png") else "video"
            return entry, kind
        return str(entry["path"]), str(entry.get("kind", "video"))

    def _quarantine(self, file_path: Path, transaction_id: str) -> str:
        self.quarantine_root.mkdir(parents=True, exist_ok=True)
        target = self.quarantine_root / f"{transaction_id}_{file_path.name}"
        if target.exists():
            target = self.quarantine_root / f"{transaction_id}_{os.urandom(4).hex()}_{file_path.name}"
        shutil.move(str(file_path), str(target))
        return str(target)

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _inspect(self, path: Path, kind: str) -> bool:
        if not path.exists() or not path.is_file() or path.is_symlink():
            return False
        try:
            if kind == "thumbnail":
                with path.open("rb") as handle:
                    return handle.read(8) == b"\x89PNG\r\n\x1a\n"
            executable = shutil.which("ffprobe")
            if executable is None:
                return False
            completed = subprocess.run(
                [
                    executable,
                    "-v",
                    "error",
                    "-print_format",
                    "json",
                    "-show_streams",
                    "-show_format",
                    str(path),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            payload = json.loads(completed.stdout or "{}")
            format_name = str(payload.get("format", {}).get("format_name", ""))
            video_streams = [
                stream for stream in payload.get("streams", [])
                if stream.get("codec_type") == "video"
            ]
            return ("mp4" in format_name.lower() or "mov" in format_name.lower()) and len(video_streams) == 1
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError):
            return False

    def _verify_expected_identity(self, path: Path, expected: Dict[str, Any]) -> bool:
        expected_size = expected.get("size_bytes")
        expected_sha = expected.get("sha256")
        if not expected_size or not expected_sha:
            return False
        try:
            return (
                path.stat().st_size == int(expected_size)
                and self._sha256(path) == str(expected_sha)
            )
        except OSError:
            return False

    def reconcile_on_restart(self) -> Dict[str, List[str]]:
        with self._lock:
            journal = self._load_journal()
            reconciled = {
                "COMMITTED": [],
                "ROLLED_BACK": [],
                "ORPHANED": [],
                "RECONCILIATION_REQUIRED": [],
            }

            for tx_id, record in list(journal.items()):
                state = record.get("state")
                if state in {"COMMITTED", "ROLLED_BACK", "ORPHANED"}:
                    continue

                entries = record.get("details", {}).get("files", [])
                normalised = [self._normalise_file_entry(entry) for entry in entries]
                if not normalised:
                    record["state"] = "ROLLED_BACK"
                    record.setdefault("details", {})["reconciliation_reason"] = "No artifact evidence was recorded before restart."
                    reconciled["ROLLED_BACK"].append(tx_id)
                    continue

                missing = False
                invalid = False
                identity_missing = False

                for file_name, kind in normalised:
                    raw_path = Path(file_name)
                    if raw_path.is_symlink():
                        invalid = True
                        continue
                    path = raw_path.resolve()
                    try:
                        path.relative_to(self.storage_root)
                    except ValueError:
                        invalid = True
                        continue
                    if not path.exists():
                        missing = True
                        continue
                    if not self._inspect(path, kind):
                        invalid = True
                        continue
                    expected_map = record.get("details", {}).get("expected_artifacts", {})
                    expected = expected_map.get(kind)
                    if not expected or not self._verify_expected_identity(path, expected):
                        identity_missing = True

                if invalid:
                    quarantined = []
                    for file_name, _kind in normalised:
                        path = Path(file_name).resolve()
                        if path.exists():
                            try:
                                path.relative_to(self.storage_root)
                                quarantined.append(self._quarantine(path, tx_id))
                            except ValueError:
                                pass
                    record["state"] = "ORPHANED"
                    record.setdefault("details", {})["quarantined_files"] = quarantined
                    reconciled["ORPHANED"].append(tx_id)
                elif missing:
                    record["state"] = "ROLLED_BACK"
                    reconciled["ROLLED_BACK"].append(tx_id)
                elif identity_missing:
                    record["state"] = "RECONCILIATION_REQUIRED"
                    record.setdefault("details", {})["reconciliation_reason"] = (
                        "Artifact evidence exists but expected SHA-256/byte-length identity is incomplete or mismatched."
                    )
                    reconciled["RECONCILIATION_REQUIRED"].append(tx_id)
                else:
                    record["state"] = "COMMITTED"
                    reconciled["COMMITTED"].append(tx_id)

            for orphan in self.storage_root.glob("staging_render_*"):
                if orphan.exists():
                    try:
                        orphan.relative_to(self.quarantine_root)
                    except ValueError:
                        self._quarantine(orphan, "unindexed")
                        reconciled["ORPHANED"].append(str(orphan))

            self._save_journal(journal)
            logger.info("render_reconciliation_complete", reconciled=reconciled)
            return reconciled
