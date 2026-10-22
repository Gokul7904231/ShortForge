"""YAML + integration contract for the two reconciled render workflows.

Verifies (on top of the PR 247 fail-closed guarantees):
  - both workflows still parse as valid YAML;
  - the dead `repository_dispatch: factoryos_render_job` trigger stayed removed;
  - no committed/`||` secret fallback was reintroduced;
  - the direct workflow_dispatch path for exact named jobs is intact;
  - failed dispatch/callback steps keep failing visibly (no `|| echo` mask);
  - an empty queue remains claim resolved (exit 0) — a valid no-work outcome.
"""

from __future__ import annotations

from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml", reason="PyYAML required for workflow parsing")

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
DISPATCHER = WORKFLOWS / "factoryos-render-worker.yml"
RENDERER = WORKFLOWS / "factoryos-basic-render.yml"

DISPATCHER_GITHUB_ACTIONS_TRIGGER = "workflow_dispatch"


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def test_both_workflows_parse_as_yaml():
    assert isinstance(_load(DISPATCHER), dict)
    assert isinstance(_load(RENDERER), dict)


def test_no_repository_dispatch_trigger_remains():
    for path in (DISPATCHER, RENDERER):
        parsed = _load(path)
        # PyYAML parses a bare `on:` key as boolean True.
        on_block = parsed.get("on") or parsed.get(True) or {}
        assert "repository_dispatch" not in (on_block or {}), (
            f"{path.name} reintroduced repository_dispatch"
        )


def test_basic_render_workflow_is_named_job_only():
    parsed = _load(RENDERER)
    on_block = parsed.get("on") or parsed.get(True) or {}
    assert set(on_block.keys()) == {"workflow_dispatch"}
    inputs = on_block["workflow_dispatch"]["inputs"]
    # Exact named-job contract from the direct dispatch path (GitHubActionsRenderManager).
    assert set(inputs.keys()) == {"jobId", "executionToken"}
    assert inputs["jobId"]["required"] is True
    assert inputs["executionToken"]["required"] is True


def test_no_secret_fallback_reintroduced():
    for path in (DISPATCHER, RENDERER):
        text = path.read_text(encoding="utf-8")
        assert "factoryos-render-worker-secret-key-2026" not in text
        assert "secrets.RENDER_WORKER_SECRET" not in text.replace(
            "${{ secrets.RENDER_WORKER_SECRET }}", ""
        )
        assert "RENDER_WORKER_SECRET ||" not in text
        assert "WORKER_SECRET ||" not in text


def test_failed_dispatch_is_not_masked():
    text = DISPATCHER.read_text(encoding="utf-8")
    step = text.split("gh workflow run", 1)[1]
    assert "|| echo" not in step
    # The named-job dispatch inputs are preserved exactly.
    assert "-f jobId=" in step
    assert '-f executionToken="$EXECUTION_TOKEN"' in step


def test_empty_queue_status_valid_no_work(monkeypatch, tmp_path):
    """HTTP 200 + claimed=false resolves with exit 0 — only this outcome maps to
    `claimed=false`; every failure path must return non-zero."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "github_dispatch_claim", REPO_ROOT / "services/rendering-engine/scripts/github_dispatch_claim.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    monkeypatch.setenv("RENDER_WORKER_SECRET", "secret-value")
    monkeypatch.setenv("CONTROL_PLANE_URL", "https://control-plane.invalid")
    output = tmp_path / "github_output.txt"
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))

    class _Empty:
        status = 200

        def read(self):
            return b'{"success": true, "claimed": false}'

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(module, "_urlopen", lambda request, timeout: _Empty())
    assert module.main() == 0
    assert "claimed=false" in output.read_text(encoding="utf-8")


def test_missing_secret_fails_closed_without_request():
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "github_dispatch_claim", REPO_ROOT / "services/rendering-engine/scripts/github_dispatch_claim.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._urlopen = None  # a request here would crash — that is the assertion

    import os

    saved = os.environ.pop("RENDER_WORKER_SECRET", None)
    try:
        assert module.main() == 2
    finally:
        if saved is not None:
            os.environ["RENDER_WORKER_SECRET"] = saved
