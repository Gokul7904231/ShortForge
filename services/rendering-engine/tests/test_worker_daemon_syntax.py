"""Regression test for the persistent render worker's syntax integrity."""

import ast
from pathlib import Path


def test_worker_daemon_parses_after_provider_neutral_refactor() -> None:
    worker_path = Path(__file__).resolve().parents[1] / "worker_daemon.py"
    source = worker_path.read_text(encoding="utf-8")
    ast.parse(source, filename=str(worker_path))
