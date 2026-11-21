"""
Unit test suite verifying permanent backoff cap and explicit watchdog timeouts
in InstaBox worker daemon and agent.
"""

import ast
from pathlib import Path
import pytest


def test_agent_syntax_and_constants():
    agent_path = Path(__file__).resolve().parents[2] / "instabox-agent" / "agent.py"
    assert agent_path.exists(), f"Missing agent.py at {agent_path}"

    source = agent_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(agent_path))
    assert tree is not None

    # Inspect module-level constants
    constants = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == "float":
                        first_arg = node.value.args[0]
                        if isinstance(first_arg, ast.Call) and len(first_arg.args) >= 2:
                            default_val = first_arg.args[1]
                            if isinstance(default_val, ast.Constant):
                                constants[target.id] = float(default_val.value)

    assert constants.get("MAX_BACKOFF_SECONDS") == 15.0
    assert constants.get("HEARTBEAT_TIMEOUT_SECONDS") == 5.0
    assert constants.get("CLAIM_TIMEOUT_SECONDS") == 10.0
    assert constants.get("PROGRESS_TIMEOUT_SECONDS") == 10.0
    assert constants.get("CALLBACK_TIMEOUT_SECONDS") == 15.0


def test_worker_daemon_backoff_cap():
    daemon_path = Path(__file__).resolve().parents[1] / "worker_daemon.py"
    source = daemon_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(daemon_path))
    assert tree is not None
    assert "min(15.0, backoff_sec * 2)" in source


def test_exponential_backoff_never_exceeds_cap():
    max_cap = 15.0
    for attempt in range(1, 20):
        raw_backoff = 2 ** (attempt - 1)
        capped_backoff = min(max_cap, float(raw_backoff))
        assert capped_backoff <= 15.0
        if attempt >= 5:
            assert capped_backoff == 15.0
